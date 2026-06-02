#!/usr/bin/env sh
set -u

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
LOG_DIR="$ROOT/data/logs"
LOG_FILE="$ROOT/data/logs/macos-launcher.log"
mkdir -p "$LOG_DIR" >/dev/null 2>&1 || true

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

ARCH="$(uname -m)"

case "$ARCH" in
  arm64)
    PLATFORM="darwin-arm64"
    ;;
  x86_64)
    PLATFORM="darwin-x64"
    ;;
  *)
    log "Unsupported macOS architecture: $ARCH"
    exit 1
    ;;
esac

log "macOS launcher started. root=$ROOT arch=$ARCH platform=$PLATFORM"

NODE="$ROOT/runtimes/macos/node/$PLATFORM/bin/node"
ARCHIVE="$ROOT/runtime-archives/macos/node-v24-$PLATFORM.tar.gz"

if [ ! -x "$NODE" ]; then
  if [ ! -f "$ARCHIVE" ]; then
    log "Missing Node archive: $ARCHIVE"
    log "Install Node.js on PATH or copy the matching archive into runtime-archives/macos."
    exit 1
  fi
  log "Preparing portable Node runtime for $PLATFORM..."
  mkdir -p "$ROOT/runtimes/macos/node/$PLATFORM"
  tar -xzf "$ARCHIVE" -C "$ROOT/runtimes/macos/node/$PLATFORM" --strip-components 1
else
  log "Portable Node runtime already exists: $NODE"
fi

PYTHON="$ROOT/runtimes/macos/python/$PLATFORM/bin/python3"
PYTHON_ARCHIVE="$ROOT/runtime-archives/macos/python-3.11-$PLATFORM.tar.gz"

if [ ! -x "$PYTHON" ]; then
  if [ -f "$PYTHON_ARCHIVE" ]; then
    log "Preparing portable Python runtime for $PLATFORM..."
    mkdir -p "$ROOT/runtimes/macos/python/$PLATFORM"
    tar -xzf "$PYTHON_ARCHIVE" -C "$ROOT/runtimes/macos/python/$PLATFORM" --strip-components 1
  else
    log "Portable Python archive not found: $PYTHON_ARCHIVE"
    log "Hermes Agent requires Python 3.11+. OpenClaw can still start, but Hermes Agent will remain stopped until Python is prepared."
  fi
else
  log "Portable Python runtime already exists: $PYTHON"
fi

APP_PATH="$ROOT/ClawHermes-Control-Mac.app"
APP_ARCHIVE="$ROOT/ClawHermes-Control-Mac.app.tar.gz"
APP_EXTRACT_DIR="$ROOT/data/tmp/macos-app"
APP_EXECUTABLE="$APP_PATH/Contents/MacOS/launcher"
APP_OPENED=0
CONTROL_PID_FILE="$ROOT/data/tmp/pids/control-server.pid"
CONTROL_METADATA_FILE="$ROOT/data/tmp/control-server.json"

extractElectrobunAppArchive() {
  if [ ! -f "$APP_ARCHIVE" ]; then
    log "Electrobun UI app archive is not bundled: $APP_ARCHIVE"
    return 1
  fi

  log "Extracting Electrobun UI app archive: $APP_ARCHIVE"
  rm -rf "$APP_EXTRACT_DIR" >/dev/null 2>&1 || true
  mkdir -p "$APP_EXTRACT_DIR" >/dev/null 2>&1 || true
  if ! tar -xzf "$APP_ARCHIVE" -C "$APP_EXTRACT_DIR" >/dev/null 2>&1; then
    log "Failed to extract Electrobun UI app archive: $APP_ARCHIVE"
    return 1
  fi

  EXTRACTED_APP="$APP_EXTRACT_DIR/ClawHermes-Control-Mac.app"
  if [ ! -d "$EXTRACTED_APP" ]; then
    EXTRACTED_APP="$(find "$APP_EXTRACT_DIR" -maxdepth 1 -type d -name '*.app' -print -quit 2>/dev/null || true)"
  fi
  if [ -z "$EXTRACTED_APP" ] || [ ! -d "$EXTRACTED_APP" ]; then
    log "Electrobun UI app archive did not contain a .app bundle."
    return 1
  fi

  APP_PATH="$EXTRACTED_APP"
  APP_EXECUTABLE="$APP_PATH/Contents/MacOS/launcher"
  log "Electrobun UI app extracted to: $APP_PATH"
  return 0
}

