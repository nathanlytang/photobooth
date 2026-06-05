/**
 * Notification service.
 *
 * Long-running mode: subscribe to `session.events.on('ended', ...)` and
 * (optionally) sweep the sessions directory once at start. Each session is
 * processed by the same `engine.processSession` used by the one-shot script.
 *
 * One-shot mode: `runOnce()` mirrors the old `pnpm notify` behavior — sweep
 * the sessions directory (or the retry queue, when `options.mode === 'retry'`),
 * process every session, write the retry queue, and return a summary.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as config from '../config.js';
import * as session from '../session.js';
import type { NotificationsOptions } from '../types.js';
import { SmtpEmailProvider, TwilioSmsProvider } from './providers.js';
import {
  getNotificationsTemplates,
  processSession,
  type ProcessContext,
} from './engine.js';
import { loadRetryQueue, writeRetryQueue } from './queue.js';
import { logResult, printSummary } from './logging.js';
import {
  outcomeLabel,
  shouldQueue,
  type NotifyOptions,
  type RetryEntry,
  type SessionResult,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/** Project root (server/notifications/.. -> server/.. -> repo root). */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const DRAIN_DELAY_MS = 5000;

const DEFAULTS: NotifyOptions = {
  channel: 'preferEmail',
  deleteAfterSend: false,
  skipAlreadySent: true,
  skipVideoSessions: false,
  maxAgeDays: 0,
  dryRun: false,
  continueOnError: true,
  mode: 'all',
  retryQueuePath: './scripts/sendShares.retry.json',
  runInitialSweep: true,
};

function resolveOptions(fromConfig: NotificationsOptions | undefined): NotifyOptions {
  const o = fromConfig || {};
  return {
    channel: o.channel ?? DEFAULTS.channel,
    deleteAfterSend: o.deleteAfterSend ?? DEFAULTS.deleteAfterSend,
    skipAlreadySent: o.skipAlreadySent ?? DEFAULTS.skipAlreadySent,
    skipVideoSessions: o.skipVideoSessions ?? DEFAULTS.skipVideoSessions,
    maxAgeDays: typeof o.maxAgeDays === 'number' ? o.maxAgeDays : DEFAULTS.maxAgeDays,
    dryRun: o.dryRun ?? DEFAULTS.dryRun,
    continueOnError: o.continueOnError ?? DEFAULTS.continueOnError,
    mode: o.mode ?? DEFAULTS.mode,
    retryQueuePath: o.retryQueuePath || DEFAULTS.retryQueuePath,
    runInitialSweep: o.runInitialSweep ?? DEFAULTS.runInitialSweep,
  };
}

function buildContext(options: NotifyOptions): ProcessContext {
  const cfg = config.get();
  const emailProvider = new SmtpEmailProvider(cfg.app.notifications);
  const smsProvider = new TwilioSmsProvider(cfg.app.notifications);
  const cutoffMs =
    options.maxAgeDays > 0 ? Date.now() - options.maxAgeDays * 86400 * 1000 : 0;
  return {
    emailProvider,
    smsProvider,
    cutoffMs,
    templates: getNotificationsTemplates(),
    options,
  };
}

function listAllSessions(sessionsDir: string): string[] {
  if (!fs.existsSync(sessionsDir)) return [];
  return fs
    .readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(sessionsDir, d.name))
    .sort();
}

function getSessionsDir(): string {
  const sessionsDir = config.get().app.sessionsDir;
  return path.isAbsolute(sessionsDir) ? sessionsDir : path.resolve(REPO_ROOT, sessionsDir);
}

// --------------------------------------------------------------------------
// Long-running watcher state
// --------------------------------------------------------------------------

const inFlight = new Set<string>();
const pending = new Map<string, string>(); // sessionId -> sessionDir
let drainTimer: ReturnType<typeof setTimeout> | null = null;

let started = false;
let sessionListener: ((arg: { id: string; dir: string }) => void) | null = null;

/**
 * Process a single session directory and update the retry queue. Returns
 * silently on error (errors are logged); never throws.
 */
