# macOS Electrobun 构建与跨平台 USB 发布流程

本文档说明如何在 Windows 和 macOS 之间协作生成同一个 `dist-usb/ClawHermes` 产物。

## 目标产物

最终 USB 目录保持一套 shared payload：

```text
dist-usb/ClawHermes/
  ClawHermes-Control.exe
  Start-ClawHermes-Mac.command
  Stop-ClawHermes-Mac.command
  ClawHermes-Control-Mac.app/

  core/
  adapters/
  apps/
  portal/
  config/
  data/
  skills/

  runtimes/windows/
  runtimes/macos/
  runtime-archives/macos/
```

其中：

- Windows 用户双击 `ClawHermes-Control.exe`。
- macOS 用户双击 `Start-ClawHermes-Mac.command`。
- 如果 `ClawHermes-Control-Mac.app` 存在，macOS 启动脚本优先打开 Electrobun UI。
- 如果 `.app` 不存在，macOS 启动脚本回退打开浏览器 Portal。

## 仓库与产物边界

macOS 构建产物和 runtime archive 不提交到 git，只作为构建机本地文件参与 release：

```text
launcher/electrobun/build/
launcher/electrobun/artifacts/
runtime-archives/macos/*.tar.gz
apps/hermes-agent/vendor/darwin-*/
apps/hermes-web-ui/dist/
apps/hermes-web-ui/node_modules/
```

这些目录在 macOS 构建机或发布机上准备好即可。代码仓库只保存启动脚本、adapter 配置、release 脚本、文档和测试。

## 哪些步骤能在 Windows 上完成

Windows 构建机可以完成：

- shared payload 打包：`core/`、`adapters/`、`apps/`、`portal/`、`config/`、`skills/`
- Windows 控制台入口：`ClawHermes-Control.exe`
- macOS `.command` 启动脚本复制
- macOS runtime archive 携带
- release manifest 生成
- 跨平台路径、runtime manifest、adapter override 的单元测试

执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release\Build-UsbRelease.ps1 -Clean
```

生成目录：

```text
dist-usb/ClawHermes/
```

## 哪些步骤需要 macOS 或 macOS CI

如果要让 macOS 也像 Windows 一样启动 Electrobun 原生 UI，需要在 macOS 或 macOS CI 上构建 `.app`：

```bash
cd launcher/electrobun
npm install
npm run build:mac
```

按架构单独构建：

```bash
# Apple Silicon
npm run build:mac:arm64

# Intel Mac
npm run build:mac:x64
```

构建产物通常位于：

```text
launcher/electrobun/build/canary-mac-arm64/DTclaw Control.app
```

或类似的 `canary-mac-*` 目录。

## 合并 macOS `.app` 到 USB 产物

推荐方式是在 macOS 构建出 `.app` 后，把 `.app` 放回仓库对应构建目录，然后在 Windows 上重新跑发布脚本。发布脚本会自动复制第一个找到的 `.app`：

```text
dist-usb/ClawHermes/ClawHermes-Control-Mac.app
```

也可以在 Windows 已经生成好 `dist-usb` 后手动复制：

```text
launcher/electrobun/build/.../DTclaw Control.app
  -> dist-usb/ClawHermes/ClawHermes-Control-Mac.app
```

## macOS Node runtime archive

macOS 启动脚本会优先使用：

```text
runtimes/macos/node/darwin-arm64/bin/node
runtimes/macos/node/darwin-x64/bin/node
```

如果不存在，会从以下 archive 首次解压：

```text
runtime-archives/macos/node-v24-darwin-arm64.tar.gz
runtime-archives/macos/node-v24-darwin-x64.tar.gz
```

准备 archive 时，使用 Node.js 官方 macOS tarball，并重命名为上述文件名。启动脚本会解压到：

```text
runtimes/macos/node/darwin-arm64/
runtimes/macos/node/darwin-x64/
```

## macOS Python runtime 与 Hermes Agent

Hermes Agent 在 macOS 上不复用 Windows `.venv`，而是使用 macOS `python3` 和可移动依赖目录：

```text
apps/hermes-agent/vendor/darwin-arm64/
apps/hermes-agent/vendor/darwin-x64/
```

在 macOS 构建机上准备 Apple Silicon 依赖：

```bash
cd apps/hermes-agent
python3 -m pip install --upgrade pip
python3 -m pip install --target vendor/darwin-arm64 .
```

Intel Mac 对应把目标目录改为 `vendor/darwin-x64`。发布包还可以携带 Python runtime archive，启动脚本会按当前架构首次解压：

```text
runtime-archives/macos/python-3.11-darwin-arm64.tar.gz
runtime-archives/macos/python-3.11-darwin-x64.tar.gz
```

Hermes Web UI 在 macOS 上仍使用同一份 `dist/server`，但需要在 macOS 构建机上准备兼容依赖并构建：

```bash
cd apps/hermes-web-ui
npm install
npm run build
```

## macOS 真机验证

在 macOS 上拉取分支后：

```bash
git checkout codex/macos-electrobun-usb-release
cd launcher/electrobun
npm install
npm run build:mac:arm64
```

准备或复制 `runtime-archives/macos/node-v24-darwin-arm64.tar.gz` 和 `runtime-archives/macos/python-3.11-darwin-arm64.tar.gz` 后，将发布目录放到 USB 或本地测试目录，执行：

```bash
cd dist-usb/ClawHermes
chmod +x Start-ClawHermes-Mac.command Stop-ClawHermes-Mac.command
./Start-ClawHermes-Mac.command
```

验证点：

- 首次运行能解压 macOS Node runtime 和 Python runtime。
- `core/node/dist/clawhermes.js start --json` 能正常启动。
- Hermes Agent 的 `http://127.0.0.1:8642/health` 返回 200。
- Hermes Web UI 的 `http://127.0.0.1:8648` 可以打开。
- 有 `ClawHermes-Control-Mac.app` 时会打开 Electrobun UI。
- 没有 `.app` 时会打开浏览器 Portal。
- `Stop-ClawHermes-Mac.command` 能停止服务。

如果 macOS 阻止运行，可先清理 quarantine：

```bash
xattr -rd com.apple.quarantine .
```

## 当前限制

- Windows 上不能可靠生成和验证 macOS `.app`。
- 未签名 `.app` 可能触发 Gatekeeper 提示。
- 签名、公证、Intel/Apple Silicon 双架构分发需要后续在 macOS CI 或真实 Mac 上完善。