verifyElectrobunAppBundle() {
  if [ ! -d "$APP_PATH" ]; then
    log "Electrobun UI app directory is missing: $APP_PATH"
    if ! extractElectrobunAppArchive; then
      return 1
    fi
  fi
  if [ ! -f "$APP_PATH/Contents/Info.plist" ]; then
    log "Electrobun UI app bundle is incomplete: missing $APP_PATH/Contents/Info.plist"
    return 1
  fi
  if [ ! -f "$APP_EXECUTABLE" ]; then
    log "Electrobun UI app bundle is incomplete: missing $APP_EXECUTABLE"
    return 1
  fi
  if [ ! -x "$APP_EXECUTABLE" ]; then
    chmod +x "$APP_EXECUTABLE" >/dev/null 2>&1 || true
  fi
  if [ ! -x "$APP_EXECUTABLE" ]; then
    log "Electrobun UI app executable is not executable: $APP_EXECUTABLE"
    return 1
  fi
  log "Electrobun UI app bundle verified: $APP_PATH"
  return 0
}

electrobunPidsForCurrentBundle() {
  ps -axo pid=,command= 2>/dev/null | awk -v exe="$APP_EXECUTABLE" 'index($0, exe) { print $1 }'
}

logElectrobunProcessState() {
  PIDS="$(electrobunPidsForCurrentBundle || true)"
  if [ -n "$PIDS" ]; then
    log "Electrobun process for current bundle: pid=$(printf '%s' "$PIDS" | tr '\n' ' ')"
  else
    log "No Electrobun process for current bundle was found."
  fi
}

electrobunWindowCount() {
  WINDOW_TMP="$ROOT/data/tmp/electrobun-window-count.$$"
  mkdir -p "$ROOT/data/tmp" >/dev/null 2>&1 || true
  osascript <<'APPLESCRIPT' > "$WINDOW_TMP" 2>/dev/null &
tell application "System Events"
  set matches to application processes whose bundle identifier is "dev.clawhermes.control"
  if (count of matches) is 0 then
    return 0
  end if
  return count of windows of item 1 of matches
end tell
APPLESCRIPT
  OSA_PID="$!"
  OSA_ATTEMPTS=0
  while kill -0 "$OSA_PID" >/dev/null 2>&1; do
    if [ "$OSA_ATTEMPTS" -ge 8 ]; then
      kill "$OSA_PID" >/dev/null 2>&1 || true
      wait "$OSA_PID" >/dev/null 2>&1 || true
      rm -f "$WINDOW_TMP" >/dev/null 2>&1 || true
      printf '%s\n' "timeout"
      return 1
    fi
    OSA_ATTEMPTS=$((OSA_ATTEMPTS + 1))
    sleep 0.25
  done
  wait "$OSA_PID" >/dev/null 2>&1 || true
  cat "$WINDOW_TMP" 2>/dev/null || true
  rm -f "$WINDOW_TMP" >/dev/null 2>&1 || true
}

