# Decision 0001: Windows-First Native Portable Bundle

## Status

Accepted.

## Context

The project should run from a USB drive with minimal host-machine dependency and minimal host disk usage. Docker would simplify isolation but would require Docker Desktop or Docker Engine on the host.

The user wants Windows support first, with future macOS expansion.

## Decision

ClawHermes-USB will use a Windows-first native portable bundle as the primary architecture.

The USB project will contain:

- portable runtimes
- upstream application directories
- data directories
- launchers
- service adapters
- local portal

Docker may be considered later as an optional mode, but not the primary MVP path.

## Consequences

Positive:

- Better aligns with USB portability.
- Avoids a hard Docker dependency.
- Keeps data close to the project folder.
- Makes the folder easier to move and back up.

Negative:

- More responsibility for runtime packaging.
- Native Node/Python dependencies may be harder on Windows.
- Upstream tools may still assume host home paths.

Mitigation:

- Use process-local environment redirection.
- Keep adapters explicit.
- Validate runtime and path behavior before integrating upstream tools.
