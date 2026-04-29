import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import * as config from './config.js';
import type { GalleryServerConfig, SessionMetadata, ShareResult } from './types.js';

export function isEnabled(): boolean {
  const gs = config.get().app.galleryServer;
  return !!(gs && gs.enabled);
}

function getGalleryConfig(): GalleryServerConfig {
  return config.get().app.galleryServer!;
}

function request(
  method: string,
  urlPath: string,
  body?: unknown,
  contentType?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const gs = getGalleryConfig();
    const base = new URL(gs.baseUrl);
    const isHttps = base.protocol === 'https:';
    const mod = isHttps ? https : http;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${gs.authToken}`,
    };

    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    const options: http.RequestOptions = {
      hostname: base.hostname,
      port: base.port || (isHttps ? 443 : 80),
      path: urlPath,
      method,
      headers,
      timeout: 30000,
    };

    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode! >= 200 && res.statusCode! < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        } else {
          reject(new Error(`Gallery server responded with ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gallery server request timed out'));
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

export async function createShare(shareId?: string | null): Promise<ShareResult | null> {
  if (!isEnabled()) return null;

  try {
    const gs = getGalleryConfig();
    const body: Record<string, unknown> = {};
    if (shareId) {
      body.shareId = shareId;
    }
    if (gs.resize !== undefined) {
      body.resize = gs.resize;
    }
    const result = await request('POST', '/api/shares', body, 'application/json') as ShareResult;
    console.log(`[gallery] Created share: ${result.shareId} -> ${result.shareUrl}`);
    return result;
  } catch (err) {
    console.log(err);
    console.error('[gallery] Failed to create share:', (err as Error).message);
    return null;
  }
}

export async function uploadPhoto(shareId: string, filePath: string): Promise<void> {
  if (!isEnabled() || !shareId) return;

  try {
    const gs = getGalleryConfig();
    const base = new URL(gs.baseUrl);
    const isHttps = base.protocol === 'https:';
    const mod = isHttps ? https : http;

    const filename = path.basename(filePath);
    const fileData = fs.readFileSync(filePath);
    const boundary = '----PhotoboothUpload' + Date.now();

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="photo"; filename="${filename}"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileData, footer]);

    const options: http.RequestOptions = {
      hostname: base.hostname,
      port: base.port || (isHttps ? 443 : 80),
      path: `/api/shares/${shareId}/photos`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gs.authToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 60000,
    };

    await new Promise<void>((resolve, reject) => {
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode! >= 200 && res.statusCode! < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Photo upload timed out'));
      });

      req.write(body);
      req.end();
    });

    console.log(`[gallery] Uploaded photo ${filename} to share ${shareId}`);
  } catch (err) {
    console.error(`[gallery] Failed to upload photo:`, (err as Error).message);
  }
}

export async function uploadMetadata(shareId: string, metadata: SessionMetadata): Promise<void> {
  if (!isEnabled() || !shareId) return;

  try {
    await request('PUT', `/api/shares/${shareId}/metadata`, metadata, 'application/json');
    console.log(`[gallery] Uploaded metadata to share ${shareId}`);
  } catch (err) {
    console.error('[gallery] Failed to upload metadata:', (err as Error).message);
  }
}

export async function uploadVideo(shareId: string, filePath: string): Promise<void> {
  if (!isEnabled() || !shareId) return;

  try {
    const gs = getGalleryConfig();
    const base = new URL(gs.baseUrl);
    const isHttps = base.protocol === 'https:';
    const mod = isHttps ? https : http;

    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
    const mimeType = ext === 'mp4' ? 'video/mp4'
      : ext === 'mov' ? 'video/quicktime'
      : ext === 'webm' ? 'video/webm'
      : 'application/octet-stream';

    const fileData = fs.readFileSync(filePath);
    const boundary = '----PhotoboothVideoUpload' + Date.now();

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="video"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileData, footer]);

    const options: http.RequestOptions = {
      hostname: base.hostname,
      port: base.port || (isHttps ? 443 : 80),
      path: `/api/shares/${shareId}/videos`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gs.authToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 600000, // videos may be large
    };

    await new Promise<void>((resolve, reject) => {
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode! >= 200 && res.statusCode! < 300) {
            resolve();
          } else {
            reject(new Error(`Video upload failed with ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Video upload timed out'));
      });

      req.write(body);
      req.end();
    });

    console.log(`[gallery] Uploaded video ${filename} to share ${shareId}`);
  } catch (err) {
    console.error(`[gallery] Failed to upload video:`, (err as Error).message);
    throw err;
  }
}