async function handleSessionDir(dir: string): Promise<void> {
  const sessionId = path.basename(dir);
  if (inFlight.has(sessionId)) return;
  inFlight.add(sessionId);

  try {
    const options = resolveOptions(config.get().app.notifications?.options);
    const ctx = buildContext(options);

    let result: SessionResult;
    if (!fs.existsSync(dir)) {
      result = {
        sessionId,
        sessionDir: dir,
        outcome: { kind: 'skipped', reason: 'bad-metadata', detail: 'session folder missing' },
      };
    } else {
      try {
        result = await processSession(dir, ctx);
      } catch (err) {
        result = {
          sessionId,
          sessionDir: dir,
          outcome: { kind: 'failed', reason: (err as Error).message, attempts: [] },
        };
      }
    }

    logResult(result);

    // Surgical retry-queue update: only touch this one session's entry.
    const queue = loadRetryQueue(options.retryQueuePath, REPO_ROOT);
    const prior = queue.entries.find((e) => e.sessionId === sessionId);
    const filtered = queue.entries.filter((e) => e.sessionId !== sessionId);
    if (shouldQueue(result.outcome)) {
      const o = result.outcome;
      const reason =
        o.kind === 'failed'
          ? o.reason
          : o.kind === 'skipped'
          ? o.detail || o.reason
          : '';
      filtered.push({
        sessionId,
        sessionDir: dir,
        outcome: outcomeLabel(result.outcome),
        reason,
        lastAttemptAt: new Date().toISOString(),
        attempts: (prior?.attempts || 0) + (options.dryRun ? 0 : 1),
      });
    }
    if (!options.dryRun) {
      writeRetryQueue(options.retryQueuePath, REPO_ROOT, {
        updatedAt: new Date().toISOString(),
        entries: filtered,
      });
    }
  } catch (err) {
    console.error(`[notify-service] ${sessionId}: handler error: ${(err as Error).message}`);
  } finally {
    inFlight.delete(sessionId);
  }
}

function scheduleDrain(): void {
  if (drainTimer) return;
  drainTimer = setTimeout(async () => {
    drainTimer = null;
    const dirs = Array.from(pending.values());
    pending.clear();
    for (const dir of dirs) {
      await handleSessionDir(dir);
    }
  }, DRAIN_DELAY_MS);
}

function onSessionEnded(arg: { id: string; dir: string }): void {
  pending.set(arg.id, arg.dir);
  scheduleDrain();
}

async function runInitialSweep(): Promise<void> {
  const sessionsDir = getSessionsDir();
  const dirs = listAllSessions(sessionsDir);
  if (dirs.length === 0) {
    console.log(`[notify-service] Initial sweep: no sessions under ${sessionsDir}`);
    return;
  }
  console.log(`[notify-service] Initial sweep: ${dirs.length} session(s) under ${sessionsDir}`);
  for (const dir of dirs) {
    await handleSessionDir(dir);
  }
}

/**
 * Start the long-running watcher. Idempotent; respects the
 * `app.notifications.enabled` flag (no-op when disabled).
 */
export function start(): void {
  if (started) return;
  const cfg = config.get();
  if (cfg.app.notifications?.enabled !== true) return;
  started = true;

  const options = resolveOptions(cfg.app.notifications?.options);
  console.log(
    `[notify-service] started (channel=${options.channel} runInitialSweep=${options.runInitialSweep})`
  );

  sessionListener = onSessionEnded;
  session.events.on('ended', sessionListener);

  if (options.runInitialSweep) {
    runInitialSweep().catch((err) =>
      console.error('[notify-service] Initial sweep error:', err)
    );
  }
}

/** Stop the long-running watcher. Safe to call when not started. */
export function stop(): void {
  if (!started) return;
  started = false;
  if (sessionListener) {
    session.events.off('ended', sessionListener);
    sessionListener = null;
  }
  if (drainTimer) {
    clearTimeout(drainTimer);
    drainTimer = null;
  }
  pending.clear();
  console.log('[notify-service] stopped');
}

