# U 盘交付包生成 Runbook

本文面向其他开发者或交付人员，目标是说明：从 clone 下来的源码仓库开始，如何准备上游应用 payload、runtime 和 WSL rootfs，并生成可以复制到 U 盘的 ClawHermes-USB 交付内容。

这不是普通用户文档。当前交付包的普通用户入口是根目录下的 `ClawHermes-Control.exe`。

## 2026-05-06 当前交付形态

当前推荐交付形态已经切换为 PyQt EXE 控制面板入口：

```text
dist-usb/ClawHermes/ClawHermes-Control.exe
```

普通用户只需要双击 `ClawHermes-Control.exe`。这个 EXE 会在打开时启动或复用本地 control-server，再通过本机 `127.0.0.1` JSON API 完成状态检测、启动、停止、模型配置和日志读取。交付包根目录不再暴露 VBS/PowerShell 作为用户入口；这些内部脚本和 Node 控制服务只由 PyQt 控制面板间接调用。

默认生成命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/release/Build-UsbRelease.ps1 `
  -Clean
```

未显式传入 `-OutputRoot` 时，脚本输出到：

```text
dist-usb/ClawHermes
```

当前脚本会执行这些动作：

- 停止已有本地 control-server 和托管服务，避免复制运行中的 pid/log 状态。
- 构建 `core/node/dist`。
- 重新构建 Hermes Web UI，确保 Windows 下 Terminal 不再回退到 `/bin/bash`。
- 重新构建 PyQt `ClawHermes-Control.exe`。
- 把 `ClawHermes-Control.exe` 和 PyInstaller `_internal/` 复制到交付包根目录。
- 复制 OpenClaw、Hermes Agent、Hermes Web UI payload。
- 复制仓库根目录 `skills/` 到交付包根目录 `skills/`，并通过 OpenClaw `skills.load.extraDirs` 加载，避免把定制技能写进 `apps/openclaw`。
- 复制或内置 `runtimes/windows/node/node.exe` 和 `runtimes/windows/python/python.exe`，使目标机器无需全局安装 Node/Python。
- 移除 `data/settings/device-binding.json`，确保生成的母包保持未绑定状态；第一次在目标 U 盘启动服务时才写入当前 U 盘绑定。
- 写入 `release-manifest.json`，其中 `entryPoint` 应为 `ClawHermes-Control.exe`。

当前已验证的本地交付输出：

```text
dist-usb/ClawHermes/
  ClawHermes-Control.exe
  _internal/
  core/node/dist/
  adapters/
  config/
  portal/
  runtimes/windows/node/node.exe      # Node.js v24.15.0
  runtimes/windows/python/python.exe  # Python 3.11.7
  apps/openclaw/
  apps/hermes-agent/
  apps/hermes-web-ui/
  skills/
  data/
  START_HERE.txt
  release-manifest.json
```

验证命令示例：

```powershell
.\dist-usb\ClawHermes\runtimes\windows\node\node.exe --version
.\dist-usb\ClawHermes\runtimes\windows\python\python.exe --version
.\dist-usb\ClawHermes\runtimes\windows\node\node.exe `
  .\dist-usb\ClawHermes\core\node\dist\clawhermes.js `
  setup --usb-root .\dist-usb\ClawHermes --json
```

最终 smoke test 已使用交付包自己的 `node.exe` 启动整套服务，OpenClaw、Hermes Agent、Hermes Web UI 和 Portal 均返回 ready，然后通过 `stop` 停止，无残留进程。

## 总体原则

- clone 下来的仓库是开发仓库，不是最终 U 盘交付包。
- 普通用户不应该在 U 盘上执行 `npm install`、`pnpm install`、`pip install` 或 `uv sync`。
- 上游应用、Node 依赖、Python 虚拟环境、WSL rootfs 都应该由开发机或构建机提前准备。
- U 盘交付包可以不包含 `.git`、`tests/`、`core/node/src/` 等开发内容。
- 交付前必须在一台干净 Windows 机器上做启动、停止、模型配置和备份验证。

