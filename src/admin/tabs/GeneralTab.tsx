import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { PhotoboothConfig } from '@/admin/types';

interface Props {
  config: PhotoboothConfig;
  onChange: (next: PhotoboothConfig) => void;
}

function Field({ label, children, badge, description }: { label: string; children: React.ReactNode; badge?: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        {badge && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">{badge}</span>}
      </div>
      {children}
      {description && <p className="text-xs text-zinc-500">{description}</p>}
    </div>
  );
}

export default function GeneralTab({ config, onChange }: Props) {
  const app = config.app;
  const updateApp = (patch: Partial<PhotoboothConfig['app']>) => {
    onChange({ ...config, app: { ...app, ...patch } });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Port" badge="restart" description="HTTP port the photobooth server listens on. Requires a full restart to take effect.">
          <Input type="number" value={app.port} onChange={(e) => updateApp({ port: Number(e.target.value) })} />
        </Field>
        <Field label="Sessions Directory" badge="restart" description="Filesystem path where photo/video session folders are written.">
          <Input value={app.sessionsDir} onChange={(e) => updateApp({ sessionsDir: e.target.value })} />
        </Field>
        <Field label="Event Name" description="Optional label for this event. Included in uploaded gallery metadata.">
          <Input value={app.eventName || ''} onChange={(e) => updateApp({ eventName: e.target.value })} />
        </Field>
        <Field label="Mode" description="dev shows extra debug UI; prod hides it for kiosk use.">
          <select
            className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
            value={app.mode || 'prod'}
            onChange={(e) => updateApp({ mode: e.target.value as 'dev' | 'prod' })}
          >
            <option value="dev">dev</option>
            <option value="prod">prod</option>
          </select>
        </Field>
        <Field label="Camera Position" description="Where the physical camera sits relative to the screen. Controls which side the 'Look here' arrow points.">
          <select
            className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
            value={app.cameraPosition || 'above'}
            onChange={(e) => updateApp({ cameraPosition: e.target.value as 'above' | 'below' })}
          >
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
        </Field>
        <Field label="Look Text" description="Text shown next to the arrow that tells guests where to look during capture.">
          <Input value={app.lookText || ''} onChange={(e) => updateApp({ lookText: e.target.value })} />
        </Field>
        <Field label="Countdown Seconds" description="How long the on-screen countdown runs before each photo is taken.">
          <Input type="number" value={app.countdownSeconds} onChange={(e) => updateApp({ countdownSeconds: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-2">
          <Switch checked={app.enableEmail !== false} onCheckedChange={(v) => updateApp({ enableEmail: v })} />
          <span className="flex flex-col">
            <span className="text-sm">Enable Email</span>
            <span className="text-xs text-zinc-500">Show the email field on the contact screen at the end of a session.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <Switch checked={app.enablePhone !== false} onCheckedChange={(v) => updateApp({ enablePhone: v })} />
          <span className="flex flex-col">
            <span className="text-sm">Enable Phone</span>
            <span className="text-xs text-zinc-500">Show the phone-number field on the contact screen.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <Switch checked={app.generateShareId === true} onCheckedChange={(v) => updateApp({ generateShareId: v })} />
          <span className="flex flex-col">
            <span className="text-sm">Generate Share ID</span>
            <span className="text-xs text-zinc-500">Create a unique share URL + QR code for each session, even without a gallery server.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <Switch checked={app.periodicAutofocus === true} onCheckedChange={(v) => updateApp({ periodicAutofocus: v })} />
          <span className="flex flex-col">
            <span className="text-sm">Periodic Autofocus</span>
            <span className="text-xs text-zinc-500">Re-trigger autofocus on a timer while idle so the camera stays sharp between sessions.</span>
          </span>
        </label>
      </div>
    </div>
  );
}
