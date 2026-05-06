# Native PyQt Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-native control-service path and PyQt control-panel scaffold for ClawHermes-USB.

**Architecture:** The PyQt control panel is a thin client that starts or reuses a localhost Node control service. The Node service reuses existing core lifecycle, status, model configuration, setup, and log functions, while adapters declare native Windows runtime paths instead of WSL2 for the default OpenClaw and Hermes Agent path.

**Tech Stack:** TypeScript/Node.js core, Python unittest verification, PyQt6 source scaffold, PyInstaller documentation.

---

## File Structure

- Modify `.gitignore` to ignore `.firecrawl/` research cache.
- Modify `adapters/openclaw/adapter.json` to declare a Windows-native Node runtime and candidate integration metadata.
- Modify `adapters/hermes-agent/adapter.json` to declare a Windows-native Python runtime and candidate integration metadata.
- Create `core/node/src/control-server.ts` for localhost JSON APIs.
- Modify `core/node/src/core.ts` to export control server start/stop helpers.
- Modify `core/node/src/clawhermes.ts` to add `control-server` and `control-server-stop` actions.
- Modify `core/windows/clawhermes.ps1` to allow the new actions.
- Create `launcher/pyqt/clawhermes_control.py` for the PyQt UI scaffold.
- Create `launcher/pyqt/requirements.txt` for PyQt dependencies.
- Create `launcher/pyqt/build.ps1` for PyInstaller packaging.
- Modify `tests/test_windows_core.py` with failing tests for native adapters, control APIs, and PyQt scaffold expectations.
- Modify `docs/PROGRESS.md`, `README.md`, and `README.zh-CN.md` to describe the new control panel path.

## Task 1: Native Adapter Metadata

- [ ] Write failing tests that `adapters openclaw --json` reports `runtime.kind == "node"` and `integration.strategy == "windows-native-adapter"`.
- [ ] Write failing tests that `adapters hermes-agent --json` reports `runtime.kind == "python"` and `integration.strategy == "windows-native-adapter"`.
- [ ] Write failing tests that setup no longer emits default WSL2 actions for OpenClaw or Hermes Agent.
- [ ] Update the two adapter descriptors to native metadata and commands.
- [ ] Run the targeted unittest methods and confirm they pass.

## Task 2: Control Server API

- [ ] Write a failing test that `control-server --port 0 --json` starts a localhost server, writes `data/tmp/control-server.json`, and serves `/api/health`.
- [ ] Write a failing test that `/api/status`, `/api/install/status`, `/api/model-config`, and `/api/logs?service=launcher&lines=5` return JSON.
- [ ] Write a failing test that `POST /api/shutdown` stops the control server and removes its PID metadata.
- [ ] Implement `core/node/src/control-server.ts` using `node:http`.
- [ ] Export start and stop helpers through `core.ts`.
- [ ] Add CLI actions and PowerShell dispatcher support.
- [ ] Run the targeted control-server tests and confirm they pass.

## Task 3: Service Actions Through Control API

- [ ] Write a failing test using the fake process USB root that `POST /api/services/start` launches services and `POST /api/services/stop` stops them.
- [ ] Write a failing test that `POST /api/services/fake-service/start` and `POST /api/services/fake-service/stop` operate a single adapter.
- [ ] Add control-service routing for all-service and single-service start/stop.
- [ ] Return structured JSON errors with `{ error: { code, message } }`.
- [ ] Run targeted lifecycle API tests and confirm they pass.

## Task 4: PyQt Scaffold

- [ ] Write failing tests that `launcher/pyqt/clawhermes_control.py` contains USB-root discovery, control-server bootstrap, `/api/status` polling, model-config access, log access, and shutdown call.
- [ ] Implement the PyQt control panel source with a small main window, status table, action buttons, model config form, and log view.
- [ ] Add `requirements.txt` with `PyQt6`.
- [ ] Add `build.ps1` that runs PyInstaller against the script and names the executable `ClawHermes-Control.exe`.
- [ ] Run targeted scaffold tests and confirm they pass.

## Task 5: Documentation and Verification

- [ ] Update README files to mention the future PyQt executable path while keeping existing launchers as fallback.
- [ ] Update progress log with date, summary, changed areas, validation, and next steps.
- [ ] Run `npm test`.
- [ ] Fix any failures without reverting unrelated changes.
- [ ] Review `git diff` for unrelated or accidental changes.
