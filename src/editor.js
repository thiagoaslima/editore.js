(function(global, editor) {
  if (typeof define === 'function' && define.amd)
    define('editor-js', [], editor);
  else if (typeof exports !== 'undefined')
    exports.Editor = editor();
  else
    global.Editor = editor();
}(window, function() {
  'use strict';

  function Editor(form) {
    var self = this;

    if (!form || !form.nodeName || !form.children.length)
      return new Error('No form was passed!');

    // editor setup
    self.default = {};
    self.default.blockElement = 'p';

    // editor events
    self.events = {};
    self.events.CHANGE = [];

    // field types
    self.fieldTypes         = {};
    self.fieldTypes.RICH    = 'rich';
    self.fieldTypes.SIMPLE  = 'simple';

    // regex patterns
    self.regex              = {};
    self.regex.markup       = /(<\/*[\w\s01-9='":;,\-]*\/*>)+/g;
    self.regex.enbsp        = /&nbsp;*/g;
    self.regex.space        = /\s/g;
    self.regex.spaces       = /\s+/g;
    self.regex.trim         = /\s+$/g;
    self.regex.lineBreak      = /[\r\n]/g; 
    self.regex.lineBreaks     = /(\r\n|\n|\r)[.]?/g; 
    self.regex.spaceAndEnbsp  = /\s|&nbsp;/g;

    // set editor form, fields and plugins
    self.form             = form;
    self.fields           = {};

    // set handler event method
    function handler(methods, data, context) {
      return function(e) {
        for (var method in methods) (function (method) {
          method.call(context, data, e);
        }(methods[method]));
      }
    }

    // return editor fields
    function fields() {
      var fields = {};

      for (var field in self.fields) (function(field) {
        fields[field.name] = {
          name        : field.name,
          element     : field.element,
          maxLength   : field.maxLength,
          type        : field.type,
          require     : field.require,
          placeholder : field.placeholder,
          plugins     : field.plugins,
        }
      }(self.fields[field]))

      return fields;
    }

    // return field values
    function values() {
      var values = {};

      for (var field in self.fields) (function(field) {
        values[field.name] = {
          name: field.name,
          length: field.length,
          value: self.getValue(field),
          valid: self.validate(field)
        }
      }(self.fields[field]))

      return values;
    }

    // register plugins
    function register(type, Plugin) {
      for (var field in self.fields) (function(field) {
        if (field.type == self.fieldTypes.RICH) {
          var plugin = new Plugin(field.plugins[type], field, self);
          field.plugins[type].methods[plugin.name] = plugin;
          field.plugins[type].element.appendChild(plugin.register());
        }
      } (self.fields[field]));
    }

    // destroy editor listeners
    function destroy() {
      for (var field in self.fields) (function(field) {
        // set handlers
        field.element.removeEventListener('paste', field.events.paste);
        field.element.removeEventListener('click', field.events.click);
        field.element.removeEventListener('mouseup', field.events.mouseup);
        field.element.removeEventListener('keydown', field.events.keydown);
        field.element.removeEventListener('keypress', field.events.keypress);
        field.element.removeEventListener('keyup', field.events.keyup);

        if (field.type == self.fieldTypes.RICH) {
          for (var plugin in field.plugins) (function(plugin) {
            for (var method in plugin.methods) (function(method) {
              method.destroy();
            } (plugin.methods[method]));
          } (field.plugins[plugin]));
        }
      } (self.fields[field]));
    }

    // register callbacks to editor events
    function subscribe(type, callback) {
      if (!self.events[type])
        return new Error('cant subscribe to a invalid event!');

      self.events[type].push(callback);
    }

    // editor constructor
    for (var i = form.children.length - 1; i >= 0; i--) (function(element) {
      var field          = self.getDataAttribute('field', element, 'str', false),
          placeholder    = self.getDataAttribute('placeholder', element, 'str', false),
          pasteEvents    = [],
          clickEvents    = [],
          mouseUpEvents  = [],
          keyupEvents    = [],
          keydownEvents  = [],
          keypressEvents = [],
          DOMNodeInsertedEvents = [];

      if (!(field) || !(placeholder))
        return new Error('data-field or data-placeholder are not defined!');

      // set field
      self.fields[field]             = {};
      self.fields[field].type        = self.getDataAttribute('type', element, 'str', self.fieldTypes.SIMPLE);
      self.fields[field].maxLength   = self.getDataAttribute('length', element, 'int', false);
      self.fields[field].require     = self.getDataAttribute('require', element, 'bol', false);
      self.fields[field].name        = field;
      self.fields[field].placeholder = placeholder;
      self.fields[field].element     = element;
      self.fields[field].value       = '';
      self.fields[field].valid       = false;
      self.fields[field].length      = 0;
      self.fields[field].focus       = false;
      self.fields[field].events      = {};
      self.fields[field].plugins     = {
        action: {
          element: document.createElement('div'),
          methods: {}
        },

        edition: {
          element: document.createElement('div'),
          methods: {},
          status: false
        }
      };

      // set action element      
      self.fields[field].plugins.action.element.setAttribute('contenteditable', 'false');
      self.fields[field].plugins.action.element.setAttribute('id', 'actionBar');
      // set edition element      
      self.fields[field].plugins.edition.element.setAttribute('contenteditable', 'false');
      self.fields[field].plugins.edition.element.setAttribute('id', 'editionBar');
      self.fields[field].plugins.edition.element.style.position = 'absolute';
      self.fields[field].plugins.edition.element.style.zIndex = 9999;

      // set field listeners
      switch(self.fields[field].type) {
        case self.fieldTypes.SIMPLE:
          pasteEvents.push(self.binds.paste, self.binds.change);
          clickEvents.push(self.binds.focus);
          keydownEvents.push(self.unsetPlaceholder);
          keypressEvents.push(self.binds.disableBlocks);
          keyupEvents.push(self.setLength, self.setPlaceholder, self.binds.focus, self.binds.change);
          break;
        case self.fieldTypes.RICH:
          pasteEvents.push(self.binds.paste, self.binds.change);
          clickEvents.push(self.binds.blocksCreation, self.binds.focus);
          mouseUpEvents.push(self.binds.selection);
          keydownEvents.push(self.unsetPlaceholder);
          keypressEvents.push();
          keyupEvents.push(self.setLength, self.binds.blocksCreation, self.binds.focus, self.setPlaceholder, self.binds.change);
          DOMNodeInsertedEvents.push(self.unsetSpan);
          break;
      }
      // set optional listeners
      if (self.fields[field].maxLength)
        keyupEvents.push(self.validateMaxLength);
      if (self.fields[field].require)
        keyupEvents.push(self.validateRequire);

      // set elements
      self.setEditable(self.fields[field].element);
      self.setTabIndex(self.fields[field].element, (i - length) + 1);
      self.setLength(self.fields[field]);
      self.setPlaceholder(self.fields[field]);
      // set handlers    
      self.fields[field].events.paste = handler(pasteEvents, self.fields[field], self);
      self.fields[field].events.click = handler(clickEvents, self.fields[field], self);
      self.fields[field].events.mouseup = handler(mouseUpEvents, self.fields[field], self);
      self.fields[field].events.keydown = handler(keydownEvents, self.fields[field], self);
      self.fields[field].events.keypress = handler(keypressEvents, self.fields[field], self);
      self.fields[field].events.keyup = handler(keyupEvents, self.fields[field], self);
      self.fields[field].events.DOMNodeInserted = handler(DOMNodeInsertedEvents, self.fields[field], self)
      // atach handlers
      self.fields[field].element.addEventListener('paste', self.fields[field].events.paste);
      self.fields[field].element.addEventListener('click', self.fields[field].events.click);
      self.fields[field].element.addEventListener('mouseup', self.fields[field].events.mouseup);
      self.fields[field].element.addEventListener('keydown', self.fields[field].events.keydown);
      self.fields[field].element.addEventListener('keypress', self.fields[field].events.keypress);
      self.fields[field].element.addEventListener('keyup', self.fields[field].events.keyup);
      self.fields[field].element.addEventListener('DOMNodeInserted', self.fields[field].events.DOMNodeInserted);
    } (form.children[i]));

    return {
      fields: fields,
      values: values,
      register: register,
      destroy: destroy,
      subscribe: subscribe
    }
  }

  Editor.prototype = {
    binds: {
      selection: function(field, e) {
        var self = this,
            selection = window.getSelection(),
            range,
            position,
            top,
            left;

        if (selection.type == 'Range' && !field.plugins.edition.status) {
          for (var method in field.plugins.edition.methods) (function(method) {
            method.beforeShow();
          } (field.plugins.edition.methods[method]));
          // show edition toolbar
          document.body.appendChild(field.plugins.edition.element);
          range = selection.getRangeAt(0);
          position = range.getBoundingClientRect();
          top = position.top + window.pageYOffset - field.plugins.edition.element.offsetHeight;
          left = ((position.left + position.right) / 2) - (field.plugins.edition.element.offsetWidth / 2);
          field.plugins.edition.element.style.top =  top + 'px';
          field.plugins.edition.element.style.left = left + 'px';
          field.plugins.edition.status = true;
          field.plugins.edition.selection = selection;
          return;
        }

        if(field.plugins.edition.status) {
          document.body.removeChild(field.plugins.edition.element);
          field.plugins.edition.status = false;
          field.plugins.edition.selection = false;
        }
      },

      focus: function(field, e) {
        var self = this;

        if ([91,40,38,37,39,13,1, 8].indexOf(e.which) < 0 || (!field.length & e.type !== 'click') || e.target == field.plugins.action.element || e.target == field.plugins.edition.element)
          return;

        field.focus = true;
        field.element.classList.add('focus');

        if (field.type == self.fieldTypes.RICH)
          self.setAction(field);
        
        for (var _field in self.fields) (function (_field) {
          if (_field.name == field.name)
            return;
          // remove focus
          _field.focus = false;
          _field.element.classList.remove('focus');
          // remove actionBar
          if (_field.type == self.fieldTypes.RICH && _field.currentBlock)
            self.unsetAction(_field);
        } (self.fields[_field]));
      },

      paste: function (field, e) {
        e.preventDefault();

        var self = this,
            html = [],
            blocks = e.clipboardData.getData('text/plain'),
            block, blockOpen, blockClose;

        switch(field.type) {
          case self.fieldTypes.SIMPLE:
            html = [e.clipboardData.getData('text/plain').replace(self.regex.spaces, ' ')];
            break;

          case self.fieldTypes.RICH:
            blocks = e.clipboardData.getData('text/plain').split(self.regex.lineBreak);
            blockOpen = ('<' + self.default.blockElement + '>');
            blockClose = ('</' + self.default.blockElement + '>');

            for (var block in blocks) (function(block) {
                html.push(blockOpen, block, blockClose);
            } (blocks[block])); 
            break;

          default:
            html = [e.clipboardData.getData('text/plain').replace(self.regex.spaces, ' ')];
            break;
        }

        document.execCommand('insertHTML', false, html.join(''));
      },

      change: function(field, e) {
        var self = this;
        
        if (['paste'].indexOf(e.type) >= 0 || [40,38,37,39,1,9,16,18,27].indexOf(e.which) < 0)
          self.emmit('CHANGE', field);
      },

      disableBlocks: function(field, e) {
        if (e.which === 13)
          return e.preventDefault();
      },

      blocksCreation: function(field, e) {
        var self = this,
            node = self.getCurrentNode();

        if ((node && node.children.length === 0 && e.which !== 8) || (!field.length && e.which === 1))
          document.execCommand('formatBlock', false, self.default.blockElement);
      },
    },

    getCurrentNode: function() {
      var node = document.getSelection().anchorNode;

      // if child is nodeText (type 3) return parent node else return node
      if (node && node.nodeType === 3)
        return node.parentNode
      else
        return node;
    },

    getCurrentBlock: function(currentNode) {
      var self = this,
          currentTagName = currentNode.tagName.toLowerCase();
      
      if (currentTagName == self.default.blockElement)
          return currentNode;
      return self.getCurrentBlock(currentNode.parentNode);
    },

    getValue: function(field) {
      var self = this;

      if (field.type = self.fieldTypes.SIMPLE)
        return field.element.innerText.replace(self.regex.lineBreaks, ' ').replace(self.regex.trim, '');
      if (field.type = self.fieldTypes.RICH)
        return field.element.innerHTML;
      return '';
    },

    getDataAttribute: function(name, element, type, defaultValue) {
      var value = element.getAttribute('data-' + name);

      if (!value)
        return defaultValue || false;

      switch (type) {
        case 'str':
          value = value.toString();
          break;
        case 'int':
          value = window.parseInt(value);
          break;
        case 'bol':
          value = (value == 'true');
          break;
        default:
          value = value.toString();
          break;
      }
      
      return value;
    },

    setLength: function(field) {
      var self = this;

      field.length = field.element.innerHTML
        .replace(self.regex.markup, '')
        .replace(self.regex.spaceAndEnbsp, '_')
        .length;
      return self;
    },

    setAction: function(field) {
      var self = this,
          currentBlock = self.getCurrentBlock(self.getCurrentNode());

      if (field.currentBlock !== currentBlock) {
        field.currentBlock = currentBlock;
         for (var method in field.plugins.action.methods) (function(method) {
              method.beforeShow();
        } (field.plugins.action.methods[method]));
        // set action toolbar
        field.element.insertBefore(field.plugins.action.element, field.currentBlock.nextSibling);
      }
      return self;
    },

    setEditionBar: function(field) {
    },

    setPlaceholder: function(field) {
      var self = this;
      if (!field.length) {
        field.element.innerHTML = "";
        field.element.classList.add('placeholder');
      }
      return self;
    },

    setEditable: function(element) {
      var self = this;

      element.style.minHeight = '1em'; //fix empty contenteditable input
      element.setAttribute('contenteditable', true);
      return self; 
    },

    setTabIndex: function(element, index) {
      var self = this;

      element.setAttribute('tabindex', index);
      return self; 
    },

    // https://code.google.com/p/chromium/issues/detail?id=226941
    unsetSpan: function(field, event) {
      var self = this,
          span = event.target;

      if (span.nodeType == 3 || span.tagName.toLowerCase() !== "span" ) 
        return;

      span.parentNode.insertBefore(document.createTextNode(span.innerText), span);
      span.parentNode.removeChild(span);
      return self;
    },

    unsetAction: function(field) {
      var self = this;
      
      if (field.element.children.length)
        field.element.removeChild(field.plugins.action.element);
      field.currentBlock = null;
      return self;
    },

    unsetPlaceholder: function(field, event) {
      var self = this;
      
      if (event.keyCode !== 9)
        field.element.classList.remove('placeholder');
    },

    validate: function(field) {
      var self = this;

      if (field.require && !field.length)
        return false;
      if (field.maxLength && self.validateMaxLength(field))
        return false;
      return true;
    },

    validateMaxLength: function(field) {
      var self = this;

      if (field.length > field.maxLength) {
        field.element.classList.add('invalid');
        return true;
      }
      
      field.element.classList.remove('invalid')
      return false;
    },

    validateRequire: function(field) {
      var self = this;

      if (!field.length) {
        field.element.classList.add('require');
        return true;
      }

      field.element.classList.remove('require');
      return false;
    },

    emmit: function(event, data) {
      var self = this;

      if (!self.events[event])
        return new Error('cant emmit a invalid event!');

      for (var callback in self.events[event]) (function(callback) {
        callback.call(self, data);
      } (self.events[event][callback]));

      return self;
    },
  }

  return Editor;
}));
