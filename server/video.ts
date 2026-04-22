import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import * as config from './config.js';
import * as camera from './camera.js';
import type { VideoAudioExternalMicConfig } from './types.js';

// --- External mic capture via ffmpeg ---

interface AudioRecording {
  process: ChildProcess;
  outputPath: string;
  startedAt: number;
  finished: Promise<void>;
}

/**
 * Start an ffmpeg subprocess that records audio from the configured input to a
 * local file (PCM WAV). Returns a handle whose `finished` promise resolves
 * when ffmpeg exits cleanly.
 */
export function startAudioCapture(
  destDir: string,
  basename: string,
  cfg: VideoAudioExternalMicConfig
): AudioRecording {
  const outputPath = path.join(destDir, `${basename}.wav`);
  const tokens = tokenizeArgs(cfg.ffmpegInput);
  const args: string[] = [...tokens];
  if (cfg.sampleRate) args.push('-ar', String(cfg.sampleRate));
  if (cfg.channels) args.push('-ac', String(cfg.channels));
  args.push('-y', outputPath);

  console.log('[video-audio] Starting ffmpeg:', 'ffmpeg', args.join(' '));
  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) console.log('[video-audio]', msg);
  });

  const finished = new Promise<void>((resolve) => {
    proc.on('close', (code) => {
      console.log(`[video-audio] ffmpeg exited with code ${code}`);
      resolve();
    });
  });

  return {
    process: proc,
    outputPath,
    startedAt: Date.now(),
    finished,
  };
}

/**
 * Stop a running audio capture by sending 'q' on stdin (graceful) then waiting
 * for the process to exit. Falls back to SIGINT/SIGKILL if it hangs.
 */
export async function stopAudioCapture(rec: AudioRecording): Promise<string | null> {
  if (!rec.process.killed && rec.process.exitCode === null) {
    try {
      rec.process.kill('SIGINT');
    } catch {
      // already gone
    }
  }

  // wait up to 5s for graceful exit, then SIGKILL
  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => {
      if (rec.process.exitCode === null) {
        try { rec.process.kill('SIGKILL'); } catch { /* noop */ }
      }
      resolve();
    }, 5000);
  });

  await Promise.race([rec.finished, timeout]);
  await rec.finished; // ensure stream flushed

  if (fs.existsSync(rec.outputPath)) {
    return rec.outputPath;
  }
  console.warn('[video-audio] No output file produced at', rec.outputPath);
  return null;
}

/**
 * Mux a camera video + external audio into a single output file.
 * Video stream is copied; audio is re-encoded to AAC for broad compatibility.
 */
export function muxAudio(videoPath: string, audioPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      outPath,
    ];
    console.log('[video-mux] Running ffmpeg', args.join(' '));
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg mux exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', (err) => reject(err));
  });
}

// --- High-level recording session ---

export interface RecordingState {
  startedAt: string;         // ISO timestamp
  startedAtMs: number;
  filesBefore: string[];     // snapshot of on-camera files prior to recording
  audio: AudioRecording | null;
}

/**
 * Snapshot on-camera files, then trigger gphoto2 movie start. Optionally begin
 * recording external-mic audio on the host.
 */
export async function startRecording(destDir: string, takeNumber: number): Promise<RecordingState> {
  // Snapshot what's on the camera BEFORE we start — used to diff the new file afterwards.
    console.log(new Date().getTime())

  const filesBefore = await safeListCameraFiles();
  console.log(new Date().getTime())

  const videoCfg = config.get().app.video;
  const externalMic = videoCfg?.audio?.externalMic;
  let audio: AudioRecording | null = null;
  if (externalMic && externalMic.enabled) {
    try {
      audio = startAudioCapture(destDir, `take_${String(takeNumber).padStart(3, '0')}_audio`, externalMic);
    } catch (err) {
      console.warn('[video] External mic failed to start, continuing without:', (err as Error).message);
      audio = null;
    }
  }

  try {
    console.log(new Date().getTime())

    await camera.movieStart();
  } catch (err) {
    // Clean up audio if movie failed to start.
    if (audio) {
      try { await stopAudioCapture(audio); } catch { /* noop */ }
    }
    throw err;
  }

  return {
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    filesBefore,
    audio,
  };
}

export interface StopResult {
  stoppedAt: string;
  cameraPath: string | null;
  fileExtension: string;
  audioPath: string | null;
}

export interface FastStopResult {
  stoppedAt: string;
  audioPath: string | null;
  fileExtension: string;
  filesBefore: string[];
}

