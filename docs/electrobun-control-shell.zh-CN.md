# Electrobun 控制面板实验版

这个目录记录 `launcher/electrobun` 的实验性桌面入口。它使用 `Electrobun + Vue + Vite + Bun`，视觉方向参考 `vh-claw` 的深色侧边栏、状态卡片、模型服务商卡片和日志终端布局。

## 当前定位

- 保留现有 Node `control-server` 作为后端控制层。
- Electrobun 只负责桌面窗口、Vue UI 和 RPC 转发。
- 不替换 PyQt 入口；这是一个并行验证分支。
- 启动、停止、状态轮询、模型配置、日志读取都复用现有 HTTP/JSON API。

## 为什么不全局安装 Electrobun

Windows 下 `bun install -g electrobun` 容易卡在依赖解析阶段。当前实现使用本地依赖：

```powershell
cd launcher\electrobun
bun install
```

脚本会显式调用：

```powershell
node .\node_modules\electrobun\bin\electrobun.cjs
```

因此不需要全局 `electrobun` 命令。

## 代理构建

默认代理端口按本机 Clash/代理工具配置为 HTTP `127.0.0.1:7897`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher\electrobun\build.ps1
```

只验证 Web UI 和类型检查，不构建桌面安装包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher\electrobun\build.ps1 -WebOnly
```

如果代理端口不同：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher\electrobun\build.ps1 -HttpProxy "http://127.0.0.1:7897"
```

## 构建产物

Windows 构建产物会生成到：

```text
launcher\electrobun\build\canary-win-x64
```

当前构建会生成 Electrobun 安装器和压缩包。这个目录被 `.gitignore` 忽略，不进入仓库。

## 已知边界

- 这是实验入口，还没有接入 `scripts/release/Build-UsbRelease.ps1`。
- 正式替换 PyQt 前，需要验证 Electrobun 安装包在目标机器上的无 Node/Python/Bun 环境启动体验。
- 关闭窗口时需要继续保持和 PyQt 一样的清理语义：停止服务、关闭 control-server、释放 U 盘占用。
## U 盘入口说明

U 盘交付目录根部应优先开放 `ClawHermes-Control-Electrobun.exe`。它是一个无控制台窗口的轻量启动器，会把自身所在目录写入 `CLAWHERMES_USB_ROOT`，必要时静默执行同目录的 `ClawHermes-Control-Electrobun-Setup.exe`，然后启动已安装到 `%LOCALAPPDATA%\dev.clawhermes.control\canary\app` 的 Electrobun 控制面板。

不要把 `ClawHermes-Control-Electrobun-Setup.exe` 作为用户入口直接开放；直接点 setup 时，安装后的 app 无法稳定继承 U 盘根目录，容易出现窗口闪退或启动后找不到控制服务。

## 本次界面与关闭行为改动

- 主窗口改为 Electrobun 的隐藏原生标题栏，并在页面内绘制类似 macOS 的关闭、最小化、最大化按钮。
- 关闭按钮会让窗口立即消失，避免用户感觉点击无效；Electrobun Bun 进程会在后台继续调用 control-server 的 `/api/services/stop` 停止 OpenClaw、Hermes Agent、Hermes Web UI 和 Portal，再调用 `/api/shutdown` 关闭本地控制服务，完成后退出自身，尽量释放 U 盘目录占用。
- 顶部启动、停止、刷新按钮改为横向图标胶囊按钮，避免中文按钮文字竖排和拥挤。
- 左侧导航、服务卡片、模型供应商卡片和统计卡片增加彩色图标块，整体视觉方向参考 `vh-claw` 的深色控制台风格。
- 服务状态徽标使用短标签显示，完整状态保留在悬停标题里，避免 `placeholder-started` 这类长状态和服务名重叠。
- 服务卡片固定展示 `OpenClaw`、`Hermes Agent`、`Hermes Web UI`、`Portal` 的完整名称，并增加二级说明，避免 Hermes Agent 与 Hermes Web UI 在窄卡片里都被截断成 `Herme...`。
- 模型服务商卡片参考 `vh-claw` 的 preset 流程：点击服务商不会立即写配置，而是填入对应 Base URL 和默认模型；用户确认 API Key 后点击“保存模型”，再通过现有 control-server 写入 OpenClaw 与 Hermes 的共享模型配置。
- 左侧新增 `服务` 页面，参考 `D:\project\uclaw\src\mainview\components\HomePage.vue` 的导航栏、蓝色英雄区、粒子背景和 `product12.png` 主图。该页面以内嵌方式呈现，`立即使用` 会切回控制台并触发启动流程，`联系我们` 和 `DT 官网` 使用系统浏览器打开外链。

## 本地测试包

本地测试包会放到 `dist-usb` 下的一个独立目录中，入口文件是：

```text
ClawHermes-Control-Electrobun.exe
```

测试时优先点击这个根目录入口。它会静默安装或更新 Electrobun app，然后把当前目录作为 `CLAWHERMES_USB_ROOT` 传给控制面板。

当前测试包用于验证 Electrobun 壳、Vue 界面、控制服务通信、关闭清理和 U 盘入口流程。若 `apps/openclaw`、`apps/hermes-agent`、`apps/hermes-web-ui` 目录还没有放入真实 payload，启动后会显示 placeholder 或 stopped；这不是界面美化导致的功能回退，而是交付目录里还没有真实服务文件。

## 验证命令

本分支提交前需要至少通过：

```powershell
cd launcher\electrobun
bun run typecheck
cd ..\..
python -m unittest tests.test_windows_core.WindowsCoreTests.test_electrobun_control_shell_scaffold_matches_vh_claw_style -v
powershell -NoProfile -ExecutionPolicy Bypass -File .\launcher\electrobun\build.ps1 -SkipInstall
```