export function isStarted(): boolean {
  return started;
}

// --------------------------------------------------------------------------
// One-shot entrypoint (used by `pnpm notify`)
// --------------------------------------------------------------------------

export interface RunOnceResult {
  results: SessionResult[];
  failedCount: number;
}

export async function runOnce(): Promise<RunOnceResult> {
  const cfg = config.get();
  const options = resolveOptions(cfg.app.notifications?.options);
  const ctx = buildContext(options);
  const sessionsDir = getSessionsDir();
  const existingQueue = loadRetryQueue(options.retryQueuePath, REPO_ROOT);

  console.log(
    `[notify] mode=${options.mode} channel=${options.channel} dryRun=${options.dryRun} deleteAfterSend=${options.deleteAfterSend}`
  );
  console.log(
    `[notify] providers: email=${ctx.emailProvider.available() ? 'ok' : 'unconfigured'} sms=${
      ctx.smsProvider.available() ? 'ok' : 'unconfigured'
    }`
  );

  let sessionDirs: string[] = [];
  if (options.mode === 'retry') {
    if (existingQueue.entries.length === 0) {
      console.log('[notify] Retry mode: queue is empty. Nothing to do.');
      return { results: [], failedCount: 0 };
    }
    for (const entry of existingQueue.entries) {
      const dir =
        entry.sessionDir && fs.existsSync(entry.sessionDir)
          ? entry.sessionDir
          : path.join(sessionsDir, entry.sessionId);
      sessionDirs.push(dir);
    }
  } else {
    sessionDirs = listAllSessions(sessionsDir);
    if (sessionDirs.length === 0) {
      console.log(`[notify] No sessions found under ${sessionsDir}`);
    }
  }

  const queueById: Record<string, RetryEntry> = {};
  for (const e of existingQueue.entries) queueById[e.sessionId] = e;

  const results: SessionResult[] = [];

  for (const dir of sessionDirs) {
    let result: SessionResult;
    if (!fs.existsSync(dir)) {
      result = {
        sessionId: path.basename(dir),
        sessionDir: dir,
        outcome: { kind: 'skipped', reason: 'bad-metadata', detail: 'session folder missing' },
      };
    } else {
      try {
        result = await processSession(dir, ctx);
      } catch (err) {
        result = {
          sessionId: path.basename(dir),
          sessionDir: dir,
          outcome: { kind: 'failed', reason: (err as Error).message, attempts: [] },
        };
      }
    }
    results.push(result);
    logResult(result);

    if (result.outcome.kind === 'failed' && !options.continueOnError) {
      console.error('[notify] continueOnError=false; aborting.');
      break;
    }
  }

  // Update retry queue (full rewrite for one-shot run).
  const nowIso = new Date().toISOString();
  const processedIds = new Set(results.map((r) => r.sessionId));
  const nextEntries: RetryEntry[] = [];
  for (const e of existingQueue.entries) {
    if (!processedIds.has(e.sessionId)) nextEntries.push(e);
  }
  for (const r of results) {
    if (r.outcome.kind === 'sent') continue;
    if (!shouldQueue(r.outcome)) continue;
    const prior = queueById[r.sessionId];
    const reason =
      r.outcome.kind === 'failed'
        ? r.outcome.reason
        : r.outcome.detail || r.outcome.reason;
    nextEntries.push({
      sessionId: r.sessionId,
      sessionDir: r.sessionDir,
      outcome: outcomeLabel(r.outcome),
      reason,
      lastAttemptAt: nowIso,
      attempts: (prior?.attempts || 0) + (options.dryRun ? 0 : 1),
    });
  }
  if (!options.dryRun || options.mode === 'retry') {
    writeRetryQueue(options.retryQueuePath, REPO_ROOT, {
      updatedAt: nowIso,
      entries: nextEntries,
    });
  }

  printSummary(results);

  const failedCount = results.filter((r) => r.outcome.kind === 'failed').length;
  return { results, failedCount };
}
