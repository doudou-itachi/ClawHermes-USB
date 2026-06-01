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
if [ ! -x "$NODE" ]; then
  NODE="node"
fi

METADATA="$ROOT/data/tmp/control-server.json"
if [ -f "$METADATA" ]; then
  "$NODE" -e "
const fs = require('node:fs');
const meta = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const base = String(meta.url || '').replace(/\/$/, '');
async function post(path) {
  if (!base) return;
  try { await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); } catch {}
}
post('/api/services/stop').then(() => post('/api/shutdown'));
" "$METADATA"
else
  "$NODE" "$ROOT/core/node/dist/clawhermes.js" stop --usb-root "$ROOT" --json
fi
