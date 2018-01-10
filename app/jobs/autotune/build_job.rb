require 'autoshell'
require 'date'
require 'logger'
require 'stringio'

module Autotune
  # project a blueprint
  class BuildJob < ActiveJob::Base
    queue_as :default

    lock_job :retry => 20.seconds do
      arguments.first.to_gid_param
    end

    unique_job :with => :payload

    def perform(project, target: 'preview', current_user: nil)
      # Reset any previous error messages:
      project.meta.delete('error_message')

      # Create a new repo object based on the projects working dir
      repo = Autoshell.new(project.working_dir,
                           :env => Rails.configuration.autotune.build_environment,
                           :logger => project.output_logger)

      # Make sure the repo exists and is up to date (if necessary)
      raise 'Missing files!' unless repo.exist?

      # Add a few extras to the build data
      build_data = project.data.deep_dup
      build_data['build_type'] = 'publish'

      current_user ||= project.user

      # Get the deployer object
      deployer = project.deployer(target.to_sym, :user => current_user)

      # Run the before build deployer hook
      deployer.before_build(build_data, repo.env)

      # Run the build
      repo.cd { |s| s.run(BLUEPRINT_BUILD_COMMAND, :stdin_data => build_data.to_json) }

      # Upload build
      deployer.deploy(project.full_deploy_dir)

      # Create screenshots (has to happen after upload)
      if deployer.take_screenshots?
        begin
          url = deployer.url_for('/')
          script_path = Autotune.root.join('bin', 'screenshot.js').to_s
          repo.cd(project.deploy_dir) { |s| s.run 'phantomjs', script_path, get_full_url(url) }

          # Upload screens
          repo.glob(File.join(project.deploy_dir, 'screenshots/*')).each do |file_path|
            deployer.deploy_file(project.full_deploy_dir, "screenshots/#{File.basename(file_path)}")
          end
        rescue Autoshell::CommandError => exc
          logger.error(exc.message)
          outlogger.warn(exc.message)
        end
      end

      # Set status and save project
      project.update_published_at = true if target.to_sym == :publish
      project.status = 'built'
    rescue => exc
      # If the command failed, raise a red flag
      if exc.is_a? Autoshell::CommandError
        msg = exc.message
      else
        msg = exc.message + "\n" + exc.backtrace.join("\n")
      end
      project.status = 'broken'
      raise
    ensure
      # Always make sure to save the log and the project
      project.save!
    end

    private

    def get_full_url(url)
      return url if url.start_with?('http')
      url.start_with?('//') ? 'http:' + url : 'http://localhost:3000' + url
    end
  end
end
