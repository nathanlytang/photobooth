/**
 * QR Code wrapper for the photobooth share screen.
 * Uses qrcode-generator library (vendor-qrcode.js) loaded before this file.
 *
 * Usage: Photobooth.QRCode.render(canvasElement, text, size)
 */
(function () {
  'use strict';

  function render(canvas, text, pixelSize) {
    pixelSize = pixelSize || 280;

    // typeNumber 0 = auto-detect version
    var qr = qrcode(0, 'L');
    qr.addData(text);
    qr.make();

    var moduleCount = qr.getModuleCount();
    var quiet = 4;
    var totalModules = moduleCount + quiet * 2;
    var scale = pixelSize / totalModules;

    canvas.width = pixelSize;
    canvas.height = pixelSize;
    var ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pixelSize, pixelSize);

    // Draw modules
    ctx.fillStyle = '#000000';
    for (var r = 0; r < moduleCount; r++) {
      for (var c = 0; c < moduleCount; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(
            Math.round((c + quiet) * scale),
            Math.round((r + quiet) * scale),
            Math.ceil(scale),
            Math.ceil(scale)
          );
        }
      }
    }
  }

  window.Photobooth = window.Photobooth || {};
  window.Photobooth.QRCode = { render };
})();
