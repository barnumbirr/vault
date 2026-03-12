/* global hljs */

var FETCH_TIMEOUT = 30000;

function fetchWithTimeout(url, options) {
  var controller = new AbortController();
  var id = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
  options = options || {};
  options.signal = controller.signal;
  return fetch(url, options).finally(function () { clearTimeout(id); });
}

class HasteDocument {
  constructor() {
    this.locked = false;
    this.key = null;
    this.data = null;
  }

  htmlEscape(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/>/g, '&gt;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  async load(key, lang) {
    try {
      var res = await fetchWithTimeout('/documents/' + key);
      if (!res.ok) return false;
      var json = await res.json();

      this.locked = true;
      this.key = key;
      this.data = json.data;

      var high;
      try {
        if (lang === 'txt') {
          high = { value: this.htmlEscape(json.data) };
        } else if (lang) {
          high = hljs.highlight(json.data, { language: lang });
        } else {
          high = hljs.highlightAuto(json.data);
        }
      } catch (err) {
        try {
          high = hljs.highlightAuto(json.data);
        } catch (err2) {
          high = { value: this.htmlEscape(json.data) };
        }
      }

      return {
        value: high.value,
        key: key,
        language: high.language || lang,
        lineCount: json.data === '' ? 0 : json.data.split('\n').length,
      };
    } catch (err) {
      return false;
    }
  }

  async save(data, secretKey) {
    if (this.locked) return null;
    this.data = data;

    try {
      var res = await fetchWithTimeout('/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Authorization': secretKey,
        },
        body: data,
      });

      if (!res.ok) {
        try {
          return { error: await res.json() };
        } catch (e) {
          return { error: { message: 'Something went wrong!' } };
        }
      }

      var json = await res.json();
      this.locked = true;
      this.key = json.key;

      var high;
      try {
        high = hljs.highlightAuto(data);
      } catch (err) {
        high = { value: this.htmlEscape(data) };
      }

      return {
        result: {
          value: high.value,
          key: json.key,
          language: high.language,
          lineCount: data === '' ? 0 : data.split('\n').length,
        },
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { error: { message: 'Request timed out.' } };
      }
      return { error: { message: 'Something went wrong!' } };
    }
  }
}

class Haste {
  constructor(appName, options) {
    this.appName = appName;
    this.textarea = document.querySelector('textarea');
    this.box = document.getElementById('box');
    this.code = document.querySelector('#box code');
    this.linenos = document.getElementById('linenos');
    this.options = options;
    this.doc = new HasteDocument();
    this.buttons = [];
    this.secretKey = null;

    this.configureButtons();
    this.configureShortcuts();
    this.configureTabBehavior();

    if (!options.twitter) {
      document.querySelector('#box2 .twitter').classList.add('hidden');
    }
  }

  setTitle(ext) {
    document.title = ext ? this.appName + ' - ' + ext : this.appName;
  }

  showMessage(msg, cls) {
    var li = document.createElement('li');
    li.className = cls || 'info';
    li.textContent = msg;
    var messages = document.getElementById('messages');
    messages.prepend(li);
    setTimeout(function () {
      li.style.transition = 'opacity 0.2s';
      li.style.opacity = '0';
      setTimeout(function () { li.remove(); }, 200);
    }, 3000);
  }

  promptForSecret() {
    var self = this;
    return new Promise(function (resolve) {
      var overlay = document.getElementById('auth-overlay');
      var input = document.getElementById('auth-input');
      var form = document.getElementById('auth-form');
      var cancel = document.getElementById('auth-cancel');

      input.value = '';
      overlay.classList.remove('hidden');
      input.focus();

      function cleanup() {
        overlay.classList.add('hidden');
        form.removeEventListener('submit', onSubmit);
        cancel.removeEventListener('click', onCancel);
        overlay.removeEventListener('keydown', onKey);
      }

      function onSubmit(e) {
        e.preventDefault();
        var val = input.value.trim();
        cleanup();
        if (val) {
          self.secretKey = val;
          resolve(true);
        } else {
          resolve(false);
        }
      }

      function onCancel() {
        cleanup();
        resolve(false);
      }

      function onKey(e) {
        if (e.key === 'Escape') onCancel();
      }

      form.addEventListener('submit', onSubmit);
      cancel.addEventListener('click', onCancel);
      overlay.addEventListener('keydown', onKey);
    });
  }

