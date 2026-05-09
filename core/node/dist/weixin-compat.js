"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withWeixinFetchCompatibility = withWeixinFetchCompatibility;
exports.weixinFetchPreloadPath = weixinFetchPreloadPath;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_url_1 = require("node:url");
function withWeixinFetchCompatibility(root, env) {
    const next = Object.fromEntries(Object.entries(env).filter((entry) => typeof entry[1] === "string"));
    const preloadPath = weixinFetchPreloadPath(root);
    if (!(0, node_fs_1.existsSync)(preloadPath))
        return next;
    const importOption = `--import ${(0, node_url_1.pathToFileURL)(preloadPath).href}`;
    const existing = next.NODE_OPTIONS?.trim() ?? "";
    next.NODE_OPTIONS = existing.includes(importOption) ? existing : [importOption, existing].filter(Boolean).join(" ");
    return next;
}
function weixinFetchPreloadPath(root) {
    return (0, node_path_1.join)(root, "core", "node", "dist", "weixin-fetch-preload.js");
}
