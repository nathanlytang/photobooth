const { spawn } = require('child_process');
const config = require('./config');

let ffmpegProcess = null;
let clients = new Set();

// MJPEG boundary marker
const JPEG_START = Buffer.from([0xff, 0xd8]);
const JPEG_END = Buffer.from([0xff, 0xd9]);

let frameBuffer = Buffer.alloc(0);

function start() {
  const cfg = config.get().preview;

  const args = [
    '-f', 'v4l2',
    '-input_format', 'mjpeg',
    '-video_size', `${cfg.width}x${cfg.height}`,
    '-framerate', String(cfg.fps),
    '-i', cfg.device,
    '-c:v', 'copy',
    '-f', 'mjpeg',
    '-an',
    'pipe:1'
  ];

  console.log('[preview] Starting ffmpeg:', 'ffmpeg', args.join(' '));

  ffmpegProcess = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  ffmpegProcess.stdout.on('data', (chunk) => {
    frameBuffer = Buffer.concat([frameBuffer, chunk]);
    extractAndBroadcastFrames();
  });

  ffmpegProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      console.log('[preview] ffmpeg:', msg);
    }
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`[preview] ffmpeg exited with code ${code}`);
    ffmpegProcess = null;
  });

  ffmpegProcess.on('error', (err) => {
    console.error('[preview] Failed to start ffmpeg:', err.message);
    ffmpegProcess = null;
  });
}

function extractAndBroadcastFrames() {
  while (true) {
    const startIdx = frameBuffer.indexOf(JPEG_START);
    if (startIdx === -1) {
      frameBuffer = Buffer.alloc(0);
      return;
    }

    const endIdx = frameBuffer.indexOf(JPEG_END, startIdx + 2);
    if (endIdx === -1) {
      // Keep from the start marker onward, discard anything before
      if (startIdx > 0) {
        frameBuffer = frameBuffer.subarray(startIdx);
      }
      return;
    }

    const frame = frameBuffer.subarray(startIdx, endIdx + 2);
    frameBuffer = frameBuffer.subarray(endIdx + 2);

    broadcast(frame);
  }
}

function broadcast(frame) {
  const message = Buffer.concat([
    Buffer.from('FRAME'),
    frame
  ]);

  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
      } catch (err) {
        // Client disconnected
      }
    }
  }
}

function addClient(ws) {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
}

function removeClient(ws) {
  clients.delete(ws);
}

function stop() {
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
  }
  clients.clear();
}

function isRunning() {
  return ffmpegProcess !== null;
}

module.exports = { start, stop, addClient, removeClient, isRunning };
