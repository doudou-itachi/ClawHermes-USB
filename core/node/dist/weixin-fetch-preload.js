"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const originalFetch = globalThis.fetch;
const WEIXIN_API_HOST = "ilinkai.weixin.qq.com";
const ISOLATED_FETCH_TIMEOUT_MS = 120_000;
globalThis.fetch = async (input, init) => {
    const url = fetchUrl(input);
    if (url?.protocol === "https:" && url.hostname === WEIXIN_API_HOST) {
        return isolatedWeixinFetch(url, init);
    }
    if (init?.headers) {
        const headers = new Headers(init.headers);
        headers.delete("content-length");
        init = { ...init, headers };
    }
    return originalFetch(input, init);
};
function fetchUrl(input) {
    try {
        if (typeof input === "string" || input instanceof URL)
            return new URL(input);
        return new URL(input.url);
    }
    catch {
        return null;
    }
}
function isolatedWeixinFetch(url, init) {
    const method = init?.method ?? "GET";
    const body = requestBody(init?.body);
    const headers = new Headers(init?.headers);
    headers.delete("content-length");
    if (body)
        headers.set("content-length", String(body.byteLength));
    const payload = Buffer.from(JSON.stringify({
        url: url.toString(),
        method,
        headers: Object.fromEntries(headers.entries()),
        body: body?.toString("base64") ?? null,
    })).toString("base64url");
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(process.execPath, ["--input-type=module", "-e", isolatedFetchScript(), payload], {
            env: isolatedFetchEnv(),
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });
        const stdout = [];
        const stderr = [];
        let settled = false;
        const timer = setTimeout(() => {
            settle(() => reject(new Error(`Isolated WeChat fetch timed out after ${ISOLATED_FETCH_TIMEOUT_MS}ms.`)));
            child.kill();
        }, ISOLATED_FETCH_TIMEOUT_MS);
        child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
        child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
        child.on("error", (error) => settle(() => reject(error)));
        child.on("exit", (code) => {
            settle(() => {
                const out = Buffer.concat(stdout).toString("utf8");
                const err = Buffer.concat(stderr).toString("utf8");
                if (code !== 0) {
                    reject(new Error((err || out || `Isolated WeChat fetch exited with ${code ?? "unknown"}`).trim()));
                    return;
                }
                try {
                    const parsed = JSON.parse(out.trim());
                    resolve(new Response(Buffer.from(parsed.body, "base64"), {
                        status: parsed.status,
                        statusText: parsed.statusText,
                        headers: new Headers(parsed.headers),
                    }));
                }
                catch (error) {
                    reject(error);
                }
            });
        });
        function settle(callback) {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            callback();
        }
    });
}
function requestBody(body) {
    if (body == null)
        return null;
    if (typeof body === "string")
        return Buffer.from(body);
    if (body instanceof ArrayBuffer)
        return Buffer.from(body);
    if (ArrayBuffer.isView(body))
        return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    return null;
}
function isolatedFetchEnv() {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    return env;
}
function isolatedFetchScript() {
    return `
const payload = JSON.parse(Buffer.from(process.argv[1], "base64url").toString("utf8"));
const init = { method: payload.method, headers: payload.headers };
if (payload.body) init.body = Buffer.from(payload.body, "base64");
try {
  const response = await fetch(payload.url, init);
  const body = Buffer.from(await response.arrayBuffer()).toString("base64");
  process.stdout.write(JSON.stringify({
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers.entries()),
    body,
  }));
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
`;
}
