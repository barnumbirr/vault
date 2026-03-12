/* global Haste */

var app = null;

var handlePop = function (evt) {
  var path = evt.target.location.pathname;
  if (path === '/') {
    app.newDocument(true);
  } else {
    app.loadDocument(path.substring(1, path.length));
  }
};

setTimeout(function () {
  window.onpopstate = function (evt) {
    try {
      handlePop(evt);
    } catch (err) {
      /* not loaded yet */
    }
  };
}, 1000);

document.addEventListener('DOMContentLoaded', function () {
  var appName = '\u2702\uFE0F ' + window.location.hostname;
  app = new Haste(appName, { twitter: false });
  handlePop({ target: window });
});