## 微信渠道插件与扫码登录兼容层

当前 Electrobun 定制版只开放微信渠道入口。为了让其他人重新构建或替换 payload 后不丢失微信扫码能力，交付时必须同时保留两部分内容：

- `apps/openclaw/node_modules/@tencent-weixin/openclaw-weixin/`
- `core/node/dist/weixin-fetch-preload.js`
- `core/node/dist/weixin-compat.js`

`weixin-compat.js` 负责把兼容层注入到需要的 Node 进程；`weixin-fetch-preload.js` 是实际的 iLink 请求兼容层。两者都应随 `core/node/dist/` 一起进入交付包，不能只复制其中一个。

其中 `@tencent-weixin/openclaw-weixin` 是 OpenClaw 微信官方插件；`weixin-fetch-preload.js` 是 ClawHermes 侧的兼容层，会注入到微信扫码登录子进程以及 OpenClaw Gateway 服务进程。它用于隔离微信 iLink API 请求，避免 OpenClaw/Undici fetch dispatcher 在二维码请求、`notifyStart` 和 `getUpdates` 长轮询阶段因为 `Content-Length` 兼容问题导致 `TypeError: fetch failed`。

发布脚本 `scripts/release/Build-UsbRelease.ps1` 会在复制 `apps/openclaw` 前检查微信插件：

- 如果插件已经存在，会随 `apps/openclaw` payload 一起复制。
- 如果插件缺失，脚本会尝试安装 `@tencent-weixin/openclaw-weixin`。
- 生成的 `release-manifest.json` 会记录 `channelPluginPolicy.weixin`，交付人员应检查 `included` 为 `true`。

后续如果重新准备或替换 `apps/openclaw` payload，不要只复制 OpenClaw 主程序；必须重新确认微信插件仍存在，并重新运行发布脚本或至少检查最终包里的上述两个路径。最终 smoke test 应点击“渠道接入 -> 微信扫码登录”，确认 `data/logs/channel-weixin.log` 中出现终端二维码或 `https://liteapp.weixin.qq.com/q/...` 备用链接；扫码授权并启动 OpenClaw 后，还应检查 `data/tmp/openclaw/openclaw-*.log` 中没有连续的 `notifyStart failed` 或 `getUpdates error: TypeError: fetch failed`。

交付包从一块 U 盘复制到另一块 U 盘，或在不同电脑上盘符发生变化时，`data/openclaw/openclaw.json` 里可能还保留旧盘符的 `plugins.load.paths`、`skills.load.extraDirs` 或日志路径。ClawHermes 在启动 OpenClaw 前会按当前 `<USB_ROOT>` 刷新这些路径：微信插件路径只保留当前包内的 `apps/openclaw/node_modules/@tencent-weixin/openclaw-weixin`，技能路径只保留当前包内的 `skills/`，OpenClaw runtime log 写到当前包的 `data/logs/openclaw-runtime.log`。如果手动修改过 `openclaw.json`，交付复核时也要确认这些路径没有指向上一台电脑或旧 U 盘。

推荐使用高速 USB 3.x U 盘或移动 SSD。WSL rootfs、`node_modules`、SQLite、日志和缓存都是大量小文件或频繁读写路径，低速 U 盘会明显拖慢体验。

## 独立技能包目录

当前定制版支持把 OpenClaw 技能作为独立 payload 交付，目录固定为：

```text
<USB_ROOT>/skills/<skill-name>/SKILL.md
```

这个目录不属于 `apps/openclaw`，因此后续重新准备或替换 OpenClaw payload 时，不会覆盖定制技能。发布脚本会把仓库根目录 `skills/` 复制到交付包根目录 `skills/`；如果仓库根目录暂时没有 `skills/`，脚本会在交付包里创建空目录并在 manifest 中记录提示。

启动 OpenClaw 前，ClawHermes 会确保 `data/openclaw/openclaw.json` 中存在：

