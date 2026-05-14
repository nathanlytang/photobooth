import fs from 'fs';
import path from 'path';
import * as config from '../../server/config.js';
import type {
  SessionMetadata,
  ContactSentInfo,
  ContactSentAttempt,
  ContactSentMethod,
} from '../../server/types.js';
import type { NotificationProvider } from '../providers.js';
import type { NotifyOptions, SessionResult } from './types.js';
import {
  htmlToText,
  isValidEmail,
  isValidPhone,
  planChannels,
  renderTemplate,
} from './validation.js';

export interface NotificationsTemplates {
  subject: string;
  emailTemplate: string;
  smsTemplate: string;
}

export interface ProcessContext {
  emailProvider: NotificationProvider;
  smsProvider: NotificationProvider;
  cutoffMs: number; // 0 = disabled
  templates: NotificationsTemplates;
  options: NotifyOptions;
}

export function getNotificationsTemplates(): NotificationsTemplates {
  const cfg = config.get().app.notifications || {};
  return {
    subject: cfg.subject || 'Your photos',
    emailTemplate: cfg.emailTemplate || 'Your photos: {shareUrl}',
    smsTemplate: cfg.smsTemplate || 'Your photos: {shareUrl}',
  };
}

function writeMetadataAtomic(metadataPath: string, metadata: SessionMetadata): void {
  const tmp = `${metadataPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(metadata, null, 2), 'utf-8');
  fs.renameSync(tmp, metadataPath);
}

export async function processSession(
  sessionDir: string,
  ctx: ProcessContext
): Promise<SessionResult> {
  const { options } = ctx;
  const sessionId = path.basename(sessionDir);
  const metadataPath = path.join(sessionDir, 'metadata.json');

  if (!fs.existsSync(metadataPath)) {
    return {
      sessionId,
      sessionDir,
      outcome: { kind: 'skipped', reason: 'bad-metadata', detail: 'metadata.json missing' },
    };
  }

  let metadata: SessionMetadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  } catch (err) {
    return {
      sessionId,
      sessionDir,
      outcome: { kind: 'skipped', reason: 'bad-metadata', detail: (err as Error).message },
    };
  }

  if (!metadata.shareUrl) {
    return { sessionId, sessionDir, outcome: { kind: 'skipped', reason: 'no-share-url' } };
  }

  if (options.skipVideoSessions && metadata.type === 'video') {
    return { sessionId, sessionDir, outcome: { kind: 'skipped', reason: 'video-session' } };
  }

  if (
    options.skipAlreadySent &&
    metadata.contact &&
    metadata.contact.sent &&
    metadata.contact.sent.sent === true
  ) {
    return { sessionId, sessionDir, outcome: { kind: 'skipped', reason: 'already-sent' } };
  }

  if (ctx.cutoffMs > 0) {
    const ended = metadata.endedAt ? Date.parse(metadata.endedAt) : NaN;
    if (Number.isFinite(ended) && ended < ctx.cutoffMs) {
      return { sessionId, sessionDir, outcome: { kind: 'skipped', reason: 'too-old' } };
    }
  }

  const rawEmail = (metadata.contact?.email || '').trim() || null;
  const rawPhone = (metadata.contact?.phone || '').trim() || null;

  if (!rawEmail && !rawPhone) {
    return { sessionId, sessionDir, outcome: { kind: 'skipped', reason: 'no-contact' } };
  }

  const emailValid = rawEmail ? isValidEmail(rawEmail) : false;
  const phoneValid = rawPhone ? isValidPhone(rawPhone) : false;

  const plan = planChannels(options.channel, !!rawEmail, !!rawPhone);
  if ('skip' in plan) {
    return { sessionId, sessionDir, outcome: { kind: 'skipped', reason: plan.skip } };
  }

  if (plan.email && !emailValid) plan.email = false;
  if (plan.sms && !phoneValid) plan.sms = false;
  if (!plan.email && !plan.sms) {
    if (rawEmail && !emailValid) {
      return { sessionId, sessionDir, outcome: { kind: 'skipped', reason: 'invalid-email', detail: rawEmail } };
    }
    if (rawPhone && !phoneValid) {
      return { sessionId, sessionDir, outcome: { kind: 'skipped', reason: 'invalid-phone', detail: rawPhone } };
    }
    return { sessionId, sessionDir, outcome: { kind: 'skipped', reason: 'no-contact' } };
  }

  if (plan.email && !ctx.emailProvider.available()) plan.email = false;
  if (plan.sms && !ctx.smsProvider.available()) plan.sms = false;
  if (!plan.email && !plan.sms) {
    return { sessionId, sessionDir, outcome: { kind: 'skipped', reason: 'provider-unconfigured' } };
  }

  const eventName = metadata.eventName || '';
  const eventNameSuffix = eventName ? ` from ${eventName}` : '';
  const vars = { shareUrl: metadata.shareUrl, eventName, eventNameSuffix };
  const subject = renderTemplate(ctx.templates.subject, vars);
  const emailHtml = renderTemplate(ctx.templates.emailTemplate, vars);
  const emailText = htmlToText(emailHtml);
  const smsBody = renderTemplate(ctx.templates.smsTemplate, vars);

  const attempts: ContactSentAttempt[] = [];
  const recipients: { email?: string; phone?: string } = {};
  const tasks: Promise<void>[] = [];
  const startTs = Date.now();

  if (plan.email) {
    const to = rawEmail!;
    recipients.email = to;
    tasks.push(
      (async () => {
        const at = new Date().toISOString();
        if (options.dryRun) {
          attempts.push({ method: 'email', ok: true, at });
          return;
        }
        try {
          await ctx.emailProvider.send(to, { subject, body: emailText, html: emailHtml });
          attempts.push({ method: 'email', ok: true, at });
        } catch (err) {
          attempts.push({ method: 'email', ok: false, error: (err as Error).message, at });
        }
      })()
    );
  }
  if (plan.sms) {
    const to = rawPhone!;
    recipients.phone = to;
    tasks.push(
      (async () => {
        const at = new Date().toISOString();
        if (options.dryRun) {
          attempts.push({ method: 'sms', ok: true, at });
          return;
        }
        try {
          await ctx.smsProvider.send(to, { body: smsBody });
          attempts.push({ method: 'sms', ok: true, at });
        } catch (err) {
          attempts.push({ method: 'sms', ok: false, error: (err as Error).message, at });
        }
      })()
    );
  }

  await Promise.all(tasks);
  const durationMs = Date.now() - startTs;

  const okAttempts = attempts.filter((a) => a.ok);
  if (okAttempts.length === 0) {
    const reason = attempts.map((a) => `${a.method}=${a.error || 'unknown error'}`).join('; ');
    return { sessionId, sessionDir, outcome: { kind: 'failed', reason, attempts } };
  }

  const okMethods = new Set(okAttempts.map((a) => a.method));
  const method: ContactSentMethod =
    okMethods.size === 2 ? 'both' : okMethods.has('email') ? 'email' : 'sms';

  if (!options.dryRun) {
    const sentInfo: ContactSentInfo = {
      sent: true,
      method,
      sentAt: new Date().toISOString(),
      recipients,
      attempts,
    };
    metadata.contact = {
      email: metadata.contact?.email ?? null,
      phone: metadata.contact?.phone ?? null,
      sent: sentInfo,
    };
    try {
      writeMetadataAtomic(metadataPath, metadata);
    } catch (err) {
      return {
        sessionId,
        sessionDir,
        outcome: {
          kind: 'failed',
          reason: `sent ok but metadata write failed: ${(err as Error).message}`,
          attempts,
        },
      };
    }

    if (options.deleteAfterSend) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          console.warn(`[notify] ${sessionId}: deleteAfterSend failed: ${(err as Error).message}`);
        }
      }
    }
  }

  return {
    sessionId,
    sessionDir,
    outcome: { kind: 'sent', method, recipients, attempts, durationMs, dryRun: options.dryRun },
  };
}
