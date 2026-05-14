import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { PhotoboothConfig } from '@/admin/types';

interface Props {
  config: PhotoboothConfig;
  onChange: (next: PhotoboothConfig) => void;
}

export default function PreviewTab({ config, onChange }: Props) {
  const preview = config.preview;
  const crop = preview.crop || { enabled: false, x: 0, y: 0, width: preview.width, height: preview.height };

  const updatePreview = (patch: Partial<PhotoboothConfig['preview']>) => {
    onChange({ ...config, preview: { ...preview, ...patch } });
  };

  const updateCrop = (patch: Partial<PhotoboothConfig['preview']['crop']>) => {
    onChange({ ...config, preview: { ...preview, crop: { ...crop, ...patch } as PhotoboothConfig['preview']['crop'] } });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Device</Label>
          <Input value={preview.device} onChange={(e) => updatePreview({ device: e.target.value })} />
          <p className="text-xs text-zinc-500">V4L2 device path of the HDMI capture card (e.g. /dev/video0).</p>
        </div>
        <div className="space-y-1.5">
          <Label>Width</Label>
          <Input type="number" value={preview.width} onChange={(e) => updatePreview({ width: Number(e.target.value) })} />
          <p className="text-xs text-zinc-500">Capture width in pixels. Must match a mode supported by the capture device.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Height</Label>
          <Input type="number" value={preview.height} onChange={(e) => updatePreview({ height: Number(e.target.value) })} />
          <p className="text-xs text-zinc-500">Capture height in pixels.</p>
        </div>
        <div className="space-y-1.5">
          <Label>FPS</Label>
          <Input type="number" value={preview.fps} onChange={(e) => updatePreview({ fps: Number(e.target.value) })} />
          <p className="text-xs text-zinc-500">Live preview frame rate. Higher values use more CPU.</p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <label className="flex items-start gap-2">
          <Switch checked={crop.enabled} onCheckedChange={(v) => updateCrop({ enabled: v })} />
          <span className="flex flex-col">
            <span className="text-sm font-medium">Crop Preview</span>
            <span className="text-xs text-zinc-500">Crop the captured frame before streaming to the kiosk. Useful for removing letterboxing.</span>
          </span>
        </label>
        {crop.enabled && (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">X</Label>
              <Input type="number" value={crop.x} onChange={(e) => updateCrop({ x: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Y</Label>
              <Input type="number" value={crop.y} onChange={(e) => updateCrop({ y: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Width</Label>
              <Input type="number" value={crop.width} onChange={(e) => updateCrop({ width: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Height</Label>
              <Input type="number" value={crop.height} onChange={(e) => updateCrop({ height: Number(e.target.value) })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
