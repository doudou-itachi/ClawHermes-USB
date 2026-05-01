"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWizard = setupWizard;
const adapters_1 = require("./adapters");
const diagnostics_1 = require("./diagnostics");
const payloads_1 = require("./payloads");
const portable_1 = require("./portable");
function setupWizard(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const setup = (0, diagnostics_1.setupDiagnostics)(root);
    const payloads = (0, payloads_1.payloadInventory)(root);
    const adapters = (0, adapters_1.loadAdapters)(root).filter((adapter) => adapter.enabled);
    const orderedAdapters = (0, adapters_1.serviceOrder)(root, "start").filter((adapter) => adapter.enabled);
    const setupActionSeverities = new Set(setup.actions.map((action) => action.severity));
    const runtimeWarnings = setup.actions.filter((action) => action.category === "runtime");
    const wslAdapters = adapters.filter((adapter) => adapter.runtime?.kind === "wsl2" || adapter.integration?.platform === "wsl2");
    const missingEnvFiles = setup.envFiles.filter((file) => !file.exists);
    const readyPayloads = payloads.apps.filter((app) => app.ready).length;
    const phases = [
        {
            id: "diagnose",
            title: "Diagnose current root",
            status: setupActionSeverities.has("error") ? "blocked" : setup.actions.length > 0 ? "review" : "ready",
            summary: `${setup.actions.length} setup action(s), ${setup.messages.length} diagnostic message(s).`,
            commands: [
                command("Run setup diagnostics", "node core/node/dist/clawhermes.js setup --json", false, false),
                command("Inspect adapter metadata", "node core/node/dist/clawhermes.js adapters --json", false, false),
            ],
        },
        {
            id: "prepare-runtimes",
            title: "Prepare portable runtimes",
            status: runtimeWarnings.length > 0 ? "review" : "ready",
            summary: `${setup.runtimes.filter((runtime) => runtime.found).length}/${setup.runtimes.length} declared runtime(s) found.`,
            commands: [
                command("Review runtime plan", "node core/node/dist/clawhermes.js runtimes --json", false, false),
                command("Install runtime from local archive", "node core/node/dist/clawhermes.js install-runtime node --archive <archive.zip> --confirm-install --json", true, true),
            ],
        },
        {
            id: "prepare-wsl2",
            title: "Prepare WSL2 adapters",
            status: wslAdapters.length > 0 && !setup.wsl.hasWsl2Distro ? "review" : "ready",
            summary: `${wslAdapters.length} WSL2 adapter(s), ${setup.wslArtifacts.filter((artifact) => artifact.sourceArchiveExists).length}/${setup.wslArtifacts.length} source rootfs artifact(s) present.`,
            commands: [
                command("Review WSL2 host plan", "node core/node/dist/clawhermes.js prepare-wsl --distro Ubuntu --dry-run --json", false, false),
                ...wslAdapters.map((adapter) => command(`Review ${adapter.id} WSL2 workflow`, `node core/node/dist/clawhermes.js wsl-workflow ${adapter.id} --json`, false, false)),
            ],
        },
        {
            id: "initialize-env",
            title: "Initialize environment files",
            status: missingEnvFiles.length > 0 ? "review" : "ready",
            summary: `${missingEnvFiles.length} env file(s) missing.`,
            commands: [
                command("Preview env initialization", "node core/node/dist/clawhermes.js init-env --dry-run --json", false, false),
                command("Create missing env files", "node core/node/dist/clawhermes.js init-env --json", true, true),
            ],
        },
        {
            id: "payloads",
            title: "Review and package payloads",
            status: readyPayloads === payloads.apps.length ? "ready" : "review",
            summary: `${readyPayloads}/${payloads.apps.length} app payload(s) ready; ${payloads.wslRootfs.filter((item) => item.archive.exists).length}/${payloads.wslRootfs.length} rootfs archive(s) present.`,
            commands: [
                command("Inventory ignored payloads", "node core/node/dist/clawhermes.js payloads --json", false, false),
                command("Preview payload export", "node core/node/dist/clawhermes.js payload-export --dry-run --json", false, false),
                command("Create payload export", "node core/node/dist/clawhermes.js payload-export --confirm-export --json", true, true),
            ],
        },
        {
            id: "setup-adapters",
            title: "Install adapter dependencies",
            status: "review",
            summary: `${orderedAdapters.length} enabled adapter(s) in start order.`,
            commands: orderedAdapters.flatMap((adapter) => [
                command(`Preview ${adapter.id} setup`, `node core/node/dist/clawhermes.js setup-adapter ${adapter.id} --dry-run --json`, false, false),
                command(`Run ${adapter.id} setup`, `node core/node/dist/clawhermes.js setup-adapter ${adapter.id} --confirm-setup --json`, true, true),
            ]),
        },
        {
            id: "start-and-verify",
            title: "Start and verify services",
            status: "review",
            summary: "Start uses runtime port remapping and writes actual URLs to data/tmp/ports.json.",
            commands: [
                command("Start all services", "node core/node/dist/clawhermes.js start --json", true, true),
                command("Check status", "node core/node/dist/clawhermes.js status --json", false, false),
                ...orderedAdapters.map((adapter) => command(`Verify ${adapter.id}`, `node core/node/dist/clawhermes.js verify-adapter ${adapter.id} --json`, false, false)),
            ],
        },
        {
            id: "backup-and-release",
            title: "Back up and prepare release",
            status: "review",
            summary: "Use backups and the release checklist after verification passes.",
            commands: [
                command("Preview backup", "node core/node/dist/clawhermes.js backup --dry-run --json", false, false),
                command("Create backup", "node core/node/dist/clawhermes.js backup --json", true, true),
                command("Read release checklist", "docs/release-checklist.md", false, false),
            ],
        },
    ];
    return {
        root,
        generatedAt: new Date().toISOString(),
        wouldModify: false,
        releaseChecklist: "docs/release-checklist.md",
        setupSummary: {
            actions: setup.actions.length,
            errors: setup.actions.filter((action) => action.severity === "error").length,
            warnings: setup.actions.filter((action) => action.severity === "warning").length,
        },
        payloadSummary: {
            appsReady: readyPayloads,
            appsTotal: payloads.apps.length,
            wslRootfsPresent: payloads.wslRootfs.filter((item) => item.archive.exists).length,
            wslRootfsTotal: payloads.wslRootfs.length,
        },
        phases,
        messages: [
            "setup-wizard is read-only and does not install runtimes, initialize env files, start services, export payloads, or modify WSL.",
            "Run guarded commands explicitly when a phase requires confirmation.",
        ],
    };
}
function command(label, command, mutatesState, requiresConfirmation) {
    return { label, command, mutatesState, requiresConfirmation };
}
