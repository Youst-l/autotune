"use strict";

var $ = require('jquery'),
    _ = require('underscore'),
    Backbone = require('backbone'),
    camelize = require('underscore.string/camelize'),
    logger = require('../logger'),
    helpers = require('../helpers'),
    diff = require('virtual-dom/diff'),
    patch = require('virtual-dom/patch'),
    html2hscript = require('html2hscript'),
    h = require("virtual-dom/h"),
    createElement = require('virtual-dom/create-element');

var BaseView = Backbone.View.extend({
  loaded: true,
  firstRender: true,
  events: {
    'click button[data-hook],a[data-hook]': 'handleHook'
  },

  initialize: function(options) {
    if (_.isObject(options)) {
      _.extend(this, _.pick(options, 'app', 'query'));
    }

    this.virtualEl = this.makeRootNode();

    this.hook('afterInit', options);
  },

  handleHook: function(eve) {
    eve.preventDefault();
    eve.stopPropagation();

    var $btn = $(eve.currentTarget);

    if ( $btn.hasClass('btn') ) { $btn.button( 'loading' ); }

    this.hook(
      camelize($btn.data('hook')), $btn.data('hook-options')
    ).catch(function(err) {
      logger.error('Hook failed', err);
    }).then(function() {
      if ( $btn.hasClass('btn') ) { $btn.button( 'reset' ); }
    });
  },

  /*
   * Create a virtual dom node for the root element created by the Backbone
   * view. Optionally takes an array of children virtual nodes.
   */
  makeRootNode: function(children) {
    var attrs = {};
    if ( this.id ) { attrs.id = this.id; }
    if ( this.className ) { attrs.className = this.className; }
    return h(this.tagName, attrs, children || []);
  },

  /*
   * Render the view's template and convert it into an array of virtual
   * DOM elements. Returns a promise object.
   */
  renderVirtualDom: function() {
    var view = this;
    // Generate the element using template and templateData()
    var html = helpers.render( this.template, this.templateData() );

    // Create a promise which converts the html string into hscript, then
    // into virtual dom nodes
    return new Promise(function(resolve, reject) {
      html2hscript(html, function(err, hscript) {
        // hscript here is a string of javascript which needs to be evaluated.
        // The string makes use of the `h` function, which we require above.
        if ( err ) {
          reject(err);
        } else {
          resolve(
            view.makeRootNode(eval('[' + hscript + ']')) // jshint ignore:line
          );
        }
      });
    });
  },

  /*
   * Does the full render process for this view, and populate the view.el
   * element. Calling this method will update the view without totally
   * re-rendering it all.
   */
  render: function() {
    var activeTab = window.location.hash,
        view = this;

    // Only render if this view is loaded
    if ( !this.loaded ) { return Promise.resolve(); }

    // Do some renderin'. First up: beforeRender()
    return view.hook( 'beforeRender' ).then(function() {
      return view.renderVirtualDom();
    }).then(function(virtualEl) {
      var patches = diff(view.virtualEl, virtualEl);
      view.el = patch(view.el, patches);
      view.virtualEl = virtualEl;

      // Reset any button states
      view.$('.btn').button('reset');
      return view.hook( 'afterRender' );
    }).then(function() {
      // Set a tab on the page if we have an anchor
      if ( activeTab ) {
        logger.debug( 'set tab', activeTab );
        view.$('.nav-tabs a[href="'+activeTab+'"]').tab('show');
      }

      if ( view.firstRender ) {
        // Reset first render flag
        logger.debug( 'first render' );
        view.firstRender = false;
      }

      view.app.trigger( 'loadingStop' );
    });
  },

  templateData: function() {
    return {
      model: this.model,
      collection: this.collection,
      app: this.app,
      query: this.query
    };
  },

  load: function(parentView) {
    this.loaded = this.firstRender = true;
    this.parentView = parentView;
    return this.trigger('load');
  },

  unload: function() {
    this.loaded = false;
    if ( this.parentView ) { this.parentView = null; }
    return this.trigger('unload');
  },

  hook: function() {
    var args = Array.prototype.slice.call(arguments),
        name = args.shift();

    logger.debug('hook ' + name);

    this.trigger(name, args);

    if( _.isFunction(this[name]) ) {
      return Promise.resolve( this[name].apply(this, args) );
    } else {
      return Promise.resolve( this );
    }
  }
});

/* Take an array of mixins and objects and return a new Backbone view class.
 * Merges objects in the event attributes instead of overridding.
 *
 * http://stackoverflow.com/questions/9403675/backbone-view-inherit-and-extend-events-from-parent
 */
BaseView.extend = function() {
  // make a new array, starting with an empty object and add all the arguments
  var args = [ { } ].concat( Array.prototype.slice.call(arguments) );
  // < [{}, arg1, arg2, arg3...]
  // merge all the objects together...
  var obj = _.extend.apply(_, args);

  // Go through all the arguments and merge together their event attributes
  obj.events = _.extend(
    _.reduce(
      _.pluck(arguments, 'events'),
      function(m, o) { return _.extend(m, o); },
      {} ),
    this.prototype.events
  );

  // Make a view
  return Backbone.View.extend.call(this, obj);
};

module.exports = BaseView;