  lightKey() {
    this.configureKey(['new', 'save']);
  }

  fullKey() {
    this.configureKey(['new', 'duplicate', 'twitter', 'raw', 'copy', 'delete']);
  }

  configureKey(enable) {
    document.querySelectorAll('#box2 .function').forEach(function (el) {
      var shouldEnable = enable.some(function (cls) {
        return el.classList.contains(cls);
      });
      el.classList.toggle('enabled', shouldEnable);
    });
  }

  newDocument(hideHistory) {
    this.box.classList.add('hidden');
    this.doc = new HasteDocument();
    if (!hideHistory) {
      window.history.pushState(null, this.appName, '/');
    }
    this.setTitle();
    this.lightKey();
    this.textarea.value = '';
    this.textarea.classList.remove('hidden');
    this.textarea.focus();
    this.removeLineNumbers();
  }

  async loadDocument(key) {
    var parts = key.split('.', 2);
    this.doc = new HasteDocument();
    var lang = this.lookupTypeByExtension(parts[1]);
    var ret = await this.doc.load(parts[0], lang);
    if (ret) {
      this.code.innerHTML = ret.value;
      this.setTitle(ret.key);
      this.fullKey();
      this.textarea.value = '';
      this.textarea.classList.add('hidden');
      this.box.classList.remove('hidden');
      this.box.focus();
      this.addLineNumbers(ret.lineCount);
    } else {
      this.newDocument();
    }
  }

  duplicateDocument() {
    if (this.doc.locked) {
      var currentData = this.doc.data;
      this.newDocument();
      this.textarea.value = currentData;
    }
  }

  copyURL() {
    if (!this.doc.locked) return;
    if (!navigator.clipboard) {
      this.showMessage('Clipboard API not available. Copy the URL manually.', 'error');
      return;
    }
    var self = this;
    navigator.clipboard.writeText(window.location.href).then(function () {
      self.showMessage('URL copied to clipboard.', 'info');
    }, function () {
      self.showMessage('Failed to copy URL.', 'error');
    });
  }

  async deleteDocument() {
    if (!this.doc.locked || !this.doc.key) return;
    if (!this.secretKey && !(await this.promptForSecret())) return;
    if (!confirm('Delete this document? This cannot be undone.')) return;

    var self = this;
    try {
      var res = await fetchWithTimeout('/documents/' + this.doc.key, {
        method: 'DELETE',
        headers: { 'Authorization': this.secretKey },
      });

      if (!res.ok) {
        var json = await res.json().catch(function () { return {}; });
        if (json.message === 'Unauthorized.') {
          self.secretKey = null;
        }
        self.showMessage(json.message || 'Failed to delete.', 'error');
        return;
      }

      self.showMessage('Document deleted.', 'info');
      self.newDocument();
    } catch (err) {
      if (err.name === 'AbortError') {
        self.showMessage('Request timed out.', 'error');
      } else {
        self.showMessage('Something went wrong!', 'error');
      }
    }
  }

