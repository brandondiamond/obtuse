(function($) {
  // defaults for modal plugin (note that modal closing is handled by the plugin)
  $.extend($.modal.defaults, {
    persist: true,
    closeClass: "close-popup",
    close: false,
    autoResize: true,
    autoPosition: true,
    modal: true,
    zIndex: 50
  });

  $(document).ready(function() {
    /************/
    /* SETTINGS */
    /************/
    
    $.obtuse.settings.types.modal = "popup";

    /**********/
    /* MODALS */
    /**********/
    
    /*
     * Use the helper to create a confirmation modal.
     */

    $.obtuse.defineAlertModal("alert", $("#alert-modal"));

    /*
     * Welcome message.
     */
 
    $.obtuse.defineModal("welcome", $("#welcome-modal"), function($f) {
      var $f = $("#welcome-modal");
 
      $.obtuse.defineForm($f, {
        '$.friend-lbl': { state: ['friend'] }
      }, {
        modal: true
      });
    });
 
    /**************/
    /* INTERFACES */
    /**************/

    /*
     * Base functionality UI.
     */

    $.obtuse.defineInterface("home", $("#home-interface"), function($f) {
      $f.find('.friend-input').change(function() {
        $.obtuse.dirtyState();
        return true;
      });

      $.obtuse.defineForm($f, {
        friend: { state: ['friend'], rules: ['email'] }
      }, {
        method: 'friend.save',
        error: 'Please enter an email address.'
      }, function(res) {
        $.obtuse.cleanState();
        $.obtuse.showModal("welcome");
      });
    });
 
    /*********/
    /* VIEWS */
    /*********/

    /*
     * Claimed user accessed the app.
     */
 
    $.obtuse.defineView("app", {
      interfaces: [ "home" ]
    }, function() {
      $.obtuse.showModal("alert", {
        title: "Hello World!",
        message: "This is the example app."
      });
    });

    /*******/
    /* APP */
    /*******/
    
    var initial_state = null;
    var initial_view = "app";

    $.obtuse.start(initial_state, initial_view, { 
      warn: true,
      debug: {
        offlineLatency: 3000,
        offline: {
          "*": null,
          "/state/load": "%state%"
        },

        testing: {
          methods: {
            "friend.save": ["post", "/password/save"]
          },
         
          friend: "hello-world@example.com"
        }
      }
    });

    return true;
  });
})(jQuery);
