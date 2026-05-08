# Portable Data Policy

## Principle

ClawHermes-USB treats the USB project directory as the source of truth for application state.

The host machine may retain small unavoidable traces, but OpenClaw, Hermes Agent, Hermes Web UI, sessions, memory, skills, logs, workspace files, and runtime caches should be directed into the project `data/` directory.

## Main Data Root

```text
data/
```

## Required Subdirectories

```text
data/home
data/openclaw
data/hermes
data/hermes-web-ui
data/shared-workspace
data/cache
data/tmp
data/logs
data/backups
```

## Windows Environment Redirection

The launcher should set:

```bat
set HOME=%USB_ROOT%\data\home
set USERPROFILE=%USB_ROOT%\data\home
set APPDATA=%USB_ROOT%\data\home\AppData\Roaming
set LOCALAPPDATA=%USB_ROOT%\data\home\AppData\Local
set TEMP=%USB_ROOT%\data\tmp
set TMP=%USB_ROOT%\data\tmp
set HERMES_HOME=%USB_ROOT%\data\hermes
set npm_config_cache=%USB_ROOT%\data\cache\npm
set PIP_CACHE_DIR=%USB_ROOT%\data\cache\pip
set UV_CACHE_DIR=%USB_ROOT%\data\cache\uv
```

These variables are process-local and must not be persisted to the host system environment.

## Allowed Host Traces

- Browser cache and history if using the host browser.
- Windows recent-file metadata.
- Antivirus scan records.
- Firewall prompts.
- DNS cache or OS network traces.

## Disallowed Host Dependencies

- Host global npm packages.
- Host Python packages.
- OpenClaw state in host profile.
- Hermes state in host profile.
- Hermes Web UI state in host profile.
- Required Windows service installation for daily use.

## Backup Modes

### Data-Only Backup

Backs up `config/` and important `data/` directories.

### Full Portable Backup

Backs up the entire project, excluding disposable temp files.

## USB Device Binding

ClawHermes can bind a generated delivery package to the first USB device that starts a managed service. The binding file is:

```text
data/settings/device-binding.json
```

Release packages are intentionally generated without this file. On the first `start` or `start-adapter --confirm-start`, ClawHermes records a hashed fingerprint for the current USB device. Later starts are allowed only when the current USB fingerprint matches the stored binding.

This binding is meant for normal delivery control and accidental-copy prevention, not for cryptographic licensing. The raw USB serial or test fingerprint is not stored; only a hash and a short source summary are written.

When preparing one master delivery package for multiple USB drives, do not run the services from the master directory before copying it. If a package was accidentally bound during packaging, delete `data/settings/device-binding.json` before copying it to another USB drive, or rebuild the release package.
