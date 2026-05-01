param(
    [string]$UsbRoot,
    [switch]$SelfTest
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
    @{ Id = "model"; Icon = "◇"; Label = "模型配置" },
    @{ Id = "logs"; Icon = "≡"; Label = "日志" },
    @{ Id = "backup"; Icon = "◌"; Label = "备份" },
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
        throw "Command failed: $Action`n$stderr"
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

function Show-ClawHermesControl {
    param([string]$Root)

    [System.Windows.Forms.Application]::EnableVisualStyles()

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "ClawHermes-USB 图形控制中心"
    $form.StartPosition = "CenterScreen"
    $form.Size = New-Object System.Drawing.Size(1040, 700)
    $form.MinimumSize = New-Object System.Drawing.Size(920, 620)
    $form.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)

    $nav = New-Object System.Windows.Forms.Panel
    $nav.Dock = "Left"
    $nav.Width = 220
    $nav.BackColor = [System.Drawing.Color]::FromArgb(17, 24, 39)
    [void]$form.Controls.Add($nav)

    $title = New-Label -Text "ClawHermes" -X 18 -Y 18 -Width 180 -Height 28 -Size 14 -Style ([System.Drawing.FontStyle]::Bold)
    $title.ForeColor = [System.Drawing.Color]::White
    [void]$nav.Controls.Add($title)

    $subtitle = New-Label -Text "USB Control / 小白模式" -X 18 -Y 48 -Width 180 -Height 20 -Size 8
    $subtitle.ForeColor = [System.Drawing.Color]::FromArgb(156, 163, 175)
    [void]$nav.Controls.Add($subtitle)

    $content = New-Object System.Windows.Forms.Panel
    $content.Dock = "Fill"
    $content.BackColor = [System.Drawing.Color]::FromArgb(241, 245, 249)
    [void]$form.Controls.Add($content)

    $status = New-Object System.Windows.Forms.TextBox
    $status.Multiline = $true
    $status.ReadOnly = $true
    $status.ScrollBars = "Vertical"
    $status.Location = New-Object System.Drawing.Point(24, 96)
    $status.Size = New-Object System.Drawing.Size(740, 460)
    $status.Text = "欢迎使用 ClawHermes-USB 图形控制中心。`r`n`r`n请从左侧选择功能。"
    [void]$content.Controls.Add($status)

    $header = New-Label -Text "总览" -X 24 -Y 24 -Width 720 -Height 34 -Size 18 -Style ([System.Drawing.FontStyle]::Bold)
    [void]$content.Controls.Add($header)

    $description = New-Label -Text "启动、停止、打开界面、安装向导、模型配置、日志、备份和修复都集中在这里。" -X 24 -Y 62 -Width 760 -Height 24 -Size 9
    [void]$content.Controls.Add($description)

    $buttonTop = 86
    foreach ($item in $script:NavItems) {
        $button = New-Object System.Windows.Forms.Button
        $button.Text = "$($item.Icon)  $($item.Label)"
        $button.Tag = $item
        $button.Location = New-Object System.Drawing.Point(14, $buttonTop)
        $button.Size = New-Object System.Drawing.Size(190, 38)
        $button.FlatStyle = "Flat"
        $button.ForeColor = [System.Drawing.Color]::White
        $button.BackColor = [System.Drawing.Color]::FromArgb(31, 41, 55)
        $button.Add_Click({
            $selected = $this.Tag
            $header.Text = [string]$selected.Label
            $status.Text = "当前页面：$($selected.Label)`r`n`r`n后续实现会在这里执行对应操作，并把详细日志写入 data\logs。"
        })
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
    foreach ($choice in $script:ThemeChoices) {
        [void]$themeBox.Items.Add($choice.Label)
    }
    $themeBox.SelectedIndex = 0
    [void]$nav.Controls.Add($themeBox)

    $rootLabel = New-Label -Text $Root -X 18 -Y 620 -Width 180 -Height 38 -Size 7
    $rootLabel.ForeColor = [System.Drawing.Color]::FromArgb(156, 163, 175)
    [void]$nav.Controls.Add($rootLabel)

    [void][System.Windows.Forms.Application]::Run($form)
}

$root = Resolve-ClawHermesRoot -Root $UsbRoot

if ($SelfTest) {
    [pscustomobject]@{
        root = $root
        nav = $script:NavItems.Label
        themes = $script:ThemeChoices.Label
        settingsPath = Get-GuiSettingsPath -Root $root
    } | ConvertTo-Json -Compress
    exit 0
}

Show-ClawHermesControl -Root $root