waitForElectrobunApp() {
  ATTEMPTS=0
  while [ "$ATTEMPTS" -lt 20 ]; do
    PIDS="$(electrobunPidsForCurrentBundle || true)"
    if [ -n "$PIDS" ]; then
      osascript -e 'tell application id "dev.clawhermes.control" to activate' >/dev/null 2>&1 || true
      WINDOW_COUNT="$(electrobunWindowCount || true)"
      if printf '%s\n' "$WINDOW_COUNT" | grep -Eq '^[1-9][0-9]*$'; then
        log "Electrobun UI is running with $WINDOW_COUNT visible window(s)."
        return 0
      fi
      log "Electrobun app process is running for current bundle, but no visible window yet. pid=$(printf '%s' "$PIDS" | tr '\n' ' ') windowCount=${WINDOW_COUNT:-unknown}"
    fi
    ATTEMPTS=$((ATTEMPTS + 1))
    sleep 0.25
  done
  log "Electrobun UI did not expose a visible window before timeout."
  return 1
}

if verifyElectrobunAppBundle; then
  log "Preparing Electrobun UI sidecar hints."
  RESOURCE_DIR="$APP_PATH/Contents/Resources"
  mkdir -p "$RESOURCE_DIR" >/dev/null 2>&1 || true
  printf '%s\n' "$ROOT" > "$RESOURCE_DIR/clawhermes-usb-root.txt" 2>/dev/null || true
  printf '%s\n' "$ROOT" > "$ROOT/clawhermes-usb-root.txt" 2>/dev/null || true
  xattr -rd com.apple.quarantine "$APP_PATH" >/dev/null 2>&1 || true
  osascript -e 'tell application id "dev.clawhermes.control" to quit' >/dev/null 2>&1 || true
  for PID in $(electrobunPidsForCurrentBundle || true); do
    kill "$PID" >/dev/null 2>&1 || true
  done
  "$NODE" -e "const fs=require('node:fs'); for (const file of process.argv.slice(1)) { try { const pid = JSON.parse(fs.readFileSync(file, 'utf8')).processId; if (Number.isInteger(pid) && pid > 0) process.kill(pid, 'SIGTERM'); } catch {} }" "$CONTROL_PID_FILE" "$CONTROL_METADATA_FILE" >/dev/null 2>&1 || true
  rm -f "$CONTROL_PID_FILE" "$CONTROL_METADATA_FILE" >/dev/null 2>&1 || true
  "$NODE" "$ROOT/core/node/dist/clawhermes.js" stop --usb-root "$ROOT" --json >/dev/null 2>&1 || true
  sleep 0.6
  log "Opening Electrobun UI: $APP_PATH"
  if open -n "$APP_PATH"; then
    log "macOS open accepted Electrobun UI launch request."
    logElectrobunProcessState
    if waitForElectrobunApp; then
      APP_OPENED=1
    else
      APP_OPENED=0
      log "Electrobun UI did not stay running or expose a visible window. Falling back to browser Portal after core start."
    fi
  else
    log "Failed to open Electrobun UI. Falling back to browser Portal after core start."
  fi
fi

log "Starting ClawHermes core from $ROOT..."
JSON="$("$NODE" "$ROOT/core/node/dist/clawhermes.js" start --usb-root "$ROOT" --json 2>&1)"
STATUS="$?"

if [ "$STATUS" -ne 0 ]; then
  log "ClawHermes core start exited with status $STATUS."
  printf '%s\n' "$JSON" | tee -a "$LOG_FILE"
  if [ "$APP_OPENED" -eq 1 ]; then
    exit 0
  fi
  exit "$STATUS"
fi

if [ "$APP_OPENED" -eq 1 ]; then
  osascript -e 'tell application id "dev.clawhermes.control" to activate' >/dev/null 2>&1 || true
  log "Electrobun UI remained active after core start."
  exit 0
fi

URL="$(printf '%s' "$JSON" | "$NODE" -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const p=JSON.parse(s);console.log(p.portal?.url||'')}catch{}})")"
if [ -n "$URL" ]; then
  log "Opening browser Portal fallback: $URL"
  open "$URL"
else
  log "Core started but no Portal URL was found in JSON response."
  printf '%s\n' "$JSON" | tee -a "$LOG_FILE"
fi
