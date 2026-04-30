# Adapter 契约

## 1. 目的

Adapter 是 ClawHermes-USB core 编排层和外部服务之间的边界。

Core 应该知道如何根据描述文件启动一个服务，但不应该知道 OpenClaw、Hermes Agent、Hermes Web UI 或未来集成的内部细节。

每个 adapter 回答这些问题：

- 这个服务叫什么？
- 应用安装在哪里？
- 需要哪个便携 runtime？
- 用什么命令启动？
- 读取哪些 env 文件？
- 数据应该写到哪里？
- 如何判断服务健康？
- portal 应显示哪个 URL？
- 必须先启动哪些服务？

## 2. 必需文件

每个 adapter 目录应包含：

```text
adapters/<service-id>/
  adapter.json
  README.md
```

可选文件：

```text
  setup.ps1
  start.ps1
  stop.ps1
  health.ps1
  templates/
```

只有服务需要超出通用进程管理器的特殊行为时，才需要可选脚本。

## 3. 描述文件 Schema

示例：

```json
{
  "id": "hermes-web-ui",
  "displayName": "Hermes Web UI",
  "description": "EKKOLearnAI Hermes Web UI dashboard.",
  "type": "node-service",
  "enabled": true,
  "appDir": "apps/hermes-web-ui",
  "runtime": {
    "kind": "node",
    "platform": "windows",
    "requiredExecutable": "node.exe"
  },
  "upstream": {
    "name": "EKKOLearnAI/hermes-web-ui",
    "repositoryUrl": "https://github.com/EKKOLearnAI/hermes-web-ui",
    "installDocs": "https://github.com/EKKOLearnAI/hermes-web-ui",
    "checkoutRef": "main",
    "installMode": "source-checkout",
    "notes": "Portable adapter still needs source checkout versus package CLI mode verification."
  },
  "commands": {
    "setup": "npm install",
    "start": "npm run start",
    "stop": null
  },
  "env": {
    "files": [
      "config/env/hermes-web-ui.env"
    ],
    "variables": {
      "HERMES_HOME": "${USB_ROOT}/data/hermes",
      "HERMES_WEB_UI_DATA_DIR": "${USB_ROOT}/data/hermes-web-ui"
    }
  },
  "dataDir": "data/hermes-web-ui",
  "logFile": "data/logs/hermes-web-ui.log",
  "pidFile": "data/tmp/pids/hermes-web-ui.pid",
  "health": {
    "type": "http",
    "url": "http://127.0.0.1:8648",
    "timeoutSeconds": 30
  },
  "portal": {
    "label": "Hermes Web UI",
    "url": "http://127.0.0.1:8648",
    "group": "Hermes"
  },
  "dependsOn": [
    "hermes-agent"
  ]
}
```

## 4. 字段说明

### `id`

稳定的机器可读服务 id。

规则：

- 小写
- kebab-case
- 在所有 adapter 中唯一

示例：

- `openclaw`
- `hermes-agent`
- `hermes-web-ui`

### `displayName`

显示在日志和 portal 中的人类可读名称。

### `description`

给开发者和 portal 元数据使用的简短描述。

### `type`

通用服务类型。

初始支持：

- `node-service`
- `python-service`
- `binary-service`
- `static-portal`
- `custom`

### `enabled`

服务是否默认启用。

禁用服务在 `Start.bat` 中应被忽略，除非用户显式请求。

### `appDir`

从项目根目录到上游应用目录的相对路径。

示例：

```text
apps/hermes-web-ui
```

Adapter 禁止使用绝对路径。

### `runtime`

运行时要求。

字段：

- `kind`：`node`、`python`、`git`、`binary` 或 `none`
- `platform`：`windows`、`macos` 或 `any`
- `requiredExecutable`：runtime 路径下预期存在的可执行文件

### `upstream`

上游来源和安装元数据。

字段：

- `name`：上游项目或 package 名称
- `repositoryUrl`：规范来源仓库 URL
- `installDocs`：上游安装或平台文档 URL
- `checkoutRef`：adapter 预期使用的分支、tag 或 revision
- `installMode`：`source-checkout`、`package`、`manual` 或 `unknown`
- `notes`：简短集成说明或当前 blocker

这些元数据会被 `node core/node/dist/clawhermes.js adapters --json` 和 `node core/node/dist/clawhermes.js sources --json` 使用。真实集成标记为 production-ready 前，应先更新并验证这些字段。

### `commands`

setup/start/stop 流程使用的命令。

规则：

- 默认从 `appDir` 执行。
- 命令可以使用 `${USB_ROOT}` 占位符。
- 如果通用进程管理器通过 PID 停止服务，`stop` 可以为 null。

### `env.files`

启动服务前加载的 env 文件列表。

文件路径应相对项目根目录。

示例文件以 `.example` 后缀提交。真实 env 文件应本地保存并被忽略。

### `env.variables`

为该服务设置的内联环境变量。

支持占位符：

- `${USB_ROOT}`
- `${DATA_DIR}`
- `${APP_DIR}`
- `${PORT}`
- `${SERVICE_ID}`

