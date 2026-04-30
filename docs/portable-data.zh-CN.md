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
