#!/bin/bash
# Launches the full photobooth appliance (Express server + Electron kiosk).
# Invoked by the LaunchAgent in the dedicated `photobooth` login profile.
#
# Edit PROJECT_DIR to match where you cloned the repo on the kiosk machine.

set -euo pipefail

PROJECT_DIR="${PHOTOBOOTH_DIR:-$HOME/photobooth}"

# Ensure Homebrew + Corepack tools are on PATH (LaunchAgents start with a
# minimal environment).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "$PROJECT_DIR"

# Build the frontend once if it hasn't been built yet.
if [ ! -d "dist" ] || [ -z "$(ls -A dist 2>/dev/null)" ]; then
  pnpm build
fi

# `pnpm kiosk` starts the Express server and the Electron shell together.
# Electron polls the server URL until it is reachable, so ordering is safe.
exec pnpm kiosk