```json
{
  "skills": {
    "load": {
      "extraDirs": ["<USB_ROOT>\\skills"]
    }
  }
}
```

如果该路径已经存在，不会重复追加。Electrobun 左侧的“技能中心”通过 control-server 的 `/api/skills` 读取这个目录，按 `name` 去重后展示技能名称、描述和相对路径。

技能中心还会展示 ClawHub 镜像站入口：`https://cn.clawhub-mirror.com/`。该入口用于告诉用户可在线浏览和获取 `6万+ Agent Skill`，但不会把远端技能库整体复制进交付包；交付包启动时只加载当前 U 盘根目录下的 `skills/`。

交付人员应在生成 release 前把定制技能复制到仓库根目录 `skills/`，例如：

```powershell
robocopy E:\skills .\skills /E
```

交付后复核 `release-manifest.json` 的 `skillsPayload` 字段，确认 `included` 为 `true` 且 `skillCount` 符合预期。最终 smoke test 应打开控制面板的“技能中心”，确认技能卡片可见；再启动 OpenClaw，确认 `data/openclaw/openclaw.json` 中的 `skills.load.extraDirs` 指向当前 U 盘根目录下的 `skills`。

## 快速流程

在开发机上：

```powershell
git clone https://github.com/doudou-itachi/ClawHermes-USB.git
cd ClawHermes-USB
npm install
npm run build
npm test
```

然后准备第 3 步的 `apps/` payload 和第 4 步的 `runtimes/` / WSL payload。

最后生成交付目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/release/Build-UsbRelease.ps1 `
  -OutputRoot D:\release\ClawHermes-USB `
  -Clean
```

把 `D:\release\ClawHermes-USB` 复制到 U 盘根目录即可。

如果直接输出到 U 盘，示例：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/release/Build-UsbRelease.ps1 `
  -OutputRoot E:\ClawHermes-USB `
  -Clean
```

## 第 1 步：构建 ClawHermes 核心

在仓库根目录执行：

```powershell
npm install
npm run build
npm test
```

确认存在：

```text
core/node/dist/clawhermes.js
```

交付包使用 `core/node/dist/`，不需要把 `core/node/src/` 放到普通用户 U 盘里。

## 第 2 步：确认适配器和当前状态

先看适配器定义：

```powershell
node core/node/dist/clawhermes.js adapters --json
node core/node/dist/clawhermes.js adapters openclaw --json
node core/node/dist/clawhermes.js adapters hermes-agent --json
node core/node/dist/clawhermes.js adapters hermes-web-ui --json
```

再看当前 payload 是否齐全：

```powershell
node core/node/dist/clawhermes.js payloads --json
```

如果 `apps/` 或 `runtimes/` 里只有 `.gitkeep`，说明当前仓库还只是源码仓库，没有准备好交付 payload。

## 第 3 步：详细准备上游应用 payload

`apps/` 是上游应用 payload 目录。交付包中需要这三个服务都有可运行内容：

```text
apps/openclaw
apps/hermes-agent
apps/hermes-web-ui
```

这些目录在 git 里通常只跟踪 `.gitkeep`，真实上游 checkout、依赖目录和构建产物属于本地 ignored payload，不应该直接提交到本项目源码仓库。

### 3.1 通用 payload 标准

每个 app payload 准备完成后，至少要满足：

- 适配器 start 命令能直接启动，不要求普通用户现场安装依赖。
- 必需的 `node_modules`、Python `venv`、`dist/` 或其他构建产物已经准备好。
- 配置和状态写入项目 `data/` 目录，而不是宿主机用户目录。
- 端口和 token 与 adapter 默认值一致，或能由 GUI / env 文件覆盖。
- 上游许可证要求的 license、notice 或源码交付义务已经复核。

不要把上游应用的 `.git/`、测试、开发文档、示例、缓存和 CI 文件直接放到普通用户 U 盘里，除非许可证或运行时明确要求。

### 3.2 OpenClaw payload

目录：