  async lockDocument() {
    if (!this.secretKey && !(await this.promptForSecret())) {
      return;
    }

    var result = await this.doc.save(this.textarea.value, this.secretKey);
    if (!result) return;

    if (result.error) {
      if (result.error.message === 'Unauthorized.') {
        this.secretKey = null;
      }
      this.showMessage(result.error.message, 'error');
    } else if (result.result) {
      var ret = result.result;
      this.code.innerHTML = ret.value;
      this.setTitle(ret.key);
      var file = '/' + ret.key;
      if (ret.language) {
        file += '.' + this.lookupExtensionByType(ret.language);
      }
      window.history.pushState(null, this.appName + '-' + ret.key, file);
      this.fullKey();
      this.textarea.value = '';
      this.textarea.classList.add('hidden');
      this.box.classList.remove('hidden');
      this.box.focus();
      this.addLineNumbers(ret.lineCount);
    }
  }

  addLineNumbers(lineCount) {
    var h = '';
    for (var i = 0; i < lineCount; i++) {
      h += (i + 1).toString() + '<br/>';
    }
    this.linenos.innerHTML = h;
  }

  removeLineNumbers() {
    this.linenos.innerHTML = '&gt;';
  }

  lookupExtensionByType(type) {
    for (var key in Haste.extensionMap) {
      if (Haste.extensionMap[key] === type) return key;
    }
    return type;
  }

  lookupTypeByExtension(ext) {
    return Haste.extensionMap[ext] || ext;
  }

  configureButtons() {
    var self = this;
    var pointer = document.getElementById('pointer');
    var box3 = document.getElementById('box3');
    var box3Label = box3.querySelector('.label');
    var box3Shortcut = box3.querySelector('.shortcut');

    this.buttons = [
      {
        el: document.querySelector('#box2 .save'),
        label: 'Save',
        shortcutDescription: 'control + s',
        shortcut: function (evt) { return evt.ctrlKey && evt.keyCode === 83; },
        action: function () {
          if (self.textarea.value.trim() !== '') {
            self.lockDocument();
          }
        },
      },
      {
        el: document.querySelector('#box2 .new'),
        label: 'New',
        shortcutDescription: 'control + n',
        shortcut: function (evt) { return evt.ctrlKey && evt.keyCode === 78; },
        action: function () { self.newDocument(!self.doc.key); },
      },
      {
        el: document.querySelector('#box2 .duplicate'),
        label: 'Duplicate & Edit',
        shortcutDescription: 'control + d',
        shortcut: function (evt) { return self.doc.locked && evt.ctrlKey && evt.keyCode === 68; },
        action: function () { self.duplicateDocument(); },
      },
      {
        el: document.querySelector('#box2 .raw'),
        label: 'Just Text',
        shortcutDescription: 'control + shift + r',
        shortcut: function (evt) { return evt.ctrlKey && evt.shiftKey && evt.keyCode === 82; },
        action: function () { window.location.href = '/raw/' + self.doc.key; },
      },
      {
        el: document.querySelector('#box2 .twitter'),
        label: 'Twitter',
        shortcutDescription: 'control + shift + t',
        shortcut: function (evt) {
          return self.options.twitter && self.doc.locked && evt.shiftKey && evt.ctrlKey && evt.keyCode === 84;
        },
        action: function () {
          window.open(
            'https://twitter.com/share?url=' + encodeURIComponent(window.location.href),
            '_blank',
            'noopener'
          );
        },
      },
      {
        el: document.querySelector('#box2 .copy'),
        label: 'Copy URL',
        shortcutDescription: 'control + shift + c',
        shortcut: function (evt) {
          return self.doc.locked && evt.ctrlKey && evt.shiftKey && evt.keyCode === 67;
        },
        action: function () { self.copyURL(); },
      },
      {
        el: document.querySelector('#box2 .delete'),
        label: 'Delete',
        shortcutDescription: '',
        shortcut: null,
        action: function () { self.deleteDocument(); },
      },
    ];

    for (var i = 0; i < this.buttons.length; i++) {
      (function (button) {
        button.el.addEventListener('click', function (evt) {
          evt.preventDefault();
          if (button.el.classList.contains('enabled')) {
            button.action();
          }
        });

        button.el.addEventListener('mouseenter', function () {
          box3Label.textContent = button.label;
          box3Shortcut.textContent = button.shortcutDescription || '';
          box3.classList.remove('hidden');
          pointer.classList.remove('hidden');
          button.el.appendChild(pointer);
        });

        button.el.addEventListener('mouseleave', function () {
          box3.classList.add('hidden');
          pointer.classList.add('hidden');
        });
      })(this.buttons[i]);
    }
  }

