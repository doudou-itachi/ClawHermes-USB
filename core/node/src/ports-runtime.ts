import { createServer } from "node:net";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AdapterDescriptor, ServiceEnvironment } from "./types";
import { getRoot, resolveRelative } from "./portable";

export type RuntimePortServiceAssignment = {
  serviceId: string;
  host: string;
  defaultPort: number;
  assignedPort: number;
  changed: boolean;
};

export type RuntimePortState = {
  root: string;
  generatedAt: string;
  portal: {
    host: string;
    defaultPort: number;
    assignedPort: number;
    changed: boolean;
    url: string;
  };
  services: RuntimePortServiceAssignment[];
};

export function runtimePortsPath(root: string): string {
  return join(getRoot(root), "data", "tmp", "ports.json");
}

export function readRuntimePortState(root: string): RuntimePortState | null {
  const path = runtimePortsPath(root);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RuntimePortState;
  } catch {
    return null;
  }
}

export async function assignRuntimePorts(rootInput: string, adapters: AdapterDescriptor[]): Promise<RuntimePortState> {
  const root = getRoot(rootInput);
  const reserved = new Set<number>();
  const portalDefaultPort = readDefaultPortalPort(root);
  const portalAssignedPort = await chooseAvailablePort(portalDefaultPort, reserved);
  reserved.add(portalAssignedPort);

  const services: RuntimePortServiceAssignment[] = [];
  for (const adapter of adapters) {
    const defaultPort = adapterDefaultPort(adapter);
    if (!defaultPort || services.some((item) => item.serviceId === adapter.id)) continue;
    const assignedPort = await chooseAvailablePort(defaultPort, reserved);
    reserved.add(assignedPort);
    services.push({
      serviceId: adapter.id,
      host: "127.0.0.1",
      defaultPort,
      assignedPort,
      changed: assignedPort !== defaultPort,
    });
  }

  const state: RuntimePortState = {
    root,
    generatedAt: new Date().toISOString(),
    portal: {
      host: "127.0.0.1",
      defaultPort: portalDefaultPort,
      assignedPort: portalAssignedPort,
      changed: portalAssignedPort !== portalDefaultPort,
      url: `http://127.0.0.1:${portalAssignedPort}/`,
    },
    services,
  };
  const path = runtimePortsPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

export function applyRuntimePortsToAdapter(adapter: AdapterDescriptor, state: RuntimePortState | null): AdapterDescriptor {
  if (!state) return adapter;
  const cloned = structuredClone(adapter) as AdapterDescriptor;
  if (typeof cloned.health?.url === "string") cloned.health.url = replaceLocalhostPorts(cloned.health.url, state);
  if (cloned.portal && typeof cloned.portal.url === "string") cloned.portal.url = replaceLocalhostPorts(cloned.portal.url, state);
  return cloned;
}

export function applyRuntimePortsToEnvironment(serviceEnv: ServiceEnvironment, state: RuntimePortState | null): ServiceEnvironment {
  if (!state) return serviceEnv;
  const env = { ...serviceEnv.env };
  const ownAssignment = state.services.find((item) => item.serviceId === serviceEnv.serviceId);
  for (const [name, value] of Object.entries(env)) {
    let nextValue = replaceLocalhostPorts(value, state);
    if (ownAssignment && isPortVariable(name) && value.trim() === String(ownAssignment.defaultPort)) {
      nextValue = String(ownAssignment.assignedPort);
    }
    env[name] = nextValue;
  }
  return { ...serviceEnv, env };
}

export function replaceLocalhostPorts(value: string, state: RuntimePortState): string {
  let result = value;
  for (const assignment of state.services) {
    result = replaceUrlPort(result, assignment.defaultPort, assignment.assignedPort);
  }
  result = replaceUrlPort(result, state.portal.defaultPort, state.portal.assignedPort);
  return result;
}

export function runtimePortalUrl(root: string): string {
  return readRuntimePortState(root)?.portal.url ?? "http://127.0.0.1:17000/";
}

function adapterDefaultPort(adapter: AdapterDescriptor): number | null {
  const healthPort = portFromUrl(typeof adapter.health?.url === "string" ? adapter.health.url : null);
  if (healthPort) return healthPort;
  return portFromUrl(adapter.portal?.url ?? null);
}

function readDefaultPortalPort(root: string): number {
  const portsPath = resolveRelative(root, "config/defaults/ports.json");
  if (!existsSync(portsPath)) return 17000;
  try {
    const parsed = JSON.parse(readFileSync(portsPath, "utf8")) as { portal?: unknown };
    return typeof parsed.portal === "number" && Number.isInteger(parsed.portal) ? parsed.portal : 17000;
  } catch {
    return 17000;
  }
}

function portFromUrl(value: string | null): number | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return null;
    const port = Number(parsed.port);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

async function chooseAvailablePort(preferred: number, reserved: Set<number>): Promise<number> {
  let candidate = preferred;
  while (reserved.has(candidate) || !(await portAvailable(candidate))) candidate += 1;
  return candidate;
}

function portAvailable(port: number): Promise<boolean> {
  if (tcpPortListed(port)) return Promise.resolve(false);
  return new Promise((resolveAvailable) => {
    const server = createServer();
    server.once("error", () => resolveAvailable(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailable(true)));
  });
}

function tcpPortListed(port: number): boolean {
  try {
    const output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", timeout: 3000 });
    const pattern = new RegExp(`(?:^|\\s)(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[?::1\\]?|\\[?::\\]?):${port}\\s+[^\\r\\n]*\\sLISTENING\\s`, "im");
    return pattern.test(output);
  } catch {
    return false;
  }
}

function replaceUrlPort(value: string, defaultPort: number, assignedPort: number): string {
  if (defaultPort === assignedPort) return value;
  return value.replace(new RegExp(`(https?://(?:127\\.0\\.0\\.1|localhost):)${defaultPort}(?=/|$)`, "g"), `$1${assignedPort}`);
}

function isPortVariable(name: string): boolean {
  return /(^|_)PORT$/i.test(name);
}
