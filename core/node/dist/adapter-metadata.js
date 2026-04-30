"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAdapterReady = markAdapterReady;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
const adapter_verification_1 = require("./adapter-verification");
function markAdapterReady(usbRoot, serviceId, options) {
    const root = (0, portable_1.getRoot)(usbRoot);
    if (!serviceId)
        throw new Error("Service id is required. Example: mark-adapter-ready hermes-web-ui --confirm-ready --summary \"Verified locally\"");
    if (!options.confirm)
        throw new Error("mark-adapter-ready modifies adapter metadata. Re-run with --confirm-ready to proceed.");
    const summary = options.summary?.trim();
    if (!summary)
        throw new Error("--summary is required and must describe the verification evidence.");
    const verification = (0, adapter_verification_1.verifyAdapter)(root, serviceId);
    if (!verification.productionReadyCandidate) {
        throw new Error(`Adapter ${serviceId} is not a production-ready candidate: ${verification.nextSteps.join("; ")}`);
    }
    const adapterPath = (0, node_path_1.join)(root, "adapters", serviceId, "adapter.json");
    if (!(0, node_fs_1.existsSync)(adapterPath))
        throw new Error(`Adapter descriptor not found: adapters/${serviceId}/adapter.json`);
    const adapter = JSON.parse((0, node_fs_1.readFileSync)(adapterPath, "utf8"));
    adapter.integration = {
        ...(adapter.integration ?? {}),
        status: "verified",
        productionReady: true,
        verifiedAt: new Date().toISOString().slice(0, 10),
        summary,
    };
    (0, node_fs_1.writeFileSync)(adapterPath, `${JSON.stringify(adapter, null, 2)}\n`, "utf8");
    return {
        root,
        serviceId,
        adapterPath,
        updated: true,
        integration: adapter.integration,
        verification,
    };
}
