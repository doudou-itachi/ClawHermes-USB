# ClawHermes-USB

ClawHermes-USB 是一个 Windows 优先的 U 盘便携式运行套件，用于从同一个可移动目录运行官方 OpenClaw、Hermes Agent 和 EKKOLearnAI/hermes-web-ui。

这个项目的目标不是 fork 上游工具，而是提供一层便携启动器、清晰目录结构、数据隔离规则、服务适配器、备份流程和本地门户，让用户可以在不同 Windows 机器之间携带自己的 agent 环境，并尽量减少对宿主机磁盘和全局环境的影响。

## 当前状态

当前仓库已经包含可运行的 TypeScript + Node.js 编排骨架，并保留少量 Windows Batch/PowerShell 启动脚本作为用户入口。

已经实现：

- 根据启动脚本位置自动识别 USB 项目根目录。
- 为当前进程树设置便携环境变量。
- 运行时、路径、端口、适配器、env 文件和集成就绪度诊断。
- 加载服务 adapter 描述文件并按依赖排序。
- 占位服务的启动、状态、停止、日志和 PID 元数据。
- 对标记为 production-ready 的 adapter 启动真实受管进程。
- 本地门户 `http://127.0.0.1:17000/`，支持实时状态、setup actions、adapter verification、日志、备份状态和受保护操作命令展示。
- 便携备份命令，在 `data/backups/` 下生成带时间戳的 zip 归档。
- 备份归档的只读还原预案，以及受保护的无覆盖还原执行。

尚未实现：

- 自动下载、内置或安装 OpenClaw、Hermes Agent、Hermes Web UI。
- 对三个默认 adapter 的真实上游服务集成验证。

## 快速开始

安装依赖并构建 TypeScript 核心：

```powershell
npm install
npm run build
```

运行 Windows 启动脚本：

```text
launcher/windows/Setup.bat
launcher/windows/Start.bat
launcher/windows/Status.bat
launcher/windows/Stop.bat
launcher/windows/Backup.bat
```

面向普通 U 盘用户时，按需要双击对应脚本；日常使用通常只用 1-5。

日常使用脚本：

| 脚本 | 做什么 | 大致执行了什么 |
| --- | --- | --- |
| `launcher/windows/1-Install-ClawHermes.bat` | 第一次使用时安装和准备环境。 | 调用 `UserGuide.ps1 -Mode Install`，先检查当前 U 盘目录、payload、运行时和 WSL 计划；创建缺失的本地 env 文件；在用户输入确认后才导入 `ClawHermes-Ubuntu`；最后启动服务并打开本地门户。 |
| `launcher/windows/2-Start-ClawHermes.bat` | 启动 ClawHermes 服务并打开网页入口。 | 调用 `UserGuide.ps1 -Mode Start`，执行核心 `start` 流程，启动 OpenClaw、Hermes Agent、Hermes Web UI 和本地 Portal；如果端口被占用，会读取运行时分配的门户地址再打开浏览器。 |
| `launcher/windows/3-Stop-ClawHermes.bat` | 停止当前正在运行的服务。 | 调用 `UserGuide.ps1 -Mode Stop`，执行核心 `stop` 流程，停止受管进程和本地 Portal，并清理对应 PID 状态。 |
| `launcher/windows/4-Status-ClawHermes.bat` | 查看当前是否安装完整、服务是否运行。 | 调用 `UserGuide.ps1 -Mode Status`，执行核心 `status --json`，把各服务状态和门户地址用更容易读的方式显示出来。 |
| `launcher/windows/5-Backup-ClawHermes.bat` | 备份 U 盘里的配置和用户数据。 | 调用 `UserGuide.ps1 -Mode Backup`，执行核心 `backup` 流程，在 `data/backups/` 下生成带时间戳的备份包；不会卸载 WSL，也不会删除 payload。 |

高级维护脚本：

