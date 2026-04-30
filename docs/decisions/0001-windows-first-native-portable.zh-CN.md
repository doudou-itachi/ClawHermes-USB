# 决策 0001：Windows 优先的原生便携包

## 状态

已接受。

## 背景

项目需要从 U 盘运行，并尽量减少宿主机依赖和宿主机磁盘占用。Docker 可以简化隔离，但会要求宿主机安装 Docker Desktop 或 Docker Engine。

用户希望先支持 Windows，并为未来 macOS 扩展留出空间。

## 决策

ClawHermes-USB 将使用 Windows 优先的原生便携包作为主架构。

U 盘项目将包含：

- 便携 runtimes
- 上游应用目录
- 数据目录
- launchers
- 服务 adapters
- 本地 portal

Docker 后续可以作为可选模式考虑，但不是 MVP 主路径。

## 影响

正面：

- 更符合 U 盘便携目标。
- 避免强依赖 Docker。
- 数据更容易留在项目目录内。
- 整个目录更容易移动和备份。

负面：

- runtime 打包责任更重。
- Windows 下 Node/Python 原生依赖可能更难处理。
- 上游工具可能仍假设宿主机 home 路径。

缓解：

- 使用进程局部环境变量重定向。
- 保持 adapter 显式。
- 在接入上游工具前，先验证 runtime 和路径行为。
