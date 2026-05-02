# U 盘交付包生成 Runbook

本文面向其他开发者或交付人员，目标是说明：从 clone 下来的源码仓库开始，如何准备上游应用 payload、runtime 和 WSL rootfs，并生成可以复制到 U 盘的 ClawHermes-USB 交付内容。

这不是普通用户文档。普通用户只需要双击交付包里的 `启动 ClawHermes.vbs`。

## 总体原则

- clone 下来的仓库是开发仓库，不是最终 U 盘交付包。
- 普通用户不应该在 U 盘上执行 `npm install`、`pnpm install`、`pip install` 或 `uv sync`。
- 上游应用、Node 依赖、Python 虚拟环境、WSL rootfs 都应该由开发机或构建机提前准备。
- U 盘交付包可以不包含 `.git`、`tests/`、`core/node/src/` 等开发内容。
- 交付前必须在一台干净 Windows 机器上做启动、停止、模型配置和备份验证。

推荐使用高速 USB 3.x U 盘或移动 SSD。WSL rootfs、`node_modules`、SQLite、日志和缓存都是大量小文件或频繁读写路径，低速 U 盘会明显拖慢体验。

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

- 运行位置：WSL2，目标 distro 为 `ClawHermes-Ubuntu`。
- 默认端口：`8642`。
- 健康检查：`http://127.0.0.1:8642/health`。
- 启动命令：`./venv/bin/hermes gateway run`。
- 数据目录：`data/hermes`。

准备方式：

1. 在开发机或构建机上准备真实 `apps/hermes-agent` 上游 payload。
2. 在 WSL 环境中运行 Hermes Agent 的安装脚本或等价依赖安装步骤。
3. 确认 Python 虚拟环境已经存在：`apps/hermes-agent/venv/`。
4. 确认 `./venv/bin/hermes gateway run` 可以直接执行。

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
apps/hermes-agent/venv/
apps/hermes-agent/setup-hermes.sh
```

以及上游运行所需的 Python package、agent 代码目录和入口脚本都仍然存在。不要盲目删除 `agent/`、`gateway/`、`hermes_cli/` 这类可能是运行时必需的目录。

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

OpenClaw 和 Hermes Agent 当前都走 WSL2 adapter。交付包需要提前准备 WSL rootfs artifact：

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
启动 ClawHermes.vbs
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
- `warnings` 是否为空，或是否已经人工确认。
- `retainedSourceLikeDirectories` 中的目录是否确实运行必需。

如果 manifest 提示某个 app 保留了 source-like runtime 目录，不代表一定错误。它表示脚本不确定这些目录是源码还是运行时，需要交付人员复核。

## 第 7 步：复制到 U 盘并验收

如果先生成到 `D:\release\ClawHermes-USB`，再复制到 U 盘：

```powershell
robocopy D:\release\ClawHermes-USB E:\ClawHermes-USB /MIR
```

在干净 Windows 机器上验收：

1. 双击 `启动 ClawHermes.vbs`。
2. 打开“安装向导”，确认 WSL、runtime、payload 没有缺项。
3. 打开“模型配置”，填写 API URL、模型名称和 API Key。
4. 点击“启动服务”。
5. 点击“打开界面”，分别检查 OpenClaw 和 Hermes Web UI。
6. 发送一条测试消息，确认 OpenClaw / Hermes 真实可回复。
7. 点击“停止服务”。
8. 点击“备份”，确认 `data/backups/` 有输出。

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
- `launcher/windows/ClawHermes-Control.vbs` 存在。
- `启动 ClawHermes.vbs` 存在。
- `apps/openclaw` 是可运行 payload。
- `apps/hermes-agent` 是可运行 payload。
- `apps/hermes-web-ui` 是可运行 payload。
- `runtimes/windows/node/node.exe` 可执行。
- `runtimes/wsl/ubuntu-rootfs.tar` 和 `.sha256` 存在。
- `release-manifest.json` 已复核。
- 干净 Windows 机器上完成 GUI 启动、模型配置、服务启动、界面打开、真实回复、停止和备份测试。
