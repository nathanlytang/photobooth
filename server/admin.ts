import { randomBytes } from 'crypto';
import { Router } from 'express';
import * as config from './config.js';

interface TokenEntry {
  token: string;
  expiresAt: number;
}

const sessions = new Map<string, TokenEntry>();

const COOKIE_NAME = 'pb_admin';

function parseCookies(header?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const pair of header.split(';')) {
    const [k, ...v] = pair.trim().split('=');
    if (k) result[k] = v.join('=');
  }
  return result;
}

function setCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; SameSite=Lax; HttpOnly; Max-Age=${maxAgeSeconds}`;
}

function clearCookie(name: string): string {
  return `${name}=; Path=/; SameSite=Lax; HttpOnly; Max-Age=0`;
}

function getConfig(): { password: string; ttlMinutes: number } {
  const a = config.get().admin;
  return { password: a.password, ttlMinutes: a.sessionTtlMinutes };
}

function requireAuth(req: any, res: any, next: any): void {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  if (!raw) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const entry = sessions.get(raw);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) sessions.delete(raw);
    res.status(401).json({ error: 'Session expired' });
    return;
  }
  next();
}

const router = Router();

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const cfg = getConfig();
  if (password !== cfg.password) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  const token = randomBytes(32).toString('hex');
  const ttl = cfg.ttlMinutes * 60;
  sessions.set(token, { token, expiresAt: Date.now() + ttl * 1000 });
  res.setHeader('Set-Cookie', setCookie(COOKIE_NAME, token, ttl));
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  if (raw) sessions.delete(raw);
  res.setHeader('Set-Cookie', clearCookie(COOKIE_NAME));
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  if (!raw) {
    res.json({ authenticated: false });
    return;
  }
  const entry = sessions.get(raw);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) sessions.delete(raw);
    res.json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true });
});

router.get('/config', requireAuth, (_req, res) => {
  res.json(config.get());
});

router.put('/config', requireAuth, (req, res) => {
  const next = req.body as Record<string, unknown>;
  if (!next || typeof next !== 'object') {
    res.status(400).json({ error: 'Invalid config body' });
    return;
  }
  try {
    config.save(next as any);
    res.json({ ok: true, config: config.get() });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/restart', requireAuth, (_req, res) => {
  res.json({ ok: true, restarting: true });
  setTimeout(() => {
    process.exit(0);
  }, 250);
});

router.get('/status', requireAuth, (_req, res) => {
  res.json({
    uptime: process.uptime(),
    version: process.version,
    env: process.env.NODE_ENV || 'development',
  });
});

export default router;
