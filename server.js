const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

const config = require('./src/config');
const preview = require('./src/preview');
const camera = require('./src/camera');
const session = require('./src/session');

// Load configuration
const cfg = config.load();

let autofocusInterval = null;

// Ensure sessions directory exists
const sessionsDir = path.resolve(cfg.app.sessionsDir);
fs.mkdirSync(sessionsDir, { recursive: true });

// Express app
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve session photos for thumbnail display
app.use('/sessions', express.static(sessionsDir));

// REST endpoint to get current config (non-sensitive, for frontend countdown value etc.)
app.get('/api/config', (req, res) => {
  res.json({
    countdownSeconds: cfg.app.countdownSeconds,
    cameraPosition: cfg.app.cameraPosition || 'above',
    lookText: cfg.app.lookText || 'Look up here!',
    enableEmail: cfg.app.enableEmail !== false,
    enablePhone: cfg.app.enablePhone !== false,
    mode: cfg.app.mode || 'prod'
  });
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('[ws] Client connected');

  // Register for preview frames
  preview.addClient(ws);

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
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

          stopAutofocusLoop();
          try {
            const photoNum = active.photoCount + 1;
            const result = await camera.captureAndDownload(active.dir, photoNum);
            session.addPhoto(result.filename);

            // Send back the photo info for thumbnail
            send(ws, 'capture:complete', {
              filename: result.filename,
              photoNumber: photoNum,
              url: `/sessions/${active.id}/${result.filename}`
            });
            startAutofocusLoop();
          } catch (err) {
            console.error('[capture] Error:', err.message);
            send(ws, 'capture:error', { message: err.message });
            startAutofocusLoop();
          }
          break;
        }

        case 'session:end': {
          stopAutofocusLoop();
          const contactInfo = payload || {};
          try {
            const result = session.end(contactInfo);
            send(ws, 'session:ended', result);
          } catch (err) {
            send(ws, 'error', { message: err.message });
          }
          break;
        }

        default:
          console.log('[ws] Unknown message type:', type);
      }
    } catch (err) {
      console.error('[ws] Error handling message:', err.message);
      send(ws, 'error', { message: err.message });
    }
  });

  ws.on('close', () => {
    console.log('[ws] Client disconnected');
    preview.removeClient(ws);
  });
});

function send(ws, type, payload) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

// Startup
async function init() {
  // Detect and configure camera
  try {
    await camera.detectCamera();
    await camera.applySettings();
  } catch (err) {
    console.warn('[init] Camera setup failed (will retry on capture):', err.message);
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

function shutdown() {
  console.log('[server] Shutting down...');
  stopAutofocusLoop();
  preview.stop();
  wss.close();
  server.close();
  process.exit(0);
}

function startAutofocusLoop() {
  stopAutofocusLoop();
  autofocusInterval = setInterval(() => {
    if (session.getActive()) {
      camera.triggerAutofocus();
    }
  }, 5000);
  console.log('[server] Autofocus loop started (every 5s)');
}

function stopAutofocusLoop() {
  if (autofocusInterval) {
    clearInterval(autofocusInterval);
    autofocusInterval = null;
    console.log('[server] Autofocus loop stopped');
  }
}

init();
