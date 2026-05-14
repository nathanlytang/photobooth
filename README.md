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

Edit `config.json` to adjust camera and app settings.

### Camera

Exposure values live at the top of the `camera` block. The **gphoto2 config paths**
for every setting live in `camera.paths` — nothing is hardcoded, so you can use
shortened names (e.g. `iso`) or fully-qualified paths (e.g. `/main/imgsettings/iso`)
depending on what your camera body accepts. Run `gphoto2 --list-config` to inspect
the paths your camera exposes.

| Setting | Description |
|---------|-------------|
| `camera.iso` | ISO sensitivity for photo mode (e.g. `"400"`) |
| `camera.shutterSpeed` | Shutter speed for photo mode (e.g. `"1/125"`) |
| `camera.aperture` | Aperture f-stop for photo mode (e.g. `"4"`) |
| `camera.pictureProfile` | Picture profile/style (optional) |
| `camera.captureTarget` | `"card"` or `"internal"` — where the camera stores captures |
| `camera.persistentMovieMode` | Keep the camera in movie mode at all times; photo captures are stills grabbed from live-view. See below. |
| `camera.paths.iso` | gphoto2 config path for ISO (required) |
| `camera.paths.shutterSpeed` | gphoto2 config path for shutter speed (required) |
| `camera.paths.aperture` | gphoto2 config path for aperture (required) |
| `camera.paths.pictureProfile` | gphoto2 config path for picture profile (optional) |
| `camera.paths.autofocus` | gphoto2 config path for autofocus trigger (required) |
| `camera.paths.captureTarget` | gphoto2 config path for capture target (required) |
| `camera.startupConfigs` | Array of `{path, value}` pairs applied **once** when entering photo mode (e.g. white balance, anything else you want to set but not manage per-session). |
| `camera.video.iso` | ISO override for video sessions (falls back to `camera.iso`) |
| `camera.video.shutterSpeed` | Shutter speed override for video sessions |
| `camera.video.aperture` | Aperture override for video sessions |
| `camera.video.paths.*` | Per-key gphoto2 path overrides for video mode. Useful when the camera exposes separate controls for stills vs movie (e.g. `movieiso` instead of `iso`). |
| `camera.video.startupConfigs` | One-shot configs applied when entering a video session. |
| `camera.movie.startConfigPath` / `startValue` | gphoto2 config + value that begins a movie recording (e.g. `movie` = `1`). |
| `camera.movie.stopConfigPath` / `stopValue` | gphoto2 config + value that stops a movie recording. |
| `camera.movie.fileExtension` | Expected movie container extension (`"mov"` or `"mp4"`). |
| `camera.movie.audioSource` | External mic device for ffmpeg (e.g. `hw:1,0` on Linux; leave `null` to use in-camera audio only). |
| `camera.movie.audioCodec` | Audio codec when muxing external audio (default `aac`). |

**Lifecycle of camera settings:**

| Trigger | What runs |
|---|---|
| Server startup | `startupConfigs` for the base mode (`video` if `persistentMovieMode`, else `photo`), then photo settings applied |
| Photo session start | `camera.startupConfigs` → photo settings (iso/shutter/aperture/…) |
| Video session start | `camera.video.startupConfigs` → video settings (with `camera.video.paths` overrides) |
| Session end | Photo settings re-applied (returns camera to idle defaults) |

**Persistent movie mode** (`camera.persistentMovieMode: true`) is useful if you
want photos captured as stills from live-view without toggling the camera in and
out of movie mode per session. When enabled:

- Both photo and video sessions write exposure through `camera.video.paths`
  (e.g. `movieiso`) because the stills paths don't accept writes while the
  camera is in movie mode.
- Photo captures still work via `--capture-image` — on most bodies this grabs
  a still from live-view.
- The video `startupConfigs` are applied once at startup and left in place.

### Preview

| Setting | Description |
|---------|-------------|
| `preview.device` | V4L2 device path (e.g. "/dev/video0") |
| `preview.width` | Preview resolution width |
| `preview.height` | Preview resolution height |
| `preview.fps` | Preview frame rate |
| `preview.crop.enabled` | Enable cropping of preview feed (true/false) |
| `preview.crop.x` | Crop region X offset in pixels |
| `preview.crop.y` | Crop region Y offset in pixels |
| `preview.crop.width` | Crop region width in pixels |
| `preview.crop.height` | Crop region height in pixels |

### App

| Setting | Description |
|---------|-------------|
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
| `app.video.enabled` | Enable the video-guestbook mode (true/false) |
| `app.video.maxRecordSeconds` | Hard ceiling on a single take's duration |
| `app.video.countdownSeconds` | Pre-recording countdown on the tablet |
| `app.video.prompts` | List of prompt strings shown before each take |
| `app.video.promptsPersistDuringRecording` | Keep the prompt on-screen while recording (true/false) |
| `app.video.share.enabled` | Collect contact + show share/QR screen after video session (true/false) |
| `app.video.share.upload` | Push downloaded takes to the gallery server (true/false) |
| `app.video.share.uploadTiming` | "immediate" (upload right after Keep) or "onEnd" (batch on session end) |

### Notifications (share notifier script)

