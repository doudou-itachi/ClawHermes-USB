# Windows Runtime Design

## Goal

The Windows runtime should allow ClawHermes-USB to run without requiring system-wide Node.js, Python, or Git installs.

## Runtime Directories

```text
runtimes/windows/node/
runtimes/windows/python/
runtimes/windows/git/
```

## Launcher Behavior

The Windows launcher should:

1. Resolve `USB_ROOT`.
2. Validate runtime executables.
3. Prepend runtime folders to `PATH`.
4. Set portable cache and home variables.
5. Start services through the orchestrator.

Runtime preparation guidance is available through:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 runtimes -UsbRoot .
```

For structured output:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 runtimes -UsbRoot . -Json
```

The command does not download binaries. It reads `config/defaults/runtimes.json` and tells the user which package to download, where to extract it, and which executable paths will be accepted.

To install from a local zip archive that has already been downloaded:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 install-runtime node --archive D:\downloads\node.zip -UsbRoot .
```

Preview without extracting:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 install-runtime node --archive D:\downloads\node.zip --dry-run -UsbRoot . -Json
```

Verify a known SHA256 before extracting:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 install-runtime node --archive D:\downloads\node.zip --sha256 <expected-sha256> -UsbRoot .
```

`install-runtime` currently supports `.zip` archives. It strips a single top-level directory when present, so official packages such as `node-v*-win-x64.zip` can be extracted into the manifest install directory cleanly.

## Expected Executables

```text
runtimes/windows/node/node.exe
runtimes/windows/python/python.exe
runtimes/windows/git/cmd/git.exe
```

Runtime validation is configured by:

```text
config/defaults/runtimes.json
```

The manifest records runtime name, version policy, package type, official source URL, install directory, candidate executable paths, and packaging notes. This keeps setup diagnostics data-driven instead of hardcoding every executable path in code.

## Recommended Runtime Packages

### Node.js

Use the official Windows standalone zip from:

```text
https://nodejs.org/en/download
```

Extract it so `node.exe` is available under:

```text
runtimes/windows/node/node.exe
```

The project currently tracks the `lts` policy rather than pinning a specific Node release in the repository.

### Python

Use the official Windows embeddable package from:

```text
https://www.python.org/downloads/windows/
```

Extract it so `python.exe` is available under:

```text
runtimes/windows/python/python.exe
```

The embeddable package is intentionally isolated and does not include pip by default. Service adapters that need Python packages should not assume host Python or global pip.

### Git

Use Git for Windows Portable, also called the thumbdrive edition, from:

```text
https://git-scm.com/downloads/win
```

Extract it so one of these exists:

```text
runtimes/windows/git/cmd/git.exe
runtimes/windows/git/bin/git.exe
```

## Constraints

- Do not call globally installed `npm`, `python`, or `git` unless explicitly allowed.
- Do not permanently alter host environment variables.
- Do not install Windows services during normal startup.
- Avoid requiring administrator rights for MVP.
- Do not download or update runtime payloads silently during daily startup.
- Do not commit runtime binaries to git.

## Known Risks

- Node native modules may require Visual C++ runtime or prebuilt binaries.
- PTY packages may behave differently across Windows versions.
- Antivirus may slow startup from removable drives.
- Long paths on older Windows systems may cause package install issues.
