import https from 'https';
import http from 'http';
import { URL } from 'url';
import nodemailer, { Transporter } from 'nodemailer';
import type {
  NotificationsConfig,
  NotificationsSmtpConfig,
  NotificationsTwilioConfig,
} from '../server/types.js';

export interface NotificationMessage {
  subject?: string;
  /** Plain-text body. For email this is the text/plain fallback. */
  body: string;
  /** Optional HTML body. Used only by email providers. */
  html?: string;
}

export interface NotificationProvider {
  kind: 'email' | 'sms';
  available(): boolean;
  send(to: string, message: NotificationMessage): Promise<void>;
}

// --- Email via SMTP (nodemailer) ---

export class SmtpEmailProvider implements NotificationProvider {
  kind: 'email' = 'email';
  private cfg: NotificationsSmtpConfig | undefined;
  private from: string | undefined;
  private transporter: Transporter | null = null;

  constructor(notifications: NotificationsConfig | undefined) {
    this.cfg = notifications?.smtp;
    this.from = notifications?.from?.email;
  }

  available(): boolean {
    return !!(this.cfg && this.cfg.host && this.cfg.port && this.from);
  }

  private getTransport(): Transporter {
    if (this.transporter) return this.transporter;
    if (!this.cfg) throw new Error('SMTP not configured');
    this.transporter = nodemailer.createTransport({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: !!this.cfg.secure,
      auth: this.cfg.user
        ? { user: this.cfg.user, pass: this.cfg.pass || '' }
        : undefined,
    });
    return this.transporter;
  }

  async send(to: string, message: NotificationMessage): Promise<void> {
    if (!this.available()) throw new Error('SMTP provider not configured');
    const transporter = this.getTransport();
    await transporter.sendMail({
      from: this.from,
      to,
      subject: message.subject || 'Your photos',
      text: message.body,
      html: message.html,
    });
  }
}

// --- SMS via Twilio (raw HTTPS, no extra dep) ---

export class TwilioSmsProvider implements NotificationProvider {
  kind: 'sms' = 'sms';
  private cfg: NotificationsTwilioConfig | undefined;

  constructor(notifications: NotificationsConfig | undefined) {
    this.cfg = notifications?.twilio;
  }

  available(): boolean {
    return !!(
      this.cfg &&
      this.cfg.accountSid &&
      this.cfg.authToken &&
      this.cfg.from
    );
  }

  async send(to: string, message: NotificationMessage): Promise<void> {
    if (!this.available() || !this.cfg) {
      throw new Error('Twilio provider not configured');
    }
    const sid = this.cfg.accountSid;
    const token = this.cfg.authToken;
    const from = this.cfg.from;

    const params = new URLSearchParams();
    params.set('To', to);
    params.set('From', from);
    params.set('Body', message.body);
    const body = params.toString();

    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const url = new URL(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`
    );

    await new Promise<void>((resolve, reject) => {
      const mod = url.protocol === 'https:' ? https : http;
      const req = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 30000,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            const status = res.statusCode || 0;
            if (status >= 200 && status < 300) return resolve();
            let msg = `Twilio responded ${status}`;
            try {
              const parsed = JSON.parse(data);
              if (parsed && parsed.message) msg += `: ${parsed.message}`;
            } catch {
              if (data) msg += `: ${data}`;
            }
            reject(new Error(msg));
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Twilio request timed out'));
      });
      req.write(body);
      req.end();
    });
  }
}
