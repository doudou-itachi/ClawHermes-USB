# Windows GUI Control Center Design

## Goal

Replace the normal end-user flow of double-clicking several Windows scripts and watching multiple command windows with one beginner-friendly Windows GUI entry point.

The GUI should let a non-technical user install, start, stop, open, configure, back up, and inspect ClawHermes-USB from one place. It must keep the existing portable boundaries: no hardcoded drive letters, no global environment mutations, logs under `data/logs/`, persistent data under `data/`, and WSL host-changing actions behind clear user confirmation.

## Target User

The default user is a beginner. They should not need to understand WSL, rootfs archives, ports, process IDs, env files, API gateway terms, or command-line syntax.

The GUI should use plain Chinese labels and short explanations. Advanced details should remain available through an expert/log view, but they should not be the default experience.

## Entry Point

Add a Windows GUI launcher under `launcher/windows/`.

Recommended entry names:

- `ClawHermes-Control.bat`
- `ClawHermes-Control.ps1`

The `.bat` file is only a double-click bridge. It resolves the USB root from its own location and launches the PowerShell GUI script. The GUI script owns the visible interface and calls the existing project dispatcher in `core/windows/clawhermes.ps1`.

Existing numbered scripts may remain as maintenance or fallback entries, but the README and user-facing guidance should present the GUI as the primary path.

## GUI Technology

Use PowerShell with Windows Forms for the first implementation.

Reasons:

- Works on standard Windows without bundling a heavy desktop framework.
- Can be launched from a USB drive with a small `.bat` bridge.
- Can call the existing dispatcher and parse JSON results.
- Can hide child process windows for routine operations.
- Keeps the MVP close to the existing Windows launcher stack.

Do not use a large Electron/.NET packaging step for the first version. A tray app can be considered later after the core workflow is stable.

## Layout

Use a left-side vertical navigation layout. All primary features live in the left rail:

- `总览`
- `安装向导`
- `启动服务`
- `停止服务`
- `打开界面`
- `模型配置`
- `日志`
- `备份`
- `修复 / 更新`

The main area changes based on the selected feature. It should avoid nested card-heavy layouts, but individual repeated service rows or status panels may use simple cards.

Use restrained line-style icons or Windows font symbols beside left-nav items. Avoid colorful emoji-style icons in the production UI.

## Appearance

Support light and dark themes.

Default behavior should follow the current Windows app theme when it can be detected safely. The user can override it from the GUI with:

- `跟随系统`
- `浅色`
- `深色`

The theme control should live in the lower-left area or a small settings section, not as a distracting primary action. Store the preference under project-local data, for example `data/settings/gui.json`, so the choice travels with the USB package and does not modify global Windows settings.

Both themes should keep the same left-navigation layout and icon set. Dark mode should use restrained contrast and avoid bright emoji-like color blocks.

## First-Run Install Wizard

The GUI should detect whether the local machine is already ready. If not, it opens `安装向导` by default.

Wizard phases:

1. `环境检查`
   - Check Windows/WSL availability.
   - Check portable runtime and source payload readiness.
   - Check rootfs or WSL backup artifacts.
2. `WSL 准备`
   - Explain in plain language that Windows needs a Linux runtime feature.
   - Use existing diagnostics and preparation commands.
   - If administrator permission or reboot is required, stop at a clear instruction screen.
3. `导入运行环境`
   - Import the managed `ClawHermes-Ubuntu` distribution only after explicit confirmation.
   - Show progress in the GUI.
4. `模型配置`
   - Ask for model settings before first full start when no usable model config exists.
5. `启动验证`
   - Start services.
   - Poll status until services are ready or show actionable errors.
   - Offer buttons to open OpenClaw Chat, Hermes Web UI, and Portal.

The wizard must be restartable. After a reboot or partial completion, reopening the GUI should re-check status and continue from the next required phase.

## Beginner Mode And Expert Details

Beginner mode is the default.

Beginner mode shows:

- Plain-language status.
- One primary action button per phase.
- Clear warnings before host-changing actions.
- Log location and a `查看详细日志` button when something fails.

