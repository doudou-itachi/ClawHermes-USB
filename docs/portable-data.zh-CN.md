# 便携数据策略

## 原则

ClawHermes-USB 将 U 盘项目目录视为应用状态的真实来源。

宿主机可能保留少量不可避免的痕迹，但 OpenClaw、Hermes Agent、Hermes Web UI、sessions、memory、skills、logs、workspace 文件和 runtime 缓存都应尽量被引导到项目 `data/` 目录。

## 主数据根目录

```text
data/
```

## 必需子目录

```text
data/home
data/openclaw
data/hermes
data/hermes-web-ui
data/shared-workspace
data/cache
data/tmp
data/logs
data/backups
```

## Windows 环境变量重定向

启动器应设置：

```bat
set HOME=%USB_ROOT%\data\home
set USERPROFILE=%USB_ROOT%\data\home
set APPDATA=%USB_ROOT%\data\home\AppData\Roaming
set LOCALAPPDATA=%USB_ROOT%\data\home\AppData\Local
set TEMP=%USB_ROOT%\data\tmp
set TMP=%USB_ROOT%\data\tmp
set HERMES_HOME=%USB_ROOT%\data\hermes
set npm_config_cache=%USB_ROOT%\data\cache\npm
set PIP_CACHE_DIR=%USB_ROOT%\data\cache\pip
set UV_CACHE_DIR=%USB_ROOT%\data\cache\uv
```

这些变量只在当前进程树中生效，不应写入宿主机系统环境。

## 允许的宿主机痕迹

- 使用宿主浏览器时产生的浏览器缓存和历史。
- Windows 最近文件元数据。
- 杀毒软件扫描记录。
- 防火墙提示。
- DNS 缓存或 OS 网络痕迹。

## 不允许依赖宿主机的内容

- 宿主机全局 npm 包。
- 宿主机 Python 包。
- OpenClaw 状态写入宿主机 profile。
- Hermes 状态写入宿主机 profile。
- Hermes Web UI 状态写入宿主机 profile。
- 日常使用必须安装 Windows 服务。

## 备份模式

### 数据备份

备份 `config/` 和重要 `data/` 目录。

### 完整便携备份

备份整个项目，排除可丢弃临时文件。

## U 盘设备绑定

ClawHermes 可以把生成后的交付包绑定到第一次启动托管服务的 U 盘设备。绑定文件为：

```text
data/settings/device-binding.json
```

发布脚本会刻意生成未绑定的交付包，不会把开发机或母包里的绑定文件带入最终产物。第一次执行 `start` 或 `start-adapter --confirm-start` 时，ClawHermes 会记录当前 U 盘设备指纹的哈希；后续启动时，只有当前 U 盘指纹和已保存绑定一致才允许继续。

这个绑定用于常规交付管控和避免误复制，不等同于加密授权。系统不会保存原始 U 盘序列号或测试指纹，只保存哈希和简短来源说明。

如果要用同一份母包复制到多个 U 盘，不要在复制前从母包目录启动服务。若打包或测试时不小心让母包生成了绑定文件，请先删除 `data/settings/device-binding.json`，或重新生成发布包后再复制到其它 U 盘。