### `dataDir`

服务便携数据目录的相对路径。

### `logFile`

服务日志文件的相对路径。

### `pidFile`

PID 元数据文件的相对路径。

### `health`

健康检查描述。

MVP 支持类型：

#### HTTP

```json
{
  "type": "http",
  "url": "http://127.0.0.1:8648",
  "timeoutSeconds": 30
}
```

#### TCP

```json
{
  "type": "tcp",
  "host": "127.0.0.1",
  "port": 8642,
  "timeoutSeconds": 30
}
```

#### Process

```json
{
  "type": "process",
  "timeoutSeconds": 10
}
```

### `portal`

Portal 元数据。

字段：

- `label`：可见按钮文本
- `url`：服务 URL
- `group`：视觉分组

### `dependsOn`

必须先启动的服务 id 列表。

编排器必须对服务进行拓扑排序。循环依赖无效。

## 5. Adapter 职责

Adapter 应该：

- 将服务特定假设限制在本目录内
- 记录上游版本要求
- 定义健康检查
- 定义数据目录
- 定义 env 文件
- 避免宿主机绝对路径

Adapter 不应该：

- 永久修改宿主机
- 在宿主机全局安装 package
- 把 secrets 写入提交文件
- 访问其他 adapter 的私有目录
- 在非必要时重复 core 的进程管理逻辑

## 6. 初始服务 Adapter

### 6.1 OpenClaw

目的：

- 运行官方 OpenClaw。
- 暴露 Control UI 和 WebChat。
- 将 OpenClaw 状态存储在 `data/openclaw`。

未决问题：

- 官方 Windows 便携启动方式。
- data/home 路径相关环境变量。
- 默认端口和端口重映射方式。

### 6.2 Hermes Agent

目的：

- 运行 Hermes Agent gateway/API。
- 将 `HERMES_HOME` 指向 `data/hermes`。
- 为 Hermes Web UI 提供 backend。

预期默认端口：

- `8642`

### 6.3 Hermes Web UI

目的：

- 运行 EKKOLearnAI/hermes-web-ui。
- 连接 Hermes Agent。
- 将 UI 状态存储在 `data/hermes-web-ui`。

预期默认端口：

- `8648`

## 7. 版本记录

每个 adapter 后续应记录上游版本元数据。

建议文件：

```text
adapters/<service-id>/version.json
```

示例：

```json
{
  "upstream": "EKKOLearnAI/hermes-web-ui",
  "version": "unknown",
  "source": "manual",
  "installedAt": null
}
```

## 8. 校验规则

Adapter validator 应在以下情况失败：

- 缺少 `id`
- `appDir` 是绝对路径
- `dataDir` 是绝对路径
- `logFile` 不在 `data/logs`
- `pidFile` 不在 `data/tmp`
- `dependsOn` 引用了未知服务
- 缺少健康检查
- 用户可见服务缺少 portal URL

以下情况应给出 warning：

- 服务启用但 app 目录为空
- runtime 可执行文件缺失
- env 文件缺失
- 默认端口被占用

## 9. Adapter 准备命令

尝试真实上游集成前，先运行 adapter 指导命令：

```powershell
node core/node/dist/clawhermes.js adapters --json
node core/node/dist/clawhermes.js adapters hermes-web-ui --json
```

该命令会报告：

- `appDir` 和 `dataDir` 是否存在
- adapter 声明的 runtime 元数据
- env 文件和 example 模板是否存在
- setup/start/stop 命令
- 依赖服务 id
- 集成就绪度元数据
- 标记 production-ready 前的下一步

在 app 目录、env 文件、setup 命令、start 命令、健康检查和数据路径行为都经过验证前，不要把 adapter 标记为 `productionReady: true`。

## 10. App 来源准备命令

准备上游应用 checkout 时，使用来源计划命令：

```powershell
node core/node/dist/clawhermes.js sources --json
node core/node/dist/clawhermes.js sources hermes-web-ui --json
```

该命令是只读的。它会报告：

- `apps/` 下的目标 app 目录路径
- 每个 app 目录是否存在，以及是否包含真实内容
- 来自 `adapter.json` 的上游仓库元数据
- 建议的 `git clone` 命令文本
- 用于自动化安全检查的 `wouldModify: false`

不要把建议的 clone 命令当成自动安装器。网络和文件系统写入应继续放在明确的用户或操作者动作之后。

## 11. 贡献者工作流

新增服务：

1. 创建 `adapters/<new-service>/`。
2. 添加 `adapter.json`。
3. 添加 `README.md`。
4. 在 `config/env/` 下添加 env example。
5. 在 `apps/<new-service>/` 下添加 app 占位目录。
6. 在 `data/<new-service>/` 下添加数据目录。
7. 运行 `node core/node/dist/clawhermes.js adapters <new-service> --json`。
8. 运行 `node core/node/dist/clawhermes.js sources <new-service> --json`。
9. 如有需要，更新 portal 元数据。

除非服务需要新的通用能力，否则不应修改 core 代码。
