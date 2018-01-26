require_dependency 'autotune/application_controller'

module Autotune
  # API for blueprints
  class BlueprintsController < ApplicationController
    model Blueprint
    skip_before_action :require_google_login,
                       :only => [:index, :show]

    before_action :only => [:index, :show] do
      require_google_login if google_auth_required? && !accepts_json?
    end

    before_action :respond_to_html
    before_action :require_superuser, :only => [:create, :update, :update_repo, :destroy]

    rescue_from ActiveRecord::UnknownAttributeError do |exc|
      render_error exc.message, :bad_request
    end

    def index
      @blueprints = Blueprint
      query = {}
      query[:status] = params[:status] if params[:status].present?
      query[:mode] = params[:mode] if params[:mode].present?
      query[:tag] = params[:tag] if params[:theme].present?
      query[:type] = params[:type] if params[:type].present?
      @blueprints = @blueprints.search(params[:search]) if params[:search].present?

      if query.empty?
        @blueprints = @blueprints.all
      else
        @blueprints = @blueprints.where(query)
      end
    end

    def show
      @blueprint = instance
    end

    def edit
      @blueprint = instance
    end

    def create
      @blueprint = Blueprint.new
      @blueprint.attributes = select_from_post :title, :repo_url, :slug
      if @blueprint.valid?
        @blueprint.save
        @blueprint.update_repo(current_user)
        render :show, :status => :created
      else
        render_error @blueprint.errors.full_messages.join(', '), :bad_request
      end
    end

    def update
      @blueprint = instance
      @blueprint.attributes = select_from_post :title, :repo_url, :slug, :status, :mode
      if @blueprint.valid?
        trigger_upgrade = @blueprint.repo_url_changed?
        @blueprint.save
        @blueprint.update_repo(current_user) if trigger_upgrade
        render :show
      else
        render_error @blueprint.errors.full_messages.join(', '), :bad_request
      end
    end

    def update_repo
      instance.update_repo(current_user)
      render_accepted
    end

    def destroy
      @blueprint = instance
      if @blueprint.projects.count > 0
        render_error(
          'This blueprint is in use. You must delete the projects which use this blueprint.',
          :bad_request)
      elsif @blueprint.destroy
        head :no_content
      else
        render_error @blueprint.errors.full_messages.join(', '), :bad_request
      end
    end
  end
end