```text
apps/openclaw
```

当前适配器模型：

- 运行位置：WSL2，目标 distro 为 `ClawHermes-Ubuntu`。
- 默认端口：`18789`。
- 健康检查：`http://127.0.0.1:18789/healthz`。
- 启动命令：`node openclaw.mjs gateway --port ${OPENCLAW_GATEWAY_PORT} --verbose --allow-unconfigured`。
- 状态目录：`data/openclaw`。
- 运行日志：`data/logs/openclaw-runtime.log`。

准备方式：

1. 在开发机或构建机上准备真实 `apps/openclaw` 上游 payload。
2. 在 WSL 环境中完成 Node.js、pnpm 和 OpenClaw 依赖安装。
3. 确认 OpenClaw 已经构建，至少不需要用户首次启动时再跑 `pnpm install` / `pnpm build`。
4. 确认项目本地配置会写入 `data/openclaw/openclaw.json`。

可用 adapter 命令验证：

```powershell
node core/node/dist/clawhermes.js setup-adapter openclaw --confirm-setup --json
node core/node/dist/clawhermes.js start-adapter openclaw --confirm-start --json
node core/node/dist/clawhermes.js verify-adapter openclaw --json
node core/node/dist/clawhermes.js stop --json
```

交付前至少确认：

```text
apps/openclaw/openclaw.mjs
apps/openclaw/node_modules/
apps/openclaw/dist/
```

实际运行所需目录以当前上游版本为准。如果 `release-manifest.json` 提示保留了 source-like 目录，需要交付人员确认这些目录到底是运行必需，还是可以通过独立 bundle 移除。

### 3.3 Hermes Agent payload

目录：

```text
apps/hermes-agent
```

当前适配器模型：

- Windows 运行位置：Windows-native Python，依赖 `apps/hermes-agent/.venv/`。
- macOS 运行位置：macOS `python3`，依赖 `apps/hermes-agent/vendor/<darwin-arch>/`。
- 默认端口：`8642`。
- 健康检查：`http://127.0.0.1:8642/health`。
- Windows 启动命令：`python -c "from hermes_cli.main import main; raise SystemExit(main())" gateway run`。
- macOS 启动命令：`python3 -c "from hermes_cli.main import main; raise SystemExit(main())" gateway run`。
- 数据目录：`data/hermes`。

准备方式：

1. 在开发机或构建机上准备真实 `apps/hermes-agent` 上游 payload。
2. Windows 构建机执行 `node core/node/dist/clawhermes.js setup-adapter hermes-agent --confirm-setup --json`，生成 `.venv`。
3. macOS 构建机在 `apps/hermes-agent` 下执行 `python3 -m pip install --target vendor/darwin-arm64 .` 或对应 Intel 架构的 `vendor/darwin-x64`。
4. 确认 `hermes_cli/`、`gateway/`、`agent/` 等上游运行代码目录仍然在 payload 内。

可用 adapter 命令验证：

```powershell
node core/node/dist/clawhermes.js setup-adapter hermes-agent --confirm-setup --json
node core/node/dist/clawhermes.js start-adapter hermes-agent --confirm-start --json
node core/node/dist/clawhermes.js verify-adapter hermes-agent --json
node core/node/dist/clawhermes.js stop --json
```

如果 Hermes Web UI 要一起交付，必须先保证 Hermes Agent 健康，因为 Hermes Web UI 依赖 Hermes Agent API。

交付前至少确认：

```text
apps/hermes-agent/.venv/
apps/hermes-agent/vendor/darwin-arm64/ 或 apps/hermes-agent/vendor/darwin-x64/
runtime-archives/macos/python-3.11-darwin-arm64.tar.gz 或目标架构对应包
```

以上 macOS vendor/runtime 文件是本地 release 输入，不提交到 git。以及上游运行所需的 Python package、agent 代码目录和入口脚本都仍然存在。不要盲目删除 `agent/`、`gateway/`、`hermes_cli/` 这类可能是运行时必需的目录。

