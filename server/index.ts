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
import * as video from './video.js';
import * as notifications from './notifications/service.js';
import adminRouter from './admin.js';
import type {
  ContactInfo,
  FrontendConfig,
  FrontendVideoConfig,
  WsMessage,
  VideoTake,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const cfg = config.load();

let autofocusInterval: ReturnType<typeof setInterval> | null = null;

// --- Video recording state (scoped to active session) ---
// Only one recording can be in flight at a time; these are reset when the
// session ends.
let videoRecordingState: video.RecordingState | null = null;
let videoRecordingActive = false;
let videoMaxDurationTimer: ReturnType<typeof setTimeout> | null = null;
// Most-recent start-recording request — remembers the chosen prompt so we can
// attach it to the take when the client sends `video:start-recording-confirm`
// after the countdown.
let pendingStartPrompt: string | null = null;
let pendingStartArmed = false;

function resetVideoState(): void {
  videoRecordingState = null;
  videoRecordingActive = false;
  if (videoMaxDurationTimer) {
    clearTimeout(videoMaxDurationTimer);
    videoMaxDurationTimer = null;
  }
  pendingStartPrompt = null;
  pendingStartArmed = false;
  pendingDetections.clear();
}

// Ensure sessions directory exists
const sessionsDir = path.resolve(cfg.app.sessionsDir);
fs.mkdirSync(sessionsDir, { recursive: true });

// Express app
const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

// In production, serve the Vite build output. PHOTOBOOTH_DIST lets the packaged
// kiosk point at the frontend bundled inside the app's resources.
const distPath = process.env.PHOTOBOOTH_DIST
  ? path.resolve(process.env.PHOTOBOOTH_DIST)
  : path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Serve session photos for thumbnail display
app.use('/sessions', express.static(sessionsDir));

// REST endpoint to get current config (non-sensitive, for frontend countdown value etc.)
app.get('/api/config', (_req, res) => {
  const c = config.get();
  const gs = c.app.galleryServer;
  const v = c.app.video;
  const videoConfig: FrontendVideoConfig = {
    enabled: !!(v && v.enabled),
    maxRecordSeconds: v?.maxRecordSeconds ?? 60,
    countdownSeconds: v?.countdownSeconds ?? 3,
    startOffsetMs: v?.startOffsetMs ?? 0,
    prompts: Array.isArray(v?.prompts) ? v!.prompts! : [],
    promptsPersistDuringRecording: v?.promptsPersistDuringRecording !== false,
    shareEnabled: !!(v?.share?.enabled),
  };
  const frontendConfig: FrontendConfig = {
    countdownSeconds: c.app.countdownSeconds,
    cameraPosition: c.app.cameraPosition || 'above',
    lookText: c.app.lookText || 'Look up here!',
    enableEmail: c.app.enableEmail !== false,
    enablePhone: c.app.enablePhone !== false,
    mode: c.app.mode || 'prod',
    crop: c.preview.crop || null,
    shutterOffsetMs: c.app.shutterOffsetMs || 0,
    eventName: c.app.eventName || null,
    screensaverTimeoutSeconds: typeof c.app.screensaverTimeoutSeconds === 'number' ? c.app.screensaverTimeoutSeconds : 60,
    galleryEnabled: !!(gs && gs.enabled),
    video: videoConfig,
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
          const result = session.start('photo');
          send(ws, 'session:started', result);
          startAutofocusLoop();

          // Apply photo-mode camera settings + startupConfigs in background.
          // USB mutex serializes against any subsequent capture.
          (async () => {
            try {
              await camera.applyStartupConfigs('photo');
              await camera.applySettings('photo');
            } catch (e) {
              console.warn('[camera] photo session setup failed:', (e as Error).message);
            }
          })();

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
          if (active.type !== 'photo') {
            send(ws, 'error', { message: 'Capture requires a photo session' });
            break;
          }

          send(ws, 'capture:countdown', { seconds: config.get().app.countdownSeconds });

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
          if (active.type !== 'photo') {
            send(ws, 'error', { message: 'Capture requires a photo session' });
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

            // Return the camera to idle (photo) settings in the background.
            camera.applySettings('photo').catch((e: Error) => {
              console.warn('[camera] applySettings(photo) on end failed:', e.message);
            });

            // Upload metadata to gallery server in the background
            if (gallery.isEnabled() && result.shareId) {
              gallery.uploadMetadata(result.shareId, result.metadata).catch(() => {});
            }
          } catch (err) {
            send(ws, 'error', { message: (err as Error).message });
          }
          break;
        }

        // --- Video guestbook ---

        case 'video:session:start': {
          if (!isVideoEnabled()) {
            send(ws, 'video:error', { message: 'Video guestbook is not enabled in config' });
            break;
          }
          const result = session.start('video');
          send(ws, 'video:session:started', result);

          // Apply video-mode startupConfigs + settings in background so
          // movieStart (which happens later, after the countdown) uses the
          // right exposure. USB mutex serializes against movieStart.
          (async () => {
            try {
              await camera.applyStartupConfigs('video');
              await camera.applySettings('video');
            } catch (e) {
              console.warn('[camera] video session setup failed:', (e as Error).message);
            }
          })();

          // Create a gallery share in the background if sharing is enabled.
          if (isVideoShareActive()) {
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

        case 'video:start-recording': {
          if (!assertVideoSession(ws)) break;
          if (videoRecordingActive || pendingStartArmed) {
            send(ws, 'video:error', { message: 'A recording is already in progress' });
            break;
          }
          const p = (payload || {}) as { prompt?: string | null };
          pendingStartPrompt = typeof p.prompt === 'string' ? p.prompt : null;
          pendingStartArmed = true;
          send(ws, 'video:countdown', {
            seconds: config.get().app.video?.countdownSeconds ?? 3,
          });
          break;
        }

        case 'video:start-recording-confirm': {
          if (!assertVideoSession(ws)) break;
          if (videoRecordingActive) {
            send(ws, 'video:error', { message: 'Already recording' });
            break;
          }
          if (!pendingStartArmed) {
            send(ws, 'video:error', { message: 'No pending start (did countdown run?)' });
            break;
          }
          const chosenPrompt = pendingStartPrompt;
          pendingStartPrompt = null;
          pendingStartArmed = false;
          const active = session.getActive();
          if (!active) {
            send(ws, 'video:error', { message: 'No active session' });
            break;
          }
          const movieCfg = config.get().camera.movie;
          const ext = movieCfg?.fileExtension || 'mov';
          try {
            const take = session.beginVideoTake(chosenPrompt, ext);
            const state = await video.startRecording(active.dir, take.takeNumber);
            videoRecordingState = state;
            videoRecordingActive = true;

            const maxSeconds = config.get().app.video?.maxRecordSeconds ?? 60;
            send(ws, 'video:recording-started', {
              takeNumber: take.takeNumber,
              startedAt: state.startedAt,
              maxSeconds,
            });

            // Server-side safety timeout: stop at max + 2s grace.
            if (videoMaxDurationTimer) clearTimeout(videoMaxDurationTimer);
            videoMaxDurationTimer = setTimeout(() => {
              if (videoRecordingActive) {
                console.log('[video] Max duration reached — forcing stop');
                handleStopRecording(ws).catch((e) => {
                  console.error('[video] Safety stop failed:', e);
                });
              }
            }, (maxSeconds + 2) * 1000);
          } catch (err) {
            // Roll back the take if startRecording failed.
            const activeSession = session.getActive();
            if (activeSession && activeSession.currentTake) {
              activeSession.currentTake = null;
            }
            console.error('[video] Failed to start recording:', (err as Error).message);
            send(ws, 'video:error', { message: (err as Error).message });
          }
          break;
        }

        case 'video:stop-recording': {
          if (!assertVideoSession(ws)) break;
          if (!videoRecordingActive) {
            send(ws, 'video:error', { message: 'No recording in progress' });
            break;
          }
          await handleStopRecording(ws);
          break;
        }

        case 'video:keep': {
          if (!assertVideoSession(ws)) break;
          try {
            const { take, keptTakeCount } = session.markLastTakeKept();
            send(ws, 'video:take-kept', { take, keptTakeCount });

            // Kick off background download+upload if uploadTiming = immediate.
            if (shouldUploadImmediately()) {
              queueVideoUpload(take, ws);
            }
          } catch (err) {
            send(ws, 'video:error', { message: (err as Error).message });
          }
          break;
        }

        case 'video:retake': {
          if (!assertVideoSession(ws)) break;
          try {
            const { keptTakeCount } = session.markLastTakeDiscarded();
            send(ws, 'video:take-discarded', { keptTakeCount });
          } catch (err) {
            send(ws, 'video:error', { message: (err as Error).message });
          }
          break;
        }

        case 'video:session:end': {
          const active = session.getActive();
          if (!active || active.type !== 'video') {
            send(ws, 'video:error', { message: 'No active video session' });
            break;
          }
          if (videoRecordingActive || active.currentTake) {
            send(ws, 'video:error', {
              message: 'Cannot end session while a recording or pending take is active',
            });
            break;
          }

          const contactInfo = (payload || {}) as ContactInfo;

          // If uploadTiming = 'onEnd', download+upload any kept takes now
          // before ending the session.
          if (shouldUploadOnEnd()) {
            const pendingTakes = active.videoTakes.filter(
              (t) => t.kept && !t.localFilename && !t.uploadSkipped
            );
            for (const t of pendingTakes) {
              await runVideoUpload(t, ws).catch((e) => {
                console.error('[video] onEnd upload failed:', e);
              });
            }
          }

          try {
            const result = session.end(contactInfo);
            resetVideoState();
            send(ws, 'video:session:ended', result);

            // Return the camera to idle (photo) settings in the background.
            camera.applySettings('photo').catch((e: Error) => {
              console.warn('[camera] applySettings(photo) on video end failed:', e.message);
            });

            // Upload metadata to gallery server in the background
            if (gallery.isEnabled() && result.shareId) {
              gallery.uploadMetadata(result.shareId, result.metadata).catch(() => {});
            }
          } catch (err) {
            send(ws, 'video:error', { message: (err as Error).message });
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

// --- Video helpers ---

function isVideoEnabled(): boolean {
  const c = config.get();
  return !!c.app.video && c.app.video.enabled === true;
}

/** Is the gallery share flow active for the current video session? */
function isVideoShareActive(): boolean {
  const v = config.get().app.video;
  return !!(v && v.enabled && v.share && v.share.enabled);
}

function shouldUploadImmediately(): boolean {
  const v = config.get().app.video;
  if (!v?.share?.enabled || !v.share.upload) return false;
  const timing = v.share.uploadTiming || 'immediate';
  return timing === 'immediate' && gallery.isEnabled();
}

function shouldUploadOnEnd(): boolean {
  const v = config.get().app.video;
  if (!v?.share?.enabled || !v.share.upload) return false;
  const timing = v.share.uploadTiming || 'immediate';
  return timing === 'onEnd' && gallery.isEnabled();
}

/** Guard: require an active video session, else emit video:error. */
function assertVideoSession(ws: WebSocket): boolean {
  const active = session.getActive();
  if (!active) {
    send(ws, 'video:error', { message: 'No active session' });
    return false;
  }
  if (active.type !== 'video') {
    send(ws, 'video:error', { message: 'Not a video session' });
    return false;
  }
  return true;
}

/**
 * In-flight camera-file detections keyed by takeNumber. The detection is
 * kicked off in the background right after the camera+audio are stopped so
 * the client can transition to the review screen without waiting on the
 * ~1.5s SD-card finalize delay + gphoto2 file-list call.
 */
const pendingDetections = new Map<number, Promise<string | null>>();

/** Await the background cameraPath detection for a given take, if any. */
async function awaitCameraPath(takeNumber: number): Promise<string | null> {
  const p = pendingDetections.get(takeNumber);
  if (!p) return null;
  try {
    return await p;
  } finally {
    pendingDetections.delete(takeNumber);
  }
}

/**
 * Stop the currently active recording, finish the take in session state, and
 * notify the client with `video:recording-stopped` as soon as the camera and
 * audio are idle. The on-camera file detection runs in the background and
 * updates the take's `cameraPath` when complete.
 */
async function handleStopRecording(ws: WebSocket): Promise<void> {
  if (!videoRecordingState || !videoRecordingActive) return;
  const state = videoRecordingState;
  videoRecordingActive = false;
  videoRecordingState = null;
  if (videoMaxDurationTimer) {
    clearTimeout(videoMaxDurationTimer);
    videoMaxDurationTimer = null;
  }

  try {
    // Fast phase: stop camera + audio. Returns as soon as hardware is idle.
    const fast = await video.stopRecordingFast(state);
    const take = session.finishCurrentTake({
      cameraPath: null, // filled in by the background detection below
      stoppedAt: fast.stoppedAt,
    });
    if (fast.audioPath) {
      (take as VideoTake & { audioPath?: string }).audioPath = fast.audioPath;
    }

    // Notify the client immediately so it can show the review screen.
    send(ws, 'video:recording-stopped', { take });

    // Background: detect the new file on the SD card. When it resolves, patch
    // the take so that `video:keep` can proceed with download+upload.
    const detection = video.detectRecordedFile(fast.filesBefore, fast.fileExtension)
      .then((cameraPath) => {
        session.updateTake(take.takeNumber, { cameraPath });
        return cameraPath;
      })
      .catch((err: Error) => {
        console.warn('[video] Background detection failed:', err.message);
        return null;
      });
    pendingDetections.set(take.takeNumber, detection);
  } catch (err) {
    // Attempt to finalize the take even if stop failed, so the user isn't stuck.
    try {
      session.finishCurrentTake({ cameraPath: null, stoppedAt: new Date().toISOString() });
    } catch { /* noop */ }
    console.error('[video] stopRecording failed:', (err as Error).message);
    send(ws, 'video:error', { message: (err as Error).message });
  }
}

/** Queue a take for background download+upload (immediate mode). */
function queueVideoUpload(take: VideoTake, ws: WebSocket): void {
  runVideoUpload(take, ws).catch((e: Error) => {
    console.error('[video] Background upload error:', e.message);
  });
}

/**
 * Download the take from the camera, mux external audio if present, upload to
 * gallery server, and update the session record.
 */
async function runVideoUpload(take: VideoTake, ws: WebSocket): Promise<void> {
  const active = session.getActive();
  if (!active) return;

  // If the background file-detection hasn't landed yet, wait for it.
  if (!take.cameraPath) {
    const resolved = await awaitCameraPath(take.takeNumber);
    if (resolved) {
      take.cameraPath = resolved;
    }
  }

  if (!take.cameraPath) {
    console.warn(`[video] Take ${take.takeNumber} has no cameraPath; skipping upload`);
    session.updateTake(take.takeNumber, {
      downloadError: 'No camera path detected',
      uploadSkipped: true,
    });
    return;
  }

  const v = config.get().app.video;
  if (!v?.share?.enabled) return;
  if (!v.share.upload) {
    session.updateTake(take.takeNumber, { uploadSkipped: true });
    return;
  }

  const baseName = `video_${String(countLocalFilenamesUpTo(take.takeNumber)).padStart(3, '0')}`;
  const audioPath = (take as VideoTake & { audioPath?: string }).audioPath || null;

  let localPath: string | null = null;
  try {
    localPath = await video.downloadAndFinalize(
      take.cameraPath,
      active.dir,
      baseName,
      take.fileExtension,
      audioPath
    );
    session.updateTake(take.takeNumber, { localFilename: path.basename(localPath) });
    send(ws, 'video:download-complete', {
      take: session.updateTake(take.takeNumber, {}) || take,
    });
  } catch (err) {
    console.error('[video] Download failed:', (err as Error).message);
    session.updateTake(take.takeNumber, {
      downloadError: (err as Error).message,
      uploadSkipped: true,
    });
    return;
  }

  if (!gallery.isEnabled() || !active.shareId) {
    console.log('[video] Gallery not enabled or no shareId; leaving take local only');
    return;
  }

  try {
    await gallery.uploadVideo(active.shareId, localPath);
    session.updateTake(take.takeNumber, { uploaded: true });
  } catch (err) {
    session.updateTake(take.takeNumber, {
      uploaded: false,
      uploadError: (err as Error).message,
    });
  }
}

/**
 * Count kept takes up to and including the given takeNumber to derive the
 * per-session local filename index (video_001.mov, video_002.mov, …).
 */
function countLocalFilenamesUpTo(takeNumber: number): number {
  const active = session.getActive();
  if (!active) return 1;
  let count = 0;
  for (const t of active.videoTakes) {
    if (t.kept) count++;
    if (t.takeNumber === takeNumber) return count || 1;
  }
  return count || 1;
}

// Startup
async function init(): Promise<void> {
  // Detect and configure camera
  try {
    await camera.detectCamera();
    // If the camera is meant to live in movie mode, run the video startup
    // configs once up-front so the camera is in live-view before any session.
    if (cfg.camera.persistentMovieMode) {
      console.log('[init] persistentMovieMode enabled — applying video startupConfigs');
      await camera.applyStartupConfigs('video');
    } else {
      await camera.applyStartupConfigs('photo');
    }
    await camera.applySettings('photo');
  } catch (err) {
    console.warn('[init] Camera setup failed (will retry on capture):', (err as Error).message);
  }

  // Start live preview
  preview.start();

  // Start HTTP server
  server.listen(cfg.app.port, () => {
    console.log(`[server] Photobooth running at http://localhost:${cfg.app.port}`);
  });

  // Start notification service if enabled in config (no-op when disabled).
  notifications.start();
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
  if (config.get().app.periodicAutofocus === false) return;
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

// React to live config changes
config.events.on('change', ({ prev, next }) => {
  const pPrev = JSON.stringify(prev.preview);
  const pNext = JSON.stringify(next.preview);
  if (pPrev !== pNext) {
    console.log('[config] Preview config changed — restarting preview');
    preview.stop();
    preview.start();
  }

  const afPrev = prev.app.periodicAutofocus;
  const afNext = next.app.periodicAutofocus;
  if (afPrev !== afNext) {
    if (afNext) {
      console.log('[config] periodicAutofocus enabled — starting loop');
      startAutofocusLoop();
    } else {
      console.log('[config] periodicAutofocus disabled — stopping loop');
      stopAutofocusLoop();
    }
  }

  // React to notification-service enable toggle.
  const nPrev = prev.app.notifications?.enabled === true;
  const nNext = next.app.notifications?.enabled === true;
  if (nPrev !== nNext) {
    if (nNext) {
      console.log('[config] notifications.enabled=true — starting service');
      notifications.start();
    } else {
      console.log('[config] notifications.enabled=false — stopping service');
      notifications.stop();
    }
  }

  // Notify all connected kiosk clients to reload so UI reflects new config.
  for (const ws of wss.clients) {
    send(ws, 'config:updated', {});
  }
});

// Catch-all error handlers — log before pm2 restarts the process
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  shutdown();
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

init();
