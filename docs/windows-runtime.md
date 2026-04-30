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

## Expected Executables

```text
runtimes/windows/node/node.exe
runtimes/windows/python/python.exe
runtimes/windows/git/cmd/git.exe
```

Exact paths may vary by packaged runtime. Runtime validation should support configurable executable paths later.

## Constraints

- Do not call globally installed `npm`, `python`, or `git` unless explicitly allowed.
- Do not permanently alter host environment variables.
- Do not install Windows services during normal startup.
- Avoid requiring administrator rights for MVP.

## Known Risks

- Node native modules may require Visual C++ runtime or prebuilt binaries.
- PTY packages may behave differently across Windows versions.
- Antivirus may slow startup from removable drives.
- Long paths on older Windows systems may cause package install issues.
