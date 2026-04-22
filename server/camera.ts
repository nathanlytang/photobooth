import { execFile } from 'child_process';
import path from 'path';
import * as config from './config.js';
import type { CameraConfig, CameraPaths, CaptureResult } from './types.js';

export type CameraMode = 'photo' | 'video';

const SETTING_KEYS = ['iso', 'shutterSpeed', 'aperture', 'pictureProfile'] as const;
type SettingKey = typeof SETTING_KEYS[number];

interface ResolvedSetting {
  key: SettingKey;
  path: string;
  value: string;
  /** True if the value came from the per-mode override (e.g. `camera.video.iso`). */
  fromValueOverride: boolean;
  /** True if the gphoto2 path came from the per-mode path override (e.g. `camera.video.paths.iso`). */
  fromPathOverride: boolean;
}

/**
 * Resolve the concrete (path, value) pairs to apply for the given mode.
 *
 * - **Value:** `camera.<mode>.<key>` (for video) if defined, else `camera.<key>`.
 * - **Path:**  `camera.<mode>.paths.<key>` (for video) if defined, else `camera.paths.<key>`.
 */
function resolveSettings(mode: CameraMode): ResolvedSetting[] {
  const cam = config.get().camera as CameraConfig;
  const modeCfg = mode === 'video' ? (cam.video || {}) : {};
  const basePaths = cam.paths;
  // Path overrides: normally from the mode's own `paths` block, but when
  // persistentMovieMode is enabled the camera physically lives in movie
  // mode, so even photo sessions must write via `camera.video.paths` (e.g.
  // `movieiso`) for exposure changes to take effect.
  const overridePaths =
    modeCfg.paths
    ?? (cam.persistentMovieMode ? cam.video?.paths : undefined)
    ?? {};

  const out: ResolvedSetting[] = [];
  for (const key of SETTING_KEYS) {
    const overrideVal = (modeCfg as Record<string, unknown>)[key];
    const fallbackVal = (cam as unknown as Record<string, unknown>)[key];
    const fromValueOverride = typeof overrideVal === 'string' && overrideVal.length > 0;
    const value = fromValueOverride ? (overrideVal as string) : (fallbackVal as string | undefined);
    if (typeof value !== 'string' || value.length === 0) continue;

    const overridePath = (overridePaths as Record<string, string | undefined>)[key];
    const basePath = (basePaths as unknown as Record<string, string | undefined>)[key];
    const fromPathOverride = typeof overridePath === 'string' && overridePath.length > 0;
    const p = fromPathOverride ? (overridePath as string) : basePath;
    if (!p) continue;

    out.push({ key, path: p, value, fromValueOverride, fromPathOverride });
  }
  return out;
}

/** Resolve a single named path (e.g. autofocus, captureTarget) with per-mode override support. */
function resolvePath(key: keyof CameraPaths, mode: CameraMode): string | undefined {
  const cam = config.get().camera as CameraConfig;
  const modeCfg = mode === 'video' ? (cam.video || {}) : {};
  const override = (modeCfg.paths || {})[key];
  if (typeof override === 'string' && override.length > 0) return override;
  return (cam.paths as unknown as Record<string, string | undefined>)[key as string];
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

/**
 * Apply the exposure/imaging settings for the given session mode.
 *
 * `mode` defaults to 'photo' (idle / photo session). Call with 'video' when
 * entering a video session to apply `camera.video.*` value overrides and
 * `camera.video.paths.*` gphoto2 path overrides (e.g. writing ISO via
 * `movieiso` instead of `iso`).
 */
export async function applySettings(mode: CameraMode = 'photo'): Promise<void> {
  const cam = config.get().camera as CameraConfig;
  const entries = resolveSettings(mode);
  console.log(`[camera] Applying ${mode} settings...`);

  for (const { key, path, value, fromValueOverride, fromPathOverride } of entries) {
    const valTag = fromValueOverride ? ` [${mode}]` : '';
    const pathTag = fromPathOverride ? ` [${mode}-path]` : '';
    try {
      await gphoto2(['--set-config', `${path}=${value}`]);
      console.log(`[camera]   ${key} = ${value}${valTag}  (${path})${pathTag}`);
    } catch (err) {
      console.warn(`[camera]   Failed to set ${key}: ${(err as Error).message}`);
    }
  }

  // Capture target — keeps images on the SD card by default.
  if (cam.captureTarget) {
    const targetPath = resolvePath('captureTarget', mode);
    if (!targetPath) {
      console.warn('[camera]   Missing camera.paths.captureTarget — skipping captureTarget');
    } else {
      try {
        // captureTarget: "card" = 1 (Memory card), "internal" = 0 (Internal RAM)
        const targetValue = cam.captureTarget === 'card' ? '1' : '0';
        await gphoto2(['--set-config', `${targetPath}=${targetValue}`]);
        console.log(`[camera]   captureTarget = ${cam.captureTarget}  (${targetPath})`);
      } catch (err) {
        console.warn(`[camera]   Failed to set captureTarget: ${(err as Error).message}`);
      }
    }
  }

  console.log(`[camera] ${mode} settings applied`);
}

/**
 * Apply the arbitrary `startupConfigs` for the given mode. Photo mode reads
 * from `camera.startupConfigs`; video mode reads from `camera.video.startupConfigs`.
 * Each entry is a plain `{ path, value }` passed to `gphoto2 --set-config`.
 * Individual failures are logged and swallowed.
 */
export async function applyStartupConfigs(mode: CameraMode): Promise<void> {
  const cam = config.get().camera as CameraConfig;
  const list = mode === 'video'
    ? (cam.video?.startupConfigs || [])
    : (cam.startupConfigs || []);
  if (!Array.isArray(list) || list.length === 0) return;
  console.log(`[camera] Applying ${mode} startupConfigs (${list.length})...`);
  for (const pc of list) {
    try {
      await gphoto2(['--set-config', `${pc.path}=${pc.value}`]);
      console.log(`[camera]   startup ${pc.path} = ${pc.value}`);
    } catch (err) {
      console.warn(`[camera]   Failed startupConfig ${pc.path}:`, (err as Error).message);
    }
  }
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
    const afPath = resolvePath('autofocus', 'photo');
    if (!afPath) throw new Error('camera.paths.autofocus is not configured');
    await gphoto2(['--set-config', `${afPath}=1`], 10000);
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
    const afPath = resolvePath('autofocus', 'photo');
    if (!afPath) throw new Error('camera.paths.autofocus is not configured');
    await gphoto2(['--set-config', `${afPath}=1`], 10000);
    console.log('[camera] Periodic autofocus triggered');
  } catch (err) {
    console.warn('[camera] Periodic autofocus failed:', (err as Error).message);
  }
}

