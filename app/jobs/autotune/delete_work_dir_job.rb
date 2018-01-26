require 'autoshell'

module Autotune
  # recursively delete a filepath
  class DeleteWorkDirJob < ActiveJob::Base
    queue_as :default

    # do the deed
    def perform(path)
      # Get a generic workdir object for the path, and destroy it
      wd = Autoshell.new(path)
      wd.rm if wd.exist?
    end
  end
end
