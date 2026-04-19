import { execFile } from 'child_process';
import path from 'path';
import * as config from './config.js';
import type { CaptureResult } from './types.js';

// gphoto2 config path for each known camera setting
const ALL_SETTINGS: Record<string, string> = {
  iso: '/main/imgsettings/iso',
  shutterSpeed: '/main/capturesettings/shutterspeed',
  aperture: '/main/capturesettings/f-number',
  whiteBalance: '/main/imgsettings/whitebalance',
  pictureProfile: '/main/capturesettings/picturestyle',
};

// Build map from only the settings present in config.json
function buildSettingMap(): Record<string, string> {
  const cam = config.get().camera || {};
  const map: Record<string, string> = {};
  for (const [key, configPath] of Object.entries(ALL_SETTINGS)) {
    if (cam[key] !== undefined) {
      map[key] = configPath;
    }
  }
  return map;
}

// Mutex to serialize all USB access — prevents "Could not claim the USB device"
let usbLock: Promise<unknown> = Promise.resolve();

function withUsbLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = usbLock.then(fn, fn) as Promise<T>;
  usbLock = next.catch(() => {});
  return next;
}

function gphoto2(args: string[], timeout = 30000): Promise<string> {
  return withUsbLock(() => new Promise<string>((resolve, reject) => {
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

export async function applySettings(): Promise<void> {
  const cam = config.get().camera;
  const settingMap = buildSettingMap();
  console.log('[camera] Applying camera settings...');

  for (const [key, configPath] of Object.entries(settingMap)) {
    try {
      await gphoto2(['--set-config', `${configPath}=${cam[key]}`]);
      console.log(`[camera]   ${key} = ${cam[key]}`);
    } catch (err) {
      console.warn(`[camera]   Failed to set ${key}: ${(err as Error).message}`);
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
      console.warn(`[camera]   Failed to set captureTarget: ${(err as Error).message}`);
    }
  }

  console.log('[camera] Settings applied');
}

export async function captureAndDownload(
  destDir: string,
  photoNumber: number,
  onCaptured?: () => void
): Promise<CaptureResult> {
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
    console.warn('[camera] Autofocus failed (continuing with capture):', (err as Error).message);
  }

  console.log('[camera] Triggering capture...');

  // Capture image — files stay on the camera SD card
  const output = await gphoto2(['--capture-image'], 15000);
  console.log('[camera] Capture output:', output);

  // Notify caller that the shutter fired (before download begins)
  if (typeof onCaptured === 'function') onCaptured();

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

export async function detectCamera(retryInterval = 5000, maxRetries = Infinity): Promise<string> {
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
    } catch {
      // detection failed
    }
    console.log(`[camera] No camera detected — is it turned on? Retrying in ${retryInterval / 1000}s... (attempt ${attempts})`);
    await new Promise(resolve => setTimeout(resolve, retryInterval));
  }
  throw new Error('Camera not detected after maximum retries');
}

export async function triggerAutofocus(): Promise<void> {
  try {
    await gphoto2(['--set-config', '/main/actions/autofocusdrive=1'], 10000);
    console.log('[camera] Periodic autofocus triggered');
  } catch (err) {
    console.warn('[camera] Periodic autofocus failed:', (err as Error).message);
  }
}
