# PRD：ClawHermes-USB

## 1. 产品概述

ClawHermes-USB 是一个 Windows 优先的 U 盘便携式 agent 套件，用于从同一个可移动目录中运行官方 OpenClaw、Hermes Agent 和 EKKOLearnAI/hermes-web-ui。

产品希望提供一个可随身携带的 agent 工作环境。这个环境包含运行时、应用代码、配置、sessions、memory、skills、日志和共享工作区。用户把 U 盘插入兼容的 Windows 机器后，运行一个启动器，就可以在本地浏览器中同时访问 OpenClaw 和 Hermes 的 Web 体验。

这个项目需要按可维护的软件产品来设计，而不是把若干批处理脚本堆在一起。项目结构必须方便未来开发者理解服务边界、增加新集成、修改启动逻辑、支持 macOS，以及定位运行失败原因。

## 2. 问题背景

OpenClaw 和 Hermes Agent 都是能力很强的自托管 agent 系统，但默认安装方式通常假设某一台固定机器。它们可能会写入用户 home 目录，依赖宿主机运行时，打开本地端口，把 sessions 和 memory 存在宿主机磁盘上，并需要用户记住多个手动启动步骤。

如果用户希望在不同机器之间携带同一套 agent 环境，就会遇到这些问题：

- 配置和 memory 不会自然跟随用户迁移。
- 宿主机会残留应用数据、缓存和不完整安装。
- 在另一台机器复现同样环境很费时间。
- 同时运行 OpenClaw 和 Hermes 时，需要记住端口、启动顺序和健康状态。
- 临时脚本很快会变得难以维护。

ClawHermes-USB 通过便携目录布局、运行时边界、数据重定向策略、服务适配器模型和本地控制入口来解决这些问题。

## 3. 目标

### 3.1 用户目标

- 在 Windows 上从 U 盘运行 OpenClaw 和 Hermes。
- 将核心 agent 数据保存在 U 盘。
- 通过一个统一入口启动两个生态。
- 从本地 portal 访问 OpenClaw Control UI、OpenClaw WebChat 和 Hermes Web UI。
- 换到另一台兼容 Windows 机器时尽量不需要重新配置。
- 可以从一个目录备份完整便携 agent 环境。

### 3.2 开发者目标

- 项目结构清晰、模块化、容易阅读。
- 通用编排逻辑与具体服务行为分离。
- 每个集成可以通过 adapter 替换。
- 避免硬编码盘符和用户绝对路径。
- 日志和诊断信息容易找到。
- 给未来 macOS 支持留下清晰路径。

### 3.3 产品目标

- 第一版支持 Windows。
- 主路径不要求 Docker。
- 使用官方 OpenClaw 和 EKKOLearnAI/hermes-web-ui，不 fork。
- 使用 Hermes Agent 作为 Hermes 运行时。
- 尽量减少宿主机磁盘占用。
- 架构可以后续支持 Open WebUI、LobeChat 或其他 Hermes dashboard。

## 4. 非目标

MVP 不做这些事情：

- 承诺宿主机完全零痕迹。
- 内置大型本地 LLM 模型权重。
- 提供完整离线推理能力。
- 第一版支持 Linux/macOS。
- 修改 OpenClaw、Hermes Agent 或 Hermes Web UI 源码，除非 adapter 层必须做兼容处理。
- 替代上游工具自身的配置系统。
- 给任意工具执行提供安全沙箱。
- 第一版提供企业级多用户权限控制。

## 5. 目标用户

### 5.1 主要用户

有技术背景的用户，希望携带一个个人 agent 环境，并且可以在 Windows 上运行本地启动器。

典型需求：

- 在多台 Windows 电脑之间切换。
- 让 agent memory、sessions、skills 跟着自己走。
- 同时实验 OpenClaw 和 Hermes。
- 不想在每台宿主机上安装完整环境。

### 5.2 次要用户

希望扩展项目的开发者。

典型需求：

- 新增另一个 agent 前端。
- 替换 portal 实现。
- 添加 macOS 支持。
- 改进诊断能力。
- 添加 update 或 backup 工作流。

## 6. 核心用户场景

### 6.1 首次设置

用户把 ClawHermes-USB 下载或构建到 U 盘目录。

用户运行：

```text
launcher/windows/Setup.bat
```

设置流程检查：

- 便携 Node.js runtime。
- 便携 Python runtime。
- 可选便携 Git。
- 必需目录结构。
- 必需应用目录。
- 初始配置模板。

如果缺少依赖，setup 应该说明缺什么、应该放在哪里，或者在后续自动化版本中从哪里下载。

### 6.2 日常启动

用户插入 U 盘并运行：

