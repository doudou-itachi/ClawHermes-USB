using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

internal static class ClawHermesControlLauncher
{
    private const string AppIdentifier = "dev.clawhermes.control";
    private const string Channel = "canary";
    private const string SetupFileName = "ClawHermes-Control-Electrobun-Setup.exe";

    [STAThread]
    private static int Main()
    {
        try
        {
            var usbRoot = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            var launcherPath = InstalledLauncherPath();

            if (NeedsInstall(usbRoot, launcherPath))
            {
                PrepareForInstall(launcherPath);
                InstallApp(usbRoot, launcherPath);
            }

            if (!IsAppReady(launcherPath))
            {
                ShowError("没有找到 Electrobun 控制面板运行文件，请确认同目录存在安装包。");
                return 1;
            }

            if (!IsProcessRunning(launcherPath))
            {
                StartProcess(launcherPath, usbRoot, usbRoot, false);
            }

            return 0;
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
            return 1;
        }
    }

    private static void InstallApp(string usbRoot, string launcherPath)
    {
        var setupPath = Path.Combine(usbRoot, SetupFileName);
        if (!File.Exists(setupPath))
        {
            throw new FileNotFoundException("没有找到 Electrobun 安装包。", setupPath);
        }

        using (var setup = StartProcess(setupPath, usbRoot, usbRoot, true))
        {
            var deadline = DateTime.UtcNow.AddSeconds(45);
            while (DateTime.UtcNow < deadline)
            {
                if (IsAppReady(launcherPath))
                {
                    WaitForStableFile(launcherPath);
                    WriteInstalledSetupHash(usbRoot, launcherPath);
                    if (!setup.HasExited)
                    {
                        setup.Kill();
                    }
                    return;
                }

                if (setup.HasExited && !IsAppReady(launcherPath))
                {
                    break;
                }

                Thread.Sleep(250);
            }
        }

        if (!IsAppReady(launcherPath))
        {
            throw new InvalidOperationException("Electrobun 控制面板安装未完成。");
        }
    }

    private static void PrepareForInstall(string launcherPath)
    {
        StopInstalledApp(launcherPath);
        var appRoot = InstalledAppRoot(launcherPath);
        DeleteDirectoryWithRetry(appRoot);
        DeleteDirectoryWithRetry(Path.Combine(Path.GetDirectoryName(appRoot), "self-extraction"));
    }

    private static void StopInstalledApp(string launcherPath)
    {
        var appRoot = InstalledAppRoot(launcherPath);
        foreach (var process in Process.GetProcesses())
        {
            try
            {
                if (!IsInstalledAppProcess(process, appRoot))
                {
                    continue;
                }

                process.Kill();
                process.WaitForExit(5000);
            }
            catch
            {
                // Best effort; stale processes are handled by the install timeout below.
            }
        }
    }

    private static bool IsInstalledAppProcess(Process process, string appRoot)
    {
        var name = process.ProcessName.ToLowerInvariant();
        if (name != "launcher" && name != "bun")
        {
            return false;
        }

        try
        {
            var modulePath = process.MainModule.FileName;
            return Path.GetFullPath(modulePath).StartsWith(appRoot, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static void DeleteDirectoryWithRetry(string path)
    {
        for (var i = 0; i < 12; i++)
        {
            try
            {
                if (!Directory.Exists(path))
                {
                    return;
                }

                Directory.Delete(path, true);
                return;
            }
            catch
            {
                Thread.Sleep(250);
            }
        }
    }

    private static bool NeedsInstall(string usbRoot, string launcherPath)
    {
        if (!IsAppReady(launcherPath))
        {
            return true;
        }

        var setupHash = ReadHash(Path.Combine(usbRoot, "ClawHermes-Control-Electrobun-Setup.metadata.json"));
        var installedHash = ReadInstalledSetupHash(launcherPath);

        return !string.IsNullOrWhiteSpace(setupHash)
            && !string.Equals(setupHash, installedHash, StringComparison.OrdinalIgnoreCase);
    }

    private static Process StartProcess(string fileName, string workingDirectory, string usbRoot, bool hidden)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = hidden,
            WindowStyle = hidden ? ProcessWindowStyle.Hidden : ProcessWindowStyle.Normal,
        };
        startInfo.EnvironmentVariables["CLAWHERMES_USB_ROOT"] = usbRoot;
        return Process.Start(startInfo);
    }

    private static string InstalledLauncherPath()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            AppIdentifier,
            Channel,
            "app",
            "bin",
            "launcher.exe");
    }

    private static bool IsAppReady(string launcherPath)
    {
        var appRoot = InstalledAppRoot(launcherPath);
        return new[]
        {
            launcherPath,
            Path.Combine(appRoot, "bin", "bun.exe"),
            Path.Combine(appRoot, "bin", "libNativeWrapper.dll"),
            Path.Combine(appRoot, "Resources", "main.js"),
            Path.Combine(appRoot, "Resources", "version.json"),
            Path.Combine(appRoot, "Resources", "app", "bun", "index.js"),
            Path.Combine(appRoot, "Resources", "app", "views", "mainview", "index.html"),
        }.All(File.Exists);
    }

    private static string ReadHash(string path)
    {
        if (!File.Exists(path))
        {
            return string.Empty;
        }

        var match = Regex.Match(File.ReadAllText(path), "\"hash\"\\s*:\\s*\"([^\"]+)\"");
        return match.Success ? match.Groups[1].Value : string.Empty;
    }

    private static string ReadInstalledSetupHash(string launcherPath)
    {
        var markerPath = InstalledSetupHashPath(launcherPath);
        return File.Exists(markerPath) ? File.ReadAllText(markerPath).Trim() : string.Empty;
    }

    private static void WriteInstalledSetupHash(string usbRoot, string launcherPath)
    {
        var setupHash = ReadHash(Path.Combine(usbRoot, "ClawHermes-Control-Electrobun-Setup.metadata.json"));
        if (string.IsNullOrWhiteSpace(setupHash))
        {
            return;
        }

        var markerPath = InstalledSetupHashPath(launcherPath);
        Directory.CreateDirectory(Path.GetDirectoryName(markerPath));
        File.WriteAllText(markerPath, setupHash);
    }

    private static string InstalledSetupHashPath(string launcherPath)
    {
        var appRoot = InstalledAppRoot(launcherPath);
        return Path.Combine(appRoot, "Resources", "clawhermes-setup-hash.txt");
    }

    private static string InstalledAppRoot(string launcherPath)
    {
        return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(launcherPath), ".."));
    }

    private static bool IsProcessRunning(string launcherPath)
    {
        var normalized = Path.GetFullPath(launcherPath);
        return Process.GetProcessesByName("launcher").Any(process =>
        {
            try
            {
                return string.Equals(Path.GetFullPath(process.MainModule.FileName), normalized, StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        });
    }

    private static void WaitForStableFile(string path)
    {
        var lastLength = -1L;
        for (var i = 0; i < 20; i++)
        {
            var length = new FileInfo(path).Length;
            if (length > 0 && length == lastLength)
            {
                return;
            }
            lastLength = length;
            Thread.Sleep(150);
        }
    }

    private static void ShowError(string message)
    {
        MessageBox.Show(message, "ClawHermes Control", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
