# Cross-Platform USB Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one `dist-usb/ClawHermes` payload that runs on Windows and macOS with shared business payloads and platform-specific launchers/runtimes.

**Architecture:** Keep `core`, `adapters`, `apps`, `portal`, `config`, and `data` shared. Add small platform/runtime selection helpers in Node core, keep platform differences in runtime manifests and adapter overrides, and expose Windows `.exe` plus macOS `.command`/Electrobun `.app` entrypoints at the release root.

**Tech Stack:** TypeScript Node16 modules, Python `unittest`, PowerShell release builder, POSIX shell macOS launchers, Electrobun 1.16.0.

---

## File Structure

- Create `core/node/src/platform.ts`: platform id, arch id, path separator, browser open command, and runtime path helpers.
- Modify `core/node/src/portable.ts`: use platform helper for PATH and runtime directories.
- Modify `core/node/src/runtimes.ts`: select runtime entries by current or injected platform/arch.
- Modify `core/node/src/adapters.ts`: apply `platformOverrides[platform]` while loading adapter descriptors.
- Modify `core/node/src/types.ts`: add platform-aware runtime and adapter override types.
- Modify `config/defaults/runtimes.json`: describe Windows and macOS Node candidates in one manifest.
- Modify `launcher/macos/Start.command`: real macOS bootstrap that prepares Node, starts core, and opens Electrobun app or Portal.
- Modify `launcher/macos/Stop.command`: stop control server/services through portable Node.
- Modify `launcher/electrobun/package.json`: add macOS build scripts.
- Modify `launcher/electrobun/src/bun/index.ts`: resolve portable Node on Windows/macOS and use it for sync health probes.
- Modify `scripts/release/Build-UsbRelease.ps1`: copy macOS launchers, runtime archives, and macOS Electrobun `.app` when present.
- Modify `tests/test_windows_core.py`: add focused tests for cross-platform manifest, adapter overrides, macOS launchers, Electrobun Node resolution, and release builder output.

---

### Task 1: Platform Helper And Portable PATH

**Files:**
- Create: `core/node/src/platform.ts`
- Modify: `core/node/src/portable.ts`
- Modify: `core/node/src/types.ts`
- Test: `tests/test_windows_core.py`

- [ ] **Step 1: Write the failing tests**

Add these tests near existing runtime/setup tests in `tests/test_windows_core.py`:

```python
    def test_portable_env_uses_platform_specific_runtime_paths(self):
        script = """
import { portableEnv } from './core/node/dist/portable.js';
const win = portableEnv('C:/usb', { platform: 'win32', arch: 'x64' });
const mac = portableEnv('/Volumes/USB/ClawHermes', { platform: 'darwin', arch: 'arm64' });
console.log(JSON.stringify({ winPath: win.PATH, macPath: mac.PATH }));
"""
        result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertIn("runtimes\\windows\\node", payload["winPath"])
        self.assertIn("runtimes/macos/node/darwin-arm64/bin", payload["macPath"].replace("\\", "/"))
        self.assertIn(":", payload["macPath"])
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run build
python -m unittest tests.test_windows_core.TestWindowsCore.test_portable_env_uses_platform_specific_runtime_paths -v
```

Expected: fail because `portableEnv` does not accept an injected platform and always returns Windows runtime PATH entries.

- [ ] **Step 3: Write minimal implementation**

Create `core/node/src/platform.ts`:

```ts
import { join } from "node:path";

export type SupportedPlatform = "windows" | "darwin" | "linux";
export type SupportedArch = "x64" | "arm64";

export type PlatformProbe = {
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
};

export type PlatformInfo = {
  id: SupportedPlatform;
  nodePlatform: NodeJS.Platform;
  arch: SupportedArch;
  runtimeKey: string;
  pathSeparator: ";" | ":";
  executableSuffix: string;
};

export function detectPlatform(probe: PlatformProbe = {}): PlatformInfo {
  const nodePlatform = probe.platform ?? process.platform;
  const nodeArch = probe.arch ?? process.arch;
  const id: SupportedPlatform = nodePlatform === "win32" ? "windows" : nodePlatform === "darwin" ? "darwin" : "linux";
  const arch: SupportedArch = nodeArch === "arm64" ? "arm64" : "x64";
  return {
    id,
    nodePlatform,
    arch,
    runtimeKey: id === "darwin" ? `darwin-${arch}` : id,
    pathSeparator: id === "windows" ? ";" : ":",
    executableSuffix: id === "windows" ? ".exe" : "",
  };
}

export function runtimePathEntries(usbRoot: string, info = detectPlatform()): string[] {
  if (info.id === "darwin") {
    return [
      join(usbRoot, "runtimes", "macos", "node", info.runtimeKey, "bin"),
      join(usbRoot, "runtimes", "macos", "python", info.runtimeKey, "bin"),
      join(usbRoot, "runtimes", "macos", "git", info.runtimeKey, "bin"),
    ];
  }
  return [
    join(usbRoot, "runtimes", "windows", "node"),
    join(usbRoot, "runtimes", "windows", "python"),
    join(usbRoot, "runtimes", "windows", "git", "cmd"),
  ];
}
```