```text
launcher/windows/Start.bat
```

启动器执行：

1. 识别项目根目录。
2. 为当前进程树设置便携环境变量。
3. 加载服务定义。
4. 检查端口可用性。
5. 启动 OpenClaw。
6. 启动 Hermes Agent gateway。
7. 启动 Hermes Web UI。
8. 启动本地 portal。
9. 打开 `http://127.0.0.1:17000/`。

portal 显示服务状态和入口：

- OpenClaw Control UI。
- OpenClaw WebChat。
- Hermes Web UI。
- 日志。
- 备份和停止操作。

### 6.3 停止服务

用户运行 `launcher/windows/Stop.bat`，或在 portal 中触发停止操作。

系统执行：

- 从 `data/tmp/pids` 读取进程 ID。
- 尝试优雅停止。
- 超时后强制停止。
- 写入停止日志。
- 保留用户数据。

### 6.4 移动到另一台机器

用户安全停止服务，弹出 U 盘，插入另一台兼容 Windows 机器并运行 `Start.bat`。

系统不应依赖上一次的盘符。所有路径都应基于当前启动器位置重新计算。

### 6.5 备份

用户运行备份命令。

系统在 `data/backups/` 下创建带时间戳的归档，包含：

- `config/`
- 选定的 `data/`
- adapter 元数据
- 服务版本元数据

运行时和应用代码可以根据备份模式选择是否包含。

## 7. 功能需求

### 7.1 便携根目录识别

- 启动器必须根据脚本所在位置发现项目根目录。
- 启动器不能依赖固定盘符。
- 所有生成的绝对路径都必须从项目根目录派生。

### 7.2 环境变量重定向

启动器必须设置当前进程局部环境变量，让子进程尽可能写入 U 盘数据目录。

Windows 必需变量：

- `HOME`
- `USERPROFILE`
- `APPDATA`
- `LOCALAPPDATA`
- `TEMP`
- `TMP`
- `HERMES_HOME`
- `npm_config_cache`
- `PIP_CACHE_DIR`
- `UV_CACHE_DIR`

这些变量只能作用于启动器创建的进程树，不能永久修改宿主机系统环境。

### 7.3 服务 adapter 加载

每个服务必须定义 adapter 描述文件，包括：

- service id
- 显示名称
- 服务类型
- 应用目录
- runtime 要求
- 启动命令
- 环境文件
- 数据目录
- 健康检查
- portal 链接
- 依赖顺序

Core 编排层消费这些描述文件，不应该硬编码具体服务行为。

### 7.4 端口管理

- 默认端口配置放在 `config/defaults/ports.json`。
- 启动服务前必须检测端口占用。
- MVP 可以在冲突时清晰失败。
- 后续版本可以支持自动端口重映射。

初始保留端口：

- Portal：`17000`
- OpenClaw gateway/control/webchat：等待官方运行模式确认。
- Hermes Agent API/gateway：默认 `8642`。
- Hermes Web UI：根据 EKKOLearnAI/hermes-web-ui 文档，默认 `8648`。

### 7.5 日志

所有启动器和服务日志必须写入：

```text
data/logs/
```

最少日志文件：

- `launcher.log`
- `openclaw.log`
- `hermes-agent.log`
- `hermes-web-ui.log`
- `portal.log`

日志应尽量包含时间戳、服务 id、事件类型和退出状态。

### 7.6 进程管理

启动器必须将进程元数据记录在：

```text
data/tmp/pids/
```

每个服务应包含：

- pid 文件
- 启动时间
- 命令摘要
- 工作目录
- 日志路径

### 7.7 健康检查

每个 adapter 必须定义健康检查。

MVP 支持：

- HTTP GET URL
- TCP 端口打开
- 进程存活

portal 应根据健康检查显示服务状态。

### 7.8 Portal

portal 必须提供：

- 服务状态
- 服务入口链接
- 当前项目根路径
- 当前数据根路径
- 日志入口或日志查看说明
- 停止说明
- 备份说明

MVP portal 可以是静态页面加一个轻量本地 server。后续可以升级成更完整的 UI。

### 7.9 数据持久化

系统必须将 `data/` 作为主要持久化根目录。

必需目录：

- `data/openclaw`
- `data/hermes`
- `data/hermes-web-ui`
- `data/shared-workspace`
- `data/home`
- `data/cache`
- `data/tmp`
- `data/logs`
- `data/backups`

### 7.10 Setup 校验

Setup 必须校验：

- 目录结构
- runtime 目录
- app 目录
- adapter 描述文件
- 配置文件
- `data/` 是否可写
- 端口是否可用

Setup 必须输出可操作的错误信息。

## 8. 非功能需求

### 8.1 可维护性

