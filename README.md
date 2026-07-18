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

## macOS Electron Kiosk (Mac mini appliance)

On macOS, run the booth as a dedicated Electron app instead of Chromium. Electron
becomes the entire OS surface the guest sees: fullscreen, frameless, no menu, no
popups, no navigation, no zoom, no devtools. **A touchscreen or mouse can never
escape it** — the only way out is a deliberate physical-keyboard chord
(default `Control+Option+Shift+Q`).

This is a two-part setup: the Electron shell (Part 1, in this repo) and the
macOS lockdown (Part 2, configured on the machine).

### Part 1 — Electron shell

Source lives in `electron/`:
- `electron/main.cjs` — kiosk window + hardening + physical-keyboard exit + server wait/spawn
- `electron/preload.cjs` — defense-in-depth page-level blocking (mirrors `KioskGuard`)

Run it (starts the Express server **and** the kiosk together):

```bash
pnpm install      # pulls in electron + electron-builder
pnpm build        # build the React frontend
pnpm kiosk        # server (:3000) + Electron kiosk, full screen
```

Dev shell against Vite HMR (devtools + reload allowed):

```bash
pnpm dev          # terminal 1: server + vite (:5173)
pnpm kiosk:dev    # terminal 2: Electron pointed at :5173, KIOSK_DEV=1
```

### Portable double-click build (for non-technical operators)

Produce a single, self-contained `PhotoBooth.app` that launches **everything**
(server + kiosk) with one double-click — no Node, pnpm, tsx, or terminal
required on the target machine:

```bash
pnpm dist:mac
```

This runs three steps (`vite build` → `build:server` → `electron-builder --mac`)
and outputs `release/mac-arm64/PhotoBooth.app`. Under the hood:
- `scripts/build-server.mjs` bundles the TypeScript server into a single
  `build/server/server.cjs` with esbuild.
- electron-builder embeds the server bundle, the built frontend (`dist`), and
  `config.example.json` inside the app's resources.
- At launch the app spawns the bundled server using **Electron's own Node
  runtime** (`ELECTRON_RUN_AS_NODE`), so the machine needs nothing installed
  except `gphoto2` + `ffmpeg` (the external camera/capture binaries).

**It respects `config.json`.** On first launch the app looks for a `config.json`
in the folder that contains `PhotoBooth.app`. If none exists it seeds one from
the bundled example. Edit that `config.json` (and it alone) to configure the
booth — the kiosk even reads `app.port` from it to know which URL to load.
Captured `sessions/` also land next to the app. To distribute, hand someone the
**folder** containing `PhotoBooth.app` (+ its `config.json`); it's fully portable.

```
PhotoBooth/                 <- give this folder to the operator
├── PhotoBooth.app          <- double-click to start the whole booth
├── config.json             <- the only file they edit
└── sessions/               <- captures collect here
```

> **Gatekeeper note:** the build is ad-hoc signed (no Apple Developer ID). On a
> fresh Mac, the first launch needs a one-time unblock: right-click the app →
> **Open** → **Open**, or run `xattr -dr com.apple.quarantine PhotoBooth.app`.
> For the auto-login kiosk profile (Part 2) this only matters once.

To build a different architecture (e.g. Intel), pass `--x64`/`--arm64` to
electron-builder, or build on the matching machine.

**Configuration** (all optional env vars read by `electron/main.cjs`):

| Variable | Default | Description |
|---|---|---|
| `KIOSK_URL` | `http://localhost:3000` | URL the kiosk loads. Use `http://localhost:5173` for dev. |
| `KIOSK_EXIT_ACCELERATOR` | `Control+Alt+Shift+Q` | Physical-keyboard chord that quits the kiosk. ("Alt" = Option on macOS.) |
| `KIOSK_EXIT_PIN` | _(unset)_ | If set, the exit chord pops a confirm dialog before quitting. |
| `KIOSK_SERVER_CMD` | _(unset)_ | If set, Electron spawns the server itself (e.g. `pnpm start`). Otherwise it waits for an already-running server. |
| `KIOSK_STARTUP_TIMEOUT_MS` | `60000` | How long to poll the server URL before loading anyway. |
| `KIOSK_DEV` | _(unset)_ | `1` re-enables devtools/reload and disables key blocking for debugging. |

**What the shell enforces:**
- Fullscreen + kiosk + frameless + always-on-top, single-instance only
- No application menu (kills `Cmd+Q`/`Cmd+W`/`Cmd+H`/`Cmd+M` accelerators)
- `Cmd/Ctrl+R`, `F5`, `F11`, `F12`, `Cmd+Tab`, devtools, and zoom keys blocked at the Chromium layer
- New windows/popups denied; navigation off-origin blocked; `<webview>` denied
- All browser permission requests (camera/mic/geolocation) denied
- Pinch/keyboard zoom locked to 100%
- Window cannot be closed and auto-recreates; renderer crashes auto-reload
- **Exit only via the physical-keyboard chord** — no touch/mouse exit path is exposed

### Part 2 — macOS lockdown (what you must do on the machine)

Electron is ~70% of the lockdown; macOS gestures must be disabled at the OS
level. Do this once on the Mac mini.

