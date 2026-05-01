# 开发者本地运行指南

本文面向 clone 仓库后的开发者，目标是快速理解如何在本机运行 ClawHermes-USB 便携套件，并知道图形入口 `.vbs`、PowerShell 脚本、Node 核心和服务适配器之间的关系。

## 适用场景

- 你要在 Windows 开发机上调试 ClawHermes 自己的启动器、GUI、适配器和编排逻辑。
- 你已经 clone 了仓库，但还没有准备上游应用 payload。
- 你希望先把图形控制中心跑起来，再逐步补齐 OpenClaw、Hermes Agent、Hermes Web UI 和 WSL rootfs。

## 前置要求

- Windows 10/11。
- PowerShell 5.1 或更高版本。
- Node.js，可先使用系统 Node，后续交付版再放入 `runtimes/`。
- Git。
- 如需真实运行 OpenClaw 或 Hermes Agent 的 WSL 适配器，需要启用 WSL2，并准备 `runtimes/wsl/ubuntu-rootfs.tar`。

## 第一次运行

在仓库根目录执行：

```powershell
npm install
npm run build
```

然后运行图形控制中心：

```powershell
launcher/windows/ClawHermes-Control.vbs
```

`.vbs` 是推荐的 Windows 双击入口。它先隐藏一个很短的启动器，再由启动器拉起真正的 WinForms GUI，因此用户不会看到黑色命令窗口。

如果需要在控制台里看错误，可以直接运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher/windows/ClawHermes-Control.ps1 -UsbRoot .
```

## GUI 入口做了什么

启动链路如下：

```text
ClawHermes-Control.vbs
  -> ClawHermes-Control-Launch.ps1
    -> ClawHermes-Control.ps1
      -> core/windows/clawhermes.ps1
        -> core/node/dist/clawhermes.js
          -> adapters/*/adapter.json
```

- `ClawHermes-Control.vbs`：无控制台入口，适合普通用户双击。
- `ClawHermes-Control-Launch.ps1`：隐藏启动器，不隐藏 GUI 窗口。
- `ClawHermes-Control.ps1`：WinForms 图形控制中心。
- `core/windows/clawhermes.ps1`：Windows 调度层。
- `core/node/dist/clawhermes.js`：编排核心，由 TypeScript 构建生成。
- `adapters/`：服务适配器，描述每个服务如何 setup、start、stop、status。

## 常用开发命令

```powershell
npm run build
npm test
node core/node/dist/clawhermes.js setup --json
node core/node/dist/clawhermes.js status --json
node core/node/dist/clawhermes.js model-config-status --json
```

调试 GUI 时常用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher/windows/ClawHermes-Control.ps1 -UsbRoot . -SelfTest
powershell -NoProfile -ExecutionPolicy Bypass -File launcher/windows/ClawHermes-Control.ps1 -UsbRoot . -ClickSelfTest
powershell -NoProfile -ExecutionPolicy Bypass -File launcher/windows/ClawHermes-Control.ps1 -UsbRoot . -AsyncButtonSelfTest
```

## 模型配置

图形界面的“模型配置”页面会要求填写：

- API URL / Base URL
- 模型名称
- API Key
- 应用范围：`openclaw`、`hermes` 或 `both`

配置会写入项目本地 `data/` 目录，API Key 在状态输出中会被隐藏。OpenClaw 相关配置会落到 `data/openclaw/`，Hermes 相关配置会落到 `data/hermes/`。

## 开发者注意事项

- 不要把密钥提交到 git。
- 不要把 `data/` 下的用户数据提交到 git。
- 不要把上游应用的完整 `node_modules`、WSL rootfs、缓存或构建产物直接提交到 git。
- 修改 TypeScript 后运行 `npm run build`，确保 `core/node/dist/` 同步更新。
- 修改中文文档后，用 UTF-8 重新打开检查，不能出现乱码。

## 常见问题

### 双击 VBS 没有反应

先用可见 PowerShell 运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher/windows/ClawHermes-Control.ps1 -UsbRoot .
```

这样可以看到启动错误。

### 点击按钮后卡顿

GUI 的状态、日志和配置读取会放到后台进程执行，再由 WinForms 定时器在 UI 线程更新结果。如果仍然卡顿，优先查看 `data/logs/` 和 `node core/node/dist/clawhermes.js status --json` 的输出。

### 服务显示 stopped

开发仓库默认不一定包含完整上游 payload。先运行“安装向导”或：

```powershell
node core/node/dist/clawhermes.js setup --json
node core/node/dist/clawhermes.js payloads --json
```

检查缺少哪些 apps、runtimes 或 WSL artifact。