Expert details are collapsed by default and may show:

- The dispatcher command being executed.
- Raw JSON status.
- Adapter IDs.
- Log file paths.
- Recent log tail.

## Service Control

The GUI should call existing dispatcher actions instead of duplicating lifecycle logic:

- `setup-wizard --json`
- `payloads --json`
- `wsl --json`
- `wsl-import-plan --json`
- `wsl-import --confirm-import --json`
- `init-env --json`
- `start --json`
- `stop --json`
- `status --json`
- `backup --json`
- `logs <service> --json`

Routine child commands should be launched with hidden windows where possible. The user should not see multiple `cmd.exe`, `powershell.exe`, `wsl.exe`, or `node.exe` terminal windows during normal GUI use.

Long-running output belongs in `data/logs/` and in the GUI log view.

## Open Web Interfaces

The `打开界面` page should expose separate buttons:

- `打开 Portal`
- `打开 OpenClaw Chat`
- `打开 Hermes Web UI`
- `打开 Hermes Agent API`

URLs should come from runtime status or adapter metadata, not hardcoded drive-specific paths. If ports are remapped, the GUI must use the runtime-assigned URL from status or `data/tmp/ports.json`.

## Model Configuration

The `模型配置` page should support one shared beginner-friendly form that can apply to OpenClaw, Hermes Agent, or both.

Required fields:

- Apply target:
  - `OpenClaw`
  - `Hermes Agent`
  - both selected by default
- Provider type:
  - default option: `OpenAI-Compatible`
  - later options can include OpenAI, OpenRouter, Ollama, local endpoints, or provider-specific presets
- API URL / Base URL
- Model name
- API Key

Optional advanced fields:

- Context length
- Thinking level
- Request timeout
- Extra provider parameters

Required actions:

- `测试连接`
- `保存并应用`
- `清除密钥`

Secrets must not be printed to logs, status text, or console output. The GUI may show `已保存` or masked values.

The exact OpenClaw and Hermes config write locations should be implemented through project-owned helpers, not ad hoc GUI string edits. For OpenClaw, the likely target is `data/openclaw/openclaw.json` or another OpenClaw-recognized model config path. For Hermes Agent, the likely targets are under `data/hermes` and its active profile configuration. The implementation plan must inspect upstream-supported config formats before writing.

## Error Handling

Errors should be translated into beginner-readable messages:

- Missing WSL: explain that Windows needs its Linux runtime feature.
- Reboot required: tell the user to restart Windows and reopen ClawHermes.
- Missing offline package: tell the user the USB package is incomplete and name the missing artifact.
- Service not ready: show the affected service and a `查看日志` button.
- Invalid API key/model URL: show a model configuration error without exposing the key.

The GUI should keep a single visible error area in the active page and avoid spawning modal storms.

## Safety

Host-changing actions remain guarded:

- Enabling WSL or Windows optional features requires a clear prompt and may require administrator permission.
- WSL import requires confirmation.
- WSL unregister remains outside the normal beginner flow and should stay in an advanced uninstall or repair area.
- Backup and restore remain explicit actions.

The GUI must not permanently set host environment variables. It should pass process environment only to child commands.

## Testing

Add tests without requiring real WSL host mutation:

- GUI launcher `.bat` resolves USB root and calls the GUI script.
- GUI script exposes the expected left-nav labels and beginner-mode text.
- GUI helper functions call dispatcher commands with hidden child windows.
- Install wizard can render plan/check states from mocked JSON.
- Model config validation rejects missing API URL, model name, and API key.
- Saved model config masks API keys in displayed status and logs.
- Existing `npm test` remains passing.

Manual release verification should run on a clean Windows VM with prepared offline payloads and confirm that normal GUI start does not leave multiple visible terminal windows.

## Out Of Scope For First Version

- Tray-only resident app.
- Electron or full desktop packaging.
- Automatic provider catalog discovery beyond a small provider type selector.
- Deleting the USB project directory.
- One-click destructive WSL unregister in beginner mode.
