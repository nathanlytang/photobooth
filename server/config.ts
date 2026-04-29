import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { PhotoboothConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

let config: PhotoboothConfig | null = null;

export function load(): PhotoboothConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('[config] config.json not found.');
    console.error('[config] Copy the example config to get started:');
    console.error('[config]   cp config.example.json config.json');
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    config = JSON.parse(raw) as PhotoboothConfig;
    validate(config);
    console.log('[config] Loaded config.json');
    return config;
  } catch (err) {
    console.error('[config] Failed to load config.json:', (err as Error).message);
    process.exit(1);
  }
}

function validate(cfg: PhotoboothConfig): void {
  if (!cfg.camera) throw new Error('Missing "camera" section in config');
  if (!cfg.preview) throw new Error('Missing "preview" section in config');
  if (!cfg.app) throw new Error('Missing "app" section in config');

  const requiredCamera = ['iso', 'shutterSpeed', 'aperture', 'captureTarget'] as const;
  for (const key of requiredCamera) {
    if (cfg.camera[key] === undefined) {
      throw new Error(`Missing camera.${key} in config`);
    }
  }

  // camera.paths — every gphoto2 path must live in config now.
  if (!cfg.camera.paths || typeof cfg.camera.paths !== 'object') {
    throw new Error('Missing "camera.paths" section in config');
  }
  const requiredPaths = ['iso', 'shutterSpeed', 'aperture', 'autofocus', 'captureTarget'] as const;
  for (const key of requiredPaths) {
    const v = (cfg.camera.paths as unknown as Record<string, unknown>)[key];
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`Missing or empty camera.paths.${key} in config`);
    }
  }

  const requiredPreview: (keyof typeof cfg.preview)[] = ['device', 'width', 'height', 'fps'];
  for (const key of requiredPreview) {
    if (cfg.preview[key] === undefined) {
      throw new Error(`Missing preview.${key} in config`);
    }
  }

  const requiredApp: (keyof typeof cfg.app)[] = ['port', 'sessionsDir', 'countdownSeconds'];
  for (const key of requiredApp) {
    if (cfg.app[key] === undefined) {
      throw new Error(`Missing app.${key} in config`);
    }
  }

  // Validate galleryServer if enabled
  if (cfg.app.galleryServer && cfg.app.galleryServer.enabled) {
    const gs = cfg.app.galleryServer;
    if (!gs.baseUrl) throw new Error('Missing galleryServer.baseUrl in config');
    if (!gs.authToken) throw new Error('Missing galleryServer.authToken in config');
  }

  // Validate video config if enabled
  if (cfg.app.video && cfg.app.video.enabled) {
    const v = cfg.app.video;
    if (typeof v.maxRecordSeconds !== 'number' || v.maxRecordSeconds <= 0) {
      throw new Error('video.maxRecordSeconds must be a positive number');
    }
    if (typeof v.countdownSeconds !== 'number' || v.countdownSeconds < 0) {
      throw new Error('video.countdownSeconds must be a non-negative number');
    }
    if (v.startOffsetMs !== undefined && (typeof v.startOffsetMs !== 'number' || v.startOffsetMs < 0)) {
      throw new Error('video.startOffsetMs must be a non-negative number');
    }
    const movie = cfg.camera.movie;
    if (!movie) {
      throw new Error('camera.movie is required when app.video.enabled is true');
    }
    const requiredMovie: (keyof typeof movie)[] = [
      'startConfigPath', 'startValue', 'stopConfigPath', 'stopValue', 'fileExtension'
    ];
    for (const key of requiredMovie) {
      if (movie[key] === undefined || movie[key] === null || movie[key] === '') {
        throw new Error(`Missing camera.movie.${String(key)} in config`);
      }
    }
    if (v.share && v.share.enabled) {
      if (typeof v.share.upload !== 'boolean') {
        throw new Error('video.share.upload must be a boolean when video.share.enabled is true');
      }
      if (v.share.upload && !(cfg.app.galleryServer && cfg.app.galleryServer.enabled)) {
        console.warn('[config] video.share.upload is true but galleryServer is not enabled; uploads will be skipped.');
      }
      if (v.share.uploadTiming && v.share.uploadTiming !== 'immediate' && v.share.uploadTiming !== 'onEnd') {
        throw new Error('video.share.uploadTiming must be "immediate" or "onEnd"');
      }
    }
  }
}

export function get(): PhotoboothConfig {
  if (!config) load();
  return config!;
}
