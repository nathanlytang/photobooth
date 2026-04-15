const { execFile } = require('child_process');
const path = require('path');
const config = require('./config');

// gphoto2 config name mappings
const SETTING_MAP = {
  iso: '/main/imgsettings/iso',
  shutterSpeed: '/main/capturesettings/shutterspeed',
  aperture: '/main/capturesettings/f-number',
  whiteBalance: '/main/imgsettings/whitebalance',
};

// Mutex to serialize all USB access — prevents "Could not claim the USB device"
let usbLock = Promise.resolve();

function withUsbLock(fn) {
  const next = usbLock.then(fn, fn);
  usbLock = next.catch(() => {});
  return next;
}

function gphoto2(args, timeout = 30000) {
  return withUsbLock(() => new Promise((resolve, reject) => {
    const proc = execFile('gphoto2', args, { timeout, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`gphoto2 ${args.join(' ')} failed: ${err.message}\n${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });

    // Ensure zombie processes are cleaned up on timeout
    proc.on('error', () => {});
  }));
}

async function applySettings() {
  const cam = config.get().camera;
  console.log('[camera] Applying camera settings...');

  for (const [key, configPath] of Object.entries(SETTING_MAP)) {
    if (cam[key] !== undefined) {
      try {
        await gphoto2(['--set-config', `${configPath}=${cam[key]}`]);
        console.log(`[camera]   ${key} = ${cam[key]}`);
      } catch (err) {
        console.warn(`[camera]   Failed to set ${key}: ${err.message}`);
      }
    }
  }

  // Set capture target to card so images stay on the SD card
  if (cam.captureTarget) {
    try {
      // captureTarget: "card" = 1 (Memory card), "internal" = 0 (Internal RAM)
      const targetValue = cam.captureTarget === 'card' ? '1' : '0';
      await gphoto2(['--set-config', `/main/settings/capturetarget=${targetValue}`]);
      console.log(`[camera]   captureTarget = ${cam.captureTarget}`);
    } catch (err) {
      console.warn(`[camera]   Failed to set captureTarget: ${err.message}`);
    }
  }

  console.log('[camera] Settings applied');
}

async function captureAndDownload(destDir, photoNumber) {
  const filename = `IMG_${String(photoNumber).padStart(3, '0')}.jpg`;
  const destPath = path.join(destDir, filename);

  console.log('[camera] Triggering autofocus...');

  // Trigger autofocus before capture
  try {
    await gphoto2(['--set-config', '/main/actions/autofocusdrive=1'], 10000);
    // Give the lens time to lock focus
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.log('[camera] Autofocus complete');
  } catch (err) {
    console.warn('[camera] Autofocus failed (continuing with capture):', err.message);
  }

  console.log('[camera] Triggering capture...');

  // Capture image — files stay on the camera SD card
  const output = await gphoto2(['--capture-image'], 15000);
  console.log('[camera] Capture output:', output);

  // Parse the JPEG path from gphoto2 output
  // Output lines look like: "New file is in location /store_00010001/DCIM/104NZ6_3/DSC_1124.JPG on the camera"
  const lines = output.split('\n');
  const jpegLine = lines.find(l => /\.jpe?g/i.test(l) && l.includes('New file'));

  if (!jpegLine) {
    throw new Error('No JPEG reported in capture output. Is RAW+JPEG enabled on the camera?');
  }

  const match = jpegLine.match(/location\s+(\/\S+)/);
  if (!match) {
    throw new Error(`Could not parse file path from: ${jpegLine}`);
  }

  const cameraPath = match[1];
  console.log(`[camera] Downloading ${cameraPath} to ${destPath}...`);

  // Download only the JPEG from the camera (leaves it on the SD card)
  await gphoto2([
    '--get-file', cameraPath,
    '--filename', destPath
  ], 60000);

  console.log(`[camera] Downloaded: ${filename}`);
  return { filename, path: destPath };
}

async function detectCamera(retryInterval = 5000, maxRetries = Infinity) {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    try {
      const output = await gphoto2(['--auto-detect']);
      // Check if any real camera line exists (not just the header)
      const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('Model') && !l.startsWith('-'));
      if (lines.length > 0) {
        console.log('[camera] Detected cameras:\n', output);
        return output;
      }
    } catch (err) {
      // detection failed
    }
    console.log(`[camera] No camera detected — is it turned on? Retrying in ${retryInterval / 1000}s... (attempt ${attempts})`);
    await new Promise(resolve => setTimeout(resolve, retryInterval));
  }
  throw new Error('Camera not detected after maximum retries');
}

async function triggerAutofocus() {
  try {
    await gphoto2(['--set-config', '/main/actions/autofocusdrive=1'], 10000);
    console.log('[camera] Periodic autofocus triggered');
  } catch (err) {
    console.warn('[camera] Periodic autofocus failed:', err.message);
  }
}

module.exports = { applySettings, captureAndDownload, detectCamera, triggerAutofocus };