Modify `portableEnv` to accept `probe?: PlatformProbe`, call `detectPlatform(probe)`, and build PATH with `runtimePathEntries(root, platform).concat(process.env.PATH ?? "").join(platform.pathSeparator)`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run build
python -m unittest tests.test_windows_core.TestWindowsCore.test_portable_env_uses_platform_specific_runtime_paths -v
```

Expected: pass.

---

### Task 2: Runtime Manifest Platform Selection

**Files:**
- Modify: `core/node/src/runtimes.ts`
- Modify: `core/node/src/types.ts`
- Modify: `config/defaults/runtimes.json`
- Test: `tests/test_windows_core.py`

- [ ] **Step 1: Write the failing test**

```python
    def test_runtime_diagnostics_selects_darwin_arm64_candidates(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            (temp_root / "config" / "defaults" / "runtimes.json").write_text(json.dumps({
                "platform": "multi",
                "runtimes": [
                    {
                        "name": "node",
                        "label": "Portable Node.js",
                        "versionPolicy": "lts",
                        "packageType": "official",
                        "sourceUrl": "https://nodejs.org/en/download",
                        "installDir": "runtimes/windows/node",
                        "candidates": ["runtimes/windows/node/node.exe"],
                        "platforms": {
                            "darwin-arm64": {
                                "installDir": "runtimes/macos/node/darwin-arm64",
                                "candidates": ["runtimes/macos/node/darwin-arm64/bin/node"]
                            }
                        },
                        "notes": "portable node"
                    }
                ]
            }, indent=2), encoding="utf-8")
            script = f"""
import {{ runtimeDiagnostics }} from './core/node/dist/runtimes.js';
const diagnostics = runtimeDiagnostics({json.dumps(str(temp_root))}, {{ platform: 'darwin', arch: 'arm64' }});
console.log(JSON.stringify(diagnostics[0]));
"""
            result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True, capture_output=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostic = json.loads(result.stdout)
            self.assertIn("runtimes/macos/node/darwin-arm64/bin/node", diagnostic["path"].replace("\\", "/"))
        finally:
            temp_dir.cleanup()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run build
python -m unittest tests.test_windows_core.TestWindowsCore.test_runtime_diagnostics_selects_darwin_arm64_candidates -v
```

Expected: fail because runtime selection ignores `platforms`.

- [ ] **Step 3: Write minimal implementation**

Extend the runtime manifest item type with:

```ts
platforms?: Record<string, {
  packageType?: string;
  sourceUrl?: string;
  installDir?: string;
  candidates?: string[];
  notes?: string;
}>;
```

Add `resolveRuntimeForPlatform(runtime, probe)` in `runtimes.ts` that uses `detectPlatform(probe).runtimeKey`, merges `runtime.platforms?.[runtimeKey]` over the base runtime, and keep existing base fields as fallback.

Change `runtimeDiagnostics`, `runtimePreparationPlan`, and `installRuntimeFromArchive` to accept `probe?: PlatformProbe` and use resolved runtime entries.

Update `config/defaults/runtimes.json` so `node` has:

```json
"platforms": {
  "darwin-arm64": {
    "packageType": "official-macos-tar-gz",
    "installDir": "runtimes/macos/node/darwin-arm64",
    "candidates": ["runtimes/macos/node/darwin-arm64/bin/node"]
  },
  "darwin-x64": {
    "packageType": "official-macos-tar-gz",
    "installDir": "runtimes/macos/node/darwin-x64",
    "candidates": ["runtimes/macos/node/darwin-x64/bin/node"]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run build
python -m unittest tests.test_windows_core.TestWindowsCore.test_runtime_diagnostics_selects_darwin_arm64_candidates -v
```

Expected: pass.

---

### Task 3: Adapter Platform Overrides

**Files:**
- Modify: `core/node/src/adapters.ts`
- Modify: `core/node/src/types.ts`
- Test: `tests/test_windows_core.py`

- [ ] **Step 1: Write the failing test**

```python
    def test_load_adapters_applies_darwin_platform_overrides(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            adapter_path = temp_root / "adapters" / "fake-service" / "adapter.json"
            adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
            adapter["platformOverrides"] = {
                "darwin": {
                    "runtime": {"kind": "node", "platform": "darwin", "requiredExecutable": "node"},
                    "commands": {"start": "node mac-service.js"},
                    "env": {"variables": {"FAKE_PLATFORM": "darwin"}}
                }
            }
            adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")
            script = f"""
import {{ loadAdapters }} from './core/node/dist/adapters.js';
const adapters = loadAdapters({json.dumps(str(temp_root))}, {{ platform: 'darwin', arch: 'arm64' }});
console.log(JSON.stringify(adapters[0]));
"""
            result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True, capture_output=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            adapter = json.loads(result.stdout)
            self.assertEqual(adapter["runtime"]["platform"], "darwin")
            self.assertEqual(adapter["commands"]["start"], "node mac-service.js")
            self.assertEqual(adapter["env"]["variables"]["FAKE_PLATFORM"], "darwin")
        finally:
            temp_dir.cleanup()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run build
python -m unittest tests.test_windows_core.TestWindowsCore.test_load_adapters_applies_darwin_platform_overrides -v
```

Expected: fail because `loadAdapters` ignores `platformOverrides`.

- [ ] **Step 3: Write minimal implementation**

Add `platformOverrides?: Record<string, Partial<Pick<AdapterDescriptor, "runtime" | "commands" | "env" | "health" | "portal" | "integration">>>` to `AdapterDescriptor`.

Change `loadAdapters(usbRoot, probe?)` to resolve platform with `detectPlatform(probe).id` and apply a shallow object merge plus nested merge for `commands`, `env.variables`, and `env.files`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run build
python -m unittest tests.test_windows_core.TestWindowsCore.test_load_adapters_applies_darwin_platform_overrides -v
```

Expected: pass.

---

### Task 4: macOS Launchers

**Files:**
- Modify: `launcher/macos/Start.command`
- Modify: `launcher/macos/Stop.command`
- Test: `tests/test_windows_core.py`

- [ ] **Step 1: Write the failing test**

```python
    def test_macos_launchers_prepare_runtime_and_prefer_electrobun_app(self):
        start = (ROOT / "launcher" / "macos" / "Start.command").read_text(encoding="utf-8")
        stop = (ROOT / "launcher" / "macos" / "Stop.command").read_text(encoding="utf-8")
        self.assertIn("uname -m", start)
        self.assertIn("darwin-arm64", start)
        self.assertIn("darwin-x64", start)
        self.assertIn("xattr -rd com.apple.quarantine", start)
        self.assertIn("runtime-archives/macos", start)
        self.assertIn("tar -xzf", start)
        self.assertIn("clawhermes.js", start)
        self.assertIn("ClawHermes-Control-Mac.app", start)
        self.assertIn("open \"$APP_PATH\"", start)
        self.assertIn("api/shutdown", stop)
        self.assertIn("runtimes/macos/node", stop)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m unittest tests.test_windows_core.TestWindowsCore.test_macos_launchers_prepare_runtime_and_prefer_electrobun_app -v
```

Expected: fail because launchers only print the reserved macOS support message.

- [ ] **Step 3: Write minimal implementation**

Replace `Start.command` with a POSIX shell script that:

```sh
#!/usr/bin/env sh
set -u
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) PLATFORM="darwin-arm64" ;;
  x86_64) PLATFORM="darwin-x64" ;;
  *) echo "Unsupported macOS architecture: $ARCH"; exit 1 ;;
esac
xattr -rd com.apple.quarantine "$ROOT" >/dev/null 2>&1 || true
NODE="$ROOT/runtimes/macos/node/$PLATFORM/bin/node"
ARCHIVE="$ROOT/runtime-archives/macos/node-v22-$PLATFORM.tar.gz"
if [ ! -x "$NODE" ]; then
  if [ ! -f "$ARCHIVE" ]; then echo "Missing Node archive: $ARCHIVE"; exit 1; fi
  mkdir -p "$ROOT/runtimes/macos/node/$PLATFORM"
  tar -xzf "$ARCHIVE" -C "$ROOT/runtimes/macos/node/$PLATFORM" --strip-components 1
fi
JSON="$("$NODE" "$ROOT/core/node/dist/clawhermes.js" start --usb-root "$ROOT" --json)"
APP_PATH="$ROOT/ClawHermes-Control-Mac.app"
if [ -d "$APP_PATH" ]; then
  open "$APP_PATH" && exit 0
fi
URL="$(printf '%s' "$JSON" | "$NODE" -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const p=JSON.parse(s);console.log(p.portal?.url||'')}catch{}})")"
if [ -n "$URL" ]; then open "$URL"; else echo "$JSON"; fi
```

Replace `Stop.command` with a POSIX shell script that detects the same Node path and posts `/api/services/stop` plus `/api/shutdown` when `data/tmp/control-server.json` exists.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
python -m unittest tests.test_windows_core.TestWindowsCore.test_macos_launchers_prepare_runtime_and_prefer_electrobun_app -v
```

Expected: pass.

---

### Task 5: Electrobun macOS Node Resolution

**Files:**
- Modify: `launcher/electrobun/package.json`
- Modify: `launcher/electrobun/src/bun/index.ts`
- Test: `tests/test_windows_core.py`

- [ ] **Step 1: Write the failing test**

```python
    def test_electrobun_control_shell_has_macos_build_and_runtime_resolution(self):
        shell_root = ROOT / "launcher" / "electrobun"
        package_json = json.loads((shell_root / "package.json").read_text(encoding="utf-8"))
        bun_entry = (shell_root / "src" / "bun" / "index.ts").read_text(encoding="utf-8")
        self.assertIn("--platform=mac", package_json["scripts"]["build:mac"])
        self.assertIn("darwin-arm64", bun_entry)
        self.assertIn("darwin-x64", bun_entry)
        self.assertIn("process.platform", bun_entry)
        self.assertIn("process.arch", bun_entry)
        self.assertIn("nodeCommand(usbRoot)", bun_entry)
        self.assertNotIn('spawnSync("node", ["-e"', bun_entry)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m unittest tests.test_windows_core.TestWindowsCore.test_electrobun_control_shell_has_macos_build_and_runtime_resolution -v
```

Expected: fail because there is no `build:mac`, and `pingSync` uses PATH `node`.

- [ ] **Step 3: Write minimal implementation**

Add package scripts:

```json
"build:mac": "vite build && node ./node_modules/electrobun/bin/electrobun.cjs build --env=canary --platform=mac",
"build:mac:arm64": "vite build && node ./node_modules/electrobun/bin/electrobun.cjs build --env=canary --platform=mac --arch=arm64",
"build:mac:x64": "vite build && node ./node_modules/electrobun/bin/electrobun.cjs build --env=canary --platform=mac --arch=x64"
```

Change `nodeCommand(usbRoot)` to check `process.platform === "darwin"`, map `process.arch === "arm64"` to `darwin-arm64`, otherwise `darwin-x64`, and return `$ROOT/runtimes/macos/node/<platform>/bin/node` when it exists.

Change `pingSync(url)` to call:

```ts
const command = nodeCommand(root);
const completed = spawnSync(command[0], [...command.slice(1), "-e", "..."], { encoding: "utf8", windowsHide: true });
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
python -m unittest tests.test_windows_core.TestWindowsCore.test_electrobun_control_shell_has_macos_build_and_runtime_resolution -v
```

Expected: pass.

---

### Task 6: Cross-Platform Release Builder Output

**Files:**
- Modify: `scripts/release/Build-UsbRelease.ps1`
- Test: `tests/test_windows_core.py`

- [ ] **Step 1: Write the failing test**

```python
    def test_usb_release_script_emits_macos_entrypoints_and_runtime_archives(self):
        release_script = ROOT / "scripts" / "release" / "Build-UsbRelease.ps1"
        temp_dir = tempfile.TemporaryDirectory()
        output_dir = tempfile.TemporaryDirectory()
        try:
            source_root = Path(temp_dir.name)
            output_root = Path(output_dir.name) / "ClawHermes"
            for relative_dir in [
                "launcher/pyqt/dist/ClawHermes-Control",
                "launcher/macos",
                "launcher/electrobun/build/canary-mac-arm64/DTclaw Control.app/Contents",
                "core/node/dist",
                "adapters/openclaw",
                "config/defaults",
                "portal",
                "runtimes/windows/node",
                "runtimes/windows/python",
                "runtime-archives/macos",
                "apps/openclaw/node_modules/@tencent-weixin/openclaw-weixin",
                "docs",
            ]:
                (source_root / relative_dir).mkdir(parents=True, exist_ok=True)
            (source_root / "launcher" / "pyqt" / "dist" / "ClawHermes-Control" / "ClawHermes-Control.exe").write_text("pyqt exe\n", encoding="utf-8")
            (source_root / "launcher" / "macos" / "Start.command").write_text("#!/usr/bin/env sh\necho start\n", encoding="utf-8")
            (source_root / "launcher" / "macos" / "Stop.command").write_text("#!/usr/bin/env sh\necho stop\n", encoding="utf-8")
            (source_root / "launcher" / "electrobun" / "build" / "canary-mac-arm64" / "DTclaw Control.app" / "Contents" / "Info.plist").write_text("plist\n", encoding="utf-8")
            (source_root / "core" / "node" / "dist" / "clawhermes.js").write_text("console.log('core')\n", encoding="utf-8")
            (source_root / "adapters" / "openclaw" / "adapter.json").write_text('{"id":"openclaw"}\n', encoding="utf-8")
            (source_root / "runtime-archives" / "macos" / "node-v22-darwin-arm64.tar.gz").write_text("archive\n", encoding="utf-8")
            (source_root / "apps" / "openclaw" / "package.json").write_text('{"name":"openclaw"}\n', encoding="utf-8")
            (source_root / "apps" / "openclaw" / "node_modules" / "@tencent-weixin" / "openclaw-weixin" / "package.json").write_text('{"name":"@tencent-weixin/openclaw-weixin"}\n', encoding="utf-8")
            result = subprocess.run([
                "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(release_script),
                "-UsbRoot", str(source_root), "-OutputRoot", str(output_root),
                "-Clean", "-SkipBuild", "-NoStop", "-NoBundleHostRuntimes"
            ], cwd=ROOT, text=True, capture_output=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((output_root / "ClawHermes-Control.exe").exists())
            self.assertTrue((output_root / "Start-ClawHermes-Mac.command").exists())
            self.assertTrue((output_root / "Stop-ClawHermes-Mac.command").exists())
            self.assertTrue((output_root / "ClawHermes-Control-Mac.app" / "Contents" / "Info.plist").exists())
            self.assertTrue((output_root / "runtime-archives" / "macos" / "node-v22-darwin-arm64.tar.gz").exists())
            manifest = json.loads((output_root / "release-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["entryPoints"]["windows"], "ClawHermes-Control.exe")
            self.assertEqual(manifest["entryPoints"]["macos"], "Start-ClawHermes-Mac.command")
            self.assertIn("sharedPayloads", manifest)
        finally:
            temp_dir.cleanup()
            output_dir.cleanup()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m unittest tests.test_windows_core.TestWindowsCore.test_usb_release_script_emits_macos_entrypoints_and_runtime_archives -v
```

Expected: fail because the builder does not copy macOS root entrypoints, `.app`, or runtime archives.

- [ ] **Step 3: Write minimal implementation**

Add `Copy-MacLaunchersToRoot`, `Copy-MacElectrobunAppIfPresent`, and `Copy-MacRuntimeArchives` functions to `Build-UsbRelease.ps1`.

Call them after `Copy-PyQtControlToRoot`.

Change manifest fields to preserve `entryPoint = "ClawHermes-Control.exe"` for compatibility and add:

```powershell
entryPoints = [ordered]@{
    windows = "ClawHermes-Control.exe"
    macos = "Start-ClawHermes-Mac.command"
    macosUi = "ClawHermes-Control-Mac.app"
}
sharedPayloads = @("core", "adapters", "apps", "portal", "config", "data", "skills")
platformPayloads = [ordered]@{
    windows = @("ClawHermes-Control.exe", "runtimes/windows")
    macos = @("Start-ClawHermes-Mac.command", "Stop-ClawHermes-Mac.command", "ClawHermes-Control-Mac.app", "runtime-archives/macos", "runtimes/macos")
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
python -m unittest tests.test_windows_core.TestWindowsCore.test_usb_release_script_emits_macos_entrypoints_and_runtime_archives -v
```

Expected: pass.

---

### Task 7: Full Verification

**Files:**
- All modified files above.

- [ ] **Step 1: Run full project verification**

Run:

```powershell
npm test
```

Expected: TypeScript build passes and Python unittest suite passes.

- [ ] **Step 2: Inspect git diff**

Run:

```powershell
git diff --stat
git diff -- docs/superpowers/specs/2026-05-29-cross-platform-usb-release-design.md docs/superpowers/plans/2026-06-01-cross-platform-usb-release.md core/node/src/platform.ts core/node/src/portable.ts core/node/src/runtimes.ts core/node/src/adapters.ts core/node/src/types.ts config/defaults/runtimes.json launcher/macos/Start.command launcher/macos/Stop.command launcher/electrobun/package.json launcher/electrobun/src/bun/index.ts scripts/release/Build-UsbRelease.ps1 tests/test_windows_core.py
```

Expected: diff only covers cross-platform USB release behavior, macOS launchers, Electrobun macOS entry, tests, and docs.
