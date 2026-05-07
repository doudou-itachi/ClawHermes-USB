import { spawnSync } from "node:child_process";

const originalFetch = globalThis.fetch;
const WEIXIN_API_HOST = "ilinkai.weixin.qq.com";
const ISOLATED_FETCH_TIMEOUT_MS = 120_000;

globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
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

function fetchUrl(input: Parameters<typeof fetch>[0]): URL | null {
  try {
    if (typeof input === "string" || input instanceof URL) return new URL(input);
    return new URL(input.url);
  } catch {
    return null;
  }
}

function isolatedWeixinFetch(url: URL, init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const method = init?.method ?? "GET";
  const body = requestBody(init?.body);
  const headers = new Headers(init?.headers);
  headers.delete("content-length");
  if (body) headers.set("content-length", String(body.byteLength));
  const payload = Buffer.from(JSON.stringify({
    url: url.toString(),
    method,
    headers: Object.fromEntries(headers.entries()),
    body: body?.toString("base64") ?? null,
  })).toString("base64url");
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", isolatedFetchScript(), payload], {
    encoding: "utf8",
    env: isolatedFetchEnv(),
    timeout: ISOLATED_FETCH_TIMEOUT_MS,
    windowsHide: true,
  });

  if (result.error) return Promise.reject(result.error);
  if (result.status !== 0) {
    return Promise.reject(new Error((result.stderr || result.stdout || `Isolated WeChat fetch exited with ${result.status}`).trim()));
  }

  try {
    const parsed = JSON.parse(result.stdout.trim()) as {
      status: number;
      statusText: string;
      headers: [string, string][];
      body: string;
    };
    return Promise.resolve(
      new Response(Buffer.from(parsed.body, "base64"), {
        status: parsed.status,
        statusText: parsed.statusText,
        headers: new Headers(parsed.headers),
      }),
    );
  } catch (error) {
    return Promise.reject(error);
  }
}

function requestBody(body: BodyInit | null | undefined): Buffer | null {
  if (body == null) return null;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  return null;
}

function isolatedFetchEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  return env;
}

function isolatedFetchScript(): string {
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
