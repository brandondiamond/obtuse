/**********************************/
/* OBTUSE JS - BY BRANDON DIAMOND */
/**********************************/

(function($) {

  /*
   * Verify that requirements are present.
   */
  if (!jQuery) {
    throw "RequirementMissing";
  }

  /***************/
  /* CONVENIENCE */
  /***************/

  var _opt = function(n) {
    var val = $.obtuse.settings;
    
    $.each(n.split("."), function(i, v) {
      if (! (v in val)) {
        throw "UnknownOption";
      }

      val = val[v];  
    });

    return val;
  };

  /****************/
  /* GLOBAL STATE */
  /****************/

  /*
   * Global state managed by the application (transient).
   */

  var _debug = false;
  var _dirty = false;
  var _state = {};
  var _bind = {};
  var _modes = {};
  var _modals = {};
  var _interfaces = {};

  /********************/
  /* PUBLIC INTERFACE */
  /********************/

  $.obtuse = {

    /*
     * Enable debug modes.
     */

    "enableDebug": function(opts) {
      var opts = $.extend({
        "offline": false,
        "offlineLatency": 3000,
        "testing": null
      }, opts);
 
      _debug = opts.offline ? "offline" : "debug";
      
      // replace state with testing state
      if (opts.testing) {
        $.obtuse.setStateBulk(opts.testing);
      }
 
      // expose state at top level
      window._state = _state;
 
      if (opts.offline) {
        var remoteStub = function(method) {
          return function(url, data) {
            if (console && console.log) {
              console.log("[" + method + "] " + url + " :", data);
            }
            
            // simulate jquery's promise interface
            return { 'success': function(f) { 
              // simulate latency
              setTimeout(function() {
                var res = opts.offline[url] || opts.offline['*'];
               
                // used to simulate state refresh
                if (res == "%state%") {
                  res = _state;
                }

                f(res);
              }, Math.random() * opts.offlineLatency);
              
              // this is brittle (error or complete must follow success invocation)
              return { 'error': function() {}, 'complete': function(f) { f(); } };
            }};
          };
        };
 
        $.realGet = $.get;
        $.realPost = $.post;
 
        $.get = remoteStub("get");
        $.post = remoteStub("post");
      }
    },
 
    /*
     * Determine if a debug mode is active.
     */
 
    "isDebug": function() {
      return _debug != false;
    },
 
    /*
     * Determine if app is running in offline mode.
     */
 
    "isOffline": function() {
      return _debug == "offline";
    },
 
    /*
     * Update global state (transient).
     */
 
    "setState": function(k, v, src) {
      var t = _state[k];
      
      _state[k] = v;
      
      // call any listeners on state change
      $.each((_bind[k] || []).concat(_bind['*'] || []), function(i, f) {
        if ($.isFunction(f)) {
          f(k, v, src);
        }
      });
      
      return t;
    },
 
    /*
     * Merge the old and new states intelligently (transient).
     */
 
    "mergeState": function(k, v, src) {
      var orig = $.obtuse.getState(k, null);
      // promote string to array
      if ($.isArray(orig) && $.type(v) == "string") {
         v = [v];
      }

      if ($.type(orig) == "string" && $.isArray(v)) {
        orig = [orig];
      }

      // attempt array merge
      if ($.isArray(orig) && $.isArray(v)) {
        $.obtuse.setState(k, $.merge($.merge([], orig), v), src);
        return;
      }
 
      // attempt object merge
      if ($.isPlainObject(orig) && $.isPlainObject(v)) {
        $.obtuse.setState(k, $.extend($.extend({}, orig), v), src);
        return;
      }
 
      // attempt string array merge
      if ($.type(orig) == "string" && $.type(v) == "string") {
        $.obtuse.setState(k, $.obtuse.tools.arrayStr($.merge($.merge([], $.obtuse.tools.strArray(orig)), $.obtuse.tools.strArray(v))), src);
        return;
      }
 
      // otherwise, overwrite
      $.obtuse.setState(k, v, src);
    },
 
    /*
     * Set state en masse (transient).
     */
 
    "setStateBulk": function(obj, src) {
      $.each(obj, function(k, v) {
        $.obtuse.setState(k, v, src);
      });
    },
 
    /*
     * Access global state (transient).
     */
 
    "getState": function(k, d) {
      return _state[k] || d;
    },
 
    /*
     * Determine if state has been modified (transient).
     */
 
    "hasState": function(k) {
      return k in _state;
    },
 
    /*
     * Bind a handler to a state change.
     */
 
    "bindState": function(k, f) {
      var ks = $.obtuse.tools.ensureArray(k);
      
      $.each(ks, function(i, k) {
        if (! (k in _bind)) {
          _bind[k] = [];
        }
 
        _bind[k].push(f);
      });
    },
 
    /*
     * Reload state from the backend.
     */
 
    "reloadState": function(succ, fail) {
      $.obtuse.remoteCall("state.load", {}, function(res) {
        $.obtuse.setStateBulk(res);
        
        if ($.isFunction(succ)) {
          succ();
        }
      }, fail, {
        'silent': true
      });
    },

    /*
     * Auto reload state from the backend. 
     */
    
    "liveState": function() {
      $.obtuse.remotePoll("state.load", {}, function(res) {
        $.obtuse.setStateBulk(res);
      });
    },

    /*
     * Warn about losing unsaved state on navigate away.
     */
 
    "warnState": function() {
      window.onbeforeunload = function() {
        if (_dirty) {
          return _opt("states.unsaved");
        }
      };
    },

    /*
     * Mark state as dirty.
     */

    "dirtyState": function() {
      _dirty = true;
    },

    /*
     * Mark state as clean.
     */

    "cleanState": function() {
      _dirty = false;
    },

    /***************/
    /* STATE MODES */
    /***************/
    
    /*
     * Define a collection of state (and logic) as a mode.
     */
 
    "defineMode": function(name, st, logic) {
      _modes[name] = function() {
        $.obtuse.setStateBulk(st, "mode");
 
        if ($.isFunction(logic)) {
          logic();
        }
      };
    },
 
    /*
     * Switch the app to a new mode (potentially hitting the backend).
     */
 
    "setMode": function(name, remote) {
      if (remote) {
        $.obtuse.reloadState(_modes[name]);
      } else {
        _modes[name]();
      }
    },
 
    /*
     * Obtain mode by name.
     */

    "getMode": function(name) {
      return _modes[name];
    },

    /****************/
    /* REMOTE CALLS */
    /****************/
 
    /*
     * Support for remote procedure calls.
     */
 
    "remoteCall": function(method, data, succ, fail, opts) {
      var opts = $.extend({
        success: $.obtuse.settings.network.success,
        failure: $.obtuse.settings.network.failure,
        silent: false,
        background: false
      }, opts);

      var _fail = function() {
        var _impl = function() {
          if (!opts.silent) {
            $.obtuse.external.message("error", opts.failure);
          }
 
          if ($.isFunction(fail)) {
            fail();
          }
        };
        
        if (opts.background) {
          _impl();
        } else {
          $.obtuse.external.lock("hide", _impl);
        }
      };
 
      var _succ = function(res) {
        var _impl = function() {
          if (!opts.silent) {
            $.obtuse.external.message("show", opts.success);
          }
 
          if ($.isFunction(succ)) {
            succ(res);
          }
        };
        
        if (opts.background) {
          _impl();
        } else {
          $.obtuse.external.lock("hide", _impl);
        }
      };
      
      if (!opts.background) {
        $.obtuse.external.lock("show", null);
      }

      // attempt to persist to server (catching client, server, and app errors)
      try {
        var methods = $.obtuse.getState("methods", {});
 
        if (!(method in methods)) {
          throw "UnknownRemoteMethod";
        }
        
        // lookup route and use the appropriate url/method
        $[methods[method][0]](methods[method][1], data).success(function(res) {
          _succ(res);
        }).error(function() {
          _fail();
        });
      } catch(e) {
        _fail();
 
        if ($.obtuse.isDebug()) {
          throw e;
        }
      }
    },

    /*
     * Support for remote polling.
     */
 
    "remotePoll": function(method, data, succ, opts) {
      var methods = $.obtuse.getState("methods", {});
 
      if (!(method in methods)) {
        throw "UnknownRemoteMethod";
      }

      $.obtuse.external.socket("await", methods[method][1], data, function(res) {
        if ($.isFunction(succ)) {
          return succ(res);
        }
      });
    },
    
    /**************/
    /* VALIDATION */
    /**************/
 
    /*
     * Ensure a single value meets a list of validation criteria.
     */
 
    "validate": function(value, ops, refs) {
      var refs = refs || {};
      var rules = {
        'optional': function(v) { return true; },
        'equal': function(v, o) { return v == o; },
        'minLen': function(v, o) { return v.length >= o; },
        'maxLen': function(v, o) { return v.length <= o; },
        'equalRef': function(v, o) { return v == refs[o]; },
        'email': function(v) { return $.obtuse.tools.isEmail(v); },
        'emails': function(v) {
          var vs = $.obtuse.tools.strArray(v);
          
          for (var i=0; i<vs.length; i++) {
            if (!$.obtuse.tools.isEmail(vs[i])) {
              return false;
            }
          }
 
          return true;
      }};
 
      // if value unset and optional is tolerated, succeed
      if ($.inArray("optional", ops) != -1 && !value) {
        return true;
      }
 
      // apply each operation, short circuiting on failure
      for (var i=0; i<ops.length; i++) {
        // arguments separated by colon
        var os = ops[i].split(":");
        var op = os.shift();
        
        os.unshift(value);
        
        if (!(op in rules)) {
          return false;
        }
        
        if (!rules[op].apply(undefined, os)) {
          return false;
        }
      }
 
      return true;
    },
    
    /*
     * Apply validation rules to a set of named values.
     */
 
    "validateAll": function(rules, refs) {
      var refs = refs || {};
      var invalid = [];
      
      // rules map names to validations; refs map names to values
      $.each(rules, function(ref, rs) {
        if (!$.obtuse.validate(refs[ref], rs, refs)) {
          invalid.push(ref);
        }
      });
 
      return invalid;
    },
 
    /**************/
    /* FORM STATE */
    /**************/
 
    /*
     * Find all data entry fields within a form.
     */
 
    "formFields": function($f) {
      return $f.find("[name]");
    },
 
    /*
     * Obtain form data as a dictionary.
     */
 
    "formData": function($f) {
      var data = {};
 
      $.obtuse.formFields($f).each(function () {
        var $this = $(this);
        data[$this.attr("name")] = $this.obtuseGetVal();
      });
 
      return data;
    },
 
    /*
     * Obtain form names.
     */
 
    "formNames": function($f) {
      $.map($.obtuse.formFields($f), function(v) {
        return v.attr("name");
      });
    },
 
    /*
     * Parse and find field from state key.
     */
 
    "findField": function($f, k) {
      if (!k) {
        return;
      }
      
      // use jquery selector
      if (k[0] == "$") {
        return $f.find(k.slice(1));
      }
 
      return $f.find("[name=" + k + "]");
    },
 
    /*
     * Update state from form.
     */
 
    "saveFormState": function($f, s) {
      var s = s || {};
      
      $.each(s, function(k, ds) {
        var $e = $.obtuse.findField($f, k);
        $.obtuse.relations.executeAll("save", $.obtuse.tools.ensureArray(ds), $e.obtuseGetVal(), $e, $f);      
      });
    },
 
    /*
     * Update form from state.
     */
 
    "loadFormState": function($f, s) {
      var s = s || {};
      
      $.each(s, function(k, ds) {
        var $e = $.obtuse.findField($f, k);
        $.obtuse.relations.executeAll("load", $.obtuse.tools.ensureArray(ds), null, $e);
      });
    },
 
    /*
     * Automatically update form on state changes (but not vice versa).
     */
 
    "connectFormState": function($f, s, both) {
      var s = s || {};

      if (both) {
        throw "NotImplementedError";
      }
 
      $.each(s, function(k, ds) {
        var $e = $.obtuse.findField($f, k);
        $.obtuse.relations.connectAll("load", $.obtuse.tools.ensureArray(ds), $e, $f);
      });
    },
    
    /*
     * Instrument a form (with a single button) for validation and processing.
     */
 
    "formValidation": function($f, btn, rules, err, callback) {
      var err = err || "Please correct your submission and try again.";
 
      $f.find(btn).click(function() {
        var invalid = $.obtuse.validateAll(rules, $.obtuse.formData($f));
        
        // on success, hide all indication styles and invoke callback
        if (invalid.length == 0) {
          $f.find("." + _opt("validation.bad")).removeClass(_opt("validation.bad") + " " + _opt("validation.good"));
          
          if ($.isFunction(callback)) {
            callback($f);
          }
        } else {
          $.each(invalid, function(i, v) {
            $f.find("[name=" + v + "]").removeClass(_opt("validation.good")).addClass(_opt("validation.bad"));
          });
          
          $.obtuse.external.message("error", err);
        }
 
        return false;
      });
 
      // perform validation on each contained field after blur
      $.obtuse.formFields($f).blur(function() {
        var $this = $(this);
 
        if ($.obtuse.validate($this.obtuseGetVal(), rules[$this.attr("name")] || [], $.obtuse.formData($f))) {
          $this.removeClass(_opt("validation.bad")).addClass(_opt("validation.good"));
        } else {
          $this.removeClass(_opt("validation.good")).addClass(_opt("validation.bad"));
        }
      });
    },
 
    /*
     * Bare-bones form instrumentation.
     */
 
    "formHandler": function($f, rules, callback, opts) {
      var opts = $.extend({
        'error': null,
        'inject': null,
        'restore': null
      }, opts);
 
      $.obtuse.formValidation($f, "." + _opt("actions.save"), rules, opts.error, function() {
        var resume = function(success) {
          if (success || (success === undefined)) {
            if ($.isFunction(callback)) {
              callback();
            }
          } else {
            // restore original form state
            if ($.isFunction(opts.restore)) {
              opts.restore();
            }
          }
        };
 
        if ($.isFunction(opts.inject)) {
          opts.inject($.obtuse.formData($f), resume);
        } else {
          resume();
        }
      });
    },
 
    /*
     * Instrument a simple form that uses basic HTTP submission.
     */
 
    "basicFormHandler": function($f, rules, opts) {
      $.obtuse.formHandler($f, rules, function() {
        var go = true;
 
        if ($.isFunction(opts.succ)) {
          go = opts.succ(); 
        }
 
        if (go === true || go === undefined) {
          $f.submit();
        }
      }, opts);
    },
 
    /*
     * Instrument a remote form that uses asynchronous AJAX calls.
     */
 
    "remoteFormHandler": function($f, rules, method, opts) {
      var opts = $.extend({
        'succ': null,
        'fail': null
      }, opts);
 
      return $.obtuse.formHandler($f, rules, function() {
        $.obtuse.remoteCall(method, $.obtuse.formData($f), opts.succ, opts.fail, opts);
      }, opts);
    },
 
    /*
     * Prepare a form for use in the interface with validation, processing, and data binding.
     */
 
    "defineForm": function($f, spec, opts, succ) {
      var rules = {};
      var state = {};
      var opts = $.extend({
        'modal': false,
        'restore': true,
        'method': null,
        'init': null,
        'succ': succ
      }, opts);
 
      // extract validations and mappings from specification
      $.each(spec, function(k, v) {
        if ('rules' in v) {
          rules[k] = v['rules'];
        }
 
        if ('state' in v) {
          state[k] = v['state'];
        }
      });
 
      // perform any initialization before linking to backend state
      if ($.isFunction(opts.init)) {
        $.proxy(opts.init, $f)();
      }
 
      // update form when global state changes
      $.obtuse.connectFormState($f, state);
 
      // update global state when form processed successfully
      $.obtuse.tools.preempt(opts, {
        'succ': function() {
          $.obtuse.saveFormState($f, state);

          if (opts.modal) {
            $.obtuse.hideModals();
          }
        }
      });
 
      // restore state on cancel (and failed injection)
      if (opts.restore) {
        opts.restore = function() {
          $.obtuse.loadFormState($f, state);
        };
      } 

      $f.find("." + _opt("actions.cancel")).click(function() {
        opts.restore();
        return false;
      });
 
      // debounce the submit button
      $f.find("." + _opt("actions.save")).click(function() {
        var $this = $(this);
        
        $this.attr("disabled", "disabled");
        
        setTimeout(function() {
          $this.removeAttr("disabled");
        }, 1500);
 
        return false;
      });
      
      // bind validations and processing
      if (opts.method) {
        $.obtuse.remoteFormHandler($f, rules, opts.method, opts);
      } else {
        $.obtuse.basicFormHandler($f, rules, opts);
      }
    },
 
    /********************/
    /* MODAL MANAGEMENT */
    /********************/
    
    /*
     * Get modal information.
     */

    "getModal": function(name) {
      return _modals[name];
    },

    /*
     * Define a new modal.
     */

    "defineModal": function(name, $e, prepare, refresh) {
      _modals[name] = {
        "element": $e,
        "prepare": function() {
          $e.addClass(_opt("types.modal"));

          if ($.isFunction(prepare)) {
            $.proxy(prepare, $e)($e);
          }
        },

        "refresh": function(args) {
          var cnt = true;

          if ($.isFunction(refresh)) {
            cnt = $.proxy(refresh, $e)($e, args);
          }

          return cnt;
        }
      };
    },

    /*
     * Hide all modals.
     */
 
    "hideModals": function() {
      $.obtuse.external.modal("close");
    },
 
    /*
     * Show a modal.
     */
 
    "showModal": function(name, args) {
      var modal = $.obtuse.getModal(name);
      
      if (modal.refresh(args)) {
        $.obtuse.hideModals();
        $.obtuse.external.modal("open", modal.element);
      }
    },
 
    /*
     * Switch from one modal to another (visual effect).
     */
 
    "swapModal": function(name, args) {
      $.obtuse.hideModals();
      setTimeout(function() { $.obtuse.showModal(name, args); }, 100);
    },
 
    /*
     * Confirm changes to a set of values.
     */
 
    "defineConfirmModal": function(name, el) {
      var handler = function($e, args) {
        var args = $.extend({
          'emptyMessage': 'No changes.',
          'previous': [],
          'next': [],
          'resume': function() {},
        }, args);
        
        var $a = $e.find("." + _opt("changes.added"));
        var $r = $e.find("." + _opt("changes.removed"));
        var diff = $.obtuse.tools.changes($.obtuse.tools.strArray(args.previous), $.obtuse.tools.strArray(args.next));
        
        // if no changes, simply resume and skip modal
        if (diff.add.length == 0 && diff.rem.length == 0) {
          args.resume(true);
          return false;
        }
   
        $e.find("." + _opt("changes.addedCount")).text(diff.add.length);
        $e.find("." + _opt("changes.removedCount")).text(diff.rem.length);
   
        $a.empty();
        $.each(diff.add.length ? diff.add : [ args.emptyMessage ], function(i, v) {
          $a.append($("<li />").text(v));
        });
   
        $r.empty();
        $.each(diff.rem.length ? diff.rem : [ args.emptyMessage ], function(i, v) {
          $r.append($("<li />").text(v));
        });
   
        $e.find("." + _opt("actions.save")).unbind("click").click(function() {
          args.resume(true);
          $.obtuse.hideModals();
   
          return false;
        });
   
        $e.find("." + _opt("actions.cancel")).unbind("click").click(function() {
          args.resume(false);
          $.obtuse.hideModals();
   
          return false;
        });

        return true;
      };

      $.obtuse.defineModal(name, el, handler, handler);
    },

    /*
     * Show an alert message.
     */
 
    "defineAlertModal": function(name, el) {
      var handler = function($e, args) {
        var args = $.extend({
          'title': 'New Alert',
          'message': '',
          'content': '',
          'resume': function() {},
        }, args);
        
        $e.find("." + _opt("alert.title")).text(args.title);
        $e.find("." + _opt("alert.message")).text(args.message);
        $e.find("." + _opt("actions.cancel")).unbind("click").click(function() {
          args.resume(true);
          $.obtuse.hideModals();
          return false;
        });
   
        return true;
      };

      $.obtuse.defineModal(name, el, handler, handler);
    },
 
    /*
     * Prepare all modal UI.
     */
   
    "prepareModals": function() {
      $.each(_modals, function(name, m) {
        m.prepare();
      });
    },

    /************************/
    /* INTERFACE MANAGEMENT */
    /************************/
    
    /*
     * Get interface information.
     */

    "getInterface": function(name) {
      return _interfaces[name];
    },
    
    /*
     * Define a new interface.
     */

    "defineInterface": function(name, $e, prepare, refresh) {
      _interfaces[name] = {
        "element": $e,
        "prepare": function() {
          $e.addClass(_opt("types.interface"));

          if ($.isFunction(prepare)) {
            $.proxy(prepare, $e)($e);
          }
        },

        "refresh": function(args) {
          var cnt = true;

          if ($.isFunction(refresh)) {
            cnt = $.proxy(refresh, $e)($e, args);
          }

          return cnt;
        }
      };
    },
 
    /*
     * Hide all interfaces.
     */
 
    "hideInterfaces": function() {
      $("." + _opt("types.interface")).hide();
    },
 
    /*
     * Show a interface.
     */
 
    "showInterface": function(name, args) {
      var iface = $.obtuse.getInterface(name);

      if (iface.refresh(args)) {
        $.obtuse.hideInterfaces();
        iface.element.show();
      }
    },
 
    /*
     * Prepare all interface UI.
     */
 
    "prepareInterfaces": function() {
      $.each(_interfaces, function(name, i) {
        i.prepare();
      });
    },
 
    /*******************/
    /* VIEW MANAGEMENT */
    /*******************/
    
    /*
     * Get view code.
     */

    "getView": function(name) {
      return $.obtuse.getMode(name);
    },
 
    /*
     * Define modes that interface with the app's UI.
     */
 
    "defineView": function(name, ui, logic) {
      $.obtuse.defineMode(name, ui['state'] || {}, function() {
        $.obtuse.hide();
 
        $.each(ui['modals'] || [], function(i, v) {
          $.obtuse.showModal(v);
        });
 
        $.each(ui['interfaces'] || [], function(i, v) {
          $.obtuse.showInterface(v);
        });
 
        if ($.isFunction(logic)) {
          logic();
        }
      });
    },
 
    /*
     * Prepare all application views.
     */
 
    "prepareViews": function() {
      $.obtuse.prepareInterfaces();
      $.obtuse.prepareModals();
    },

    "showView": function(view, remote) {
      $.obtuse.setMode(view, remote);
    },

    "hideViews": function() {
      $.obtuse.hideModals();
      $.obtuse.hideInterfaces();
    },
 
    /******************/
    /* INITIALIZE APP */
    /******************/
 
    /*
     * Hide all UI elements.
     */
 
    "hide": function() {
      $.obtuse.hideViews();
    },
 
    /*
     * Initialize backend state (and add local app state).
     */ 
 
    "prepareState": function(init) {
      if (init) {
        $.obtuse.setStateBulk(init);
      }
    },
 
    /*
     * Initialize minimal backend state for bootstrap. 
     */ 
 
    "prepareBootstrap": function(url) {
      $.obtuse.setStateBulk({
        "methods": {
          "state.load": ["get", url]
        }
      });
    },
 
    /*
     * Prepare all UI and state.
     */
 
    "prepare": function(init) {
      // must be stateless (i.e., not depend on state)
      $.obtuse.prepareViews();
 
      // setting state will trigger events to update UI
      $.obtuse.prepareState(init);
    },
 
    /*
     * Bootstrap launch via remote.
     */
 
    "bootstrap": function(url, succ, fail) {
      // seed the state with the provided url
      $.obtuse.prepareBootstrap(url);
 
      // trigger state reload
      $.obtuse.reloadState(succ, fail);
    },
 
    /*
     * Main function.
     */
 
    "start": function(init, view, opts) {
      var opts = $.extend({
        "debug": false,
        "warn": false,
        "live": false
      }, opts);
      
      var bootstrap = $.type(init) == "string" ? init : null;

      if (opts.warn) {
        $.obtuse.warnState();
      }

      $.obtuse.prepare(bootstrap ? null : init);

      var launch = function() {
        // after ui is defined to ensure events update UI
        if (opts.debug) {
          $.obtuse.enableDebug(opts.debug);
        }
        
        if (opts.live) {
          $.obtuse.liveState();
        }
        
        $.obtuse.showView(view);
      };
 
      if (bootstrap) {
        $.obtuse.bootstrap(bootstrap, launch);
      } else {
        launch();
      }
    }
  };

  /********************/
  /* EXTERNAL SUPPORT */
  /********************/
  
  /*
   * Each plugin has methods which take a standard set of arguments that obtuse anticipates.
   */

  $.obtuse.external = {
    "modal": function(method) {
      if (!jQuery.modal) {
        throw "RequirementMissing";
      }

      switch(method) {
        case "close":
          $.modal.close()
          break;
        
        case "open":
          var $e = arguments[1];

          $e.modal();
          break;

        default:
          throw "UnknownModalMethod";
      }
    },

    "message": function(method, text) {
      switch(method) {
        case "error":
          $.obtuse.tools.showError(text);
          break;

        case "show":
          var important = arguments[2];
          var timeout = arguments[3];

          $.obtuse.tools.showMessage(text, important, timeout);
          break;

        case "hide":
          var callback = arguments[2];
          var message = arguments[3];

          $.obtuse.tools.hideMessage(callback, message);
          break;

        default:
          throw "UnknownMessageMethod";
      }
    },

    "lock": function(method) {
      switch(method) {
        case "show":
          var timeout = arguments[1];

          $.obtuse.tools.showLoading(timeout);
          break;

        case "hide":
          var callback = arguments[1];

          $.obtuse.tools.hideLoading(callback);
          break;

        default:
          throw "UnknownLockMethod";
      }
    },

    "flag": function(method, $e, text) {
      switch(method) {
        case "show":
          var timeout = arguments[1];
          
          $e.obtuseShowFlag(text, timeout);
          break;

        default:
          throw "UnknownFlagMethod";
      }
    },

    "socket": function(method) {
      switch(method) {
        case "await":
          var url = arguments[1];
          var data = arguments[2];
          var callback = arguments[3];
          var timeout = arguments[4];

          $.obtuse.tools.pollRemote(url, data, callback, timeout);
          break;

        default:
          throw "UnknownSocketMethod";
      }
    },
  };

  /*******************/
  /* GLOBAL SETTINGS */
  /*******************/
  
  $.obtuse.settings = {
    "states": {
      "unsaved": "You have unsaved changes."
    },
    
    "actions": {
      "save": "save",
      "cancel": "cancel"
    },

    "changes": {
      "added": "added",
      "addedCount": "added-count",
      "removed": "removed",
      "removedCount": "removed-count"
    },

    "alert": {
      "title": "title",
      "message": "message"
    },

    "types": {
      "modal": "modal",
      "interface": "interface",
      "view": "view"
    },

    "messages": {
      "information": "message-info",
      "inner": "inner",
      "important": "important"
    },

    "annotations": {
      "flag": "flag"
    },

    "loading": {
      "overlay": "loading-overlay",
      "message": "Loading...",
      "timeout": 5000
    },

    "validation": {
      "good": "valid",
      "bad": "error"
    },

    "network": {
      "success": "Your changes have been saved.",
      "failure": "We couldn't save your changes.",
      "poll": 30000
    },

    "separators": {
      "pattern": /[\s,]+/,
      "value": ", "
    }
  };

  /********************/
  /* STATE OPERATIONS */
  /********************/

  /*
   * "Save" pushes UI to state, "load" pushes state to UI.
   */

  $.obtuse.relations = {
    "default": {
      "triggers": [ "save", "load" ],
      "operators": [ "assign" ]
    },

    "triggers": {
      ">": [ "save" ],
      "<": [ "load" ],
      "*": [ "save", "load" ]
    },

    "connectors": {
      "save": function(state, $e, src, callback) {
        $e.change(function() {
          callback(state, null, $e, src);
          return true;
        });
      },

      "load": function(state, $e, src, callback) {
        $.obtuse.bindState(state, function(k, v, s) {
          // ignore state changes triggered by same source (don't reload own value)
          if (s != src) {
            callback(state, v, $e, src);
          }
        }, state);
      }
    },

    "operators": {
      "=": [ "assign" ],
      "#": [ "count" ],
      "~": [ "merge" ],
      "^": [ "first" ],
      "?": [ "default" ]
    },
    
    "evaluators": {
      "save": {
        "assign": function(state, value, $e, src) {
          $.obtuse.setState(state, value || $e.obtuseGetVal(), src);
        },
  
        "merge": function(state, value, $e, src) {
          $.obtuse.mergeState(state, value || $e.obtuseGetVal(), src);
        }
      },
  
      "load": {
        "assign": function(state, value, $e, src) {
          $e.obtuseSetVal(value || $.obtuse.getState(state, ""));
        },
  
        "count": function(state, value, $e, src) {
          $e.obtuseSetVal($.obtuse.tools.strArray(value || $.obtuse.getState(state, [])).length);
        },
  
        "first": function(state, value, $e, src) {
          var arr = $.obtuse.tools.strArray(value || $.obtuse.getState(state, []));

          if (arr.length > 0) {
            $e.obtuseSetVal(arr[0]);
          }
        },

        "default": function(state, value, $e, src) {
          if (!$.trim($e.obtuseGetVal())) {
            $e.obtuseSetVal(value || $.obtuse.getState(state, ""));
          }
        }
      }
    },

    "parse": function(directive) {
      var state;
      var trgs; 
      var ops;
      var i;

      for(i = 0; i < directive.length && i < 2; i++) {
        if (directive[i] in $.obtuse.relations.triggers) {
          trgs = $.obtuse.relations.triggers[directive[i]];
          continue;
        }
        
        if (directive[i] in $.obtuse.relations.operators ) {
          ops = $.obtuse.relations.operators[directive[i]];
          continue;
        }

        break;
      }

      return { 
        "state": directive.slice(i),
        "triggers": trgs || $.obtuse.relations.default.triggers,
        "operators": ops || $.obtuse.relations.default.operators
      }
    },

    "execute": function(trigger, directive, value, $e, src) {
      var parsed = $.obtuse.relations.parse(directive);

      $.each(parsed.triggers, function (i, trg) {
        // only evaluate operations that match the trigger
        if (trg != trigger) {
          return true;
        }

        $.each(parsed.operators, function (i, op) {
          if (! (trg in $.obtuse.relations.evaluators)) {
            return true;
          }
          
          if (! (op in $.obtuse.relations.evaluators[trg])) {
            return true;
          }

          $.obtuse.relations.evaluators[trg][op](parsed.state, value, $e, src);
        });
      });
    },

    "executeAll": function(trigger, directives, value, $e, src) {
      $.each(directives, function (i, directive) {
        $.obtuse.relations.execute(trigger, directive, value, $e, src);
      });
    },

    "connect": function(trigger, directive, $e, src) {
      var parsed = $.obtuse.relations.parse(directive);
      
      if (! (trigger in $.obtuse.relations.connectors)) {
        throw "UnknownRelationConnector";
      }

      $.obtuse.relations.connectors[trigger](parsed.state, $e, src, function (state, value, $e, src) {
        $.obtuse.relations.execute(trigger, directive, value, $e, src);
      });
    },

    "connectAll": function(trigger, directives, $e, src) {
      // directives are evaluated in an undefined
      $.each(directives, function (i, directive) {
        $.obtuse.relations.connect(trigger, directive, $e, src);
      });
    }
  };

  /*******************/
  /* UTILITY LIBRARY */
  /*******************/
  
  var _msg_id = undefined;
  var _load_id = undefined;

  $.obtuse.tools = {
    "limitLen": function(s, m) {
      return s.length > m ? s.substr(0, m) + "..." : s;
    },

    "capFirst": function(str) {
      return str.replace(/^\w/, function(w) { return w.toUpperCase(); });
    },

    "capWords": function(s) {
      var result = "";
      
      $.each(s.split(" "), function() {
        result += " " + $.obtuse.tools.capFirst(this);
      });

      return result.substr(1);
    },

    "humanizeArray": function(a) {
      return (a.length > 1 ? a.slice(0, -1).join(", ").toLowerCase() + " and " + a.slice(-1).join("") : a.join("")).toLowerCase();
    },

    "ensureArray": function(a) {
      if (!$.isArray(a)) {
        return [a];
      }

      return a;
    },

    "argsArray": function(args) {
      return Array.prototype.slice.call(args);
    },

    "prettyJoin": function(arr, sep) {
      var sep = sep || "and";
      var fst = arr.slice(0, arr.length - 1);
      var lst = arr.slice(arr.length - 1);
      
      if(fst.length > 0) {
        return fst.join(", ") + " " + sep + " " + lst;
      }

      return lst + "";
    },

    "unixToDate": function(u) {
      return new Date(u * 1000);
    },

    "dateToString": function(d) {
      var h = d.getHours();
      var m = d.getMinutes();
      
      return ((h % 12) || 12) + ":" + (m < 10 ? "0" + m : m) + " " + (h < 12 ? "am" : "pm");
    },

    "unixToString": function(u) {
      return $.obtuse.tools.dateToString($.obtuse.tools.unixToDate(u));
    },

    "objectToString": function(obj) {
      var str = '';
      for (var p in obj) {
          if (obj.hasOwnProperty(p)) {
              str += p + '::' + obj[p] + '\n';
          }
      }
      return str;
    },

    "refresh": function(data) {
      window.location = data ? window.location.pathname.split("?")[0] + "?" + $.param(data) : window.location.pathname;
    },

    "redirect": function(href) {
      window.location = href;
    },

    "changes": function(p, n) {
      var rem = [];
      var add = [];
      var nop = [];

      var n = n || [];
      var p = p || [];

      $.each(n, function(i, v) {
        if($.inArray(v, p) == -1) {
          add.push(v);
        }
      });

      $.each(p, function(i, v) {
        if($.inArray(v, n) == -1) {
          rem.push(v);
        } else {
          nop.push(v);
        }
      });

      return {
        'rem': rem, 
        'add': add, 
        'nop': nop
      };
    },

    "explode": function(objs) {
      var key = {};
      var ids = $.map(objs, function(v) { key[v.id] = v; return v.id; });

      return {
        'key': key,
        'ids': ids
      };
    },

    "lockButton": function($b, func, safe) {
      var timeout = -1;
      var _lock = function() {
        $b.prop("disabled", true).addClass("disabled");
      };

      var _unlock = function() {
        $b.prop("disabled", false).removeClass("disabled");

        if(timeout != -1) {
          clearTimeout(timeout);
        }
      };
      
      // avoid executing if already locked
      if($b.hasClass("disabled")) {
        return;
      }

      _lock();

      if(safe !== false) {
        timeout = setTimeout(_unlock, safe || 10000);
      }

      func(_unlock);
    },

    "pollGet": function(url, data, callback, timeout) {
      var timeout = timeout || _opt('network.poll');
      var _poll = function() {
        setTimeout(function() {
          try {
            $.get(url, data).success(function() {
              var result = callback(data);
                
              // allow callback to (optionally) modify data on each cycle
              if (result !== undefined) {
                data = result;
              }
            }).complete(_poll);

          } catch (e) {
            /* ignore */
          }
        }, _opt('network.poll'));
      };

      _poll();
    },

    "getOrCreate": function(i, p, e) {
      var id = i.split(".");
      var $p = $(p || "body");
      var $e = $p.find("#" + id[0]);

      if(!$e.length) {
        $e = $(e || "<div />", { "id": id[0], "class": id.length == 2 ? id[1] : "" });
        $(p || "body").prepend($e);
      }
      
      return $e;
    },
  
    "showMessage": function(msg, imp, ms) {
      var ms = ms || 6000;
      var $holder = $.obtuse.tools.getOrCreate("message-holder." + _opt("messages.information"));
      var $message = $.obtuse.tools.getOrCreate("message." + _opt("messages.inner"), $holder, "<span />") 

      $.obtuse.tools.hideMessage(function() {
        var $this = $(this);

        if(imp) {
          $holder.addClass(_opt("messages.important"));
        } else {
          $holder.removeClass(_opt("messages.important"));
        }

        $this.text(msg).fadeIn();
        
        return true;
      });
      
      if(_msg_id !== undefined) {
        clearTimeout(_msg_id);
      }
     
      if(ms != -1) {
        _msg_id = setTimeout($.obtuse.tools.hideMessage, ms);
      }
    },

    "hideMessage": function(func, msg) {
      var $holder = $.obtuse.tools.getOrCreate("message-holder." + _opt("messages.information"));
      var $message = $.obtuse.tools.getOrCreate("message." + _opt("messages.inner"), $holder, "<span />") 

      if (msg && $message.text() != msg) {
        return false;
      }

      $message.stop().fadeOut(function() {
        $(this).text("").removeClass(_opt("messages.important"));
        
        if($.isFunction(func)) {
          $.proxy(func, this)();
        }
        
        return true;
      });
      
      if(_msg_id !== undefined) {
        clearTimeout(_msg_id);
        _msg_id = undefined;
      }
    },

    "showError": function(msg) {
      $.obtuse.tools.hideLoading();
      $.obtuse.tools.showMessage(msg, true);
    },

    "hideError": function() {
      $.obtuse.tools.hideMessage();
    },

    "showLoading": function(limit) {
      var limit = limit === undefined ? _opt("loading.timeout") : limit;

      $.obtuse.tools.hideLoading(function() {
        var $this = $(this);
        $this.fadeIn(function() {
          $.obtuse.tools.showMessage(_opt("loading.message"));
        });
      });

      if(_load_id !== undefined) {
        clearTimeout(_load_id);
      }
      
      if (limit === null) {
        _load_id = undefined;
      } else {
        _load_id = setTimeout($.obtuse.tools.hideLoading, limit);
      }
    },

    "hideLoading": function(func) {
      if(_load_id !== undefined) {
        clearTimeout(_load_id);
        _load_id = undefined;
      }
      
      $.obtuse.tools.hideMessage(undefined, _opt("loading.message"));
      $.obtuse.tools.getOrCreate("loading." + _opt("loading.overlay")).stop().fadeOut(function() {
        if($.isFunction(func)) {
          $.proxy(func, this)();
        }
      });
    },

    "randomString": function(strs) {
      return strs[Math.floor(strs.length * Math.random())];
    },

    "isEmail": function(raw) {
      return /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i.test(raw);
    },

    "preempt": function(obj, nxt, rev) {
      $.each(nxt, function(k, f) {
        var orig = obj[k];

        obj[k] = function() {
          var res;

          if (!rev) {
            f.apply(f, arguments);
          }

          if ($.isFunction(orig)) {
            res = orig.apply(orig, arguments);
          }

          if (rev) {
            f.apply(f, arguments);
          }

          return res;
        };
      });

      return obj;
    },

    "arrayStr": function(a) {
      return a.join(_opt("separators.value"));
    },

    "strArray": function(a) {
      if ($.isArray(a)) {
        return a;
      }

      if ($.type(a) == "string") {
        return a.trim().split(_opt("separators.pattern"));
      }
      
      throw "Array or string expected."
    },

    "installPlugins": function() {
      $.each($.obtuse.plugins, function (k, v) {
        $.fn["obtuse" + $.obtuse.tools.capFirst(k)] = v;
      });
    }
  };
  
  /******************/
  /* PLUGIN LIBRARY */
  /******************/

  $.obtuse.plugins = {
    "lettersLeft": function($stat) {
      return this.bind("keyup change blur", function() {
        var $this = $(this);
        var left = $this.attr("maxlength") - $this.val().length;
        
        if($this.val() == $this.attr("title")) {
          left = $this.attr("maxlength");
        }
  
        ($.isFunction($stat) ? $stat($this) : $stat).text(" (" + left + " letter" + (left == 1 ? "" : "s") + " left)");
        
        return left > 0;
      });
    },
  
    "preview": function() {
      return this.bind("change blur", function() {
        var $this = $(this);
        
        if($this.val().trim().length == 0) {
          $this.val($this.attr("title")).addClass("shy");
        }
      }).click(function() {
        var $this = $(this);
  
        if($this.val() == $this.attr("title")) {
          $this.val("").removeClass("shy");
        }
      }).each(function() {
        var $this = $(this);
        $this.val($this.attr("title")).addClass("shy");
      });
    },
  
    /*
     * Smarter checkboxes with on/off validations.
     */

    "checkbox": function(on, off) {
      return this.each(function() {
        $(this).click(function() {
          var $this = $(this);
          
          // important: checked property has already been updated
          if($this.is(":checked")) {
            var ret = $.proxy(on, this)(function(nxt) { 
              if(nxt) {
                $this.attr("checked", true);
              } else {
                $this.attr("checked", false);
              }
            });
            
            // support async callback or return value based transition
            if(ret !== undefined) {
              return ret;
            }
  
            return false;
          }
  
          var ret = $.proxy(off, this)(function(nxt) { 
            if(nxt) {
              $this.attr("checked", true);
            } else {
              $this.attr("checked", false);
            }
          });
          
          if(ret !== undefined) {
            return !ret;
          }
  
          return false;
        });
      });
    },
  
    "showFlag": function(msg, ms) {
      return this.each(function() {
        var $this = $(this);

        var $flag = $("<div />").addClass(_opt("annotations.flag")).text(msg).hide();
        var pos = $this.position();
        
        $flag.css({ "top": pos.top, "left": pos.left + $this.outerWidth(), "position": "absolute" }).appendTo($this.offsetParent()).fadeIn(function() {
          setTimeout(function() {
            $flag.fadeOut(function() {
              $(this).remove();
            });
          }, ms || 4000);
        });
      });
    },
  
    "fidget": function(interval, sym, len) {
      var interval = interval || 1000;
      var sym = sym || ".";
      var len = len || 3;
  
      var _animate = function($e) {
        var cnt = $e.data("cnt") || 0;
        var t = $e.text();
        var nxt = "";
        
        for(var i=0; i<cnt; i++) {
          nxt += sym;
        }
  
        for(var i=0; i<3-cnt; i++) {
          nxt += "&nbsp;";
        }
  
        $e.html(nxt);
        $e.data("cnt", cnt = (cnt + 1) % (len + 1));
      };
  
      return this.each(function() {
        var $this = $(this);
  
        if(interval == -1) {
          clearInterval($this.data("loading-animation"));
        } else {
          var i = setInterval(function() { _animate($this); }, interval);
          $this.data("loading-animation", i);
        }
      });
    },

    "sparkle": function(color, count, speed) {
      var count = count || 2;
      var speed = speed || 500;
   
      var _animate = function($e, n, p, i, c) {
        if(i < c) {
          $e.animate({ "color": i % 2 ? p : n }, speed, "linear", function() { return _animate($e, n, p, i + 1, c); });
        }
   
        return true;
      };
   
      // requires jquery ui effects
      return $(this).each(function() {
        var $this = $(this);
        var old = $this.css("color");
   
        _animate($this, color, old, 0, count * 2);
      });
    },
  
    "setVal": function(v) {
      var $this = $(this);
      
      if ($.isArray(v)) {
        v = $.obtuse.tools.arrayStr(v);
      }

      if (!v) {
        v = "";
      }

      if ($this.is(":checkbox")) {
        return $this.prop("checked", v).change();
      }

      if ($this.is(":input")) {
        return $this.val(v).change();
      }
      
      // a bit of extra smarts so we can set the "value" of plain elements
      $this.text(v).change();
    },

    "getVal": function(v) {
      var $this = $(this);

      if ($this.is(":checkbox")) {
        return $this.prop("checked");
      }

      if ($this.is(":input")) {
        return $this.val();
      }
      
      return $this.text();
    }
  };

  /*******************/
  /* INSTRUMENTATION */
  /*******************/

  $.obtuse.tools.installPlugins();
})(jQuery);
