import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
import * as config from './config.js';
import type {
  Session,
  SessionType,
  SessionStartResult,
  SessionEndResult,
  SessionMetadata,
  ContactInfo,
  VideoTake,
} from './types.js';

let currentSession: Session | null = null;

/**
 * Session lifecycle events.
 * - `'ended'` fires after `metadata.json` is written and the session is reset.
 *   Payload: `{ id, dir, type, metadata }`.
 */
export const events = new EventEmitter();

export interface SessionEndedEvent {
  id: string;
  dir: string;
  type: SessionType;
  metadata: SessionMetadata;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function getKeptTakeCount(s: Session | null = currentSession): number {
  if (!s) return 0;
  return s.videoTakes.filter(t => t.kept).length;
}

export function start(type: SessionType = 'photo'): SessionStartResult {
  if (currentSession) {
    console.log(`[session] Resuming existing session: ${currentSession.id}`);
    return {
      id: currentSession.id,
      type: currentSession.type,
      resumed: true,
      photos: currentSession.photos,
      videoTakes: currentSession.videoTakes,
      keptTakeCount: getKeptTakeCount(currentSession),
    };
  }

  const cfg = config.get().app;
  const timestamp = formatTimestamp(new Date());
  const sessionFolder = type === 'video' ? `${timestamp}_video` : timestamp;
  const sessionDir = path.resolve(cfg.sessionsDir, sessionFolder);

  fs.mkdirSync(sessionDir, { recursive: true });

  // Generate a local share ID if configured (works even if gallery server is offline)
  const gs = cfg.galleryServer || ({} as { baseUrl?: string });
  let localShareId: string | null = null;
  let localShareUrl: string | null = null;
  if (cfg.generateShareId) {
    localShareId = nanoid(6);
    localShareUrl = gs.baseUrl ? `${gs.baseUrl.replace(/\/$/, '')}/${localShareId}` : null;
    console.log(`[session] Generated local share ID: ${localShareId}`);
  }

  currentSession = {
    id: sessionFolder,
    type,
    dir: sessionDir,
    photoCount: 0,
    startedAt: new Date().toISOString(),
    photos: [],
    videoTakes: [],
    currentTake: null,
    shareId: localShareId,
    shareUrl: localShareUrl
  };

  console.log(`[session] Started ${type} session: ${sessionFolder}`);
  return {
    id: currentSession.id,
    type: currentSession.type,
    resumed: false,
    photos: [],
    videoTakes: [],
    keptTakeCount: 0,
  };
}

export function getActive(): Session | null {
  return currentSession;
}

export function addPhoto(filename: string): number {
  if (!currentSession) {
    throw new Error('No active session');
  }
  if (currentSession.type !== 'photo') {
    throw new Error('Cannot add a photo to a non-photo session');
  }

  currentSession.photoCount++;
  currentSession.photos.push({
    filename,
    capturedAt: new Date().toISOString()
  });

  return currentSession.photoCount;
}

// --- Video-session helpers ---

export function beginVideoTake(prompt: string | null, fileExtension: string): VideoTake {
  if (!currentSession) throw new Error('No active session');
  if (currentSession.type !== 'video') throw new Error('Not a video session');
  if (currentSession.currentTake) throw new Error('A take is already in progress');

  const take: VideoTake = {
    takeNumber: currentSession.videoTakes.length + 1,
    cameraPath: null,
    fileExtension,
    prompt,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    kept: false,
  };
  currentSession.currentTake = take;
  return take;
}

export function finishCurrentTake(update: Partial<VideoTake>): VideoTake {
  if (!currentSession) throw new Error('No active session');
  if (!currentSession.currentTake) throw new Error('No take in progress');
  const merged: VideoTake = { ...currentSession.currentTake, ...update, stoppedAt: update.stoppedAt || new Date().toISOString() };
  // Push as pending — not yet kept/discarded.
  currentSession.videoTakes.push(merged);
  currentSession.currentTake = null;
  return merged;
}

export function getLastTake(): VideoTake | null {
  if (!currentSession || currentSession.videoTakes.length === 0) return null;
  return currentSession.videoTakes[currentSession.videoTakes.length - 1];
}

/** Mark the most-recently finished take as kept, optionally attaching local info. */
export function markLastTakeKept(update?: Partial<VideoTake>): { take: VideoTake; keptTakeCount: number } {
  if (!currentSession) throw new Error('No active session');
  const last = getLastTake();
  if (!last) throw new Error('No take to keep');
  last.kept = true;
  if (update) Object.assign(last, update);
  return { take: last, keptTakeCount: getKeptTakeCount() };
}

/** Mark the most-recently finished take as discarded. */
export function markLastTakeDiscarded(): { take: VideoTake; keptTakeCount: number } {
  if (!currentSession) throw new Error('No active session');
  const last = getLastTake();
  if (!last) throw new Error('No take to discard');
  last.kept = false;
  return { take: last, keptTakeCount: getKeptTakeCount() };
}

/** Update an existing take (by takeNumber) with new fields — e.g. after a background upload completes. */
export function updateTake(takeNumber: number, update: Partial<VideoTake>): VideoTake | null {
  if (!currentSession) return null;
  const t = currentSession.videoTakes.find(x => x.takeNumber === takeNumber);
  if (!t) return null;
  Object.assign(t, update);
  return t;
}

export function end(contactInfo: ContactInfo): SessionEndResult {
  if (!currentSession) {
    throw new Error('No active session');
  }

  const cfg = config.get().app;
  const gs = cfg.galleryServer || ({} as { resize?: { enabled: boolean } });
  const resize = (gs.resize && gs.resize.enabled) ? gs.resize : null;
  const keptVideoCount = getKeptTakeCount(currentSession);
  const metadata: SessionMetadata = {
    sessionId: currentSession.id,
    type: currentSession.type,
    shareId: currentSession.shareId || null,
    shareUrl: currentSession.shareUrl || null,
    eventName: cfg.eventName || null,
    resize: resize || null,
    startedAt: currentSession.startedAt,
    endedAt: new Date().toISOString(),
    photoCount: currentSession.photoCount,
    photos: currentSession.photos,
    videoTakes: currentSession.videoTakes,
    keptVideoCount,
    contact: {
      email: contactInfo.email || null,
      phone: contactInfo.phone || null
    }
  };

  const metadataPath = path.join(currentSession.dir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  const summary = currentSession.type === 'video'
    ? `${keptVideoCount} kept video${keptVideoCount !== 1 ? 's' : ''} (${currentSession.videoTakes.length} total takes)`
    : `${currentSession.photoCount} photo${currentSession.photoCount !== 1 ? 's' : ''}`;
  console.log(`[session] Ended ${currentSession.type} session: ${currentSession.id} (${summary})`);

  const sessionId = currentSession.id;
  const type = currentSession.type;
  const shareId = currentSession.shareId;
  const shareUrl = currentSession.shareUrl;
  const sessionDir = currentSession.dir;
  currentSession = null;

  // Notify subscribers (e.g. notification service) that this session is done.
  // Emit synchronously after state is reset so handlers can re-enter safely.
  try {
    const evt: SessionEndedEvent = { id: sessionId, dir: sessionDir, type, metadata };
    events.emit('ended', evt);
  } catch (err) {
    console.warn('[session] events.emit("ended") handler threw:', (err as Error).message);
  }

  return { id: sessionId, type, shareId, shareUrl, metadata };
}

export function setShare(shareId: string, shareUrl: string): void {
  if (!currentSession) return;
  currentSession.shareId = shareId;
  currentSession.shareUrl = shareUrl;
}
