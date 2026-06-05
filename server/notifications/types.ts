import type { ContactSentAttempt, ContactSentMethod } from '../types.js';

export type Channel = 'email' | 'sms' | 'both' | 'preferEmail' | 'preferSms';
export type Mode = 'all' | 'retry';

export interface NotifyOptions {
  channel: Channel;
  deleteAfterSend: boolean;
  skipAlreadySent: boolean;
  skipVideoSessions: boolean;
  maxAgeDays: number;
  dryRun: boolean;
  continueOnError: boolean;
  mode: Mode;
  retryQueuePath: string;
  runInitialSweep: boolean;
}

export type SkipReason =
  | 'already-sent'
  | 'no-share-url'
  | 'video-session'
  | 'no-contact'
  | 'invalid-email'
  | 'invalid-phone'
  | 'channel-unavailable'
  | 'provider-unconfigured'
  | 'too-old'
  | 'bad-metadata';

export type Outcome =
  | {
      kind: 'sent';
      method: ContactSentMethod;
      recipients: { email?: string; phone?: string };
      attempts: ContactSentAttempt[];
      durationMs: number;
      dryRun: boolean;
    }
  | { kind: 'skipped'; reason: SkipReason; detail?: string }
  | { kind: 'failed'; reason: string; attempts: ContactSentAttempt[] };

export interface SessionResult {
  sessionId: string;
  sessionDir: string;
  outcome: Outcome;
}

export interface RetryEntry {
  sessionId: string;
  sessionDir: string;
  outcome: string;
  reason?: string;
  lastAttemptAt: string;
  attempts: number;
}

export interface RetryQueue {
  updatedAt: string;
  entries: RetryEntry[];
}

export const QUEUEABLE_SKIP_REASONS: SkipReason[] = [
  'invalid-email',
  'invalid-phone',
  'no-contact',
  'bad-metadata',
  'provider-unconfigured',
  'channel-unavailable',
];

export function shouldQueue(outcome: Outcome): boolean {
  if (outcome.kind === 'failed') return true;
  if (outcome.kind === 'skipped') return QUEUEABLE_SKIP_REASONS.includes(outcome.reason);
  return false;
}

export function outcomeLabel(outcome: Outcome): string {
  if (outcome.kind === 'sent') return 'sent';
  if (outcome.kind === 'failed') return 'failed';
  return `skipped:${outcome.reason}`;
}
