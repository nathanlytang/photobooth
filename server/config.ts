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

  const requiredCamera = ['iso', 'shutterSpeed', 'aperture', 'whiteBalance', 'captureTarget'] as const;
  for (const key of requiredCamera) {
    if (cfg.camera[key] === undefined) {
      throw new Error(`Missing camera.${key} in config`);
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
}

export function get(): PhotoboothConfig {
  if (!config) load();
  return config!;
}
