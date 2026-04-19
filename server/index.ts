import http from 'http';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import * as config from './config.js';
import * as preview from './preview.js';
import * as camera from './camera.js';
import * as session from './session.js';
import * as gallery from './gallery.js';
import type { ContactInfo, FrontendConfig, WsMessage } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const cfg = config.load();

let autofocusInterval: ReturnType<typeof setInterval> | null = null;

// Ensure sessions directory exists
const sessionsDir = path.resolve(cfg.app.sessionsDir);
fs.mkdirSync(sessionsDir, { recursive: true });

// Express app
const app = express();
app.use(express.json());

// In production, serve the Vite build output
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Serve session photos for thumbnail display
app.use('/sessions', express.static(sessionsDir));

// REST endpoint to get current config (non-sensitive, for frontend countdown value etc.)
app.get('/api/config', (_req, res) => {
  const gs = cfg.app.galleryServer;
  const frontendConfig: FrontendConfig = {
    countdownSeconds: cfg.app.countdownSeconds,
    cameraPosition: cfg.app.cameraPosition || 'above',
    lookText: cfg.app.lookText || 'Look up here!',
    enableEmail: cfg.app.enableEmail !== false,
    enablePhone: cfg.app.enablePhone !== false,
    mode: cfg.app.mode || 'prod',
    crop: cfg.preview.crop || null,
    shutterOffsetMs: cfg.app.shutterOffsetMs || 0,
    galleryEnabled: !!(gs && gs.enabled)
  };
  res.json(frontendConfig);
});

// In production, serve index.html for all non-API routes (SPA fallback)
if (fs.existsSync(distPath)) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Create HTTP server
const server = http.createServer(app);

// WebSocket server — use explicit /ws path so Vite dev proxy can forward it
const wss = new WebSocketServer({ server, path: '/ws' });

// WS heartbeat — detect stale connections
const WS_PING_INTERVAL = 30_000;
const WS_PONG_TIMEOUT = 10_000;
const aliveMap = new WeakMap<WebSocket, boolean>();

const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (aliveMap.get(ws) === false) {
      console.log('[ws] Client unresponsive, terminating');
      ws.terminate();
      continue;
    }
    aliveMap.set(ws, false);
    ws.ping();
  }
}, WS_PING_INTERVAL);

wss.on('close', () => clearInterval(heartbeatInterval));

wss.on('connection', (ws: WebSocket) => {
  console.log('[ws] Client connected');
  aliveMap.set(ws, true);
  ws.on('pong', () => aliveMap.set(ws, true));

  // Register for preview frames
  preview.addClient(ws);

  ws.on('message', async (data: Buffer | string) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(data.toString()) as WsMessage;
    } catch {
      return;
    }

    const { type, payload } = msg;

    try {
      switch (type) {
        case 'session:start': {
          const result = session.start();
          send(ws, 'session:started', result);
          startAutofocusLoop();

          // Create a gallery share in the background
          if (gallery.isEnabled()) {
            const active = session.getActive();
            gallery.createShare(active?.shareId).then((share) => {
              if (share) {
                session.setShare(share.shareId, share.shareUrl);
                console.log(`[server] Gallery share linked: ${share.shareUrl}`);
              }
            });
          }
          break;
        }

        case 'capture': {
          const active = session.getActive();
          if (!active) {
            send(ws, 'error', { message: 'No active session' });
            break;
          }

          send(ws, 'capture:countdown', { seconds: cfg.app.countdownSeconds });

          // Wait for countdown on the client side, then trigger
          // The client sends 'capture:trigger' after countdown completes
          break;
        }

        case 'capture:trigger': {
          const active = session.getActive();
          if (!active) {
            send(ws, 'error', { message: 'No active session' });
            break;
          }

          const photoNum = active.photoCount + 1;

          // Capture + download with single retry on failure (USB glitches)
          stopAutofocusLoop();
          const attemptCapture = (retry: boolean) => {
            camera.captureAndDownload(active.dir, photoNum, () => {
              // Shutter has fired — notify client immediately
              send(ws, 'capture:captured', { photoNumber: photoNum });
            }).then((result) => {
              session.addPhoto(result.filename);
              send(ws, 'capture:complete', {
                filename: result.filename,
                photoNumber: photoNum,
                url: `/sessions/${active.id}/${result.filename}`
              });
              startAutofocusLoop();

              // Upload photo to gallery server in the background
              if (gallery.isEnabled() && active.shareId) {
                gallery.uploadPhoto(active.shareId, result.path).catch(() => {});
              }
            }).catch((err: Error) => {
              if (retry) {
                console.warn('[capture] First attempt failed, retrying in 1s:', err.message);
                setTimeout(() => attemptCapture(false), 1000);
              } else {
                console.error('[capture] Error:', err.message);
                send(ws, 'capture:error', { message: err.message });
                startAutofocusLoop();
              }
            });
          };
          attemptCapture(true);
          break;
        }

        case 'session:end': {
          stopAutofocusLoop();
          const contactInfo = (payload || {}) as ContactInfo;
          try {
            const result = session.end(contactInfo);
            send(ws, 'session:ended', result);

            // Upload metadata to gallery server in the background
            if (gallery.isEnabled() && result.shareId) {
              gallery.uploadMetadata(result.shareId, result.metadata).catch(() => {});
            }
          } catch (err) {
            send(ws, 'error', { message: (err as Error).message });
          }
          break;
        }

        default:
          console.log('[ws] Unknown message type:', type);
      }
    } catch (err) {
      console.error('[ws] Error handling message:', (err as Error).message);
      send(ws, 'error', { message: (err as Error).message });
    }
  });

  ws.on('close', () => {
    console.log('[ws] Client disconnected');
    preview.removeClient(ws);
  });
});

function send(ws: WebSocket, type: string, payload: unknown): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

// Startup
async function init(): Promise<void> {
  // Detect and configure camera
  try {
    await camera.detectCamera();
    await camera.applySettings();
  } catch (err) {
    console.warn('[init] Camera setup failed (will retry on capture):', (err as Error).message);
  }

  // Start live preview
  preview.start();

  // Start HTTP server
  server.listen(cfg.app.port, () => {
    console.log(`[server] Photobooth running at http://localhost:${cfg.app.port}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown(): void {
  console.log('[server] Shutting down...');
  stopAutofocusLoop();
  preview.stop();
  wss.close();
  server.close();
  process.exit(0);
}

function startAutofocusLoop(): void {
  if (cfg.app.periodicAutofocus === false) return;
  stopAutofocusLoop();
  autofocusInterval = setInterval(() => {
    if (session.getActive()) {
      camera.triggerAutofocus();
    }
  }, 5000);
  console.log('[server] Autofocus loop started (every 5s)');
}

function stopAutofocusLoop(): void {
  if (autofocusInterval) {
    clearInterval(autofocusInterval);
    autofocusInterval = null;
    console.log('[server] Autofocus loop stopped');
  }
}

// Catch-all error handlers — log before pm2 restarts the process
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  shutdown();
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

init();
