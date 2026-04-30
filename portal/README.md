# Portal

The portal will be the local unified entry page for ClawHermes-USB.

Default URL:

```text
http://127.0.0.1:17000/
```

Planned MVP content:

- OpenClaw Control UI link.
- OpenClaw WebChat link.
- Hermes Web UI link.
- Service health status.
- Project root and data root.
- Log file locations.
- Backup and stop instructions.

The first runnable skeleton generates `portal/index.html` during
`launcher/windows/Start.bat`. The generated page is intentionally simple: it is
built from adapter metadata and shows project paths, placeholder service status,
service URLs when known, and log locations.

`portal/index.html` is a generated runtime artifact and is ignored by git. A
richer UI and tiny local server can be added after the service lifecycle is
stable.