### 3.4 Hermes Web UI payload

目录：

```text
apps/hermes-web-ui
```

当前适配器模型：

- 运行位置：Windows Node.js。
- 默认端口：`8648`。
- Hermes backend：`http://127.0.0.1:8642`。
- 健康检查：`http://127.0.0.1:8648`。
- 启动命令：`node dist/server/index.js`。
- 数据目录：`data/hermes-web-ui`。

准备方式：

1. 在开发机或构建机上准备真实 `apps/hermes-web-ui` 上游 payload。
2. 使用项目目标 Node 版本完成依赖安装和构建。
3. 确认不需要普通用户在 U 盘上再执行 `npm install`。

可用 adapter 命令验证：

```powershell
node core/node/dist/clawhermes.js setup-adapter hermes-web-ui --confirm-setup --json
node core/node/dist/clawhermes.js start-adapter hermes-agent --confirm-start --json
node core/node/dist/clawhermes.js start-adapter hermes-web-ui --confirm-start --json
node core/node/dist/clawhermes.js verify-adapter hermes-web-ui --json
node core/node/dist/clawhermes.js stop --json
```

交付前至少确认：

```text
apps/hermes-web-ui/dist/server/index.js
apps/hermes-web-ui/node_modules/
```

Hermes Web UI 的业务关系是：

```text
Hermes Web UI -> Hermes Agent API
```

也就是说，Web UI 可打开不代表 Hermes 聊天能力可用；还必须确认 `http://127.0.0.1:8642/health` 正常。

### 3.5 payload 复核命令

准备完三个 app 后运行：

```powershell
node core/node/dist/clawhermes.js payloads --json
node core/node/dist/clawhermes.js status --json
```

如果已经启动服务，再分别验证：

```powershell
node core/node/dist/clawhermes.js verify-adapter openclaw --json
node core/node/dist/clawhermes.js verify-adapter hermes-agent --json
node core/node/dist/clawhermes.js verify-adapter hermes-web-ui --json
```

完成后停止服务：

```powershell
node core/node/dist/clawhermes.js stop --json
```

## 第 4 步：详细准备 runtime 和 WSL payload

`runtimes/` 是交付包的运行时目录。普通用户机器上不应该依赖全局 Node、Python、Git 或开发机已有工具。

### 4.1 Windows runtime

推荐目录：

```text
runtimes/windows/node/
runtimes/windows/python/
runtimes/windows/git/
```

当前 Hermes Web UI 需要可用 Node.js，已经验证过的方向是 Node.js 24.x。至少确认：

```powershell
.\runtimes\windows\node\node.exe --version
```

如果 `runtimes/windows/node/node.exe` 不存在，GUI 和脚本可能会退回宿主机 Node，交付可控性会变差。正式交付时应放入便携 Node runtime。

如果未来某个 Windows 侧服务需要 Python 或 Git，也应该放入：

```text
runtimes/windows/python/
runtimes/windows/git/
```

并通过启动器优先加入 `PATH`。

### 4.2 WSL rootfs artifact

这是旧版 WSL2 adapter 交付路径，仅在显式改回 WSL2 adapter 时需要。当前默认交付路径是 Windows-native / macOS-native，不要求携带 WSL rootfs artifact：

```text
runtimes/wsl/ubuntu-rootfs.tar
runtimes/wsl/ubuntu-rootfs.tar.sha256
```

推荐做法：

1. 在开发机或构建机上准备一个干净的 Ubuntu / ClawHermes WSL 环境。
2. 在 WSL 内准备 OpenClaw 和 Hermes Agent 所需依赖。
3. 确认 `apps/openclaw`、`apps/hermes-agent` 在该 WSL 环境中可运行。
4. 停止 OpenClaw 和 Hermes Agent。
5. 清理不必要缓存和临时日志。
6. 导出 rootfs。

查看 rootfs 操作指南：

```powershell
node core/node/dist/clawhermes.js wsl-rootfs-guide --distro Ubuntu --json
```

