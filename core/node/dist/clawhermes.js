"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("./core");
function parseArgs(argv) {
    const args = [...argv];
    const action = args.shift() ?? "setup";
    let usbRoot = process.cwd();
    let json = false;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if ((arg === "--usb-root" || arg === "-UsbRoot") && args[index + 1]) {
            usbRoot = args[index + 1];
            index += 1;
        }
        else if (arg === "--json" || arg === "-Json") {
            json = true;
        }
    }
    return { action, usbRoot, json };
}
function printJson(value) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
async function main() {
    const { action, usbRoot, json } = parseArgs(process.argv.slice(2));
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
            }
            return;
        }
        case "start": {
            const result = await (0, core_1.startSkeleton)(root);
            if (json) {
                printJson(result);
            }
            else {
                console.log("ClawHermes-USB placeholder services started:");
                for (const id of result.started)
                    console.log(`- ${id}`);
                console.log("Portal target: http://127.0.0.1:17000/");
            }
            return;
        }
        case "status": {
            const result = (0, core_1.getStatus)(root);
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
