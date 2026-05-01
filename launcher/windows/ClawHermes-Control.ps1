param(
    [string]$UsbRoot,
    [switch]$SelfTest,
    [switch]$ClickSelfTest
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:NavItems = @(
    @{ Id = "overview"; Icon = "⌂"; Label = "总览" },
    @{ Id = "install"; Icon = "▣"; Label = "安装向导" },
    @{ Id = "start"; Icon = "▶"; Label = "启动服务" },
    @{ Id = "stop"; Icon = "■"; Label = "停止服务" },
    @{ Id = "open"; Icon = "↗"; Label = "打开界面" },
    @{ Id = "model"; Icon = "◉"; Label = "模型配置" },
    @{ Id = "logs"; Icon = "≡"; Label = "日志" },
    @{ Id = "backup"; Icon = "◆"; Label = "备份" },
    @{ Id = "repair"; Icon = "⚙"; Label = "修复 / 更新" }
)

$script:ThemeChoices = @(
    @{ Id = "system"; Label = "跟随系统" },
    @{ Id = "light"; Label = "浅色" },
    @{ Id = "dark"; Label = "深色" }
)

function Resolve-ClawHermesRoot {
    param([string]$Root)
    if (-not [string]::IsNullOrWhiteSpace($Root)) {
        return (Resolve-Path -LiteralPath $Root).Path
    }
    return (Resolve-Path -LiteralPath (Join-Path -Path $PSScriptRoot -ChildPath "..\..")).Path
}

function Get-GuiSettingsPath {
    param([string]$Root)
    return (Join-Path -Path $Root -ChildPath "data\settings\gui.json")
}

function Read-GuiSettings {
    param([string]$Root)
    $path = Get-GuiSettingsPath -Root $Root
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        try {
            return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
        } catch {
            return [pscustomobject]@{ theme = "system" }
        }
    }
    return [pscustomobject]@{ theme = "system" }
}

function Save-GuiSettings {
    param(
        [string]$Root,
        [string]$Theme
    )
    $path = Get-GuiSettingsPath -Root $Root
    $directory = Split-Path -Parent $path
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
        [void](New-Item -ItemType Directory -Path $directory -Force)
    }
    [pscustomobject]@{ theme = $Theme } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $path -Encoding UTF8
}

function Get-ThemePalette {
    param([string]$Theme)
    if ($Theme -eq "dark") {
        return @{
            Window = [System.Drawing.Color]::FromArgb(15, 23, 42)
            Surface = [System.Drawing.Color]::FromArgb(30, 41, 59)
            Text = [System.Drawing.Color]::FromArgb(241, 245, 249)
            Muted = [System.Drawing.Color]::FromArgb(148, 163, 184)
            Accent = [System.Drawing.Color]::FromArgb(14, 165, 233)
            Nav = [System.Drawing.Color]::FromArgb(2, 6, 23)
            NavButton = [System.Drawing.Color]::FromArgb(30, 41, 59)
        }
    }
    return @{
        Window = [System.Drawing.Color]::FromArgb(248, 250, 252)
        Surface = [System.Drawing.Color]::White
        Text = [System.Drawing.Color]::FromArgb(15, 23, 42)
        Muted = [System.Drawing.Color]::FromArgb(71, 85, 105)
        Accent = [System.Drawing.Color]::FromArgb(2, 132, 199)
        Nav = [System.Drawing.Color]::FromArgb(17, 24, 39)
        NavButton = [System.Drawing.Color]::FromArgb(31, 41, 55)
    }
}

function Invoke-ClawHermesHidden {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$Action,
        [string[]]$Arguments = @(),
        [switch]$Json
    )

    $dispatcher = Join-Path -Path $Root -ChildPath "core\windows\clawhermes.ps1"
    if (-not (Test-Path -LiteralPath $dispatcher -PathType Leaf)) {
        throw "Cannot find core dispatcher: $dispatcher"
    }

    $argumentList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $dispatcher, $Action, "-UsbRoot", $Root)
    if ($Json) {
        $argumentList += "-Json"
    }
    if ($Arguments) {
        $argumentList += $Arguments
    }

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "powershell"
    foreach ($argument in $argumentList) {
        [void]$startInfo.ArgumentList.Add($argument)
    }
    $startInfo.CreateNoWindow = $true
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($process.ExitCode -ne 0) {
        throw "命令执行失败：$Action`r`n$stderr"
    }

    if ($Json -and -not [string]::IsNullOrWhiteSpace($stdout)) {
        return ($stdout | ConvertFrom-Json)
    }
    return $stdout
}