如果当前机器已有可导出的源 distro，可执行：

```powershell
node core/node/dist/clawhermes.js wsl-export --distro Ubuntu --confirm-export --json
```

导出后把 rootfs 放到：

```text
runtimes/wsl/ubuntu-rootfs.tar
```

生成校验文件：

```powershell
Get-FileHash .\runtimes\wsl\ubuntu-rootfs.tar -Algorithm SHA256 |
  ForEach-Object { "$($_.Hash.ToLowerInvariant())  ubuntu-rootfs.tar" } |
  Set-Content .\runtimes\wsl\ubuntu-rootfs.tar.sha256 -Encoding ascii
```

### 4.3 WSL 导入验证

在交付包或构建目录中先做计划检查：

```powershell
node core/node/dist/clawhermes.js wsl-import-plan --distro Ubuntu --json
```

确认计划无误后，在干净 Windows 机器上验证导入：

```powershell
node core/node/dist/clawhermes.js wsl-import --distro Ubuntu --confirm-import --json
```

导入后的实际运行目标 distro 是项目管理的 WSL distro。适配器当前使用 `ClawHermes-Ubuntu` 作为运行目标，`Ubuntu` 常用于 rootfs/import/export 的源 artifact 名称。不要手工改 adapter 里的 distro 名称，除非同步更新所有文档和测试。

### 4.4 WSL payload 复核

交付前确认：

```powershell
Test-Path .\runtimes\wsl\ubuntu-rootfs.tar
Test-Path .\runtimes\wsl\ubuntu-rootfs.tar.sha256
node core/node/dist/clawhermes.js setup --json
node core/node/dist/clawhermes.js setup-wizard --json
```

`setup-wizard --json` 应能提示 WSL、runtime、payload 是否准备齐全。

## 第 5 步：生成交付目录

准备好 `apps/` 和 `runtimes/` 后，运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/release/Build-UsbRelease.ps1 `
  -OutputRoot D:\release\ClawHermes-USB `
  -Clean
```

脚本会复制运行所需内容，并生成：

```text
ClawHermes-Control.exe
_internal/
START_HERE.txt
release-manifest.json
```

默认不复制当前开发机的 `data/` 用户数据，只创建空目录：

```text
data/logs/
data/tmp/
data/backups/
data/settings/
data/cache/
```

如果确实要把当前数据一起带走，使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/release/Build-UsbRelease.ps1 `
  -OutputRoot D:\release\ClawHermes-USB `
  -Clean `
  -IncludeData
```

无论是否使用 `-IncludeData`，发布脚本都会从最终产物中移除 `data/settings/device-binding.json`。这样同一份母包可以复制到不同 U 盘，并在每个 U 盘第一次启动服务时分别绑定。如果你在母包目录里提前启动过服务，请在复制到其它 U 盘前删除该绑定文件，或重新生成发布包。

如果只想先生成不带上游 payload 的壳，用于检查文档和 GUI：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/release/Build-UsbRelease.ps1 `
  -OutputRoot D:\release\ClawHermes-USB `
  -Clean `
  -NoPayloads
