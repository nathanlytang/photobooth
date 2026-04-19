const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const config = require('./config');

let currentSession = null;

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function start() {
  if (currentSession) {
    console.log(`[session] Resuming existing session: ${currentSession.id}`);
    return { id: currentSession.id, resumed: true, photos: currentSession.photos };
  }

  const cfg = config.get().app;
  const timestamp = formatTimestamp(new Date());
  const sessionDir = path.resolve(cfg.sessionsDir, timestamp);

  fs.mkdirSync(sessionDir, { recursive: true });

  // Generate a local share ID if configured (works even if gallery server is offline)
  const gs = cfg.galleryServer || {};
  let localShareId = null;
  let localShareUrl = null;
  if (cfg.generateShareId) {
    localShareId = nanoid(6);
    localShareUrl = gs.baseUrl ? `${gs.baseUrl.replace(/\/$/, '')}/${localShareId}` : null;
    console.log(`[session] Generated local share ID: ${localShareId}`);
  }

  currentSession = {
    id: timestamp,
    dir: sessionDir,
    photoCount: 0,
    startedAt: new Date().toISOString(),
    photos: [],
    shareId: localShareId,
    shareUrl: localShareUrl
  };

  console.log(`[session] Started session: ${timestamp}`);
  return { id: currentSession.id, resumed: false, photos: [] };
}

function getActive() {
  return currentSession;
}

function addPhoto(filename) {
  if (!currentSession) {
    throw new Error('No active session');
  }

  currentSession.photoCount++;
  currentSession.photos.push({
    filename,
    capturedAt: new Date().toISOString()
  });

  return currentSession.photoCount;
}

function end(contactInfo) {
  if (!currentSession) {
    throw new Error('No active session');
  }

  const cfg = config.get().app;
  const gs = cfg.galleryServer || {};
  const resize = (gs.resize && gs.resize.enabled) ? gs.resize : null;
  const metadata = {
    sessionId: currentSession.id,
    shareId: currentSession.shareId || null,
    shareUrl: currentSession.shareUrl || null,
    eventName: cfg.eventName || null,
    resize: resize,
    startedAt: currentSession.startedAt,
    endedAt: new Date().toISOString(),
    photoCount: currentSession.photoCount,
    photos: currentSession.photos,
    contact: {
      email: contactInfo.email || null,
      phone: contactInfo.phone || null
    }
  };

  const metadataPath = path.join(currentSession.dir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  console.log(`[session] Ended session: ${currentSession.id} (${currentSession.photoCount} photos)`);

  const sessionId = currentSession.id;
  const shareId = currentSession.shareId;
  const shareUrl = currentSession.shareUrl;
  currentSession = null;

  return { id: sessionId, shareId, shareUrl, metadata };
}

function setShare(shareId, shareUrl) {
  if (!currentSession) return;
  currentSession.shareId = shareId;
  currentSession.shareUrl = shareUrl;
}

module.exports = { start, end, getActive, addPhoto, setShare };
