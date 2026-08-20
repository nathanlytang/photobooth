#!/bin/bash
# Applies the macOS-side kiosk lockdown (Part 2) for the CURRENT user.
# Run this while logged in as the dedicated `photobooth` account.
#
#   bash kiosk/harden-macos.sh
#
# This handles the per-user defaults that can be scripted. The items that
# cannot be scripted (auto-login, MDM Single App Mode) are documented in the
# README and must be done in System Settings / your MDM.

set -euo pipefail

echo "==> Auto-hide the Dock and make it effectively unreachable"
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 1000      # huge delay to reveal
defaults write com.apple.dock autohide-time-modifier -float 0
defaults write com.apple.dock no-bouncing -bool true
defaults write com.apple.dock show-recents -bool false

echo "==> Auto-hide the menu bar everywhere"
defaults write NSGlobalDomain _HIHideMenuBar -bool true
defaults -currentHost write NSGlobalDomain AppleMenuBarVisibleInFullscreen -bool false

echo "==> Disable all Hot Corners"
for corner in tl tr bl br; do
  defaults write com.apple.dock "wvous-${corner}-corner" -int 0
  defaults write com.apple.dock "wvous-${corner}-modifier" -int 0
done

echo "==> Disable Mission Control / Spaces swipe gestures"
defaults write com.apple.dock mcx-expose-disabled -bool true
defaults write NSGlobalDomain AppleEnableSwipeNavigateWithScrolls -bool false
defaults write com.apple.AppleMultitouchTrackpad AppleMultitouchTrackpadThreeFingerHorizSwipeGesture -int 0
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad AppleMultitouchTrackpadThreeFingerHorizSwipeGesture -int 0
defaults write com.apple.AppleMultitouchTrackpad AppleMultitouchTrackpadFourFingerHorizSwipeGesture -int 0
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad AppleMultitouchTrackpadFourFingerHorizSwipeGesture -int 0

echo "==> Disable automatic spelling / smart substitutions (kiosk text fields)"
defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false

echo "==> Disable .DS_Store clutter on any shared drives"
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true

echo "==> Restart affected services"
killall Dock 2>/dev/null || true
killall SystemUIServer 2>/dev/null || true

cat <<'NOTE'

Scripted hardening applied. Still do these by hand (cannot be scripted safely):

  1. System Settings > Users & Groups > Automatic Login = photobooth
  2. System Settings > Keyboard > Keyboard Shortcuts:
       - Mission Control: uncheck all
       - Spotlight: uncheck (or remove Cmd+Space)
  3. System Settings > Desktop & Dock > "Displays have separate Spaces" off
  4. Disable Spotlight if not needed:
       sudo mdutil -a -i off
  5. (Gold standard) Enroll in MDM (Jamf/Kandji/Apple Configurator) and push
     a "Single App Mode" / autonomous-app restriction for max lockdown.

Reboot to verify the booth comes up straight into the kiosk.
NOTE
