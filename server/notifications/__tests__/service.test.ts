/**
 * Integration tests for the notification service.
 *
 * These tests perform REAL SMTP sends. Two modes:
 *
 *  1. Ethereal (default) — `nodemailer.createTestAccount()` mints a fresh
 *     throwaway inbox at https://ethereal.email/login. Credentials are
 *     printed to stdout so you can log in and inspect delivered mail.
 *
 *  2. Real config — set `TEST_REAL_SMTP=1` to load the SMTP credentials
 *     from your project's `config.json` (`app.notifications.smtp` and
 *     `app.notifications.from.email`). This actually sends from your
 *     configured Gmail / SES / etc. account. You must also set
 *     `TEST_RECIPIENT=you@example.com` so the test knows where to deliver.
 *
 * Run with:
 *   pnpm test                              # Ethereal mode
 *   $env:TEST_REAL_SMTP='1'; $env:TEST_RECIPIENT='you@example.com'; pnpm test
 *
 * Notes:
 *  - We mock `server/config.ts` via `vi.mock` so we don't have to write
 *    test-specific data to the real `config.json`. The mock factory is
 *    hoisted; we share state with the test body via `vi.hoisted`.
 *  - Each test creates its own session directory under the OS temp dir, so
 *    nothing in your real `sessionsDir` is touched.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { setDefaultResultOrder } from 'node:dns';
import nodemailer from 'nodemailer';

// WSL2's IPv6 outbound is unreliable. Node 18+ defaults to `verbatim` DNS
// result order, which often returns IPv6 first for Gmail/SES/etc. and yields
// `ENETUNREACH` for SMTP. Force IPv4 in two ways for belt-and-suspenders:
//   1) Set the process-wide DNS result order to ipv4first.
//   2) Monkey-patch `nodemailer.createTransport` so every transport built by
//      the production `SmtpEmailProvider` runs with `family: 4` in tests —
//      no production code change required.
setDefaultResultOrder('ipv4first');

const _origCreateTransport = nodemailer.createTransport.bind(nodemailer);
(nodemailer as any).createTransport = (opts: any, ...rest: any[]) =>
  _origCreateTransport({ ...opts, family: 4 }, ...rest);

const __filenameFromMeta = fileURLToPath(import.meta.url);
const __dirnameFromMeta = path.dirname(__filenameFromMeta);

// --- Hoisted shared state ---------------------------------------------------
// `vi.hoisted` runs before any imports, so both the `vi.mock` factory and the
// test body can read/write `ctx.config` as the active fake config.
const ctx = vi.hoisted(() => ({
  config: null as any,
}));

vi.mock('../../config.js', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    load: () => ctx.config,
    get: () => ctx.config,
    reload: () => ctx.config,
    save: () => {},
    events: new EventEmitter(),
  };
});

// Imports MUST come after the vi.mock above.
import * as service from '../service.js';
import * as session from '../../session.js';

// --- Test fixtures ----------------------------------------------------------

const USE_REAL_SMTP = 
  process.env.TEST_REAL_SMTP === '1' || process.env.TEST_REAL_SMTP === 'true';

interface SmtpCreds {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
}

let smtpCreds: SmtpCreds;
let senderFrom: string;
let recipient: string;
let tmpRoot: string;
let sessionsDir: string;
let retryQueuePath: string;

function buildConfig(overrides: { runInitialSweep?: boolean } = {}) {
  return {
    app: {
      port: 3000,
      sessionsDir,
      countdownSeconds: 3,
      eventName: 'Vitest Notification Test',
      sessionsRoot: sessionsDir,
      notifications: {
        enabled: true,
        from: { email: senderFrom },
        subject: 'Your photos from {eventName}',
        emailTemplate:
          '<p>Hello! Your photos{eventNameSuffix}: <a href="{shareUrl}">{shareUrl}</a></p>',
        smsTemplate: 'Your photos: {shareUrl}',
        smtp: { ...smtpCreds },
        twilio: { accountSid: '', authToken: '', from: '' },
        options: {
          channel: 'email' as const,
          deleteAfterSend: false,
          skipAlreadySent: true,
          skipVideoSessions: false,
          maxAgeDays: 0,
          dryRun: false,
          continueOnError: true,
          mode: 'all' as const,
          retryQueuePath,
          runInitialSweep: overrides.runInitialSweep ?? true,
        },
      },
    },
  };
}

/** Load real SMTP credentials from the project's `config.json`. */
function loadRealConfigCreds(): { creds: SmtpCreds; from: string } {
  // Test file lives at server/notifications/__tests__/service.test.ts;
  // dirname is __tests__, so repo root is three parents up.
  const repoRoot = path.resolve(__dirnameFromMeta, '..', '..', '..');
  const cfgPath = path.join(repoRoot, 'config.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error(
      `[test] TEST_REAL_SMTP=1 but ${cfgPath} not found. Copy config.example.json to config.json first.`
    );
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  const n = cfg?.app?.notifications;
  if (!n?.smtp?.host || !n?.smtp?.port) {
    throw new Error(
      '[test] config.json is missing app.notifications.smtp.host / port. Configure SMTP first.'
    );
  }
  if (!n?.from?.email) {
    throw new Error('[test] config.json is missing app.notifications.from.email.');
  }
  return {
    creds: {
      host: n.smtp.host,
      port: n.smtp.port,
      secure: !!n.smtp.secure,
      user: n.smtp.user || undefined,
      pass: n.smtp.pass || undefined,
    },
    from: n.from.email,
  };
}

