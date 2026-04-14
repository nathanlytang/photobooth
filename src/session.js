const fs = require('fs');
const path = require('path');
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

  currentSession = {
    id: timestamp,
    dir: sessionDir,
    photoCount: 0,
    startedAt: new Date().toISOString(),
    photos: []
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

  const metadata = {
    sessionId: currentSession.id,
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
  currentSession = null;

  return { id: sessionId, metadata };
}

module.exports = { start, end, getActive, addPhoto };
