import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { PhotoboothConfig } from '@/admin/types';

interface Props {
  config: PhotoboothConfig;
  onChange: (next: PhotoboothConfig) => void;
}

export default function GalleryTab({ config, onChange }: Props) {
  const gs = config.app.galleryServer || { enabled: false, baseUrl: '', authToken: '' };

  const updateGS = (patch: Partial<NonNullable<PhotoboothConfig['app']['galleryServer']>>) => {
    onChange({ ...config, app: { ...config.app, galleryServer: { ...gs, ...patch } } });
  };

  const resize = gs.resize || { enabled: false, mode: 'preset', preset: 'web' };
  const updateResize = (patch: Partial<typeof resize>) => {
    updateGS({ resize: { ...resize, ...patch } });
  };

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2">
        <Switch checked={gs.enabled} onCheckedChange={(v) => updateGS({ enabled: v })} />
        <span className="flex flex-col">
          <span className="text-sm font-medium">Enable Gallery Server</span>
          <span className="text-xs text-zinc-500">Upload session photos/videos to a separate gallery server so guests can view and download them.</span>
        </span>
      </label>

      {gs.enabled && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input value={gs.baseUrl} onChange={(e) => updateGS({ baseUrl: e.target.value })} />
              <p className="text-xs text-zinc-500">Root URL of the gallery server (e.g. https://gallery.example.com).</p>
            </div>
            <div className="space-y-1.5">
              <Label>Auth Token</Label>
              <Input type="password" value={gs.authToken} onChange={(e) => updateGS({ authToken: e.target.value })} />
              <p className="text-xs text-zinc-500">Bearer token used to authenticate uploads to the gallery server.</p>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <label className="flex items-start gap-2">
              <Switch checked={resize.enabled} onCheckedChange={(v) => updateResize({ enabled: v })} />
              <span className="flex flex-col">
                <span className="text-sm font-medium">Resize Photos</span>
                <span className="text-xs text-zinc-500">
                  Downscale photos before uploading to save bandwidth/storage on the gallery. Resizing is performed by the
                  gallery server using these per-upload instructions; if disabled, originals are uploaded as-is.
                </span>
              </span>
            </label>
            {resize.enabled && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Mode</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                    value={resize.mode || 'preset'}
                    onChange={(e) => updateResize({ mode: e.target.value })}
                  >
                    <option value="preset">Preset (named profile)</option>
                    <option value="longEdge">Long Edge (fixed pixels)</option>
                    <option value="percentage">Percentage (scale factor)</option>
                  </select>
                  <p className="text-[11px] text-zinc-500">
                    <strong>Preset</strong> resolves a named profile from the gallery server's <code>presets.json</code> (each
                    preset defines its own long-edge and quality). <strong>Long Edge</strong> constrains the longest side to
                    a fixed pixel value (aspect ratio preserved, never enlarged). <strong>Percentage</strong> scales both
                    dimensions to a percent of the original.
                  </p>
                </div>

                {(resize.mode || 'preset') === 'preset' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Preset Name</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                      value={resize.preset || 'web'}
                      onChange={(e) => updateResize({ preset: e.target.value })}
                    >
                      <option value="instagram">instagram (1080px, q85)</option>
                      <option value="facebook">facebook (2048px, q85)</option>
                      <option value="socialMedia">socialMedia (1200px, q82)</option>
                      <option value="web">web (1920px, q80)</option>
                      <option value="fullSize">fullSize (no resize, q92)</option>
                      <option value="print4x6">print4x6 (1800px, q92)</option>
                      <option value="print8x10">print8x10 (3000px, q92)</option>
                    </select>
                    <p className="text-[11px] text-zinc-500">
                      Must match a key in the gallery server's <code>presets.json</code>. Unknown names are ignored and the
                      photo is uploaded unchanged.
                    </p>
                  </div>
                )}

                {resize.mode === 'longEdge' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Long Edge (px)</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="e.g. 1920"
                      value={resize.longEdge ?? ''}
                      onChange={(e) => updateResize({ longEdge: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                    <p className="text-[11px] text-zinc-500">
                      Maximum length of the longest side, in pixels. Smaller images are not enlarged.
                    </p>
                  </div>
                )}

                {resize.mode === 'percentage' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Percentage</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      placeholder="e.g. 50"
                      value={resize.percentage ?? ''}
                      onChange={(e) => updateResize({ percentage: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                    <p className="text-[11px] text-zinc-500">
                      Scale factor from 1–100. e.g. <code>50</code> halves both width and height.
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">JPEG Quality (1–100)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    placeholder="default 85"
                    value={resize.quality ?? ''}
                    onChange={(e) => updateResize({ quality: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                  <p className="text-[11px] text-zinc-500">
                    JPEG output quality. <strong>Overrides</strong> the preset's built-in quality when set. Leave blank to
                    use the preset's quality (or 85 for <code>longEdge</code>/<code>percentage</code> modes).
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
