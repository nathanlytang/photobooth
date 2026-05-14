import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  BtnBold,
  BtnBulletList,
  BtnItalic,
  BtnLink,
  BtnNumberedList,
  BtnUnderline,
  Editor,
  EditorProvider,
  Separator,
  Toolbar,
} from 'react-simple-wysiwyg';
import type {
  NotificationsConfig,
  NotificationsOptions,
  NotificationsSmtpConfig,
  NotificationsTwilioConfig,
  PhotoboothConfig,
} from '@/admin/types';

interface Props {
  config: PhotoboothConfig;
  onChange: (next: PhotoboothConfig) => void;
}

const DEFAULT_SMTP: NotificationsSmtpConfig = { host: '', port: 587, secure: false, user: '', pass: '' };
const DEFAULT_TWILIO: NotificationsTwilioConfig = { accountSid: '', authToken: '', from: '' };

export default function NotificationsTab({ config, onChange }: Props) {
  const n: NotificationsConfig = config.app.notifications || {};
  const from = n.from || {};
  const smtp = n.smtp || DEFAULT_SMTP;
  const twilio = n.twilio || DEFAULT_TWILIO;

  const updateN = (patch: Partial<NotificationsConfig>) => {
    onChange({ ...config, app: { ...config.app, notifications: { ...n, ...patch } } });
  };
  const updateFrom = (patch: Partial<NonNullable<NotificationsConfig['from']>>) => {
    updateN({ from: { ...from, ...patch } });
  };
  const updateSmtp = (patch: Partial<NotificationsSmtpConfig>) => {
    updateN({ smtp: { ...smtp, ...patch } });
  };
  const updateTwilio = (patch: Partial<NotificationsTwilioConfig>) => {
    updateN({ twilio: { ...twilio, ...patch } });
  };
  const options: NotificationsOptions = n.options || {};
  const updateOptions = (patch: Partial<NotificationsOptions>) => {
    updateN({ options: { ...options, ...patch } });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Share Notifications</h3>
        <p className="text-xs text-zinc-500">
          Settings for the <code>pnpm notify</code> script that emails or texts each session's gallery
          link. The script reads these values from <code>config.json</code>; saving here will take
          effect on the next run. Changes here do not send any messages by themselves.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h4 className="text-sm font-medium">Templates</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Email Subject</Label>
            <Input
              value={n.subject ?? ''}
              placeholder="Your photos from {eventName}"
              onChange={(e) => updateN({ subject: e.target.value })}
            />
            <p className="text-xs text-zinc-500">Supports <code>{'{eventName}'}</code>.</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Email Body (HTML)</Label>
            <div
              className={[
                'rounded-md border bg-white text-sm',
                // Restore default list / link rendering inside the editor
                // (Tailwind preflight strips these globally).
                '[&_ul]:list-disc [&_ul]:pl-6',
                '[&_ol]:list-decimal [&_ol]:pl-6',
                '[&_li]:my-0.5',
                '[&_a]:text-blue-600 [&_a]:underline',
              ].join(' ')}
            >
              <EditorProvider>
                <Editor
                  value={n.emailTemplate ?? ''}
                  onChange={(e) => updateN({ emailTemplate: e.target.value })}
                  containerProps={{ style: { minHeight: 160 } }}
                >
                  <Toolbar>
                    <BtnBold />
                    <BtnItalic />
                    <BtnUnderline />
                    <Separator />
                    <BtnBulletList />
                    <BtnNumberedList />
                    <Separator />
                    <BtnLink />
                  </Toolbar>
                </Editor>
              </EditorProvider>
            </div>
            <p className="text-xs text-zinc-500">
              Rich-text email body. Stored as HTML; the script auto-generates a plain-text
              fallback for clients that don't render HTML.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>SMS Body</Label>
            <Textarea
              rows={4}
              value={n.smsTemplate ?? ''}
              placeholder={'Your photos{eventNameSuffix}:\n{shareUrl}'}
              onChange={(e) => updateN({ smsTemplate: e.target.value })}
            />
            <p className="text-xs text-zinc-500">
              Plain text (multiline allowed). Placeholders: <code>{'{shareUrl}'}</code>,{' '}
              <code>{'{eventName}'}</code>, <code>{'{eventNameSuffix}'}</code> (e.g.{' '}
              <em>" from Wedding"</em>; empty when no event name set).
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h4 className="text-sm font-medium">Email (SMTP)</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>From Address</Label>
            <Input
              value={from.email ?? ''}
              placeholder="Photobooth <noreply@example.com>"
              onChange={(e) => updateFrom({ email: e.target.value })}
            />
            <p className="text-xs text-zinc-500">RFC-2822 from-line. Required for email to be considered configured.</p>
          </div>
          <div className="space-y-1.5">
            <Label>SMTP Host</Label>
            <Input
              value={smtp.host}
              placeholder="smtp.example.com"
              onChange={(e) => updateSmtp({ host: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>SMTP Port</Label>
            <Input
              type="number"
              min={1}
              max={65535}
              value={smtp.port ?? ''}
              onChange={(e) =>
                updateSmtp({ port: e.target.value === '' ? 0 : Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input
              value={smtp.user ?? ''}
              onChange={(e) => updateSmtp({ user: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              value={smtp.pass ?? ''}
              onChange={(e) => updateSmtp({ pass: e.target.value })}
            />
          </div>
          <label className="flex items-start gap-2 sm:col-span-2">
            <Switch
              checked={!!smtp.secure}
              onCheckedChange={(v) => updateSmtp({ secure: v })}
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">Use TLS (secure)</span>
              <span className="text-xs text-zinc-500">
                Enable for implicit TLS (port 465). Leave off for STARTTLS on 587.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h4 className="text-sm font-medium">SMS (Twilio)</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>From Number</Label>
            <Input
              value={twilio.from}
              placeholder="+15555550123"
              onChange={(e) => updateTwilio({ from: e.target.value })}
            />
            <p className="text-xs text-zinc-500">E.164 format (e.g. <code>+15555550123</code>).</p>
          </div>
          <div className="space-y-1.5">
            <Label>Account SID</Label>
            <Input
              value={twilio.accountSid}
              onChange={(e) => updateTwilio({ accountSid: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Auth Token</Label>
            <Input
              type="password"
              value={twilio.authToken}
              onChange={(e) => updateTwilio({ authToken: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h4 className="text-sm font-medium">Script Options</h4>
        <p className="text-xs text-zinc-500">
          Behavior of <code>pnpm notify</code>. Defaults are sensible; toggle <em>Dry Run</em> to
          preview a run, or switch <em>Mode</em> to <em>retry</em> to re-process only sessions in{' '}
          <code>scripts/sendShares.retry.json</code>.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <select
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              value={options.channel ?? 'preferEmail'}
              onChange={(e) => updateOptions({ channel: e.target.value as NotificationsOptions['channel'] })}
            >
              <option value="preferEmail">preferEmail (email if available, else SMS)</option>
              <option value="preferSms">preferSms (SMS if available, else email)</option>
              <option value="email">email only</option>
              <option value="sms">SMS only</option>
              <option value="both">both (send via every available channel)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <select
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              value={options.mode ?? 'all'}
              onChange={(e) => updateOptions({ mode: e.target.value as NotificationsOptions['mode'] })}
            >
              <option value="all">all (scan sessions directory)</option>
              <option value="retry">retry (only entries in retry queue)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Max Age (days)</Label>
            <Input
              type="number"
              min={0}
              value={options.maxAgeDays ?? 0}
              onChange={(e) =>
                updateOptions({ maxAgeDays: e.target.value === '' ? 0 : Number(e.target.value) })
              }
            />
            <p className="text-xs text-zinc-500">Only process sessions ended within the last N days. 0 = no limit.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Retry Queue Path</Label>
            <Input
              value={options.retryQueuePath ?? ''}
              placeholder="./scripts/sendShares.retry.json"
              onChange={(e) => updateOptions({ retryQueuePath: e.target.value })}
            />
            <p className="text-xs text-zinc-500">Relative to repo root or absolute. Stores skipped/failed sessions.</p>
          </div>

          <label className="flex items-start gap-2">
            <Switch
              checked={!!options.dryRun}
              onCheckedChange={(v) => updateOptions({ dryRun: v })}
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">Dry Run</span>
              <span className="text-xs text-zinc-500">Run full validation, but no sends, metadata writes, or deletes.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <Switch
              checked={options.skipAlreadySent !== false}
              onCheckedChange={(v) => updateOptions({ skipAlreadySent: v })}
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">Skip Already-Sent</span>
              <span className="text-xs text-zinc-500">Skip sessions whose metadata records a successful send.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <Switch
              checked={!!options.skipVideoSessions}
              onCheckedChange={(v) => updateOptions({ skipVideoSessions: v })}
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">Skip Video Sessions</span>
              <span className="text-xs text-zinc-500">Ignore sessions whose type is "video".</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <Switch
              checked={!!options.deleteAfterSend}
              onCheckedChange={(v) => updateOptions({ deleteAfterSend: v })}
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">Delete After Send</span>
              <span className="text-xs text-zinc-500">Delete the local session folder after a successful send. Does not touch the gallery server.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 sm:col-span-2">
            <Switch
              checked={options.continueOnError !== false}
              onCheckedChange={(v) => updateOptions({ continueOnError: v })}
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">Continue On Error</span>
              <span className="text-xs text-zinc-500">Keep processing remaining sessions when one fails. Off = abort on first failure.</span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
