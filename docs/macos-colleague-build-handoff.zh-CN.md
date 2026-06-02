# macOS 同事构建交付说明

本文档用于给使用 macOS 的同事执行构建。目标不是重新打 Windows 包，而是补齐 Windows 无法可靠生成的 macOS 产物，再把这些产物交回 Windows 发布机生成最终 USB/ISO 内容。

## 为什么需要 macOS 构建

Windows 可以完成 `dist-usb/ClawHermes` 的整体打包，也可以携带同一套业务 payload；但下面这些内容必须在 macOS 或 macOS CI 上构建、准备或验证：

- Electrobun 原生 UI 的 `.app`。它包含 macOS 平台的应用壳、Bun/Electrobun 打包结果和平台相关可执行文件，Windows 不能可靠生成和验证。
- Hermes Agent 的 macOS Python vendor 依赖。Windows `.venv` 不能直接在 macOS 上复用。
- Hermes Web UI 的 macOS 原生 Node 依赖，例如 `node-pty` 的 `darwin-arm64` 预编译模块。
- macOS Node/Python portable runtime archive。USB 首次运行时会解压到 `DTC/runtimes/macos/...`。

最近一次 macOS 真机现象是：Portal 和服务可以启动，`http://127.0.0.1:17000/` 能访问，但 Electrobun app 进程没有创建可见窗口。代码里已经增加了 macOS 启动日志和“先显示窗口、再启动控制服务”的修复；旧 `.app` 不会自动包含这些修复，所以必须在 macOS 上重新构建 `.app`。

## 需要构建什么

Apple Silicon Mac 当前至少需要准备这些产物：

```text
launcher/electrobun/build/canary-macos-arm64/DTclaw Control-canary.app
apps/hermes-agent/vendor/darwin-arm64/
apps/hermes-web-ui/dist/server/index.js
apps/hermes-web-ui/node_modules/node-pty/prebuilds/darwin-arm64/pty.node
runtime-archives/macos/node-v24-darwin-arm64.tar.gz
runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
```

如果要支持 Intel Mac，还需要额外准备对应的 `darwin-x64` 产物和 runtime archive。当前主线优先覆盖 Apple Silicon `darwin-arm64`。

## 拉取最新代码

```bash
git fetch origin
git checkout codex/macos-electrobun-usb-release
git pull --ff-only
git log --oneline -3
```

确认最近提交里能看到类似内容：

```text
37a1c8e fix: show macos electrobun window before control startup
```

## 构建 Electrobun macOS UI

```bash
cd launcher/electrobun
npm install
npm run typecheck
npm run build:mac:arm64
```

构建完成后检查 `.app` 是否存在：

```bash
test -d "build/canary-macos-arm64/DTclaw Control-canary.app"
```

如果实际输出目录名略有不同，请在 `launcher/electrobun/build/` 下查找最新生成的 `.app`，交回 Windows 时最终会被复制为：

```text
dist-usb/ClawHermes/ClawHermes-Control-Mac.app
```

## 准备 Hermes Agent macOS vendor

```bash
cd ../../apps/hermes-agent
rm -rf vendor/darwin-arm64
python3 -m pip install --upgrade pip
python3 -m pip install --target vendor/darwin-arm64 .
test -d vendor/darwin-arm64
```

这个目录是给 USB 上的 portable Python 使用的，不要用 Windows `.venv` 替代。

## 准备 Hermes Web UI macOS payload

```bash
cd ../hermes-web-ui
npm install
npm run build
test -f dist/server/index.js
test -f node_modules/node-pty/prebuilds/darwin-arm64/pty.node
```

`apps/hermes-web-ui/node_modules/` 里会包含 macOS 原生依赖。Windows 发布机后续打包时应使用 `-SkipBuild`，避免在 Windows 上重新覆盖这份 macOS 依赖。

## 检查 macOS portable runtime archive

仓库本地或交付目录中应存在：

```bash
test -f runtime-archives/macos/node-v24-darwin-arm64.tar.gz
test -f runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
```

这两个 archive 需要能在 USB 首次运行时解压成：

```text
runtimes/macos/node/darwin-arm64/bin/node
runtimes/macos/python/darwin-arm64/bin/python3
```

如果 archive 缺失，先不要交付最终包；需要补齐后再让 Windows 发布机打包。

## 构建后自检清单

在仓库根目录执行：

```bash
test -d "launcher/electrobun/build/canary-macos-arm64/DTclaw Control-canary.app"
test -d apps/hermes-agent/vendor/darwin-arm64
test -f apps/hermes-web-ui/dist/server/index.js
test -f apps/hermes-web-ui/node_modules/node-pty/prebuilds/darwin-arm64/pty.node
test -f runtime-archives/macos/node-v24-darwin-arm64.tar.gz
test -f runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
```

全部通过后，把这些产物交回 Windows 发布机：

```text
launcher/electrobun/build/
launcher/electrobun/artifacts/
apps/hermes-agent/vendor/darwin-arm64/
apps/hermes-web-ui/dist/
apps/hermes-web-ui/node_modules/
runtime-archives/macos/node-v24-darwin-arm64.tar.gz
runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
```

不要把这些大产物提交到当前功能分支。推荐通过 USB、网盘或 CI artifact 传回；如果临时用 Git 传产物，请使用单独的临时 transfer 分支，Windows 侧取回后再清理。

## Windows 发布机后续动作

Windows 侧拿到 macOS 产物后，在仓库根目录执行：

```powershell
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release\Build-UsbRelease.ps1 -Clean -SkipBuild
```

最终产物在：

```text
dist-usb/ClawHermes/
```

release 脚本会把 `.app` 复制为 `ClawHermes-Control-Mac.app`，并额外生成 `ClawHermes-Control-Mac.app.tar.gz`。两个文件都要保留在最终 `DTC` 目录里；部分 ISO/USB 写入工具可能会漏掉 `.app` 目录，macOS 启动脚本会用 `.tar.gz` 自动恢复。

再把 `dist-usb/ClawHermes` 作为 `DTC` 目录，和 ISO 根目录入口文件一起放到 U 盘或 ISO 根目录。

## macOS 真机验证

在 USB 或测试卷上执行：

```bash
cd /Volumes/<卷名>/DTC
chmod +x Start-ClawHermes-Mac.command Stop-ClawHermes-Mac.command
./Start-ClawHermes-Mac.command
```

预期结果：

- 优先弹出 `ClawHermes-Control-Mac.app` 的 Electrobun 原生 UI。
- 服务启动后，`http://127.0.0.1:17000/` 也可以作为浏览器 Portal fallback 访问。
- 如果没有弹出 Electrobun UI，需要查看 `data/logs/macos-launcher.log` 和 `data/logs/electrobun-control.log`。

常用日志：

```text
data/logs/macos-launcher.log
data/logs/electrobun-control.log
data/logs/launcher.log
data/logs/portal.log
data/logs/openclaw.log
data/logs/hermes-agent.log
data/logs/hermes-web-ui.log
```

如果 macOS 提示拦截或无法打开，可以在 `DTC` 目录下先清理 quarantine：

```bash
xattr -rd com.apple.quarantine .
```
