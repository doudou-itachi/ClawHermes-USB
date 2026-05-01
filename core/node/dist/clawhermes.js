"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("./core");
function parseArgs(argv) {
    const args = [...argv];
    const action = args.shift() ?? "setup";
    const positional = [];
    let usbRoot = process.cwd();
    let json = false;
    let archive;
    let sha256;
    let profile = "data-only";
    let includeLogs = false;
    let dryRun = false;
    let confirmCheckout = false;
    let confirmSetup = false;
    let confirmInstall = false;
    let confirmReady = false;
    let confirmStart = false;
    let confirmImport = false;
    let confirmExport = false;
    let confirmUnregister = false;
    let confirmRestore = false;
    let distro;
    let summary;
    let lines = 50;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if ((arg === "--usb-root" || arg === "-UsbRoot") && args[index + 1]) {
            usbRoot = args[index + 1];
            index += 1;
        }
        else if (arg === "--json" || arg === "-Json") {
            json = true;
        }
        else if (arg === "--archive" && args[index + 1]) {
            archive = args[index + 1];
            index += 1;
        }
        else if (arg === "--sha256" && args[index + 1]) {
            sha256 = args[index + 1];
            index += 1;
        }
        else if (arg === "--profile" && args[index + 1]) {
            profile = parseBackupProfile(args[index + 1]);
            index += 1;
        }
        else if (arg === "--include-logs") {
            includeLogs = true;
        }
        else if (arg === "--dry-run") {
            dryRun = true;
        }
        else if (arg === "--confirm-checkout" || arg === "--confirm") {
            confirmCheckout = true;
        }
        else if (arg === "--confirm-setup") {
            confirmSetup = true;
        }
        else if (arg === "--confirm-install") {
            confirmInstall = true;
        }
        else if (arg === "--confirm-ready") {
            confirmReady = true;
        }
        else if (arg === "--confirm-start") {
            confirmStart = true;
        }
        else if (arg === "--confirm-import") {
            confirmImport = true;
        }
        else if (arg === "--confirm-export") {
            confirmExport = true;
        }
        else if (arg === "--confirm-unregister") {
            confirmUnregister = true;
        }
        else if (arg === "--confirm-restore") {
            confirmRestore = true;
        }
        else if (arg === "--distro" && args[index + 1]) {
            distro = args[index + 1];
            index += 1;
        }
        else if (arg === "--summary" && args[index + 1]) {
            summary = args[index + 1];
            index += 1;
        }
        else if (arg === "--lines" && args[index + 1]) {
            lines = Number(args[index + 1]);
            index += 1;
        }
        else {
            positional.push(arg);
        }
    }
    return { action, positional, usbRoot, json, archive, sha256, profile, includeLogs, dryRun, confirmCheckout, confirmSetup, confirmInstall, confirmReady, confirmStart, confirmImport, confirmExport, confirmUnregister, confirmRestore, distro, summary, lines };
}
function parseBackupProfile(value) {
    if (value === "data-only" || value === "full")
        return value;
    throw new Error(`Unknown backup profile: ${value}. Expected data-only or full.`);
}
function printJson(value) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
async function main() {
    const { action, positional, usbRoot, json, archive, sha256, profile, includeLogs, dryRun, confirmCheckout, confirmSetup, confirmInstall, confirmReady, confirmStart, confirmImport, confirmExport, confirmUnregister, confirmRestore, distro, summary, lines } = parseArgs(process.argv.slice(2));
    const root = (0, core_1.getRoot)(usbRoot);
    switch (action) {
        case "env-json":
            printJson((0, core_1.portableEnv)(root));
            return;
        case "setup": {
            const result = (0, core_1.setupDiagnostics)(root);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB setup diagnostics");
                console.log(`Root: ${result.root}`);
                if (result.messages.length === 0)
                    console.log("No setup issues found.");
                for (const message of result.messages)
                    console.log(`- ${message}`);
                if (result.actions.length > 0) {
                    console.log("Recommended actions:");
                    for (const action of result.actions) {
                        console.log(`- [${action.severity}] ${action.title}`);
                        if (action.command)
                            console.log(`  command: ${action.command}`);
                        if (action.docs)
                            console.log(`  docs: ${action.docs}`);
                    }
                }
            }
            return;
        }
        case "setup-wizard": {
            const result = (0, core_1.setupWizard)(root);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB setup wizard");
                for (const phase of result.phases) {
                    console.log(`- [${phase.status}] ${phase.title}`);
                    for (const item of phase.commands)
                        console.log(`  ${item.command}`);
                }
            }
            return;
        }
        case "runtimes": {
            const result = (0, core_1.runtimePreparationPlan)(root);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB runtime preparation plan");
                console.log(`Root: ${result.root}`);
                for (const message of result.messages)
                    console.log(`- ${message}`);
            }
            return;
        }
        case "payloads": {
            const result = (0, core_1.payloadInventory)(root);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB payload inventory");
                console.log(`Root: ${result.root}`);
                for (const app of result.apps)
                    console.log(`- app ${app.serviceId}: ${app.ready ? "ready" : "missing/placeholder"} at ${app.path}`);
                for (const rootfs of result.wslRootfs)
                    console.log(`- rootfs ${rootfs.distro}: ${rootfs.archive.exists ? "present" : "missing"} at ${rootfs.archive.path}`);
                for (const backup of result.wslBackups)
                    console.log(`- backup ${backup.distributionName}: ${backup.latest ? "present" : "missing"}`);
            }
            return;
        }
        case "payload-export": {
            const result = (0, core_1.payloadExport)(root, { archive, dryRun, confirmExport });
            if (json) {
                printJson(result);
            }
            else {
                console.log(dryRun ? "ClawHermes-USB payload export plan" : "ClawHermes-USB payload export");
                for (const message of result.messages)
                    console.log(`- ${message}`);
                console.log(`Archive: ${result.archivePath}`);
                for (const entry of result.entries)
                    console.log(`- ${entry.path}`);
            }
            return;
        }
        case "wsl": {
            const result = (0, core_1.wslDiagnostics)(root, distro);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB WSL2 diagnostics");
                console.log(`wsl.exe: ${result.found ? result.executablePath : "not found"}`);
                for (const message of result.messages)
                    console.log(`- ${message}`);
            }
            return;
        }
        case "prepare-wsl": {
            const result = (0, core_1.prepareWsl)(root, { distro, dryRun, confirmInstall });
            if (json) {
                printJson(result);
            }
            else {
                console.log(dryRun ? "ClawHermes-USB WSL2 preparation plan" : "ClawHermes-USB WSL2 preparation");
                for (const message of result.messages)
                    console.log(`- ${message}`);
                for (const change of result.hostChanges)
                    console.log(`- ${change}`);
                for (const command of result.commands)
                    console.log(`Command: ${command.commandLine}`);
                console.log(`Portable import note: ${result.portableImport.summary}`);
            }
            return;
        }
        case "wsl-workflow": {
            const result = (0, core_1.wslWorkflowPlan)(root, positional[0]);
            if (json) {
                printJson(result);
            }
            else {
                console.log(`ClawHermes-USB WSL2 workflow: ${result.serviceId}`);
                for (const message of result.messages)
                    console.log(`- ${message}`);
                for (const phase of result.phases) {
                    console.log(`- [${phase.status}] ${phase.title}`);
                    console.log(`  command: ${phase.command}`);
                    if (phase.confirmCommand)
                        console.log(`  confirm: ${phase.confirmCommand}`);
                }
            }
            return;
        }
        case "wsl-import-plan": {
            const result = (0, core_1.wslImportPlan)(root, { distro });
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB WSL2 import plan");
                for (const message of result.messages)
                    console.log(`- ${message}`);
                console.log(`Command: ${result.command}`);
            }
            return;
        }
        case "wsl-rootfs-guide": {
            const result = (0, core_1.wslRootfsGuide)(root, { distro });
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB WSL2 rootfs guide");
                for (const message of result.messages)
                    console.log(`- ${message}`);
                console.log(`Export: ${result.exportCommand}`);
                console.log(`Checksum: ${result.checksumCommand}`);
            }
            return;
        }
        case "wsl-import": {
            const result = (0, core_1.wslImport)(root, { distro, confirmImport });
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB WSL2 import");
                for (const message of result.messages)
                    console.log(`- ${message}`);
                console.log(`Command: ${result.command}`);
            }
            return;
        }
        case "wsl-unregister-plan": {
            const result = (0, core_1.wslUnregisterPlan)(root, { distro });
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB WSL2 unregister plan");
                for (const warning of result.warnings)
                    console.log(`- ${warning}`);
                console.log(`Command: ${result.command}`);
            }
            return;
        }
        case "wsl-export": {
            const result = (0, core_1.wslExport)(root, { distro, archive, confirmExport });
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB WSL2 export");
                for (const message of result.messages)
                    console.log(`- ${message}`);
                console.log(`Command: ${result.command}`);
            }
            return;
        }
        case "wsl-unregister": {
            const result = (0, core_1.wslUnregister)(root, { distro, confirmUnregister });
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB WSL2 unregister");
                for (const message of result.messages)
                    console.log(`- ${message}`);
                console.log(`Command: ${result.command}`);
            }
            return;
        }
        case "init-env": {
            const result = (0, core_1.initializeEnvFiles)(root, dryRun);
            if (json) {
                printJson(result);
            }
            else {
                console.log(dryRun ? "ClawHermes-USB env initialization plan" : "ClawHermes-USB env initialization");
                for (const message of result.messages)
                    console.log(`- ${message}`);
            }
            return;
        }
        case "service-env": {
            const serviceId = positional[0];
            if (!serviceId)
                throw new Error("Service id is required. Example: service-env hermes-agent");
            const result = (0, core_1.serviceEnvironmentDiagnostic)(root, serviceId);
            if (json) {
                printJson(result);
            }
            else {
                console.log(`ClawHermes-USB service environment: ${result.serviceId}`);
                for (const file of result.files) {
                    console.log(`- ${file.path}: ${file.loaded ? "loaded" : file.exists ? "parse issues" : "missing"}`);
                }
                console.log(`Variables: ${result.variables.join(", ")}`);
            }
            return;
        }
        case "adapters": {
            const result = (0, core_1.adapterSetupPlan)(root, positional[0]);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB adapter preparation");
                console.log(`Root: ${result.root}`);
                for (const adapter of result.adapters) {
                    console.log(`- ${adapter.id}: ${adapter.integration.status}, appDir ${adapter.appDirExists ? "present" : "missing"}`);
                    for (const step of adapter.nextSteps)
                        console.log(`  - ${step}`);
                }
            }
            return;
        }
        case "sources": {
            const result = (0, core_1.appSourcePlan)(root, positional[0]);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB app source preparation plan");
                console.log(`Root: ${result.root}`);
                console.log("This command is read-only and does not modify apps/.");
                for (const source of result.sources) {
                    console.log(`- ${source.id}: ${source.appDirReady ? "ready" : "not ready"} at ${source.appDir}`);
                    if (source.checkoutCommand)
                        console.log(`  command: ${source.checkoutCommand}`);
                }
            }
            return;
        }
        case "probe-sources": {
            const result = (0, core_1.probeAppSources)(root, positional[0]);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB upstream source probe");
                console.log(`Root: ${result.root}`);
                console.log("This command is read-only and does not modify apps/.");
                for (const source of result.sources) {
                    console.log(`- ${source.id}: ${source.reachable ? "reachable" : "unreachable"}, ref ${source.refFound ? "found" : "missing"}`);
                    console.log(`  ${source.message}`);
                }
            }
            return;
        }
        case "checkout-source": {
            const result = (0, core_1.checkoutAppSource)(root, positional[0], { dryRun, confirm: confirmCheckout });
            if (json) {
                printJson(result);
            }
            else {
                console.log(result.message);
                console.log(`Target: ${result.appDir}`);
                console.log(`Repository: ${result.repositoryUrl}`);
                if (result.command)
                    console.log(`Command: ${result.command}`);
            }
            return;
        }
        case "setup-adapter": {
            const result = (0, core_1.runAdapterSetup)(root, positional[0], { dryRun, confirm: confirmSetup });
            if (json) {
                printJson(result);
            }
            else {
                console.log(result.message);
                console.log(`Command: ${result.command}`);
                console.log(`Working directory: ${result.workingDirectory}`);
            }
            return;
        }
        case "verify-adapter": {
            const result = (0, core_1.verifyAdapter)(root, positional[0]);
            if (json) {
                printJson(result);
            }
            else {
                console.log(`ClawHermes-USB adapter verification: ${result.serviceId}`);
                console.log(`Production-ready candidate: ${result.productionReadyCandidate ? "yes" : "no"}`);
                for (const item of result.checks)
                    console.log(`- [${item.status}] ${item.label}: ${item.message}`);
            }
            return;
        }
        case "mark-adapter-ready": {
            const result = (0, core_1.markAdapterReady)(root, positional[0], { confirm: confirmReady, summary });
            if (json) {
                printJson(result);
            }
            else {
                console.log(`Marked adapter production-ready: ${result.serviceId}`);
                console.log(`Descriptor: ${result.adapterPath}`);
            }
            return;
        }
        case "logs": {
            const target = positional[0];
            if (!target)
                throw new Error("Log target is required. Example: logs launcher --lines 50");
            const result = (0, core_1.readLogTail)(root, target, lines);
            if (json) {
                printJson(result);
            }
            else {
                console.log(`ClawHermes-USB logs: ${result.target}`);
                console.log(`Path: ${result.path}`);
                if (!result.exists) {
                    console.log("Log file does not exist yet.");
                }
                else {
                    for (const line of result.lines)
                        console.log(line);
                }
            }
            return;
        }
        case "install-runtime": {
            const runtimeName = positional[0];
            if (!runtimeName)
                throw new Error("Runtime name is required. Example: install-runtime node --archive path.zip");
            if (!archive)
                throw new Error("--archive is required for install-runtime.");
            const result = (0, core_1.installRuntimeFromArchive)(root, runtimeName, archive, dryRun, sha256);
            if (json) {
                printJson(result);
            }
            else {
                console.log(result.message);
                for (const exe of result.expectedExecutables)
                    console.log(`- expected: ${exe}`);
            }
            return;
        }
        case "backup": {
            const result = (0, core_1.createBackup)(root, { profile, includeLogs, dryRun });
            if (json) {
                printJson(result);
            }
            else {
                console.log(result.message);
                for (const entry of result.entries)
                    console.log(`- ${entry.path}`);
            }
            return;
        }
        case "restore-plan": {
            const result = (0, core_1.restorePlan)(root, archive);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB restore plan");
                console.log(`Archive: ${result.archivePath}`);
                for (const message of result.messages)
                    console.log(`- ${message}`);
                console.log(`Confirm command: ${result.confirmCommand}`);
            }
            return;
        }
        case "restore": {
            const result = (0, core_1.restoreBackup)(root, archive, { confirmRestore });
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB restore");
                for (const message of result.messages)
                    console.log(`- ${message}`);
            }
            return;
        }
        case "start": {
            const result = await (0, core_1.startSkeleton)(root);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB services started:");
                for (const id of result.started)
                    console.log(`- ${id}`);
                console.log(`Portal target: ${result.portal.url}`);
            }
            return;
        }
        case "start-adapter": {
            const result = (0, core_1.startSingleAdapter)(root, positional[0], { dryRun, confirm: confirmStart });
            if (json) {
                printJson(result);
            }
            else {
                console.log(result.message);
                console.log(`Command: ${result.command}`);
                console.log(`App directory: ${result.appDir}`);
            }
            return;
        }
        case "status": {
            const result = (0, core_1.getStatus)(root);
            (0, core_1.writeStatusSnapshot)(root, result);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB status");
                for (const service of result.services)
                    console.log(`${service.id}: ${service.status}`);
            }
            return;
        }
        case "stop": {
            const result = (0, core_1.stopSkeleton)(root);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB placeholder services stopped:");
                for (const id of result.stopped)
                    console.log(`- ${id}`);
            }
            return;
        }
        default:
            throw new Error(`Unknown action: ${action}`);
    }
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
});
