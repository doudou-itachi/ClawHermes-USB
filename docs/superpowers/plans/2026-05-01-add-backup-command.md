# Add Backup Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows-first backup command that creates a timestamped archive under `data/backups/`.

**Architecture:** Create `core/node/src/backup.ts` for backup profile selection, staging, manifest generation, and archive creation. Add a `backup` CLI action and a small `launcher/windows/Backup.bat` wrapper. Default to a `data-only` profile that follows the design docs; expose `--profile full`, `--include-logs`, and `--dry-run`.

**Tech Stack:** TypeScript, Node.js filesystem/process APIs, PowerShell `Compress-Archive`, Python `unittest` zip assertions.

---

### Task 1: Backup Command

**Files:**
- Create: `core/node/src/backup.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/windows/clawhermes.ps1`
- Create: `launcher/windows/Backup.bat`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing tests**

Add tests for dry-run backup planning and data-only archive contents.

- [x] **Step 2: Implement backup module**

Create backup profiles, staging copy logic, backup manifest generation, and zip archive creation.

- [x] **Step 3: Wire CLI and Windows launcher**

Expose `backup` from the TypeScript CLI, PowerShell dispatcher, and Batch launcher.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
