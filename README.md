# Photobooth

Photobooth application with HDMI capture live preview and gphoto2 camera control.

## Requirements

- **Node.js** 18+
- **pnpm** 9+ (`corepack enable` or `npm install -g pnpm`)
- **gphoto2**: `sudo apt install gphoto2`
- **ffmpeg**: `sudo apt install ffmpeg`
- **USB HDMI Capture Card** (UVC-compatible, e.g. MS2109 chipset)
- **gphoto2 supported camera** connected via USB and HDMI

## Setup

```bash
# Install dependencies
pnpm install

# Create your config file from the example
cp config.example.json config.json

# Edit camera and app settings
nano config.json
```

## Development

```bash
# Run both frontend (Vite) and backend (tsx) in watch mode
pnpm dev

# Or run them separately
pnpm dev:server   # Backend only (tsx watch)
pnpm dev:client   # Frontend only (Vite HMR)
```

## Production

```bash
# Build the frontend
pnpm build

# Start the production server (serves built frontend + API + WebSocket)
pnpm start
```

Using `pm2`:

```bash
# Build frontend
pnpm build

# Start with pm2
pm2 start ecosystem.config.cjs

# Enable auto-start on boot
pm2 save && pm2 startup

# Install log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 5
```

> **Note:** `config.json` must exist before the server will start. See `config.example.json` for the default template.

The web UI will be available at `http://localhost:3000`.

## Kiosk Mode

Launch Chromium in hardened fullscreen kiosk mode on the client:

```bash
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-translate \
  --disable-features=TranslateUI \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --disable-context-menu \
  --disable-session-crashed-bubble \
  --disable-component-update \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  http://localhost:3000
```

The web app also includes its own hardening layer (in case flags are unavailable):
- All physical keyboard input blocked
- Right-click / long-press context menu disabled
- Drag-and-drop disabled
- Middle-click disabled
- Text selection disabled
- Pull-to-refresh / overscroll navigation disabled
- Pinch-to-zoom disabled via `touch-action: manipulation`

## Configuration

Edit `config.json` to adjust camera and app settings:

| Setting | Description |
|---------|-------------|
| `camera.iso` | ISO sensitivity (e.g. "400") |
| `camera.shutterSpeed` | Shutter speed (e.g. "1/125") |
| `camera.aperture` | Aperture f-stop (e.g. "4") |
| `camera.whiteBalance` | White balance mode (e.g. "auto") |
| `camera.pictureProfile` | Picture profile/style (e.g. "standard") |
| `camera.captureTarget` | Where camera stores files ("card") |
| `preview.device` | V4L2 device path (e.g. "/dev/video0") |
| `preview.width` | Preview resolution width |
| `preview.height` | Preview resolution height |
| `preview.fps` | Preview frame rate |
| `preview.crop.enabled` | Enable cropping of preview feed (true/false) |
| `preview.crop.x` | Crop region X offset in pixels |
| `preview.crop.y` | Crop region Y offset in pixels |
| `preview.crop.width` | Crop region width in pixels |
| `preview.crop.height` | Crop region height in pixels |
| `app.port` | Web server port |
| `app.sessionsDir` | Directory for session folders |
| `app.countdownSeconds` | Countdown before capture |
| `app.shutterOffsetMs` | Delay in ms between countdown end and shutter trigger |
| `app.cameraPosition` | Camera relative to display: "above" or "below" |
| `app.lookText` | Text shown with arrow pointing at camera |
| `app.enableEmail` | Show email input on contact form (true/false) |
| `app.enablePhone` | Show phone input on contact form (true/false) |
| `app.mode` | "dev" or "prod" — dev allows F5/F11/F12/Ctrl+R/Ctrl+Shift+I and right-click |
| `app.periodicAutofocus` | Trigger autofocus every 5s during active session (true/false) |

## Session Structure

Each session creates a timestamped folder:

```
sessions/
└── 2026-04-09_22-52-00/
    ├── IMG_001.jpg
    ├── IMG_002.jpg
    └── metadata.json
```

`metadata.json` contains the contact info entered at session end.

## Hardware Setup

1. Connect camera to client via USB (for gphoto2 control)
2. Connect camera HDMI out to capture card, capture card USB to client
3. Set camera HDMI output to clean feed (no info overlay)
4. Camera should be set to RAW+JPEG — the app pulls only JPEGs
