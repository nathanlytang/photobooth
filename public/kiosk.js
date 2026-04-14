(function () {
  'use strict';

  let mode = 'prod';

  const DEV_ALLOWED_KEYS = new Set(['F5', 'F11', 'F12']);

  function isDevAllowed(e) {
    if (mode !== 'dev') return false;
    if (DEV_ALLOWED_KEYS.has(e.key)) return true;
    if (e.ctrlKey && e.shiftKey && e.key === 'I') return true;
    if (e.ctrlKey && e.key === 'r') return true;
    if (e.ctrlKey && e.key === 'R') return true;
    return false;
  }

  function init(appMode) {
    mode = appMode || 'prod';

    // Block physical keyboard input (dev mode allows certain keys)
    document.addEventListener('keydown', (e) => {
      if (isDevAllowed(e)) return;
      e.preventDefault();
      e.stopPropagation();
      return false;
    }, true);

    // Disable right-click / long-press context menu (allowed in dev)
    document.addEventListener('contextmenu', (e) => {
      if (mode === 'dev') return;
      e.preventDefault();
      return false;
    }, true);

    // Disable drag and drop (prevents dragging images to address bar)
    document.addEventListener('dragstart', (e) => {
      e.preventDefault();
      return false;
    }, true);

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      return false;
    }, true);

    // Block middle-click (could open links in new tab)
    document.addEventListener('auxclick', (e) => {
      e.preventDefault();
      return false;
    }, true);

    // Block any form of text selection
    document.addEventListener('selectstart', (e) => {
      e.preventDefault();
      return false;
    }, true);
  }

  window.Photobooth = window.Photobooth || {};
  window.Photobooth.Kiosk = { init };
})();
