import { spawn, type ChildProcess } from 'child_process';
import type { WebSocket } from 'ws';
import * as config from './config.js';

let ffmpegProcess: ChildProcess | null = null;
const clients = new Set<WebSocket>();

// MJPEG boundary marker
const JPEG_START = Buffer.from([0xff, 0xd8]);
const JPEG_END = Buffer.from([0xff, 0xd9]);

let frameBuffer = Buffer.alloc(0);
const MAX_FRAME_BUFFER = 5 * 1024 * 1024; // 5MB cap to prevent memory leaks

let shouldRestart = false;
let restartTimeout: ReturnType<typeof setTimeout> | null = null;

export function start(): void {
  const cfg = config.get().preview;

  const platformKey = process.platform === 'darwin' ? 'darwin' : 'linux';
  const platformCfg = cfg.platform[platformKey];
  if (!platformCfg) {
    console.error(`[preview] No preview.platform.${platformKey} config found; aborting`);
    return;
  }

  // Platform-specific input args (must precede -i)
  const inputArgs: string[] = ['-f', platformCfg.inputFormat];
  if (platformCfg.pixelFormat) {
    inputArgs.push('-pixel_format', platformCfg.pixelFormat);
  }

  const args = [
    ...inputArgs,
    '-video_size', `${cfg.width}x${cfg.height}`,
    '-framerate', String(cfg.fps),
    '-i', platformCfg.device,
    '-r', String(cfg.fps),
    '-c:v', 'mjpeg',
    '-q:v', '5',
    '-f', 'mjpeg',
    '-an',
    'pipe:1'
  ];

  console.log('[preview] Starting ffmpeg:', 'ffmpeg', args.join(' '));

  shouldRestart = true;
  frameBuffer = Buffer.alloc(0);

  ffmpegProcess = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  ffmpegProcess.stdout!.on('data', (chunk: Buffer) => {
    frameBuffer = Buffer.concat([frameBuffer, chunk]);
    // Cap buffer to prevent memory leaks if frames aren't being consumed
    if (frameBuffer.length > MAX_FRAME_BUFFER) {
      console.warn('[preview] Frame buffer overflow, resetting');
      frameBuffer = Buffer.alloc(0);
    }
    extractAndBroadcastFrames();
  });

  ffmpegProcess.stderr!.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) {
      console.log('[preview] ffmpeg:', msg);
    }
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`[preview] ffmpeg exited with code ${code}`);
    ffmpegProcess = null;
    if (shouldRestart) {
      console.log('[preview] Auto-restarting ffmpeg in 3s...');
      restartTimeout = setTimeout(() => {
        restartTimeout = null;
        if (shouldRestart) start();
      }, 3000);
    }
  });

  ffmpegProcess.on('error', (err) => {
    console.error('[preview] Failed to start ffmpeg:', err.message);
    ffmpegProcess = null;
  });
}

function extractAndBroadcastFrames(): void {
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

function broadcast(frame: Buffer): void {
  const message = Buffer.concat([
    Buffer.from('FRAME'),
    frame
  ]);

  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
      } catch {
        // Client disconnected
      }
    }
  }
}

export function addClient(ws: WebSocket): void {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
}

export function removeClient(ws: WebSocket): void {
  clients.delete(ws);
}

export function stop(): void {
  shouldRestart = false;
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
  }
  clients.clear();
  frameBuffer = Buffer.alloc(0);
}

export function isRunning(): boolean {
  return ffmpegProcess !== null;
}
