# WSL2 Rootfs Artifact Policy

ClawHermes-USB can plan a project-local `wsl.exe --import` command, but it must not silently download or create Linux rootfs archives.

## Storage Location

Place WSL2 import artifacts under:

```text
runtimes/wsl/
```

The default Ubuntu archive expected by `wsl-import-plan --distro Ubuntu` is:

```text
runtimes/wsl/ubuntu-rootfs.tar
runtimes/wsl/ubuntu-rootfs.tar.sha256
```

The `.sha256` file is optional until a trusted artifact source is selected, but it should be stored next to the archive whenever available. If the sidecar exists, `wsl-import` verifies it before running WSL and refuses to import when the digest does not match.

Imported adapters may use two distro names:

- `runtime.sourceDistro`, such as `Ubuntu`, identifies the base distro/rootfs artifact.
- `runtime.distro`, such as `ClawHermes-Ubuntu`, identifies the managed execution target used by setup, start, status, and verification.

## Rules

- Rootfs archives are operator-managed payloads, not source files.
- Rootfs archives must stay out of git.
- Rootfs archives must not be downloaded automatically by setup, startup, diagnostics, or workflow commands.
- Test fixtures must use tiny temporary files only and must clean them up before completion.
- Do not use `%TEMP%`, the Windows system drive, or user profile caches as the durable rootfs location.
- `data/wsl/<distribution-name>/` is the planned install location for imported distribution files.
- Even when files live under the project path, the imported distribution is registered on the current Windows host.

## Current Command

Inspect the read-only manual artifact guide:

```powershell
node core/node/dist/clawhermes.js wsl-rootfs-guide --distro Ubuntu --json
```

The guide reports a `wsl.exe --export` command, a PowerShell `Get-FileHash` command for the SHA256 sidecar, and the next import-plan/import commands. It does not run WSL and does not download anything.

First-run diagnostics also report artifact readiness:

```powershell
node core/node/dist/clawhermes.js setup --json
```

For WSL2 adapters, the `wslArtifacts` array reports the expected archive path, checksum status, import location, and guide/import commands. Missing archives add a `wsl-artifact:<service-id>` setup action.

Inspect the read-only import plan:

```powershell
node core/node/dist/clawhermes.js wsl-import-plan --distro Ubuntu --json
```

This command reports the expected archive path, checksum path, install location, and official `wsl.exe --import ... --version 2` argument list. It does not run `wsl.exe`.

After placing the rootfs archive under `runtimes/wsl/`, explicitly confirm import execution:

```powershell
node core/node/dist/clawhermes.js wsl-import --distro Ubuntu --confirm-import --json
```

This command fails before running WSL if `--confirm-import` is missing, if the rootfs archive is absent, if the planned `data/wsl/<distribution-name>/` install location already exists, if the planned distribution name is already registered on the host, or if an available `.sha256` sidecar does not match the archive.

Inspect the read-only unregister plan before removing an imported distribution:

```powershell
node core/node/dist/clawhermes.js wsl-unregister-plan --distro Ubuntu --json
```

The plan reports whether `ClawHermes-Ubuntu` is registered, the destructive `wsl.exe --unregister` command, the latest project-local backup when present, and a recommended export command. It does not run WSL.

Create an explicit backup before unregistering:

```powershell
node core/node/dist/clawhermes.js wsl-export --distro Ubuntu --confirm-export --json
```

By default, the archive is written under `data/backups/wsl/`. Archive overrides under the system temp directory are rejected unless the current project root itself is a disposable test root under temp.

Current local verification exported `ClawHermes-Ubuntu` to `data/backups/wsl/` after stopping Hermes Agent and OpenClaw. The archive and its `.sha256` sidecar are runtime artifacts and remain ignored by git.

After a project-local backup exists, unregistering still requires explicit confirmation:

```powershell
node core/node/dist/clawhermes.js wsl-unregister --distro Ubuntu --confirm-unregister --json
```

This command only targets the managed `ClawHermes-*` distribution name and refuses to run before a matching backup exists under `data/backups/wsl/`.