function New-Label {
    param(
        [string]$Text,
        [int]$X,
        [int]$Y,
        [int]$Width = 500,
        [int]$Height = 24,
        [float]$Size = 10,
        [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
    )
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Text
    $label.Location = New-Object System.Drawing.Point($X, $Y)
    $label.Size = New-Object System.Drawing.Size($Width, $Height)
    $label.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", $Size, $Style)
    return $label
}

function New-ActionButton {
    param(
        [string]$Text,
        [int]$X,
        [int]$Y,
        [scriptblock]$OnClick,
        [int]$Width = 190
    )
    $button = New-Object System.Windows.Forms.Button
    $button.Text = $Text
    $button.Location = New-Object System.Drawing.Point($X, $Y)
    $button.Size = New-Object System.Drawing.Size($Width, 34)
    $button.FlatStyle = "Flat"
    $button.UseVisualStyleBackColor = $false
    $button.Add_Click($OnClick)
    return $button
}

function Format-Output {
    param([object]$Value)
    if ($null -eq $Value) {
        return ""
    }
    if ($Value -is [string]) {
        return $Value
    }
    return ($Value | ConvertTo-Json -Depth 8)
}

function Open-Url {
    param([string]$Url)
    [void][System.Diagnostics.Process]::Start($Url)
}

function Set-GuiOutput {
    param([string]$Text)
    if ($null -ne $script:GuiOutput) {
        $script:GuiOutput.Text = $Text
    }
}

function Invoke-GuiRunAction {
    param(
        [string]$Action,
        [string[]]$Arguments = @(),
        [switch]$Json
    )
    try {
        Set-GuiOutput -Text "正在执行：$Action`r`n请稍等，窗口不会弹出额外的命令行。"
        $result = Invoke-ClawHermesHidden -Root $script:GuiRoot -Action $Action -Arguments $Arguments -Json:$Json
        Set-GuiOutput -Text (Format-Output -Value $result)
    } catch {
        Set-GuiOutput -Text ("执行失败：`r`n" + $_.Exception.Message)
    }
}

function Update-GuiThemeFromBox {
    $selectedThemeId = switch ($script:GuiThemeBox.SelectedIndex) {
        0 { "system" }
        1 { "light" }
        2 { "dark" }
        default { $null }
    }
    if (-not [string]::IsNullOrWhiteSpace($selectedThemeId)) {
        $script:CurrentTheme = $selectedThemeId
        Save-GuiSettings -Root $script:GuiRoot -Theme $script:CurrentTheme
        if ($null -ne $script:GuiApplyTheme) {
            & $script:GuiApplyTheme -Theme $script:CurrentTheme
        }
    }
}

function Show-ClawHermesControl {
    param(
        [string]$Root,
        [switch]$ClickSelfTest
    )

    [System.Windows.Forms.Application]::EnableVisualStyles()

    $settings = Read-GuiSettings -Root $Root
    $script:CurrentTheme = [string]$settings.theme
    if ([string]::IsNullOrWhiteSpace($script:CurrentTheme)) {
        $script:CurrentTheme = "system"
    }

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "ClawHermes-USB 图形控制中心"
    $form.StartPosition = "CenterScreen"
    $form.Size = New-Object System.Drawing.Size(1100, 720)
    $form.MinimumSize = New-Object System.Drawing.Size(960, 640)
    $form.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)

    $nav = New-Object System.Windows.Forms.Panel
    $nav.Dock = "Left"
    $nav.Width = 230
    [void]$form.Controls.Add($nav)

    $content = New-Object System.Windows.Forms.Panel
    $content.Dock = "None"
    $content.Location = New-Object System.Drawing.Point($nav.Width, 0)
    $content.Size = New-Object System.Drawing.Size(($form.ClientSize.Width - $nav.Width), $form.ClientSize.Height)
    $content.Anchor = "Top,Bottom,Left,Right"
    [void]$form.Controls.Add($content)

    $title = New-Label -Text "ClawHermes" -X 18 -Y 18 -Width 190 -Height 28 -Size 14 -Style ([System.Drawing.FontStyle]::Bold)
    [void]$nav.Controls.Add($title)

    $subtitle = New-Label -Text "USB Control / 小白模式" -X 18 -Y 48 -Width 190 -Height 20 -Size 8
    [void]$nav.Controls.Add($subtitle)

    $header = New-Label -Text "总览" -X 28 -Y 24 -Width 780 -Height 36 -Size 18 -Style ([System.Drawing.FontStyle]::Bold)
    [void]$content.Controls.Add($header)

    $description = New-Label -Text "启动、停止、打开界面、安装向导、模型配置、日志、备份和修复都集中在这里。" -X 28 -Y 62 -Width 800 -Height 24 -Size 9
    [void]$content.Controls.Add($description)

    $page = New-Object System.Windows.Forms.Panel
    $page.Location = New-Object System.Drawing.Point(28, 96)
    $page.Size = New-Object System.Drawing.Size(790, 540)
    $page.Anchor = "Top,Bottom,Left,Right"
    [void]$content.Controls.Add($page)

    $output = New-Object System.Windows.Forms.TextBox
    $output.Multiline = $true
    $output.ReadOnly = $true
    $output.ScrollBars = "Vertical"
    $output.Location = New-Object System.Drawing.Point(0, 190)
    $output.Size = New-Object System.Drawing.Size(760, 320)
    $output.Anchor = "Top,Bottom,Left,Right"
    $script:GuiRoot = $Root
    $script:GuiOutput = $output

    $setOutput = {
        param([string]$Text)
        $output.Text = $Text
    }.GetNewClosure()

    $addInfoText = {
        param([string]$Text)
        $label = New-Label -Text $Text -X 0 -Y 0 -Width 760 -Height 96 -Size 10
        $label.AutoSize = $false
        $page.Controls.Add($label)
        return $label
    }.GetNewClosure()

    $clearPage = {
        $page.Controls.Clear()
        $output.Text = ""
        $page.Controls.Add($output)
    }.GetNewClosure()

    $showPage = {
        param([string]$Id)
        & $clearPage
        $header.Text = switch ($Id) {
            "overview" { "总览" }
            "install" { "安装向导" }
            "start" { "启动服务" }
            "stop" { "停止服务" }
            "open" { "打开界面" }
            "model" { "模型配置" }
            "logs" { "日志" }
            "backup" { "备份" }
            "repair" { "修复 / 更新" }
            default { "总览" }
        }

        switch ($Id) {
            "overview" {
                $description.Text = "查看服务状态、端口和常用入口。遇到问题时先看这里。"
                $null = & $addInfoText -Text "建议流程：第一次使用先进入“安装向导”，安装完成后点“启动服务”，再到“打开界面”。"
                $statusButton = New-ActionButton -Text "刷新状态" -X 0 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "status" -Json }).GetNewClosure()
                $openButton = New-ActionButton -Text "打开门户" -X 210 -Y 118 -OnClick ({ Open-Url -Url "http://127.0.0.1:17000/" }).GetNewClosure()
                [void]$page.Controls.Add($statusButton)
                [void]$page.Controls.Add($openButton)
                & $setOutput -Text "欢迎使用 ClawHermes-USB 图形控制中心。`r`n`r`n这里会显示执行结果和提示，后台命令会写入 data\logs。"
            }
            "install" {
                $description.Text = "面向新手的安装检查：先确认离线包和 WSL 计划，再执行导入。"
                $null = & $addInfoText -Text "按顺序点击下面按钮。导入 WSL 前会先显示计划，避免误操作。"
                [void]$page.Controls.Add((New-ActionButton -Text "检查安装向导" -X 0 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "setup-wizard" }).GetNewClosure()))
                [void]$page.Controls.Add((New-ActionButton -Text "检查 payloads" -X 205 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "payloads" }).GetNewClosure()))
                [void]$page.Controls.Add((New-ActionButton -Text "查看 WSL 导入计划" -X 410 -Y 118 -Width 220 -OnClick ({ Invoke-GuiRunAction -Action "wsl-import-plan" -Arguments @("--distro", "Ubuntu") }).GetNewClosure()))
                [void]$page.Controls.Add((New-ActionButton -Text "执行 WSL 导入" -X 0 -Y 156 -OnClick ({ Invoke-GuiRunAction -Action "wsl-import" -Arguments @("--distro", "Ubuntu", "--confirm-import") }).GetNewClosure()))
            }
            "start" {
                $description.Text = "启动 OpenClaw、Hermes Agent、Hermes Web UI 和本地门户。"
                $null = & $addInfoText -Text "点击后会在后台启动服务，不再弹出多个黑色命令行窗口。"
                [void]$page.Controls.Add((New-ActionButton -Text "启动服务" -X 0 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "start" }).GetNewClosure()))
                [void]$page.Controls.Add((New-ActionButton -Text "启动后刷新状态" -X 205 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "status" -Json }).GetNewClosure()))
            }
            "stop" {
                $description.Text = "停止当前由 ClawHermes 管理的服务。"
                $null = & $addInfoText -Text "停止只影响本项目启动的服务，不会删除 USB 数据。"
                [void]$page.Controls.Add((New-ActionButton -Text "停止服务" -X 0 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "stop" }).GetNewClosure()))
                [void]$page.Controls.Add((New-ActionButton -Text "查看状态" -X 205 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "status" -Json }).GetNewClosure()))
            }
            "open" {
                $description.Text = "打开各个本地 Web 界面。"
                $null = & $addInfoText -Text "如果页面打不开，请先启动服务并刷新状态。"
                [void]$page.Controls.Add((New-ActionButton -Text "打开 OpenClaw Chat" -X 0 -Y 118 -Width 220 -OnClick ({ Open-Url -Url "http://127.0.0.1:18789/" }).GetNewClosure()))
                [void]$page.Controls.Add((New-ActionButton -Text "打开 Hermes Web UI" -X 240 -Y 118 -Width 220 -OnClick ({ Open-Url -Url "http://127.0.0.1:8648/" }).GetNewClosure()))
                [void]$page.Controls.Add((New-ActionButton -Text "打开门户" -X 480 -Y 118 -OnClick ({ Open-Url -Url "http://127.0.0.1:17000/" }).GetNewClosure()))
            }
            "model" {
                $description.Text = "给 OpenClaw、Hermes 或两者同时配置模型。"
                $null = & $addInfoText -Text "填写 API URL / Base URL、模型名称和 API Key。保存时会隐藏密钥显示，只写入本项目 data 目录。"

                $apiUrlLabel = New-Label -Text "API URL / Base URL" -X 0 -Y 92 -Width 160 -Height 22
                $apiUrl = New-Object System.Windows.Forms.TextBox
                $apiUrl.Location = New-Object System.Drawing.Point(165, 90)
                $apiUrl.Size = New-Object System.Drawing.Size(360, 24)
                $apiUrl.Text = "https://api.example.com/v1"

                $modelLabel = New-Label -Text "模型名称" -X 0 -Y 124 -Width 160 -Height 22
                $model = New-Object System.Windows.Forms.TextBox
                $model.Location = New-Object System.Drawing.Point(165, 122)
                $model.Size = New-Object System.Drawing.Size(360, 24)

                $apiKeyLabel = New-Label -Text "API Key" -X 0 -Y 156 -Width 160 -Height 22
                $apiKey = New-Object System.Windows.Forms.TextBox
                $apiKey.Location = New-Object System.Drawing.Point(165, 154)
                $apiKey.Size = New-Object System.Drawing.Size(360, 24)
                $apiKey.UseSystemPasswordChar = $true

                $applyLabel = New-Label -Text "应用到" -X 540 -Y 92 -Width 80 -Height 22
                $apply = New-Object System.Windows.Forms.ComboBox
                $apply.DropDownStyle = "DropDownList"
                $apply.Location = New-Object System.Drawing.Point(600, 90)
                $apply.Size = New-Object System.Drawing.Size(120, 24)
                [void]$apply.Items.Add("both")
                [void]$apply.Items.Add("openclaw")
                [void]$apply.Items.Add("hermes")
                $apply.SelectedIndex = 0

                $saveButton = New-ActionButton -Text "保存模型配置" -X 540 -Y 122 -Width 180 -OnClick ({
                    Invoke-GuiRunAction -Action "model-config" -Arguments @(
                        "--provider-type", "openai-compatible",
                        "--api-url", $apiUrl.Text,
                        "--model", $model.Text,
                        "--api-key", $apiKey.Text,
                        "--apply", $apply.SelectedItem
                    ) -Json
                }).GetNewClosure()
                $statusButton = New-ActionButton -Text "查看已保存配置" -X 540 -Y 160 -Width 180 -OnClick ({ Invoke-GuiRunAction -Action "model-config-status" -Json }).GetNewClosure()

                foreach ($control in @($apiUrlLabel, $apiUrl, $modelLabel, $model, $apiKeyLabel, $apiKey, $applyLabel, $apply, $saveButton, $statusButton)) {
                    [void]$page.Controls.Add($control)
                }
            }
            "logs" {
                $description.Text = "查看日志目录和核心日志列表。"
                $null = & $addInfoText -Text "日志统一写在 data\logs，方便拷贝给技术支持排查。"
                [void]$page.Controls.Add((New-ActionButton -Text "列出日志" -X 0 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "logs" }).GetNewClosure()))
            }
            "backup" {
                $description.Text = "备份本项目的数据目录。"
                $null = & $addInfoText -Text "备份会保存用户数据和配置，不会修改系统环境。"
                [void]$page.Controls.Add((New-ActionButton -Text "创建备份" -X 0 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "backup" }).GetNewClosure()))
            }
            "repair" {
                $description.Text = "检查运行环境、离线包、上游源码和适配器状态。"
                $null = & $addInfoText -Text "修复 / 更新用于排查问题。普通用户通常只需要把这里的输出发给维护人员。"
                [void]$page.Controls.Add((New-ActionButton -Text "检查基础环境" -X 0 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "setup" }).GetNewClosure()))
                [void]$page.Controls.Add((New-ActionButton -Text "检查 runtimes" -X 205 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "runtimes" }).GetNewClosure()))
                [void]$page.Controls.Add((New-ActionButton -Text "检查 sources" -X 410 -Y 118 -OnClick ({ Invoke-GuiRunAction -Action "sources" }).GetNewClosure()))
            }
        }
    }.GetNewClosure()

    $applyTheme = {
        param([string]$Theme)
        $effectiveTheme = $Theme
        if ($effectiveTheme -eq "system") {
            $effectiveTheme = "light"
        }
        $palette = Get-ThemePalette -Theme $effectiveTheme
        $form.BackColor = $palette.Window
        $content.BackColor = $palette.Window
        $page.BackColor = $palette.Window
        $nav.BackColor = $palette.Nav
        $header.ForeColor = $palette.Text
        $description.ForeColor = $palette.Muted
        $title.ForeColor = [System.Drawing.Color]::White
        $subtitle.ForeColor = [System.Drawing.Color]::FromArgb(156, 163, 175)
        $output.BackColor = $palette.Surface
        $output.ForeColor = $palette.Text
        foreach ($control in $nav.Controls) {
            if ($control -is [System.Windows.Forms.Button]) {
                $control.BackColor = $palette.NavButton
                $control.ForeColor = [System.Drawing.Color]::White
            }
        }
        foreach ($control in $page.Controls) {
            if ($control -is [System.Windows.Forms.Label]) {
                $control.ForeColor = $palette.Text
            }
            if ($control -is [System.Windows.Forms.Button]) {
                $control.BackColor = $palette.Accent
                $control.ForeColor = [System.Drawing.Color]::White
            }
        }
    }.GetNewClosure()
    $script:GuiApplyTheme = $applyTheme

    $buttonTop = 86
    foreach ($item in $script:NavItems) {
        $button = New-Object System.Windows.Forms.Button
        $button.Text = "$($item["Icon"])  $($item["Label"])"
        $button.Tag = $item["Id"]
        $button.Location = New-Object System.Drawing.Point(14, $buttonTop)
        $button.Size = New-Object System.Drawing.Size(200, 38)
        $button.FlatStyle = "Flat"
        $button.UseVisualStyleBackColor = $false
        $button.Add_Click(({
            & $showPage -Id ([string]$this.Tag)
            & $applyTheme -Theme $script:CurrentTheme
        }).GetNewClosure())
        [void]$nav.Controls.Add($button)
        $buttonTop += 44
    }

    $themeLabel = New-Label -Text "主题" -X 18 -Y 560 -Width 60 -Height 20 -Size 8
    $themeLabel.ForeColor = [System.Drawing.Color]::FromArgb(156, 163, 175)
    [void]$nav.Controls.Add($themeLabel)

    $themeBox = New-Object System.Windows.Forms.ComboBox
    $themeBox.DropDownStyle = "DropDownList"
    $themeBox.Location = New-Object System.Drawing.Point(18, 584)
    $themeBox.Size = New-Object System.Drawing.Size(180, 24)
    $script:GuiThemeBox = $themeBox
    foreach ($choice in $script:ThemeChoices) {
        [void]$themeBox.Items.Add($choice.Label)
    }
    $selectedTheme = $null
    foreach ($choice in $script:ThemeChoices) {
        if ($choice["Id"] -eq $script:CurrentTheme) {
            $selectedTheme = $choice
            break
        }
    }
    if ($null -eq $selectedTheme) {
        $themeBox.SelectedIndex = 0
    } else {
        $themeBox.SelectedItem = $selectedTheme["Label"]
    }
    $themeChanged = { Update-GuiThemeFromBox }
    $themeBox.Add_SelectedIndexChanged($themeChanged)
    [void]$nav.Controls.Add($themeBox)

    $rootLabel = New-Label -Text $Root -X 18 -Y 620 -Width 190 -Height 38 -Size 7
    $rootLabel.ForeColor = [System.Drawing.Color]::FromArgb(156, 163, 175)
    [void]$nav.Controls.Add($rootLabel)

    & $showPage -Id "overview"
    & $applyTheme -Theme $script:CurrentTheme
    if ($ClickSelfTest) {
        $form.Show()
        [System.Windows.Forms.Application]::DoEvents()
        $initialHeader = $header.Text
        $modelButton = $nav.Controls | Where-Object { $_ -is [System.Windows.Forms.Button] -and $_.Tag -eq "model" } | Select-Object -First 1
        $modelButton.PerformClick()
        [System.Windows.Forms.Application]::DoEvents()
        $afterModelClickHeader = $header.Text
        $modelPageHasApiUrl = ($page.Controls | Where-Object { $_.Text -eq "API URL / Base URL" }).Count -gt 0
        $modelStatusButton = $page.Controls | Where-Object { $_ -is [System.Windows.Forms.Button] -and $_.Text -eq "查看已保存配置" } | Select-Object -First 1
        $modelStatusButton.PerformClick()
        [System.Windows.Forms.Application]::DoEvents()
        $modelStatusClickShowsFeedback = -not [string]::IsNullOrWhiteSpace($output.Text)
        $themeBox.SelectedIndex = 2
        & $themeChanged
        [System.Windows.Forms.Application]::DoEvents()
        $form.Close()
        return [pscustomobject]@{
            initialHeader = $initialHeader
            afterModelClickHeader = $afterModelClickHeader
            modelPageHasApiUrl = $modelPageHasApiUrl
            modelStatusClickShowsFeedback = $modelStatusClickShowsFeedback
            afterThemeClick = $script:CurrentTheme
            contentLeft = $content.Left
            navWidth = $nav.Width
        }
    }
    [void][System.Windows.Forms.Application]::Run($form)
}

$root = Resolve-ClawHermesRoot -Root $UsbRoot

if ($SelfTest) {
    [pscustomobject]@{
        root = $root
        nav = $script:NavItems.Label
        themes = $script:ThemeChoices.Label
        settingsPath = Get-GuiSettingsPath -Root $root
        actions = @("setup-wizard", "payloads", "wsl-import-plan", "wsl-import", "model-config", "model-config-status", "start", "stop", "status", "backup", "logs")
    } | ConvertTo-Json -Compress
    exit 0
}

if ($ClickSelfTest) {
    Show-ClawHermesControl -Root $root -ClickSelfTest | ConvertTo-Json -Compress
    exit 0
}

Show-ClawHermesControl -Root $root
