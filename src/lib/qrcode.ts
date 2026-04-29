import qrcode from 'qrcode-generator';

export function renderQRCode(canvas: HTMLCanvasElement, text: string, pixelSize = 280): void {
  // typeNumber 0 = auto-detect version
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const quiet = 4;
  const totalModules = moduleCount + quiet * 2;
  const scale = pixelSize / totalModules;

  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pixelSize, pixelSize);

  // Draw modules
  ctx.fillStyle = '#000000';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
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
