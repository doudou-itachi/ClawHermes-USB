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
ARCHIVE="$ROOT/runtime-archives/macos/node-v24-$PLATFORM.tar.gz"

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

PYTHON="$ROOT/runtimes/macos/python/$PLATFORM/bin/python3"
PYTHON_ARCHIVE="$ROOT/runtime-archives/macos/python-3.11-$PLATFORM.tar.gz"

if [ ! -x "$PYTHON" ]; then
  if [ -f "$PYTHON_ARCHIVE" ]; then
    echo "Preparing portable Python runtime for $PLATFORM..."
    mkdir -p "$ROOT/runtimes/macos/python/$PLATFORM"
    tar -xzf "$PYTHON_ARCHIVE" -C "$ROOT/runtimes/macos/python/$PLATFORM" --strip-components 1
  else
    echo "Portable Python archive not found: $PYTHON_ARCHIVE"
    echo "Hermes Agent requires Python 3.11+. OpenClaw can still start, but Hermes Agent will remain stopped until Python is prepared."
  fi
fi

APP_PATH="$ROOT/ClawHermes-Control-Mac.app"
APP_OPENED=0
CONTROL_PID_FILE="$ROOT/data/tmp/pids/control-server.pid"
CONTROL_METADATA_FILE="$ROOT/data/tmp/control-server.json"

if [ -d "$APP_PATH" ]; then
  RESOURCE_DIR="$APP_PATH/Contents/Resources"
  mkdir -p "$RESOURCE_DIR" >/dev/null 2>&1 || true
  printf '%s\n' "$ROOT" > "$RESOURCE_DIR/clawhermes-usb-root.txt" 2>/dev/null || true
  printf '%s\n' "$ROOT" > "$ROOT/clawhermes-usb-root.txt" 2>/dev/null || true
  xattr -rd com.apple.quarantine "$APP_PATH" >/dev/null 2>&1 || true
  osascript -e 'tell application id "dev.clawhermes.control" to quit' >/dev/null 2>&1 || true
  "$NODE" -e "const fs=require('node:fs'); for (const file of process.argv.slice(1)) { try { const pid = JSON.parse(fs.readFileSync(file, 'utf8')).processId; if (Number.isInteger(pid) && pid > 0) process.kill(pid, 'SIGTERM'); } catch {} }" "$CONTROL_PID_FILE" "$CONTROL_METADATA_FILE" >/dev/null 2>&1 || true
  rm -f "$CONTROL_PID_FILE" "$CONTROL_METADATA_FILE" >/dev/null 2>&1 || true
  "$NODE" "$ROOT/core/node/dist/clawhermes.js" stop --usb-root "$ROOT" --json >/dev/null 2>&1 || true
  sleep 0.6
  echo "Opening Electrobun UI: $APP_PATH"
  if open -n "$APP_PATH"; then
    APP_OPENED=1
  else
    echo "Failed to open Electrobun UI. Falling back to browser Portal after core start."
  fi
fi

echo "Starting ClawHermes core from $ROOT..."
JSON="$("$NODE" "$ROOT/core/node/dist/clawhermes.js" start --usb-root "$ROOT" --json 2>&1)"
STATUS="$?"

if [ "$STATUS" -ne 0 ]; then
  echo "ClawHermes core start exited with status $STATUS."
  echo "$JSON"
  if [ "$APP_OPENED" -eq 1 ]; then
    exit 0
  fi
  exit "$STATUS"
fi

if [ "$APP_OPENED" -eq 1 ]; then
  exit 0
fi

URL="$(printf '%s' "$JSON" | "$NODE" -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const p=JSON.parse(s);console.log(p.portal?.url||'')}catch{}})")"
if [ -n "$URL" ]; then
  open "$URL"
else
  echo "$JSON"
fi