- 项目结构必须体现责任边界。
- 第三方应用代码只能放在 `apps/`。
- 便携 runtime 只能放在 `runtimes/`。
- 用户数据只能放在 `data/`。
- 本项目自己的编排代码放在 `core/`、`launcher/`、`portal/`、`scripts/`、`docs/`。

### 8.2 可扩展性

新增服务应该只需要：

1. 创建 `adapters/<service>/adapter.json`。
2. 添加可选服务脚本。
3. 添加配置模板。
4. 添加 portal 入口。

不应该需要修改无关服务逻辑。

### 8.3 可移植性

- 第一平台为 Windows。
- 未来 macOS 应尽可能复用同一套 config、adapter、apps、data 布局。
- 平台特定启动器放在 `launcher/<platform>/`。

### 8.4 宿主机影响

产品应尽量减少宿主机写入。

允许的宿主机痕迹：

- 使用宿主浏览器时产生的浏览器缓存和历史。
- 操作系统最近文件记录。
- 杀毒软件扫描记录。
- 不可控的临时进程痕迹。

设计上不允许：

- 宿主机全局 npm 安装。
- 宿主机 Python 包安装。
- OpenClaw/Hermes 状态写到宿主机用户目录。
- MVP 日常启动安装系统服务。

### 8.5 安全

- secrets 应放在 `config/env/*.env` 或服务支持的 secret 文件中。
- example env 文件不能包含真实凭据。
- 日志应避免输出完整 API key。
- portal 默认绑定 `127.0.0.1`。
- MVP 不支持公网暴露。

### 8.6 可靠性

- start 应尽量幂等。
- stop 应能处理服务已经停止的情况。
- 失败后日志仍然可见。
- 健康检查失败时应明确指出失败服务。

## 9. MVP 范围

第一个可构建里程碑：

- 目录结构。
- PRD 和设计文档。
- adapter 契约文档。
- 示例 adapter 描述文件。
- Windows launcher 占位。
- 配置模板。
- portal 占位。

第二个里程碑：

- Windows 环境 bootstrap。
- runtime 校验。
- 进程 start/stop 实现。
- 本地 portal server。
- 基础健康检查。

第三个里程碑：

- 官方 OpenClaw 集成。
- Hermes Agent 集成。
- EKKOLearnAI/hermes-web-ui 集成。
- 备份工作流。

## 10. 验收标准

文档 MVP 验收：

- 新开发者能识别 launcher、adapter、apps、runtimes、config、data 分别在哪里。
- 新开发者能理解为什么 `core/` 不能包含服务细节。
- 新开发者能根据 `docs/ADAPTER_CONTRACT.zh-CN.md` 写新的 adapter。
- PRD 清晰说明了范围内和范围外的内容。

第一版可运行验收：

- 从任意盘符运行 `Start.bat` 都能解析正确项目根目录。
- 服务启动时数据路径指向项目 `data/`。
- 日志写入 `data/logs`。
- portal 在 `127.0.0.1` 打开。
- `Stop.bat` 能停止已启动服务。

集成验收：

- OpenClaw 使用官方代码/包启动。
- Hermes Agent 使用 `data/hermes` 下的 `HERMES_HOME` 启动。
- Hermes Web UI 启动并连接 Hermes Agent。
- 移动到不同盘符后，用户 sessions 和 memory 仍可用。

## 11. 风险

### 11.1 上游路径假设

OpenClaw 或 Hermes 可能假设宿主机 home 目录。缓解方式：设置进程局部 home 变量，并记录所有不可避免写入。

### 11.2 Windows 原生模块兼容性

使用 PTY 或 native module 的 Node 包可能依赖 Windows build tools 或特定架构。缓解方式：优先使用预构建包，并记录 runtime 约束。

### 11.3 U 盘性能

慢速 U 盘会影响依赖加载、日志、SQLite 和缓存。建议严肃使用时采用 USB 3.x 或移动 SSD。

### 11.4 杀毒软件干扰

便携 runtime 和本地 server 可能触发扫描。缓解方式：日志清晰、runtime 来源明确。

### 11.5 端口冲突

宿主机可能已经占用端口。缓解方式：启动前检测冲突，后续添加自动端口映射。

## 12. 未决问题

- 哪个官方 OpenClaw 启动模式最适合 Windows 便携数据路径？
- OpenClaw 是否暴露 home/data/cache 环境变量，还是只能依赖 `HOME`/`USERPROFILE` 重定向？
- 第一版是否需要附带便携浏览器 profile，还是使用宿主浏览器？
- 备份是否包含 runtimes 和 apps，还是只包含 config/data？
- portal 应该是轻量 Node server，还是 core orchestrator 的一部分？
