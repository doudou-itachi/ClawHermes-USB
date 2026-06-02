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

log "Stopping ClawHermes from $ROOT on $PLATFORM"

NODE="$ROOT/runtimes/macos/node/$PLATFORM/bin/node"
if [ ! -x "$NODE" ]; then
  log "Portable Node runtime is missing; using node from PATH."
  NODE="node"
else
  log "Using portable Node runtime: $NODE"
fi

METADATA="$ROOT/data/tmp/control-server.json"
STOPPED=0
if [ -f "$METADATA" ]; then
  log "Stopping through control server metadata: $METADATA"
  "$NODE" -e "
const fs = require('node:fs');
const meta = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const base = String(meta.url || '').replace(/\/$/, '');
async function post(path) {
  if (!base) throw new Error('control server URL is missing');
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!response.ok) throw new Error(path + ' failed with ' + response.status);
}
post('/api/services/stop').then(() => post('/api/shutdown'));
" "$METADATA" && STOPPED=1
fi

if [ "$STOPPED" -ne 1 ]; then
  log "Control server stop path did not complete; falling back to core stop."
  "$NODE" "$ROOT/core/node/dist/clawhermes.js" stop --usb-root "$ROOT" --json
else
  log "Control server stop and shutdown requests completed."
fi
