#!/bin/bash
# Patches the Electron.app Info.plist so the macOS dock tooltip shows
# "Playshape" instead of "Electron" during development.
# This runs as part of postinstall and only affects the local dev binary.

PLIST="node_modules/electron/dist/Electron.app/Contents/Info.plist"

if [ ! -f "$PLIST" ]; then
  echo "[patch-electron-name] Electron plist not found, skipping (not on macOS?)"
  exit 0
fi

/usr/libexec/PlistBuddy -c "Set :CFBundleName Playshape" "$PLIST" 2>/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Playshape" "$PLIST" 2>/dev/null

echo "[patch-electron-name] Patched Electron.app name to 'Playshape'"
