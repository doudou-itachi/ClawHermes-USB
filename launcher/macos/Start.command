#!/usr/bin/env sh
set -u

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ARCH="$(uname -m)"

case "$ARCH" in
  arm64)
    PLATFORM="darwin-arm64"
    ;;
  x86_64)
    PLATFORM="darwin-x64"
    ;;
  *)
    echo "Unsupported macOS architecture: $ARCH"
    exit 1
    ;;
esac

NODE="$ROOT/runtimes/macos/node/$PLATFORM/bin/node"
ARCHIVE="$ROOT/runtime-archives/macos/node-v22-$PLATFORM.tar.gz"

if [ ! -x "$NODE" ]; then
  if [ ! -f "$ARCHIVE" ]; then
    echo "Missing Node archive: $ARCHIVE"
    echo "Install Node.js on PATH or copy the matching archive into runtime-archives/macos."
    exit 1
  fi
  echo "Preparing portable Node runtime for $PLATFORM..."
  mkdir -p "$ROOT/runtimes/macos/node/$PLATFORM"
  tar -xzf "$ARCHIVE" -C "$ROOT/runtimes/macos/node/$PLATFORM" --strip-components 1
fi

echo "Starting ClawHermes core from $ROOT..."
JSON="$("$NODE" "$ROOT/core/node/dist/clawhermes.js" start --usb-root "$ROOT" --json)"
APP_PATH="$ROOT/ClawHermes-Control-Mac.app"

if [ -d "$APP_PATH" ]; then
  RESOURCE_DIR="$APP_PATH/Contents/Resources"
  mkdir -p "$RESOURCE_DIR" >/dev/null 2>&1 || true
  printf '%s\n' "$ROOT" > "$RESOURCE_DIR/clawhermes-usb-root.txt" 2>/dev/null || true
  printf '%s\n' "$ROOT" > "$ROOT/clawhermes-usb-root.txt" 2>/dev/null || true
  xattr -rd com.apple.quarantine "$APP_PATH" >/dev/null 2>&1 || true
  echo "Opening Electrobun UI: $APP_PATH"
  open "$APP_PATH" && exit 0
  echo "Failed to open Electrobun UI. Falling back to browser Portal."
fi

URL="$(printf '%s' "$JSON" | "$NODE" -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const p=JSON.parse(s);console.log(p.portal?.url||'')}catch{}})")"
if [ -n "$URL" ]; then
  open "$URL"
else
  echo "$JSON"
fi
