# Windows / macOS payload 产物清单

本文用于说明 `dist-usb/ClawHermes` 交付包中哪些内容是 Windows 专属、哪些内容是 macOS 专属、哪些内容两端共用。这里的 `DTC` 指最终放到 U 盘或 ISO 根目录下的交付目录，内容等价于本仓库生成的 `dist-usb/ClawHermes`。

## 总体结构

最终交付建议保持：

```text
<ISO 或 U 盘根目录>/
  DTC/
  autorun.inf
  oc.ico
  Windows-Start.bat
  双击执行.bat
  Start-DTClaw-Mac.command
  START_HERE.txt
```

其中 `DTC/` 才是真正的应用和 payload 目录；根目录下的 bat、command、icon、inf 和说明文件只是平台入口或引导文件。

## 两端共用的 payload

这些内容 Windows 和 macOS 使用同一套，不需要分别准备两份：

```text
DTC/core/node/dist/
DTC/adapters/
DTC/apps/openclaw/
DTC/apps/hermes-agent/
DTC/apps/hermes-web-ui/
DTC/portal/
DTC/config/
DTC/data/
DTC/skills/
DTC/docs/
DTC/README.md
DTC/README.zh-CN.md
DTC/release-manifest.json
```

说明：

- `apps/openclaw`、`apps/hermes-agent`、`apps/hermes-web-ui` 是共享业务 payload。平台差异主要由 runtime、启动脚本和环境变量处理。
- `skills/` 是独立技能目录，不放到 `apps/openclaw/skills`，避免替换 OpenClaw payload 时覆盖预制技能。
- `data/` 发布时应是空运行态目录。不要把 `data/settings/device-binding.json`、`data/tmp/*`、旧日志和旧 pid 文件打进正式包。

## Windows 专属产物

Windows 主入口是：

```text
DTC/ClawHermes-Control-Electrobun.exe
```

Windows Electrobun UI 需要以下文件一起存在：

```text
DTC/ClawHermes-Control-Electrobun.exe
DTC/ClawHermes-Control-Electrobun-Setup.exe
DTC/ClawHermes-Control-Electrobun-Setup.tar.zst
DTC/ClawHermes-Control-Electrobun-Setup.metadata.json
```

关键点：

- `ClawHermes-Control-Electrobun.exe` 是便携启动器。
- `ClawHermes-Control-Electrobun-Setup.exe` 是 Electrobun 安装/自解压入口。
- `ClawHermes-Control-Electrobun-Setup.tar.zst` 必须和 setup exe 同目录；缺少它会出现 `Electrobun 控制面板安装未完成`。
- `ClawHermes-Control-Electrobun-Setup.metadata.json` 用于判断已安装 UI 是否需要更新。

Windows fallback 入口：

```text
DTC/ClawHermes-Control.exe
```

这是 PyQt 控制台 fallback。正常情况下优先用 Electrobun；如果 Electrobun 产物不完整或不可用，可以退回 PyQt。

Windows runtime：

```text
DTC/runtimes/windows/node/
DTC/runtimes/windows/python/
```

这两个目录用于让目标 Windows 机器即使没有安装 Node/Python 也能运行。之前“无 Python 的电脑也能跑”依赖的就是这部分。

Windows 根目录引导文件：

```text
Windows-Start.bat
双击执行.bat
autorun.inf
oc.ico
```

这些文件在 `DTC` 同级，不属于 `DTC` 内部 payload。它们可以沿用当前版本，只要指向 `DTC` 并启动 `DTC/ClawHermes-Control-Electrobun.exe` 或对应 fallback。

## macOS 专属产物

macOS 根入口是：

```text
DTC/Start-ClawHermes-Mac.command
```

辅助停止入口：

```text
DTC/Stop-ClawHermes-Mac.command
```

macOS Electrobun UI 产物：

```text
DTC/ClawHermes-Control-Mac.app/
DTC/ClawHermes-Control-Mac.app.tar.gz
```

关键点：

- `.app` 必须在 macOS 上构建，不能在 Windows 上完整生成。
- `.app.tar.gz` 是必要兜底产物。macOS 启动脚本会优先把它解压到 `~/Library/Application Support/ClawHermes-USB/macos-app/current/` 后启动，这解决了 ISO/写入工具导致 `.app` bundle 丢失或结构不稳定的问题。
- 即使 ISO 里能看到 `.app`，也建议保留 `.app.tar.gz`。

macOS runtime archive：

```text
DTC/runtime-archives/macos/node-v24-darwin-arm64.tar.gz
DTC/runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
```

首次在 Apple Silicon Mac 上运行时，启动脚本会把它们解压到：

```text
DTC/runtimes/macos/node/darwin-arm64/
DTC/runtimes/macos/python/darwin-arm64/
```

