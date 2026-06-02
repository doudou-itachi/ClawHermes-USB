# macOS 构建交付说明

这份文档给 macOS 同事使用。目标是补齐 Windows 发布机不能可靠生成的 macOS 原生产物，然后把产物交回 Windows 发布机，最终生成一个同时兼容 Windows 和 macOS 的 `DTC`/USB/ISO 包。

## 为什么要在 macOS 上做

Windows 可以负责最终打包 `dist-usb/ClawHermes`，也可以继续使用同一套业务 payload；但下面几类内容和 macOS 平台强相关，不能只靠 Windows 可靠生成：

- Electrobun 原生 UI `.app`：包含 macOS app bundle、Bun/Electrobun 自解压内容和 macOS 可执行文件。
- Hermes Agent Python vendor：Windows `.venv` 不能直接给 macOS portable Python 使用。
- Hermes Web UI 的 macOS Node 原生依赖：例如 `node-pty` 的 `darwin-arm64` 预编译模块。
- macOS portable runtime archive：USB 首次运行时会解压成 `DTC/runtimes/macos/...`。

本次 Hermes 问题的根因是 macOS 运行时没有完整接入 Python vendor：

- Hermes Web UI 的 Python bridge 缺少 `PYTHONPATH`，导致 `No module named 'dotenv'`。
- Hermes Agent API Server 缺少 `aiohttp`，导致 Agent 进程是 running，但 8642 health/API 不 ready。

代码侧已经修复 `PYTHONPATH` 注入；macOS 构建侧需要确保 `vendor/darwin-arm64` 或 `vendor/darwin-x64` 里包含 `aiohttp` 和 Hermes 常用 Python 依赖。

## 当前需要做什么

如果只是验证本次 Hermes 修复，至少需要重新准备：

```text
apps/hermes-agent/vendor/darwin-arm64/
```

如果本轮还改过 Electrobun UI 或 Hermes Web UI，则也需要准备：

```text
launcher/electrobun/build/canary-macos-arm64/DTclaw Control-canary.app
apps/hermes-web-ui/dist/
apps/hermes-web-ui/node_modules/node-pty/prebuilds/darwin-arm64/pty.node
```

如果 portable runtime archive 缺失，还需要补齐：

```text
runtime-archives/macos/node-v24-darwin-arm64.tar.gz
runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
```

Intel Mac 对应使用 `darwin-x64`，当前优先支持 Apple Silicon `darwin-arm64`。

## 拉取代码

```bash
git fetch origin
git checkout codex/macos-electrobun-usb-release
git pull --ff-only
git log --oneline -5
```

确认能看到类似提交：

```text
fix: wire macos hermes python dependencies
```

## 构建 Hermes Agent vendor

在 Apple Silicon Mac 上执行：

```bash
cd apps/hermes-agent
rm -rf vendor/darwin-arm64
python3 -m pip install --upgrade pip
python3 -m pip install --target vendor/darwin-arm64 . aiohttp==3.13.3
PYTHONPATH=vendor/darwin-arm64:. python3 -c "import aiohttp, dotenv, httpx, requests, websockets, yaml"
```

自检命令无输出且退出码为 0 即通过。这个目录会给 USB 上的 portable Python 使用，不要用 Windows `.venv` 替代。

Intel Mac 对应改成：

```bash
cd apps/hermes-agent
rm -rf vendor/darwin-x64
python3 -m pip install --upgrade pip
python3 -m pip install --target vendor/darwin-x64 . aiohttp==3.13.3
PYTHONPATH=vendor/darwin-x64:. python3 -c "import aiohttp, dotenv, httpx, requests, websockets, yaml"
```

## 构建 Electrobun macOS UI

只有在 Electrobun UI 代码、启动逻辑或打包配置有变化时才需要重新构建 `.app`。

```bash
cd launcher/electrobun
npm install
npm run typecheck
npm run build:mac:arm64
test -d "build/canary-macos-arm64/DTclaw Control-canary.app"
```

交回 Windows 后，发布脚本会把它复制为：

```text
dist-usb/ClawHermes/ClawHermes-Control-Mac.app
```

同时会生成：

```text
dist-usb/ClawHermes/ClawHermes-Control-Mac.app.tar.gz
```

这个 `.tar.gz` 必须保留；部分 ISO/USB 工具会漏写 `.app` 目录，macOS 启动脚本会用 `.tar.gz` 自动恢复。

## 构建 Hermes Web UI macOS payload

只有在 Hermes Web UI 代码、Node 依赖或 `node-pty` 相关内容变化时才需要重新构建。

```bash
cd apps/hermes-web-ui
npm install
npm run build
test -f dist/server/index.js
test -f node_modules/node-pty/prebuilds/darwin-arm64/pty.node
```

Windows 发布机后续打包时要用 `-SkipBuild`，避免 Windows 上的 `npm install` 覆盖 macOS 原生依赖。

## 检查 runtime archive

在仓库根目录检查：

```bash
test -f runtime-archives/macos/node-v24-darwin-arm64.tar.gz
test -f runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
```

USB 首次运行时会解压成：

```text
runtimes/macos/node/darwin-arm64/bin/node
runtimes/macos/python/darwin-arm64/bin/python3
```

archive 缺失时不要交付最终包。

## 交回 Windows 发布机

把实际生成或更新过的产物交回 Windows 发布机：

```text
apps/hermes-agent/vendor/darwin-arm64/
launcher/electrobun/build/
launcher/electrobun/artifacts/
apps/hermes-web-ui/dist/
apps/hermes-web-ui/node_modules/
runtime-archives/macos/node-v24-darwin-arm64.tar.gz
runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
```

不要把这些大产物提交到当前功能分支。推荐通过 USB、网盘或 CI artifact 传回；如果临时用 Git 传产物，请使用单独 transfer 分支，Windows 侧取回后再清理。

Windows 发布机拿到产物后执行：

```powershell
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release\Build-UsbRelease.ps1 -Clean -SkipBuild
```

最终产物在：

```text
dist-usb/ClawHermes/
```

## macOS 真机验收

把 `dist-usb/ClawHermes` 作为 U 盘或 ISO 根目录里的 `DTC` 目录后，在 macOS 上执行：

```bash
cd /Volumes/<卷名>/DTC
chmod +x Start-ClawHermes-Mac.command Stop-ClawHermes-Mac.command
./Start-ClawHermes-Mac.command
```

预期结果：

- 只保留当前 U 盘实例的 UI，标题路径应指向 `/Volumes/<卷名>/DTC`。
- OpenClaw、Hermes Agent、Hermes Web UI、Portal 状态应进入 running/ready。
- Hermes Web UI 中发送消息不应再出现 `No module named 'dotenv'`。
- Hermes Agent 不应再出现 `API Server: aiohttp not installed`。

如果出现旧 UI 残留，先清理本机旧进程：

```bash
pkill -f "ClawHermes-Control-Mac|DTclaw Control|clawhermes.js|hermes_bridge.py" || true
```

常用排查日志：

```text
data/logs/macos-launcher.log
data/logs/electrobun-control.log
data/logs/electrobun-app-process.log
data/logs/launcher.log
data/logs/openclaw.log
data/logs/hermes-agent.log
data/logs/hermes-web-ui.log
data/home/.hermes-web-ui/logs/server.log
data/home/.hermes-web-ui/logs/bridge.log
```

如果 macOS 拦截从 U 盘打开的文件，可以在 `DTC` 目录下清理 quarantine：

```bash
xattr -rd com.apple.quarantine .
```
