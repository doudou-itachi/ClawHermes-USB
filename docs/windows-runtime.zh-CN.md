# Windows Runtime 设计

## 目标

Windows runtime 的目标是让 ClawHermes-USB 不依赖系统级 Node.js、Python 或 Git 安装。

## Runtime 目录

```text
runtimes/windows/node/
runtimes/windows/python/
runtimes/windows/git/
```

## Launcher 行为

Windows launcher 应该：

1. 解析 `USB_ROOT`。
2. 校验 runtime 可执行文件。
3. 将 runtime 目录 prepend 到 `PATH`。
4. 设置便携 cache 和 home 变量。
5. 通过 orchestrator 启动服务。

可以通过以下命令查看 runtime 准备指引：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 runtimes -UsbRoot .
```

结构化输出：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 runtimes -UsbRoot . -Json
```

该命令不会下载二进制文件。它会读取 `config/defaults/runtimes.json`，告诉用户应该下载哪个包、解压到哪里，以及哪些可执行文件路径会被接受。

如果已经手动下载了本地 zip archive，可以用以下命令安装：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 install-runtime node --archive D:\downloads\node.zip -UsbRoot .
```

只预览、不解压：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 install-runtime node --archive D:\downloads\node.zip --dry-run -UsbRoot . -Json
```

`install-runtime` 当前支持 `.zip` archive。若 archive 内只有一个顶层目录，它会去掉这一层再复制内容，因此官方 `node-v*-win-x64.zip` 这类包可以干净地解压到 manifest 指定目录。

## 预期可执行文件

```text
runtimes/windows/node/node.exe
runtimes/windows/python/python.exe
runtimes/windows/git/cmd/git.exe
```

Runtime 校验由以下配置驱动：

```text
config/defaults/runtimes.json
```

该 manifest 记录 runtime 名称、版本策略、包类型、官方来源、安装目录、候选可执行文件路径和打包注意事项。这样 setup 诊断不需要把所有路径硬编码在代码里。

## 推荐 Runtime 包

### Node.js

使用官方 Windows standalone zip：

```text
https://nodejs.org/en/download
```

解压后应让 `node.exe` 位于：

```text
runtimes/windows/node/node.exe
```

当前项目记录 `lts` 版本策略，而不是在仓库中固定某个具体 Node 版本。

### Python

使用官方 Windows embeddable package：

```text
https://www.python.org/downloads/windows/
```

解压后应让 `python.exe` 位于：

```text
runtimes/windows/python/python.exe
```

Embeddable package 默认是隔离环境，并且不包含 pip。需要 Python 包的 service adapter 不应依赖宿主机 Python 或全局 pip。

### Git

使用 Git for Windows Portable，也就是 thumbdrive edition：

```text
https://git-scm.com/downloads/win
```

解压后应至少存在以下文件之一：

```text
runtimes/windows/git/cmd/git.exe
runtimes/windows/git/bin/git.exe
```

## 约束

- 除非显式允许，不调用全局安装的 `npm`、`python` 或 `git`。
- 不永久修改宿主机环境变量。
- 正常启动时不安装 Windows service。
- MVP 尽量不要求管理员权限。
- 不在日常启动中静默下载或更新 runtime payload。
- 不把 runtime 二进制提交到 git。

## 已知风险

- Node native modules 可能需要 Visual C++ runtime 或预构建二进制。
- PTY 包在不同 Windows 版本上的行为可能不同。
- 从可移动盘启动时可能被杀毒软件拖慢。
- 老版本 Windows 的长路径限制可能影响 package 安装。
