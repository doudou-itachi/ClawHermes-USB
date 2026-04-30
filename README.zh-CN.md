# ClawHermes-USB

ClawHermes-USB 是一个 Windows 优先的 U 盘便携式 agent 运行套件，用来从同一个可移动目录中运行官方 OpenClaw、Hermes Agent 和 EKKOLearnAI/hermes-web-ui。

这个项目的目标不是 fork 这些上游工具，而是提供一层便携启动器、清晰目录结构、数据隔离规则、服务适配器和本地统一入口页，让用户可以在不同 Windows 机器之间携带自己的 agent 环境，并尽量减少对宿主机磁盘和全局环境的依赖。

## 当前状态

当前仓库只包含项目骨架和细节化规划文档。

目前还没有下载、内置、安装或运行 OpenClaw、Hermes Agent、Hermes Web UI。

## 核心文档

- [产品需求文档 PRD](docs/PRD.zh-CN.md)
- [架构设计文档](docs/DESIGN.zh-CN.md)
- [适配器契约](docs/ADAPTER_CONTRACT.zh-CN.md)

英文文档：

- [PRD](docs/PRD.md)
- [Architecture Design](docs/DESIGN.md)
- [Adapter Contract](docs/ADAPTER_CONTRACT.md)

## 设计目标

- Windows 优先的便携运行体验。
- OpenClaw、Hermes Agent、Hermes Web UI、运行时依赖、sessions、memory、skills、logs、workspace 数据尽量保存在 U 盘项目目录中。
- 允许宿主机留下少量不可避免的痕迹，例如浏览器缓存、系统最近文件记录等。
- 主路径不依赖 Docker。
- 保持清晰模块边界，让后续开发者可以替换、扩展或新增服务，而不用重写启动器。

## 顶层目录规划

```text
ClawHermes-USB/
  launcher/   用户入口脚本：启动、停止、设置、状态查看。
  core/       通用编排逻辑。
  adapters/   OpenClaw、Hermes Agent、Hermes Web UI 等服务适配器。
  apps/       上游应用代码或安装目录。
  runtimes/   便携 Node.js、Python、Git，以及未来平台运行时。
  data/       便携状态、memory、sessions、logs、cache、backup。
  portal/     本地统一入口页。
  config/     默认配置、env 模板、profile、端口配置。
  scripts/    setup、diagnostics、backup、update 自动化脚本。
  docs/       产品和架构文档。
```

## 第一阶段里程碑

第一阶段实现目标：

1. 动态识别 U 盘项目根路径。
2. 为当前进程树设置便携环境变量。
3. 校验便携 Node.js、Python、Git 是否存在。
4. 加载服务 adapter 描述文件。
5. 启动占位服务并把日志写入 `data/logs`。
6. 打开本地 portal：`http://127.0.0.1:17000/`。

真正接入 OpenClaw 和 Hermes 会在启动器骨架验证之后进行。