interface MakeSessionOpts {
  id: string;
  email: string | null;
  shareUrl: string;
  type?: 'photo' | 'video';
}

function makeSession(opts: MakeSessionOpts): { dir: string; metadata: any } {
  const dir = path.join(sessionsDir, opts.id);
  fs.mkdirSync(dir, { recursive: true });
  const metadata = {
    sessionId: opts.id,
    type: opts.type || 'photo',
    shareId: opts.id.slice(-6),
    shareUrl: opts.shareUrl,
    eventName: 'Vitest Notification Test',
    resize: null,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    endedAt: new Date().toISOString(),
    photoCount: 1,
    photos: [{ index: 1, filename: 'photo-001.jpg' }],
    videoTakes: [],
    keptVideoCount: 0,
    contact: { email: opts.email, phone: null },
  };
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  return { dir, metadata };
}

function readMetadata(dir: string): any {
  return JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf-8'));
}

// --- Setup / teardown -------------------------------------------------------

beforeAll(async () => {
  if (USE_REAL_SMTP) {
    const { creds, from } = loadRealConfigCreds();
    smtpCreds = creds;
    senderFrom = from;
    if (!process.env.TEST_RECIPIENT) {
      throw new Error(
        '[test] TEST_REAL_SMTP=1 requires TEST_RECIPIENT=you@example.com so we know where to deliver.'
      );
    }
    recipient = process.env.TEST_RECIPIENT;
    console.log(
      `\n[test] Using REAL SMTP from config.json:\n` +
        `       host: ${creds.host}:${creds.port}${creds.secure ? ' (secure)' : ''}\n` +
        `       from: ${from}\n` +
        `       to:   ${recipient}\n`
    );
  } else {
    // Mint a real Ethereal SMTP account. This is a network call.
    const testAccount = await nodemailer.createTestAccount();
    smtpCreds = {
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      user: testAccount.user,
      pass: testAccount.pass,
    };
    senderFrom = `Photobooth Tests <${testAccount.user}>`;
    recipient = process.env.TEST_RECIPIENT || testAccount.user;
    console.log(
      '\n[test] Ethereal SMTP test account (log in to inspect delivered mail):\n' +
        `       URL:  https://ethereal.email/login\n` +
        `       user: ${testAccount.user}\n` +
        `       pass: ${testAccount.pass}\n` +
        `       to:   ${recipient}\n`
    );
  }

  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-notify-test-'));
  sessionsDir = path.join(tmpRoot, 'sessions');
  retryQueuePath = path.join(tmpRoot, 'retry.json');
  fs.mkdirSync(sessionsDir, { recursive: true });
}, 30_000);

afterAll(() => {
  service.stop();
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  service.stop(); // make sure nothing carries over between tests
  ctx.config = buildConfig();
});

// --- Tests ------------------------------------------------------------------

describe('notification service — real SMTP', () => {
  it('runOnce() sends an email via SMTP and marks metadata.contact.sent', async () => {
    const id = `runonce-${Date.now()}`;
    const { dir } = makeSession({
      id,
      email: recipient,
      shareUrl: 'https://gallery.example.com/runonce-abc',
    });

    const result = await service.runOnce();

    expect(result.failedCount).toBe(0);
    const meta = readMetadata(dir);
    expect(meta.contact.sent?.sent).toBe(true);
    expect(meta.contact.sent?.method).toBe('email');
    expect(meta.contact.sent?.recipients?.email).toBe(recipient);
    expect(meta.contact.sent?.attempts?.[0]?.ok).toBe(true);
  }, 30_000);

  it('start() processes a session:ended event end-to-end', async () => {
    // Disable initial sweep so this test exercises the event path only.
    ctx.config = buildConfig({ runInitialSweep: false });

    const id = `event-${Date.now()}`;
    const { dir, metadata } = makeSession({
      id,
      email: recipient,
      shareUrl: 'https://gallery.example.com/event-xyz',
    });

    service.start();
    expect(service.isStarted()).toBe(true);

    session.events.emit('ended', {
      id: metadata.sessionId,
      dir,
      type: 'photo',
      metadata,
    });

    // Wait for the in-service debounce (~5s) plus headroom for the SMTP RTT.
    await new Promise((r) => setTimeout(r, 9_000));

    const meta = readMetadata(dir);
    expect(meta.contact.sent?.sent).toBe(true);
    expect(meta.contact.sent?.method).toBe('email');
  }, 30_000);
});
