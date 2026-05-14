import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { PhotoboothConfig, CameraSetConfig } from '@/admin/types';

interface Props {
  config: PhotoboothConfig;
  onChange: (next: PhotoboothConfig) => void;
}

export default function CameraTab({ config, onChange }: Props) {
  const cam = config.camera;
  const [showPaths, setShowPaths] = useState(false);

  const updateCam = (patch: Partial<PhotoboothConfig['camera']>) => {
    onChange({ ...config, camera: { ...cam, ...patch } });
  };

  const updateApp = (patch: Partial<PhotoboothConfig['app']>) => {
    onChange({ ...config, app: { ...config.app, ...patch } });
  };

  const updatePaths = (patch: Partial<PhotoboothConfig['camera']['paths']>) => {
    onChange({ ...config, camera: { ...cam, paths: { ...cam.paths, ...patch } } });
  };

  const updateMovie = (patch: Partial<NonNullable<PhotoboothConfig['camera']['movie']>>) => {
    onChange({ ...config, camera: { ...cam, movie: { ...(cam.movie || { startConfigPath: '', startValue: '', stopConfigPath: '', stopValue: '', fileExtension: 'mov' }), ...patch } } });
  };

  const setStartupConfigs = (list: CameraSetConfig[]) => {
    onChange({ ...config, camera: { ...cam, startupConfigs: list } });
  };

  const video = cam.video || {};
  const updateVideoMode = (patch: Partial<NonNullable<PhotoboothConfig['camera']['video']>>) => {
    onChange({ ...config, camera: { ...cam, video: { ...video, ...patch } } });
  };
  const updateVideoPaths = (patch: Partial<NonNullable<NonNullable<PhotoboothConfig['camera']['video']>['paths']>>) => {
    updateVideoMode({ paths: { ...(video.paths || {}), ...patch } });
  };
  const setVideoStartupConfigs = (list: CameraSetConfig[]) => {
    updateVideoMode({ startupConfigs: list });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>ISO</Label>
          <Input value={cam.iso} onChange={(e) => updateCam({ iso: e.target.value })} />
          <p className="text-xs text-zinc-500">Camera ISO value (e.g. 100, 400, 800). Must match a value the camera supports via gphoto2.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Shutter Speed</Label>
          <Input value={cam.shutterSpeed} onChange={(e) => updateCam({ shutterSpeed: e.target.value })} />
          <p className="text-xs text-zinc-500">Shutter speed string (e.g. 1/125). Must match a value the camera supports.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Aperture</Label>
          <Input value={cam.aperture} onChange={(e) => updateCam({ aperture: e.target.value })} />
          <p className="text-xs text-zinc-500">Aperture (f-number) value, e.g. 2.8 or 5.6.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Capture Target</Label>
          <select
            className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
            value={cam.captureTarget}
            onChange={(e) => updateCam({ captureTarget: e.target.value as 'card' | 'internal' })}
          >
            <option value="card">card</option>
            <option value="internal">internal</option>
          </select>
          <p className="text-xs text-zinc-500">Where captured photos are saved on the camera. 'card' = SD card, 'internal' = camera RAM.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Picture Profile</Label>
          <Input value={cam.pictureProfile || ''} onChange={(e) => updateCam({ pictureProfile: e.target.value })} />
          <p className="text-xs text-zinc-500">Optional picture style/profile name (e.g. 'standard', 'portrait').</p>
        </div>
        <div className="space-y-1.5">
          <Label>Shutter Offset (ms)</Label>
          <Input
            type="number"
            value={config.app.shutterOffsetMs ?? 0}
            onChange={(e) => updateApp({ shutterOffsetMs: Number(e.target.value) })}
          />
          <p className="text-xs text-zinc-500">Triggers the shutter this many ms before the countdown hits 0 to compensate for camera lag.</p>
        </div>
      </div>

      <label className="flex items-start gap-2">
        <Switch checked={cam.persistentMovieMode === true} onCheckedChange={(v) => updateCam({ persistentMovieMode: v })} />
        <span className="flex flex-col">
          <span className="text-sm">Persistent Movie Mode</span>
          <span className="text-xs text-zinc-500">Keep the camera in movie mode between sessions instead of toggling each video. Faster but uses more battery.</span>
        </span>
      </label>

      <div className="pt-2">
        <button className="cursor-pointer text-sm font-medium text-zinc-600 hover:text-zinc-900" onClick={() => setShowPaths((s) => !s)}>
          {showPaths ? 'Hide' : 'Show'} gphoto2 Paths
        </button>
        <p className="text-xs text-zinc-500">Advanced: gphoto2 config paths used to write each setting. Defaults work for most Canon bodies.</p>
        {showPaths && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {(['iso', 'shutterSpeed', 'aperture', 'pictureProfile', 'autofocus', 'captureTarget'] as const).map((k) => (
              <div key={k} className="space-y-1">
                <Label className="capitalize">{k}</Label>
                <Input value={cam.paths[k] || ''} onChange={(e) => updatePaths({ [k]: e.target.value })} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 pt-2">
        <Label>Startup Configs</Label>
        <p className="text-xs text-zinc-500">Extra gphoto2 settings applied once when the camera connects (e.g. whitebalance=auto).</p>
        {(cam.startupConfigs || []).map((sc, i) => (
          <div key={i} className="flex gap-2">
            <Input placeholder="path" value={sc.path} onChange={(e) => {
              const list = [...(cam.startupConfigs || [])];
              list[i] = { ...list[i], path: e.target.value };
              setStartupConfigs(list);
            }} />
            <Input placeholder="value" value={sc.value} onChange={(e) => {
              const list = [...(cam.startupConfigs || [])];
              list[i] = { ...list[i], value: e.target.value };
              setStartupConfigs(list);
            }} />
            <Button variant="outline" size="sm" onClick={() => {
              const list = [...(cam.startupConfigs || [])];
              list.splice(i, 1);
              setStartupConfigs(list);
            }}>Remove</Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setStartupConfigs([...(cam.startupConfigs || []), { path: '', value: '' }])}>
          Add Startup Config
        </Button>
      </div>

      <div className="space-y-2 pt-2">
        <Label>Movie Recording</Label>
        <p className="text-xs text-zinc-500">gphoto2 paths/values used to start and stop video recording on the camera body.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Start Path</Label>
            <Input value={cam.movie?.startConfigPath || ''} onChange={(e) => updateMovie({ startConfigPath: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start Value</Label>
            <Input value={cam.movie?.startValue || ''} onChange={(e) => updateMovie({ startValue: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">File Extension</Label>
            <Input value={cam.movie?.fileExtension || ''} onChange={(e) => updateMovie({ fileExtension: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stop Path</Label>
            <Input value={cam.movie?.stopConfigPath || ''} onChange={(e) => updateMovie({ stopConfigPath: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stop Value</Label>
            <Input value={cam.movie?.stopValue || ''} onChange={(e) => updateMovie({ stopValue: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Label>Video Mode Camera Settings</Label>
        <p className="text-xs text-zinc-500">
          Overrides applied while recording video. Leave any field blank to inherit the photo-mode value above. These map
          to the camera's separate movie-exposure controls (e.g. <code>movieiso</code> on Canon).
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">ISO</Label>
            <Input value={video.iso || ''} onChange={(e) => updateVideoMode({ iso: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Shutter Speed</Label>
            <Input value={video.shutterSpeed || ''} onChange={(e) => updateVideoMode({ shutterSpeed: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Aperture</Label>
            <Input value={video.aperture || ''} onChange={(e) => updateVideoMode({ aperture: e.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label className="text-xs">Picture Profile</Label>
            <Input value={video.pictureProfile || ''} onChange={(e) => updateVideoMode({ pictureProfile: e.target.value })} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">ISO Path</Label>
            <Input value={video.paths?.iso || ''} onChange={(e) => updateVideoPaths({ iso: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Shutter Speed Path</Label>
            <Input value={video.paths?.shutterSpeed || ''} onChange={(e) => updateVideoPaths({ shutterSpeed: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Aperture Path</Label>
            <Input value={video.paths?.aperture || ''} onChange={(e) => updateVideoPaths({ aperture: e.target.value })} />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Video Startup Configs</Label>
          <p className="text-[11px] text-zinc-500">Extra gphoto2 settings applied each time the camera enters video mode.</p>
          {(video.startupConfigs || []).map((sc, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="path" value={sc.path} onChange={(e) => {
                const list = [...(video.startupConfigs || [])];
                list[i] = { ...list[i], path: e.target.value };
                setVideoStartupConfigs(list);
              }} />
              <Input placeholder="value" value={sc.value} onChange={(e) => {
                const list = [...(video.startupConfigs || [])];
                list[i] = { ...list[i], value: e.target.value };
                setVideoStartupConfigs(list);
              }} />
              <Button variant="outline" size="sm" onClick={() => {
                const list = [...(video.startupConfigs || [])];
                list.splice(i, 1);
                setVideoStartupConfigs(list);
              }}>Remove</Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setVideoStartupConfigs([...(video.startupConfigs || []), { path: '', value: '' }])}>
            Add Video Startup Config
          </Button>
        </div>
      </div>
    </div>
  );
}