| 脚本 | 做什么 | 大致执行了什么 |
| --- | --- | --- |
| `launcher/windows/6-Uninstall-Host-WSL-ClawHermes.bat` | 从当前 Windows 主机移除托管的 `ClawHermes-Ubuntu` WSL 环境。不是日常步骤。 | 调用 `UserGuide.ps1 -Mode Uninstall`，先显示 `wsl-unregister-plan`；真正注销前会停止服务，并要求已有项目本地 WSL 备份和用户输入明确确认，然后才执行 `wsl-unregister --confirm-unregister`。不会默认删除 U 盘项目、payload 或普通数据备份。 |
| `launcher/windows/Tools-Repair-Or-Update-ClawHermes.bat` | 给维护人员排查、修复或更新时使用。普通用户一般不需要。 | 调用 `UserGuide.ps1 -Mode Repair`，执行 `setup`、`payloads`、`runtimes`、`sources` 等只读检查，帮助判断缺什么；后续高级修复/更新可能需要联网。 |

推荐交付方式是离线优先：在交给用户之前，把便携运行时、上游应用 payload、WSL rootfs 或 WSL 备份包准备好。

也可以直接运行 Node CLI：

```powershell
node core/node/dist/clawhermes.js setup --json
node core/node/dist/clawhermes.js adapters --json
node core/node/dist/clawhermes.js adapters hermes-web-ui --json
node core/node/dist/clawhermes.js sources --json
node core/node/dist/clawhermes.js sources hermes-web-ui --json
node core/node/dist/clawhermes.js probe-sources hermes-web-ui --json
node core/node/dist/clawhermes.js checkout-source hermes-web-ui --dry-run --json
node core/node/dist/clawhermes.js setup-adapter hermes-web-ui --dry-run --json
node core/node/dist/clawhermes.js verify-adapter hermes-web-ui --json
node core/node/dist/clawhermes.js mark-adapter-ready hermes-web-ui --confirm-ready --summary "Verified locally" --json
node core/node/dist/clawhermes.js start --json
node core/node/dist/clawhermes.js status --json
node core/node/dist/clawhermes.js logs openclaw --lines 50 --json
node core/node/dist/clawhermes.js backup --dry-run --json
node core/node/dist/clawhermes.js restore-plan --archive data/backups/example.zip --json
node core/node/dist/clawhermes.js restore --archive data/backups/example.zip --confirm-restore --json
```

运行验证：

```powershell
npm test
```

## 核心文档

- [产品需求文档 PRD](docs/PRD.zh-CN.md)
- [架构设计文档](docs/DESIGN.zh-CN.md)
- [适配器契约](docs/ADAPTER_CONTRACT.zh-CN.md)
- [开发进度记录](docs/PROGRESS.md)

英文文档：

- [PRD](docs/PRD.md)
- [Architecture Design](docs/DESIGN.md)
- [Adapter Contract](docs/ADAPTER_CONTRACT.md)

## 设计目标

- Windows 优先的便携运行体验。
- 尽量把 OpenClaw、Hermes Agent、Hermes Web UI、运行时依赖、sessions、memory、skills、logs 和 workspace 数据保存在 U 盘项目目录中。
- 允许宿主机留下少量不可避免的痕迹，例如浏览器缓存、系统最近文件记录等。
- 主路径不依赖 Docker。
- 保持清晰模块边界，让后续开发者可以替换、扩展或新增服务，而不需要重写启动器。

## 顶层目录

```text
ClawHermes-USB/
  launcher/   用户入口脚本：setup、start、status、stop、backup。
  core/       TypeScript/Node 编排逻辑和 Windows 调度脚本。
  adapters/   OpenClaw、Hermes Agent、Hermes Web UI 等服务适配器。
  apps/       上游应用代码或安装目录。
  runtimes/   便携 Node.js、Python、Git，以及未来平台运行时。
  data/       便携状态、memory、sessions、logs、cache、tmp 和 backups。
  portal/     本地统一入口页面。
  config/     默认配置、env 模板、profile 和端口配置。
  scripts/    setup、diagnostics、backup、update 自动化脚本。
  docs/       产品和架构文档。
```

真实 OpenClaw 和 Hermes 集成会在便携启动器骨架经过上游项目验证后继续推进。
