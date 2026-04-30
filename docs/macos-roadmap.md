# macOS Roadmap

## Status

macOS is not part of the first runnable milestone. The project structure reserves macOS directories so future support does not require redesigning the repository.

## Future Directories

```text
launcher/macos/
runtimes/macos/node/
runtimes/macos/python/
runtimes/macos/git/
scripts/setup/macos/
```

## Strategy

macOS support should reuse:

- `config/`
- `adapters/`
- `apps/`
- `data/`
- `portal/`
- most of `core/`

Platform-specific differences should stay in:

- launcher scripts
- runtime packaging
- process handling details
- browser opening logic
- permission/quarantine handling

## Known Differences

- Executable permission bits are required.
- Downloaded binaries may have quarantine attributes.
- PTY behavior differs from Windows.
- Paths use `/` separators.
- Shell startup and env loading differ.
- Python packaging may use different wheels.

## Design Rule

Do not put Windows-only assumptions in adapter descriptors. Use relative paths and platform-specific launchers.