```

## 第 6 步：复核 release-manifest.json

生成后打开：

```text
D:\release\ClawHermes-USB\release-manifest.json
```

重点检查：

- `sourceRoot` 是否是你的开发仓库。
- `outputRoot` 是否是交付目录或 U 盘目录。
- `payloadsIncluded` 是否符合预期。
- `appPayloads` 是否列出了 `openclaw`、`hermes-agent`、`hermes-web-ui`。
- `skillsPayload` 是否记录了根目录 `skills/`，以及 `skillCount` 是否符合预期。
- `deviceBindingPolicy.bindingFile` 是否为 `data/settings/device-binding.json`，并确认最终产物中不存在该文件。
- `warnings` 是否为空，或是否已经人工确认。
- `retainedSourceLikeDirectories` 中的目录是否确实运行必需。

如果 manifest 提示某个 app 保留了 source-like runtime 目录，不代表一定错误。它表示脚本不确定这些目录是源码还是运行时，需要交付人员复核。

## 第 7 步：复制到 U 盘并验收

如果先生成到 `D:\release\ClawHermes-USB`，再复制到 U 盘：

```powershell
robocopy D:\release\ClawHermes-USB E:\ClawHermes-USB /MIR
```

在干净 Windows 机器上验收：

1. 双击 `ClawHermes-Control.exe`。
2. 打开“设置”页，确认 U 盘绑定状态为未绑定或已绑定当前 U 盘。
3. 打开“安装向导”，确认 WSL、runtime、payload 没有缺项。
4. 打开“模型配置”，填写 API URL、模型名称和 API Key。
5. 点击“启动服务”；第一次启动会生成 `data/settings/device-binding.json` 并绑定当前 U 盘。
6. 点击“打开界面”，分别检查 OpenClaw 和 Hermes Web UI。
7. 发送一条测试消息，确认 OpenClaw / Hermes 真实可回复。
8. 点击“停止服务”。
9. 点击“备份”，确认 `data/backups/` 有输出。

也可以用命令验证：

```powershell
node core/node/dist/clawhermes.js setup --json
node core/node/dist/clawhermes.js setup-wizard --json
node core/node/dist/clawhermes.js start --json
node core/node/dist/clawhermes.js status --json
node core/node/dist/clawhermes.js verify-adapter openclaw --json
node core/node/dist/clawhermes.js verify-adapter hermes-agent --json
node core/node/dist/clawhermes.js verify-adapter hermes-web-ui --json
node core/node/dist/clawhermes.js stop --json
```

## 常见问题

### 交付包打开后提示缺少 payload

通常是 `apps/` 或 `runtimes/` 没准备好。先在开发仓库运行：

```powershell
node core/node/dist/clawhermes.js payloads --json
```

再检查 `release-manifest.json` 是否真的把 payload 复制进交付目录。

### Hermes Web UI 能打开但聊天不可用

先检查 Hermes Agent：

```powershell
node core/node/dist/clawhermes.js verify-adapter hermes-agent --json
```

Hermes Web UI 依赖 Hermes Agent API。正确关系是：

```text
Hermes Web UI -> Hermes Agent API
```

### OpenClaw 或 Hermes Agent 启动失败

优先看：

```text
data/logs/openclaw.log
data/logs/openclaw-runtime.log
data/logs/hermes-agent.log
data/tmp/pids/
```

然后运行：

```powershell
node core/node/dist/clawhermes.js status --json
node core/node/dist/clawhermes.js setup-wizard --json
```

### U 盘运行很慢

这是预期风险。优先使用移动 SSD。不要在 U 盘上做依赖安装和构建。必要时未来可以增加“WSL 导入到宿主机本地磁盘”的模式，但这会增加卸载和宿主机残留处理复杂度。

## 最终交付检查清单

- `core/node/dist/clawhermes.js` 存在。
- `ClawHermes-Control.exe` 存在于交付包根目录。
- `_internal/` 存在于交付包根目录。
- `apps/openclaw` 是可运行 payload。
- `apps/hermes-agent` 是可运行 payload。
- `apps/hermes-web-ui` 是可运行 payload。
- `skills/` 位于交付包根目录，不在 `apps/openclaw` 内；“技能中心”能显示预期技能。
- `runtimes/windows/node/node.exe` 可执行。
- `runtimes/windows/python/python.exe` 可执行。
- 如交付 WSL 路径，`runtimes/wsl/ubuntu-rootfs.tar` 和 `.sha256` 存在；当前 Windows-native 路径不要求 WSL rootfs。
- `release-manifest.json` 已复核。
- 生成后的母包不包含 `data/settings/device-binding.json`；复制到目标 U 盘后，第一次启动服务才生成绑定文件。
- 干净 Windows 机器上完成 GUI 启动、模型配置、服务启动、界面打开、真实回复、停止和备份测试。
