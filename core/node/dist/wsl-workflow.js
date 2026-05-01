"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wslWorkflowPlan = wslWorkflowPlan;
const adapters_1 = require("./adapters");
const portable_1 = require("./portable");
const wsl_1 = require("./wsl");
function wslWorkflowPlan(usbRoot, serviceId) {
    const root = (0, portable_1.getRoot)(usbRoot);
    if (!serviceId)
        throw new Error("Service id is required. Example: wsl-workflow hermes-agent --json");
    const adapter = (0, adapters_1.loadAdapters)(root).find((item) => item.id === serviceId);
    if (!adapter)
        throw new Error(`Unknown adapter: ${serviceId}`);
    if (adapter.runtime?.kind !== "wsl2")
        throw new Error(`Adapter ${serviceId} is not a WSL2 adapter.`);
    const distro = adapter.runtime.distro?.trim() || "Ubuntu";
    const diagnostics = (0, wsl_1.wslDiagnostics)(root, distro);
    const wslReady = diagnostics.hasDesiredDistro && diagnostics.desiredDistroVersion === 2;
    const commandPrefix = "node core/node/dist/clawhermes.js";
    const phases = [
        {
            id: "diagnose",
            title: "Inspect WSL2 host state",
            status: wslReady ? "ready" : "needed",
            command: `${commandPrefix} wsl --distro ${distro} --json`,
            confirmCommand: null,
            modifiesHost: false,
            modifiesProject: false,
            detail: "Read-only WSL diagnostics for the target distribution.",
        },
        {
            id: "prepare-host",
            title: "Prepare WSL2 host explicitly",
            status: wslReady ? "ready" : "needed",
            command: `${commandPrefix} prepare-wsl --distro ${distro} --dry-run --json`,
            confirmCommand: `${commandPrefix} prepare-wsl --distro ${distro} --confirm-install --json`,
            modifiesHost: true,
            modifiesProject: false,
            detail: "Host-level WSL2 preparation requires explicit confirmation.",
        },
        {
            id: "checkout-source",
            title: "Prepare upstream source checkout",
            status: "manual",
            command: `${commandPrefix} checkout-source ${serviceId} --dry-run --json`,
            confirmCommand: `${commandPrefix} checkout-source ${serviceId} --confirm-checkout --json`,
            modifiesHost: false,
            modifiesProject: true,
            detail: "Project-local source checkout is guarded by --confirm-checkout.",
        },
        {
            id: "setup-adapter",
            title: "Run adapter setup in WSL2",
            status: wslReady ? "manual" : "blocked",
            command: `${commandPrefix} setup-adapter ${serviceId} --dry-run --json`,
            confirmCommand: `${commandPrefix} setup-adapter ${serviceId} --confirm-setup --json`,
            modifiesHost: false,
            modifiesProject: true,
            detail: "Adapter dependency setup runs through the WSL2 command plan after WSL2 is ready.",
        },
        {
            id: "start-adapter",
            title: "Start adapter through WSL2",
            status: wslReady ? "manual" : "blocked",
            command: `${commandPrefix} start-adapter ${serviceId} --dry-run --json`,
            confirmCommand: `${commandPrefix} start-adapter ${serviceId} --confirm-start --json`,
            modifiesHost: false,
            modifiesProject: true,
            detail: "Startup launches a Windows-side managed wsl.exe process and writes PID metadata.",
        },
        {
            id: "verify-adapter",
            title: "Verify adapter readiness",
            status: "manual",
            command: `${commandPrefix} verify-adapter ${serviceId} --json`,
            confirmCommand: null,
            modifiesHost: false,
            modifiesProject: false,
            detail: "Read-only verification must pass before marking production-ready.",
        },
        {
            id: "mark-ready",
            title: "Mark adapter production-ready",
            status: "manual",
            command: `${commandPrefix} mark-adapter-ready ${serviceId} --summary "Verified locally" --json`,
            confirmCommand: `${commandPrefix} mark-adapter-ready ${serviceId} --confirm-ready --summary "Verified locally" --json`,
            modifiesHost: false,
            modifiesProject: true,
            detail: "Metadata update is guarded by --confirm-ready and requires verification evidence.",
        },
    ];
    return {
        root,
        serviceId,
        displayName: adapter.displayName,
        runner: "wsl2",
        distro,
        wslReady,
        diagnostics,
        phases,
        messages: wslReady
            ? [`WSL2 target distribution is ready for ${serviceId}: ${distro}.`]
            : [`WSL2 target distribution is not ready for ${serviceId}: ${diagnostics.messages.join(" ")}`],
    };
}