The `pnpm notify` script scans the sessions directory, sends each session's
`shareUrl` to its captured contact via email and/or SMS, marks
`metadata.contact.sent` on success, and (optionally) deletes the local
session folder. Failed sends and skips for actionable reasons are queued to a
JSON file so they can be retried.

```bash
pnpm notify   # uses values from app.notifications in config.json
```

All script behavior is configured through `app.notifications` in `config.json`
(also editable from the **Notifications** tab in the admin panel).

| Setting | Description |
|---------|-------------|
| `app.notifications.from.email` | RFC-2822 from-line for outbound mail (e.g. `Photobooth <noreply@example.com>`). |
| `app.notifications.from.sms` | Default SMS sender label (unused if Twilio's `from` is set, which is required). |
| `app.notifications.subject` | Email subject template. Supports `{eventName}`. |
| `app.notifications.emailTemplate` | Email body as **HTML** (multiline allowed). Plain-text fallback is auto-derived. Supports `{shareUrl}`, `{eventName}`, `{eventNameSuffix}`. |
| `app.notifications.smsTemplate` | SMS body as plain text (multiline allowed). Same placeholders as `emailTemplate`. |
| `app.notifications.smtp.host` / `port` / `secure` / `user` / `pass` | SMTP server for outbound email (via nodemailer). `secure=true` for implicit TLS on 465; leave off for STARTTLS on 587. |
| `app.notifications.twilio.accountSid` / `authToken` / `from` | Twilio credentials and E.164 from-number for SMS. |
| `app.notifications.options.channel` | `preferEmail` (default), `preferSms`, `email`, `sms`, or `both`. |
| `app.notifications.options.deleteAfterSend` | When `true`, deletes the local session folder after at least one channel succeeds. Does **not** affect the gallery server. |
| `app.notifications.options.skipAlreadySent` | Skip sessions whose `metadata.contact.sent.sent === true` (default `true`). |
| `app.notifications.options.skipVideoSessions` | Skip sessions whose `type === "video"` (default `false`). |
| `app.notifications.options.maxAgeDays` | Only process sessions ended within the last N days. `0` = no limit. |
| `app.notifications.options.dryRun` | Run full validation but no sends, metadata writes, or deletes. |
| `app.notifications.options.continueOnError` | Keep processing on failure (default `true`). Off = abort on first failure. |
| `app.notifications.options.mode` | `all` scans `sessionsDir`. `retry` re-processes only the entries in the retry queue (useful after fixing bad contact info). |
| `app.notifications.options.retryQueuePath` | Path to the persisted skip/failure queue (default `./scripts/sendShares.retry.json`). |

**Template placeholders:**
- `{shareUrl}` — the per-session gallery URL.
- `{eventName}` — value of `app.eventName` (empty string if unset).
- `{eventNameSuffix}` — `" from <eventName>"` when set, empty otherwise. Handy for natural phrasing without conditionals.

**Outcomes & retry queue.** Each session ends in one of `sent`, `failed`, or
`skipped:<reason>` (reasons: `already-sent`, `no-share-url`, `video-session`,
`no-contact`, `invalid-email`, `invalid-phone`, `channel-unavailable`,
`provider-unconfigured`, `too-old`, `bad-metadata`). Outcomes are printed
per-session and grouped in a final summary. Failures and actionable skips
(invalid contact info, unconfigured provider, missing metadata, etc.) are
written to the retry queue file; successful sends remove the entry. Set
`options.mode` to `retry` to re-process only those entries.

### Video guestbook

When `app.video.enabled` is `true`, the idle screen adds a **Leave a Video Message** option
alongside **Take Photos**. The guestbook flow is:

1. Guest picks a prompt (or skips it) and taps **Start Recording**.
2. A short countdown plays on the tablet. When it ends, the server starts the
   camera's movie mode via gphoto2 (`--set-config movie=1`) and — if
   `audioSource` is set — simultaneously records audio to the sessions folder
   with ffmpeg.
3. Guest taps the stop button. The server stops movie mode, locates the new
   camera file, and muxes external audio (if any) on download.
4. Guest chooses **Keep It** or **Record Again** and can take as many takes
   as they want.
5. When they tap **End Session**, optional contact info is collected and kept
   takes can be uploaded to the gallery server.

Local kept takes land in the session directory as `video_001.mov`,
`video_002.mov`, … next to `metadata.json`. Discarded takes are not downloaded
from the camera.

## Session Structure

Each session creates a timestamped folder (with a `_video` suffix for video
sessions):

```
sessions/
├── 2026-04-09_22-52-00/
│   ├── IMG_001.jpg
│   ├── IMG_002.jpg
│   └── metadata.json
└── 2026-04-09_23-10-00_video/
    ├── video_001.mov
    ├── video_002.mov
    └── metadata.json
```

`metadata.json` contains the session type, contact info entered at session
end, and — for video sessions — the list of takes with their prompts and
upload status.

## Hardware Setup

1. Connect camera to client via USB (for gphoto2 control)
2. Connect camera HDMI out to capture card, capture card USB to client
3. Set camera HDMI output to clean feed (no info overlay)
4. Camera should be set to RAW+JPEG — the app pulls only JPEGs
