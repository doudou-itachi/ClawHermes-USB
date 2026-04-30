# macOS 路线图

## 状态

macOS 不属于第一版可运行里程碑。项目结构提前保留 macOS 目录，是为了未来支持时不需要重构仓库。

## 未来目录

```text
launcher/macos/
runtimes/macos/node/
runtimes/macos/python/
runtimes/macos/git/
scripts/setup/macos/
```

## 策略

macOS 支持应复用：

- `config/`
- `adapters/`
- `apps/`
- `data/`
- `portal/`
- 大部分 `core/`

平台差异应限制在：

- launcher 脚本
- runtime 打包
- 进程处理细节
- 浏览器打开逻辑
- 权限和 quarantine 处理

## 已知差异

- 需要可执行权限位。
- 下载的二进制可能带 quarantine 属性。
- PTY 行为不同。
- 路径使用 `/` 分隔符。
- shell 启动和 env 加载方式不同。
- Python packaging 可能使用不同 wheel。

## 设计规则

不要在 adapter 描述文件中写入 Windows-only 假设。使用相对路径和平台特定 launcher。