// --- Movie / video recording helpers ---

function getMovieConfig() {
  const movie = config.get().camera.movie;
  if (!movie) {
    throw new Error('camera.movie is not configured');
  }
  return movie;
}

/**
 * Apply any pre-configs (e.g. switching the camera into movie mode) and then
 * issue the movie-start command. Serialized through the USB mutex.
 */
export async function movieStart(): Promise<void> {
  const movie = getMovieConfig();
  // `camera.video.startupConfigs` (if any) are applied once at video session
  // start, not per-recording — so this is just the bare movie-start toggle.
  console.log('[camera] Starting movie recording...');
  await gphoto2(['--set-config', `${movie.startConfigPath}=${movie.startValue}`], 15000);
  console.log('[camera] Movie recording started');
}

/**
 * Stop the current movie recording. Retries once on transient USB errors.
 */
export async function movieStop(): Promise<void> {
  const movie = getMovieConfig();
  console.log('[camera] Stopping movie recording...');
  try {
    await gphoto2(['--set-config', `${movie.stopConfigPath}=${movie.stopValue}`], 15000);
  } catch (err) {
    console.warn('[camera] Movie stop failed, retrying in 500ms:', (err as Error).message);
    await new Promise(resolve => setTimeout(resolve, 500));
    await gphoto2(['--set-config', `${movie.stopConfigPath}=${movie.stopValue}`], 15000);
  }
  console.log('[camera] Movie recording stopped');
}

/**
 * Parse raw `gphoto2 --list-files` output into a flat list of `folder/name` paths.
 */
function parseListFiles(output: string): string[] {
  const paths: string[] = [];
  const folderRe = /^There (?:is|are) \d+ files? in folder '([^']+)'\.?$/;
  const fileRe = /^#\d+\s+(\S+)/;
  let currentFolder: string | null = null;
  for (const line of output.split('\n')) {
    const fm = line.match(folderRe);
    if (fm) {
      currentFolder = fm[1];
      continue;
    }
    const m = line.match(fileRe);
    if (m && currentFolder) {
      const sep = currentFolder.endsWith('/') ? '' : '/';
      paths.push(`${currentFolder}${sep}${m[1]}`);
    }
  }
  return paths;
}

/**
 * List every file currently on the camera storage. Used to diff before/after
 * recording so we can identify the newly created video file (more reliable
 * than parsing movie-stop output across camera vendors).
 */
export async function listCameraFiles(): Promise<string[]> {
  const output = await gphoto2(['--list-files'], 30000);
  return parseListFiles(output);
}

/**
 * Find files that appeared in `after` but were absent in `before`, filtered by
 * file extension (case-insensitive).
 */
export function diffNewFilesByExtension(
  before: string[],
  after: string[],
  fileExtension: string
): string[] {
  const beforeSet = new Set(before);
  const ext = fileExtension.toLowerCase().replace(/^\./, '');
  return after.filter(p => !beforeSet.has(p) && p.toLowerCase().endsWith(`.${ext}`));
}

/**
 * Download a single file from the camera by on-camera path.
 */
export async function downloadCameraFile(cameraPath: string, destPath: string): Promise<void> {
  console.log(`[camera] Downloading video ${cameraPath} -> ${destPath}`);
  await gphoto2([
    '--get-file', cameraPath,
    '--filename', destPath
  ], 300000); // videos can take a while
  console.log(`[camera] Download complete: ${destPath}`);
}