当前包还提示缺少 Intel Mac 可选 archive：

```text
DTC/runtime-archives/macos/node-v24-darwin-x64.tar.gz
DTC/runtime-archives/macos/python-3.11-darwin-x64.tar.gz
```

如果只支持 Apple Silicon MacBook Air，这不是阻塞项；如果要支持 Intel Mac，需要 macOS 同事补齐 x64 runtime archives。

## 之前问题对应关系

### Windows 弹出“Electrobun 控制面板安装未完成”

原因是 Windows Electrobun setup exe 旁边缺少：

```text
DTC/ClawHermes-Control-Electrobun-Setup.tar.zst
```

现在打包脚本会把 `Setup.exe`、`Setup.tar.zst`、`metadata.json` 一起复制到 release 根目录，并写入 `platformPayloads.windows`。

### macOS 看不到 Electrobun UI

通常是缺少 macOS `.app` 或 `.app` bundle 在 ISO/写入后不可用。现在需要同时保留：

```text
DTC/ClawHermes-Control-Mac.app/
DTC/ClawHermes-Control-Mac.app.tar.gz
```

启动脚本会从 `.app.tar.gz` staging 到本机用户目录再启动 UI。

### macOS 服务没起来但 UI 能打开

这次 F 盘日志显示是 `data/settings/device-binding.json` 被 Windows 首次运行写成了 Windows 指纹，macOS 再启动时被误判为另一块 U 盘。

正式发布包必须保持未绑定，不要带：

```text
DTC/data/settings/device-binding.json
```

当前核心逻辑已支持跨 Windows/macOS 追加平台指纹，同时保留同平台错盘拒绝。

### Windows 和 macOS 是否共用 payload

共用。`apps/`、`core/`、`adapters/`、`config/`、`portal/`、`skills/` 是同一套。差异在：

- Windows 使用 Windows Electrobun/PyQt 控制台和 `runtimes/windows/*`。
- macOS 使用 `.command`、macOS `.app` 和 `runtime-archives/macos/*`。
- 运行后会在 `data/` 下生成各自日志、pid、runtime 解压结果和设备绑定信息。

## 构建流程和命令

### Windows 构建机：生成主 release

Windows 侧负责生成最终 `dist-usb/ClawHermes`，并把已准备好的 Windows/macOS 产物合并进去。

基础依赖：

- Node.js/npm：用于构建 `core/node/dist`。
- Bun：用于构建 Windows Electrobun UI。
- Python 3.11：用于 PyQt fallback、Hermes Agent 相关依赖和测试。
- .NET Framework `csc.exe`：用于编译 Windows Electrobun 便携启动器 `ClawHermes-Control-Electrobun.exe`。

常用完整构建命令：

```powershell
cd E:\ClawHermes-USB
npm install
npm run build

powershell -NoProfile -ExecutionPolicy Bypass `
  -File launcher\electrobun\build.ps1 `
  -SkipInstall

powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\release\Build-UsbRelease.ps1 `
  -Clean
```

如果 macOS `.app`、runtime archive、Hermes macOS vendor 已经由 macOS 同事构建好并放回仓库对应位置，只想重新合并到本地 `dist-usb`，可以用：

```powershell
cd E:\ClawHermes-USB
npm run build

powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\release\Build-UsbRelease.ps1 `
  -Clean `
  -SkipBuild
```

`-SkipBuild` 不会重新构建上游 UI/应用，只会把当前仓库里已有的 payload 和平台产物复制进 `dist-usb/ClawHermes`。

### Windows Electrobun UI 构建

Windows Electrobun UI 的构建脚本是：

```powershell
cd E:\ClawHermes-USB
powershell -NoProfile -ExecutionPolicy Bypass `
  -File launcher\electrobun\build.ps1
```

构建后需要确认这些源产物存在：

```text
launcher/electrobun/build/canary-win-x64/ClawHermes-Control-Electrobun.exe
launcher/electrobun/build/canary-win-x64/DTclaw Control-Setup-canary.exe
launcher/electrobun/build/canary-win-x64/DTclaw Control-Setup-canary.tar.zst
launcher/electrobun/build/canary-win-x64/DTclaw Control-Setup-canary.metadata.json
```

发布脚本会把它们标准化复制为：

```text
DTC/ClawHermes-Control-Electrobun.exe
DTC/ClawHermes-Control-Electrobun-Setup.exe
DTC/ClawHermes-Control-Electrobun-Setup.tar.zst
DTC/ClawHermes-Control-Electrobun-Setup.metadata.json
```

### macOS 构建机：生成 macOS 专属产物

macOS Electrobun `.app` 必须在 macOS 或 macOS CI 上构建。

Apple Silicon 构建命令：

```bash
cd ClawHermes-USB/launcher/electrobun
npm install
npm run build:mac:arm64
```

