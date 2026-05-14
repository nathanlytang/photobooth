import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { PhotoboothConfig } from '@/admin/types';

interface Props {
  config: PhotoboothConfig;
  onChange: (next: PhotoboothConfig) => void;
}

export default function VideoTab({ config, onChange }: Props) {
  const video = config.app.video || { enabled: false, maxRecordSeconds: 60, countdownSeconds: 5, prompts: [] };

  const updateVideo = (patch: Partial<NonNullable<PhotoboothConfig['app']['video']>>) => {
    onChange({ ...config, app: { ...config.app, video: { ...video, ...patch } } });
  };

  const setPrompts = (prompts: string[]) => updateVideo({ prompts });

  const share = video.share || { enabled: false, upload: false, uploadTiming: 'immediate' };
  const updateShare = (patch: Partial<typeof share>) => {
    updateVideo({ share: { ...share, ...patch } });
  };

  const mic = video.audio?.externalMic || { enabled: false, ffmpegInput: '' };
  const updateMic = (patch: Partial<typeof mic>) => {
    updateVideo({ audio: { externalMic: { ...mic, ...patch } } });
  };

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2">
        <Switch checked={video.enabled} onCheckedChange={(v) => updateVideo({ enabled: v })} />
        <span className="flex flex-col">
          <span className="text-sm font-medium">Enable Video Guestbook</span>
          <span className="text-xs text-zinc-500">Allow guests to record short video messages alongside photo sessions.</span>
        </span>
      </label>

      {video.enabled && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Max Record Seconds</Label>
              <Input type="number" value={video.maxRecordSeconds} onChange={(e) => updateVideo({ maxRecordSeconds: Number(e.target.value) })} />
              <p className="text-xs text-zinc-500">Hard cap on recording length. Recording auto-stops at this duration.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Countdown Seconds</Label>
              <Input type="number" value={video.countdownSeconds} onChange={(e) => updateVideo({ countdownSeconds: Number(e.target.value) })} />
              <p className="text-xs text-zinc-500">Countdown shown before recording starts.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Start Offset (ms)</Label>
              <Input type="number" value={video.startOffsetMs || 0} onChange={(e) => updateVideo({ startOffsetMs: Number(e.target.value) })} />
              <p className="text-xs text-zinc-500">Begin recording this many ms before the countdown hits 0 to compensate for camera mode-switch lag.</p>
            </div>
          </div>

          <label className="flex items-start gap-2">
            <Switch checked={video.promptsPersistDuringRecording !== false} onCheckedChange={(v) => updateVideo({ promptsPersistDuringRecording: v })} />
            <span className="flex flex-col">
              <span className="text-sm">Prompts Persist During Recording</span>
              <span className="text-xs text-zinc-500">Keep the selected prompt visible on screen while recording so guests can read it.</span>
            </span>
          </label>

          <div className="space-y-2">
            <Label>Prompts</Label>
            <p className="text-xs text-zinc-500">Suggested message prompts guests can pick from before recording.</p>
            {(video.prompts || []).map((p, i) => (
              <div key={i} className="flex gap-2">
                <Input value={p} onChange={(e) => {
                  const list = [...(video.prompts || [])];
                  list[i] = e.target.value;
                  setPrompts(list);
                }} />
                <Button variant="outline" size="sm" onClick={() => {
                  const list = [...(video.prompts || [])];
                  list.splice(i, 1);
                  setPrompts(list);
                }}>Remove</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setPrompts([...(video.prompts || []), ''])}>
              Add Prompt
            </Button>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <Label>External Microphone</Label>
            <p className="text-xs text-zinc-500">Mux audio from an external USB mic into the recorded video via ffmpeg. If disabled, audio comes from the camera.</p>
            <label className="flex items-center gap-2">
              <Switch checked={mic.enabled} onCheckedChange={(v) => updateMic({ enabled: v })} />
              <span className="text-sm">Enable External Mic</span>
            </label>
            {mic.enabled && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">ffmpeg Input</Label>
                  <Input value={mic.ffmpegInput} onChange={(e) => updateMic({ ffmpegInput: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sample Rate</Label>
                  <Input type="number" value={mic.sampleRate || ''} onChange={(e) => updateMic({ sampleRate: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Channels</Label>
                  <Input type="number" value={mic.channels || ''} onChange={(e) => updateMic({ channels: Number(e.target.value) })} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <Label>Share Settings</Label>
            <p className="text-xs text-zinc-500">Controls how recorded videos are shared with guests after a session.</p>
            <label className="flex items-start gap-2">
              <Switch checked={share.enabled} onCheckedChange={(v) => updateShare({ enabled: v })} />
              <span className="flex flex-col">
                <span className="text-sm">Enable Video Sharing</span>
                <span className="text-xs text-zinc-500">Include video takes in the share QR / link given to guests.</span>
              </span>
            </label>
            {share.enabled && (
              <>
                <label className="flex items-start gap-2">
                  <Switch checked={share.upload} onCheckedChange={(v) => updateShare({ upload: v })} />
                  <span className="flex flex-col">
                    <span className="text-sm">Upload to Gallery</span>
                    <span className="text-xs text-zinc-500">Push recorded videos to the gallery server. Requires the Gallery tab to be configured.</span>
                  </span>
                </label>
                {share.upload && (
                  <div className="space-y-1">
                    <Label className="text-xs">Upload Timing</Label>
                    <p className="text-xs text-zinc-500">'immediate' uploads each take as it's kept; 'onEnd' batches at session end.</p>
                    <select
                      className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                      value={share.uploadTiming || 'immediate'}
                      onChange={(e) => updateShare({ uploadTiming: e.target.value as 'immediate' | 'onEnd' })}
                    >
                      <option value="immediate">immediate</option>
                      <option value="onEnd">onEnd</option>
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
