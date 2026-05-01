# Release Checklist

Use this checklist before publishing or handing off a ClawHermes-USB build.

## Source State

- Confirm the parent repository is clean: `git status --short`.
- Confirm ignored upstream payload checkouts are clean:
  - `git -C apps/hermes-agent status --short`
  - `git -C apps/hermes-web-ui status --short`
  - `git -C apps/openclaw status --short`
- Confirm `.gitkeep` placeholders remain tracked by the parent repository and real payload content remains ignored.

## Build And Tests

- Build the TypeScript core: `npm run build`.
- Run the full behavior suite with UTF-8 enabled: `$env:PYTHONUTF8='1'; npm test`.
- Run whitespace checks: `git diff --check`.
- Run a Chinese documentation smoke check: `$env:PYTHONUTF8='1'; python -m unittest tests.test_windows_core.WindowsCoreTests.test_chinese_docs_are_readable_utf8 -v`.

## Payloads

- Inventory ignored payloads without modification: `node core/node/dist/clawhermes.js payloads --json`.
- Preview payload export: `node core/node/dist/clawhermes.js payload-export --dry-run --json`.
- Create a payload export only for an intentional release artifact: `node core/node/dist/clawhermes.js payload-export --confirm-export --json`.
- Store payload export archives under `data/backups/payloads/`.
- Do not commit upstream app payloads, `node_modules`, WSL rootfs archives, WSL backups, env files, or generated dependency caches.

## WSL2 Artifacts

- Confirm WSL2 readiness: `node core/node/dist/clawhermes.js wsl --distro ClawHermes-Ubuntu --json`.
- Confirm import/export guidance: `node core/node/dist/clawhermes.js wsl-workflow hermes-agent --json`.
- Export the managed distro only when refreshing a release payload: `node core/node/dist/clawhermes.js wsl-export --distro Ubuntu --confirm-export --json`.
- Store WSL exports under `data/backups/wsl/` and keep SHA256 sidecars with the tar archives.

## Runtime Smoke

- Preview the complete setup flow: `node core/node/dist/clawhermes.js setup-wizard --json`.
- Start services: `node core/node/dist/clawhermes.js start --json`.
- Check actual assigned URLs: `node core/node/dist/clawhermes.js status --json`.
- Verify each adapter:
  - `node core/node/dist/clawhermes.js verify-adapter hermes-agent --json`
  - `node core/node/dist/clawhermes.js verify-adapter hermes-web-ui --json`
  - `node core/node/dist/clawhermes.js verify-adapter openclaw --json`
- Stop services: `node core/node/dist/clawhermes.js stop --json`.
- If ports are remapped, use `data/tmp/ports.json` and `status --json` as the source of truth for release notes.

## Disk Cleanup

- Delete large temporary test artifacts after validation.
- Confirm `data/tmp/` does not contain stale large files.
- Confirm `%TEMP%`, `%TMP%`, and `C:\Windows\Temp` do not contain release-test archives created by this project.
- Keep large WSL rootfs and payload archives under the project drive, not on `C:`.

## Artifact Locations

- Runtime payload export: `data/backups/payloads/`
- WSL distro export: `data/backups/wsl/`
- Data backup export: `data/backups/`
- Runtime port assignment: `data/tmp/ports.json`
- Service logs: `data/logs/`
- Setup snapshot: `data/tmp/setup.json`
- Status snapshot: `data/tmp/status.json`
