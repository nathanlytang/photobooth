/**
 * Photobooth share notifier.
 *
 * Scans the sessions directory, sends each session's shareUrl to its contact
 * via email and/or SMS, marks metadata.contact.sent on success, and (optionally)
 * deletes the local session folder. Sessions that fail or skip for actionable
 * reasons (failed delivery, invalid contact data, etc.) are recorded in a JSON
 * retry queue file. Set `OPTIONS.mode = 'retry'` to re-process those.
 *
 * Run via:  pnpm notify
 *
 * Implementation lives under ./notify/*. This file is just options + glue.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as config from '../server/config.js';
import type { NotificationsOptions } from '../server/types.js';
import { SmtpEmailProvider, TwilioSmsProvider } from './providers.js';
import type { NotifyOptions, RetryEntry, SessionResult } from './notify/types.js';
import { outcomeLabel, shouldQueue } from './notify/types.js';
import { loadRetryQueue, writeRetryQueue } from './notify/queue.js';
import {
  getNotificationsTemplates,
  processSession,
  type ProcessContext,
} from './notify/processSession.js';
import { logResult, printSummary } from './notify/logging.js';

// --------------------------------------------------------------------------
// Defaults — overridden per-key by `app.notifications.options` in config.json.
// --------------------------------------------------------------------------

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
  };
}

// --------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function listAllSessions(sessionsDir: string): string[] {
  if (!fs.existsSync(sessionsDir)) return [];
  return fs
    .readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(sessionsDir, d.name))
    .sort();
}

async function main(): Promise<void> {
  config.load();
  const cfg = config.get();
  const sessionsDir = path.isAbsolute(cfg.app.sessionsDir)
    ? cfg.app.sessionsDir
    : path.resolve(REPO_ROOT, cfg.app.sessionsDir);

  const OPTIONS = resolveOptions(cfg.app.notifications?.options);

  const emailProvider = new SmtpEmailProvider(cfg.app.notifications);
  const smsProvider = new TwilioSmsProvider(cfg.app.notifications);

  console.log(
    `[notify] mode=${OPTIONS.mode} channel=${OPTIONS.channel} dryRun=${OPTIONS.dryRun} deleteAfterSend=${OPTIONS.deleteAfterSend}`
  );
  console.log(
    `[notify] providers: email=${emailProvider.available() ? 'ok' : 'unconfigured'} sms=${
      smsProvider.available() ? 'ok' : 'unconfigured'
    }`
  );

  const cutoffMs =
    OPTIONS.maxAgeDays > 0 ? Date.now() - OPTIONS.maxAgeDays * 86400 * 1000 : 0;

  const ctx: ProcessContext = {
    emailProvider,
    smsProvider,
    cutoffMs,
    templates: getNotificationsTemplates(),
    options: OPTIONS,
  };

  const existingQueue = loadRetryQueue(OPTIONS.retryQueuePath, REPO_ROOT);

  // Build worklist
  let sessionDirs: string[] = [];
  if (OPTIONS.mode === 'retry') {
    if (existingQueue.entries.length === 0) {
      console.log('[notify] Retry mode: queue is empty. Nothing to do.');
      return;
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

    if (result.outcome.kind === 'failed' && !OPTIONS.continueOnError) {
      console.error('[notify] continueOnError=false; aborting.');
      break;
    }
  }

  // Update retry queue
  const nowIso = new Date().toISOString();
  const processedIds = new Set(results.map((r) => r.sessionId));
  const nextEntries: RetryEntry[] = [];

  // Preserve entries not touched this run
  for (const e of existingQueue.entries) {
    if (!processedIds.has(e.sessionId)) nextEntries.push(e);
  }

  // Apply this run's results
  for (const r of results) {
    if (r.outcome.kind === 'sent') continue; // success → remove
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
      attempts: (prior?.attempts || 0) + (OPTIONS.dryRun ? 0 : 1),
    });
  }

  if (!OPTIONS.dryRun || OPTIONS.mode === 'retry') {
    writeRetryQueue(OPTIONS.retryQueuePath, REPO_ROOT, {
      updatedAt: nowIso,
      entries: nextEntries,
    });
  }

  printSummary(results);

  const failedCount = results.filter((r) => r.outcome.kind === 'failed').length;
  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[notify] Fatal error:', err);
  process.exit(1);
});