**1. Dedicated kiosk login profile (recommended).**
`System Settings → Users & Groups → Add Account…`
- Name: `photobooth`, type **Standard** (not Admin)
- This is the only account guests ever see. Keep your real admin account separate and hidden.

**2. Auto-login into the kiosk account.**
`System Settings → Users & Groups → Automatic login → photobooth`
(Requires FileVault to be **off**; FileVault blocks auto-login.)

**3. Auto-launch the kiosk at login.** Use the provided LaunchAgent so the
server + Electron start automatically and restart on crash:

```bash
# While logged in as the photobooth user, with the repo at ~/photobooth:
mkdir -p ~/Library/LaunchAgents ~/photobooth/logs
cp ~/photobooth/kiosk/com.photobooth.kiosk.plist ~/Library/LaunchAgents/
# edit the two /Users/photobooth/photobooth paths in the plist if your path differs
launchctl load ~/Library/LaunchAgents/com.photobooth.kiosk.plist
```

`kiosk/start-kiosk.sh` is what the agent runs — it `cd`s into the project,
builds the frontend if needed, and runs `pnpm kiosk`.

If you built the **portable `.app`** instead of running from source, you don't
need the script at all — just add `PhotoBooth.app` to
`System Settings → General → Login Items`, or point a LaunchAgent's
`ProgramArguments` at `["/usr/bin/open", "-W", "/path/to/PhotoBooth.app"]`.

**4. Apply the scripted OS hardening:**

```bash
bash ~/photobooth/kiosk/harden-macos.sh
```

This auto-hides the Dock (with a huge reveal delay) and menu bar, disables all
Hot Corners, and turns off Mission Control / full-screen-swipe / App Exposé
trackpad gestures.

**5. Disable the remaining escape surfaces by hand** (cannot be scripted safely):
- `System Settings → Keyboard → Keyboard Shortcuts → Mission Control`: uncheck everything
- `System Settings → Keyboard → Keyboard Shortcuts → Spotlight`: uncheck (or remove `Cmd+Space`)
- `System Settings → Desktop & Dock`: turn off "Displays have separate Spaces"
- Optionally disable Spotlight entirely: `sudo mdutil -a -i off`

**6. Gold standard — MDM Single App Mode.** True iPad-style lockdown (only one
app, no app switching, no Finder, no Settings) on macOS is only achievable via
MDM (Jamf, Kandji, or free Apple Configurator). Enroll the Mac mini and push an
**autonomous single-app / Single App Mode** restriction targeting the PhotoBooth
app for maximum security. The Electron shell + the steps above get you a robust
kiosk without MDM; MDM closes the last gaps.

**7. Maintenance access.** To exit on-site, plug in a physical keyboard and press
the exit chord (`Control+Option+Shift+Q`). Then log into your separate hidden
admin account for any system changes. Optionally set `KIOSK_EXIT_PIN` in the
LaunchAgent so the chord requires a confirmation step.

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

### Notifications (service + script)

Photobooth ships with a **notification service** that runs inside the main
server and sends each session's `shareUrl` to its contact via email and/or
SMS as soon as the session ends. The same engine is also exposed as a
one-shot CLI script for manual backfills.

**Service (long-running, in-server).** When `app.notifications.enabled` is
`true`, the server:

1. (Optional) sweeps the sessions directory once at startup so anything that
   ended while the service was off still gets notified.
2. Subscribes to a `session:ended` event and processes each new session with
   a short (~5s) debounce, well under any 5-minute SLA.
3. Marks `metadata.contact.sent` on success and (optionally) deletes the
   local session folder. Failures and actionable skips go to the retry
   queue file.

Toggling `enabled` in the admin panel starts/stops the service live without
restarting the server.

**Script (manual one-shot).**

```bash
pnpm notify   # uses values from app.notifications in config.json
```

The script ignores the `enabled` flag — it always runs when invoked.
Behavior is governed by `app.notifications.options.mode`:
- `all` (default) — scan the sessions directory.
- `retry` — re-process only sessions in the retry queue file.

All configuration lives under `app.notifications` in `config.json` (also
editable from the **Notifications** tab in the admin panel).

| Setting | Description |
|---------|-------------|
| `app.notifications.enabled` | Master toggle for the in-server notification service. The script ignores this. Defaults to `false`. |
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
| `app.notifications.options.dryRun` | Run full validation but no sends, metadata writes, or deletes. Applies to both service and script. |
| `app.notifications.options.continueOnError` | Keep processing on failure (default `true`). Off = abort on first failure. Script only. |
| `app.notifications.options.mode` | Script only. `all` scans `sessionsDir`. `retry` re-processes only the entries in the retry queue (useful after fixing bad contact info). |
| `app.notifications.options.retryQueuePath` | Path to the persisted skip/failure queue (default `./scripts/sendShares.retry.json`). Shared between service and script. |
| `app.notifications.options.runInitialSweep` | When the service starts (or is toggled on), scan all existing sessions once. Default `true`. Set to `false` if you only want to handle newly ended sessions. Does not affect the script. |

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
