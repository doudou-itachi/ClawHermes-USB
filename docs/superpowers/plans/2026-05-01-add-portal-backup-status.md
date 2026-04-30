# Add Portal Backup Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make backups visible from the local portal without allowing browser-triggered write operations.

**Architecture:** Add a read-only `/backups.json` endpoint to the tiny portal server. Update the generated portal HTML to show latest backup status and point users to `launcher/windows/Backup.bat`.

**Tech Stack:** TypeScript, Node.js HTTP/filesystem APIs, Python `unittest` integration tests.

---

### Task 1: Portal Backup Status

**Files:**
- Modify: `core/node/src/portal-server.ts`
- Modify: `core/node/src/portal.ts`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing test**

Add an integration test that creates a backup, starts the portal, and verifies `/backups.json` exposes the latest archive.

- [x] **Step 2: Implement read-only backup endpoint**

List zip archives under `data/backups/`, including filename, absolute path, size, and modified time.

- [x] **Step 3: Update portal HTML**

Render backup instructions and fetch `/backups.json` to show latest backup status.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