Intel Mac 构建命令：

```bash
cd ClawHermes-USB/launcher/electrobun
npm install
npm run build:mac:x64
```

构建完成后，Windows 发布脚本会从 `launcher/electrobun/build/.../*.app` 中找到 `.app`，复制为：

```text
DTC/ClawHermes-Control-Mac.app/
DTC/ClawHermes-Control-Mac.app.tar.gz
```

`.app.tar.gz` 由 Windows 发布脚本生成，用于 macOS 启动时 staging 到本机用户目录。

### macOS Hermes Agent vendor

Hermes Agent 在 macOS 上不能复用 Windows Python 依赖，需要 macOS 架构对应的 vendor 目录。

Apple Silicon：

```bash
cd ClawHermes-USB/apps/hermes-agent
rm -rf vendor/darwin-arm64
python3 -m pip install --upgrade pip
python3 -m pip install --target vendor/darwin-arm64 . aiohttp==3.13.3
PYTHONPATH=vendor/darwin-arm64:. python3 -c "import aiohttp, dotenv, httpx, requests, websockets, yaml"
```

Intel Mac：

```bash
cd ClawHermes-USB/apps/hermes-agent
rm -rf vendor/darwin-x64
python3 -m pip install --upgrade pip
python3 -m pip install --target vendor/darwin-x64 . aiohttp==3.13.3
PYTHONPATH=vendor/darwin-x64:. python3 -c "import aiohttp, dotenv, httpx, requests, websockets, yaml"
```

这些目录随 `apps/hermes-agent/` 作为共享 app payload 的一部分进入 release。

### macOS Hermes Web UI

Hermes Web UI 仍然是同一套 `apps/hermes-web-ui/dist`，但替换依赖或源码后需要重新构建：

```bash
cd ClawHermes-USB/apps/hermes-web-ui
npm install
npm run build
```

构建完成后，`apps/hermes-web-ui/dist/` 会随 release 一起复制。

### macOS runtime archives

macOS 启动脚本会按当前架构寻找：

```text
runtime-archives/macos/node-v24-darwin-arm64.tar.gz
runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
runtime-archives/macos/node-v24-darwin-x64.tar.gz
runtime-archives/macos/python-3.11-darwin-x64.tar.gz
```

如果目标只测 Apple Silicon，至少需要：

```text
runtime-archives/macos/node-v24-darwin-arm64.tar.gz
runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
```

archive 解压要求：压缩包内应有一个顶层目录，顶层目录下直接包含 `bin/node` 或 `bin/python3`。启动脚本会使用 `--strip-components 1` 解压到：

```text
runtimes/macos/node/darwin-arm64/
runtimes/macos/python/darwin-arm64/
```

例如已有一个可运行的 Python portable 目录 `python-3.11-darwin-arm64/`，可在 macOS 上打包：

```bash
mkdir -p runtime-archives/macos
tar -czf runtime-archives/macos/python-3.11-darwin-arm64.tar.gz python-3.11-darwin-arm64
```

Node runtime 可以直接使用符合命名和目录结构要求的 Node.js macOS tarball，或重新打包为上述文件名。

### macOS 产物回传 Windows 后的合并

macOS 同事完成构建后，需要把这些内容放回 Windows 仓库同名位置：

```text
launcher/electrobun/build/.../*.app
apps/hermes-agent/vendor/darwin-arm64/
apps/hermes-agent/vendor/darwin-x64/
apps/hermes-web-ui/dist/
runtime-archives/macos/node-v24-darwin-arm64.tar.gz
runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
```

然后 Windows 上执行：

```powershell
cd E:\ClawHermes-USB
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\release\Build-UsbRelease.ps1 `
  -Clean `
  -SkipBuild
```

这样会生成同时包含 Windows 和 macOS 平台产物的：

```text
E:\ClawHermes-USB\dist-usb\ClawHermes
```

## 发布前检查

在 Windows 上生成 `dist-usb` 后至少检查：

```powershell
Test-Path .\dist-usb\ClawHermes\ClawHermes-Control-Electrobun.exe
Test-Path .\dist-usb\ClawHermes\ClawHermes-Control-Electrobun-Setup.exe
Test-Path .\dist-usb\ClawHermes\ClawHermes-Control-Electrobun-Setup.tar.zst
Test-Path .\dist-usb\ClawHermes\ClawHermes-Control-Mac.app.tar.gz
Test-Path .\dist-usb\ClawHermes\runtime-archives\macos\node-v24-darwin-arm64.tar.gz
Test-Path .\dist-usb\ClawHermes\runtime-archives\macos\python-3.11-darwin-arm64.tar.gz
Test-Path .\dist-usb\ClawHermes\data\settings\device-binding.json
```

最后一条应该返回 `False`。前面几条应按目标平台要求返回 `True`。
