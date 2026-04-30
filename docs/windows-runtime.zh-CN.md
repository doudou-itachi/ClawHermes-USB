# Windows Runtime 设计

## 目标

Windows runtime 设计目标是让 ClawHermes-USB 不依赖系统级 Node.js、Python 或 Git 安装。

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

## 预期可执行文件

```text
runtimes/windows/node/node.exe
runtimes/windows/python/python.exe
runtimes/windows/git/cmd/git.exe
```

不同便携 runtime 的实际路径可能不同。后续 runtime 校验应支持可配置可执行文件路径。

## 约束

- 除非显式允许，不调用全局安装的 `npm`、`python` 或 `git`。
- 不永久修改宿主机环境变量。
- 正常启动时不安装 Windows 服务。
- MVP 尽量不要求管理员权限。

## 已知风险

- Node native modules 可能需要 Visual C++ runtime 或预构建二进制。
- PTY 包在不同 Windows 版本上的行为可能不同。
- 可移动盘启动时可能被杀毒软件拖慢。
- 老版本 Windows 的长路径限制可能影响 package 安装。