  configureShortcuts() {
    var self = this;
    document.body.addEventListener('keydown', function (evt) {
      for (var i = 0; i < self.buttons.length; i++) {
        var button = self.buttons[i];
        if (button.shortcut && button.shortcut(evt)) {
          evt.preventDefault();
          button.action();
          return;
        }
      }
    });
  }

  configureTabBehavior() {
    var textarea = this.textarea;
    textarea.addEventListener('keydown', function (evt) {
      if (evt.keyCode === 9) {
        evt.preventDefault();
        var tab = '  ';
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        var scrollTop = textarea.scrollTop;
        textarea.value =
          textarea.value.substring(0, start) + tab +
          textarea.value.substring(end);
        textarea.focus();
        textarea.selectionStart = start + tab.length;
        textarea.selectionEnd = start + tab.length;
        textarea.scrollTop = scrollTop;
      }
    });
  }
}

Haste.extensionMap = {
  // C family
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp', m: 'objectivec', mm: 'objectivec', cu: 'cpp',

  // JVM
  java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala',
  sc: 'scala', groovy: 'groovy', gradle: 'groovy', clj: 'clojure',

  // Web
  js: 'javascript', cjs: 'javascript', mjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml',
  vue: 'xml', svelte: 'xml', astro: 'xml',
  css: 'css', scss: 'scss', less: 'less', sass: 'scss',

  // Scripting
  py: 'python', pyw: 'python', rb: 'ruby', pl: 'perl', php: 'php',
  lua: 'lua', sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  ps1: 'powershell', psm1: 'powershell', bat: 'dos', cmd: 'dos',

  // Systems
  rs: 'rust', go: 'go', swift: 'swift', zig: 'zig', nim: 'nim',
  d: 'd', cr: 'crystal', v: 'verilog',

  // Functional
  hs: 'haskell', lhs: 'haskell', erl: 'erlang', ex: 'elixir', exs: 'elixir',
  elm: 'elm', ml: 'ocaml', mli: 'ocaml', fs: 'fsharp', fsx: 'fsharp',
  lisp: 'lisp', el: 'lisp', scm: 'scheme', rkt: 'scheme',

  // Data / config
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  ini: 'ini', cfg: 'ini', properties: 'properties',
  csv: 'plaintext', tsv: 'plaintext',

  // Infrastructure
  dockerfile: 'dockerfile', tf: 'hcl', hcl: 'hcl', tfvars: 'hcl',
  nix: 'nix', cmake: 'cmake', mk: 'makefile',

  // Markup / docs
  md: 'markdown', tex: 'tex', sty: 'tex', cls: 'tex',
  rst: 'plaintext', adoc: 'asciidoc', txt: '',

  // Templates
  hbs: 'handlebars', ejs: 'xml', erb: 'erb', twig: 'twig',
  pug: 'pug', haml: 'haml',

  // Query / data
  sql: 'sql', graphql: 'graphql', gql: 'graphql', proto: 'protobuf',

  // Other
  dart: 'dart', r: 'r', jl: 'julia', pas: 'delphi', vala: 'vala',
  coffee: 'coffee', vbs: 'vbscript', sm: 'smalltalk',
  diff: 'diff', awk: 'awk', vim: 'vim',
  glsl: 'glsl', wgsl: 'wgsl', asm: 'x86asm',
  sol: 'solidity', vy: 'plaintext',
  f90: 'fortran', f95: 'fortran', f: 'fortran',
  ada: 'ada', adb: 'ada', ads: 'ada',
};