/**
 * Fast phase: stop camera recording + audio capture. Returns as soon as the
 * camera/audio are idle, *without* waiting for the SD card to finalize or
 * listing files. Use `detectRecordedFile()` to complete the slow part in the
 * background.
 */
export async function stopRecordingFast(state: RecordingState): Promise<FastStopResult> {
  const movieCfg = config.get().camera.movie;
  const fileExtension = movieCfg?.fileExtension || 'mov';

  // Stop camera recording first so the file is flushed to the SD card.
  let cameraError: Error | null = null;
  try {
    await camera.movieStop();
  } catch (err) {
    cameraError = err as Error;
  }

  // Stop local audio capture.
  let audioPath: string | null = null;
  if (state.audio) {
    try {
      audioPath = await stopAudioCapture(state.audio);
    } catch (err) {
      console.warn('[video] stopAudioCapture failed:', (err as Error).message);
    }
  }

  if (cameraError) throw cameraError;

  return {
    stoppedAt: new Date().toISOString(),
    audioPath,
    fileExtension,
    filesBefore: state.filesBefore,
  };
}

/**
 * Slow phase: wait briefly for the SD card to finalize, then list camera files
 * and diff against the pre-recording snapshot to find the new file.
 */
export async function detectRecordedFile(
  filesBefore: string[],
  fileExtension: string
): Promise<string | null> {
  // Give the camera a moment to finalize the file on the SD card.
  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    const filesAfter = await safeListCameraFiles();
    const newFiles = camera.diffNewFilesByExtension(filesBefore, filesAfter, fileExtension);
    if (newFiles.length > 0) {
      const cameraPath = newFiles[newFiles.length - 1];
      console.log(`[video] Detected new on-camera file: ${cameraPath}`);
      return cameraPath;
    }
    console.warn(`[video] No new .${fileExtension} file found on camera after recording`);
    return null;
  } catch (err) {
    console.warn('[video] Failed to list camera files after stop:', (err as Error).message);
    return null;
  }
}

/**
 * Legacy convenience wrapper: performs both phases sequentially. Prefer
 * `stopRecordingFast()` + `detectRecordedFile()` when you want to overlap the
 * detection with user interaction on the review screen.
 */
export async function stopRecording(state: RecordingState): Promise<StopResult> {
  const fast = await stopRecordingFast(state);
  const cameraPath = await detectRecordedFile(fast.filesBefore, fast.fileExtension);
  return {
    stoppedAt: fast.stoppedAt,
    cameraPath,
    fileExtension: fast.fileExtension,
    audioPath: fast.audioPath,
  };
}

/**
 * Download a video from the camera and, if external audio is present, mux it
 * in. Returns the path to the final local file.
 */
export async function downloadAndFinalize(
  cameraPath: string,
  destDir: string,
  baseFilename: string,     // without extension
  fileExtension: string,
  audioPath: string | null
): Promise<string> {
  const rawPath = path.join(destDir, `${baseFilename}_raw.${fileExtension}`);
  await camera.downloadCameraFile(cameraPath, rawPath);

  if (!audioPath || !fs.existsSync(audioPath)) {
    // No external audio — just rename raw to final.
    const finalPath = path.join(destDir, `${baseFilename}.${fileExtension}`);
    fs.renameSync(rawPath, finalPath);
    return finalPath;
  }

  const muxedPath = path.join(destDir, `${baseFilename}.${fileExtension}`);
  try {
    await muxAudio(rawPath, audioPath, muxedPath);
    // Keep the raw file around in case the mux is wrong; name it .raw.<ext>.
    try { fs.unlinkSync(rawPath); } catch { /* noop */ }
    return muxedPath;
  } catch (err) {
    console.warn('[video] Mux failed, falling back to raw camera file:', (err as Error).message);
    const finalPath = path.join(destDir, `${baseFilename}.${fileExtension}`);
    fs.renameSync(rawPath, finalPath);
    return finalPath;
  }
}

// --- Helpers ---

async function safeListCameraFiles(): Promise<string[]> {
  try {
    return await camera.listCameraFiles();
  } catch (err) {
    console.warn('[video] listCameraFiles failed:', (err as Error).message);
    return [];
  }
}

/**
 * Minimal shell-like tokenizer: splits on whitespace but respects simple
 * single-and-double-quoted substrings. Good enough for "-f alsa -i hw:1,0".
 */
function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  const re = /(?:[^\s"']+|"([^"]*)"|'([^']*)')+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    tokens.push(m[0].replace(/^['"]|['"]$/g, ''));
  }
  return tokens;
}
