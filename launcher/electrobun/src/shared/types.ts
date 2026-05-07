export type ServiceHealth = {
  ready?: boolean;
  reason?: string;
};

export type ServiceStatus = {
  id?: string;
  displayName?: string;
  status?: string;
  health?: ServiceHealth;
  portalUrl?: string;
};

export type StatusPayload = {
  services?: ServiceStatus[];
};

export type ModelConfig = {
  apiUrl?: string;
  model?: string;
  apiKey?: string;
};

export type LogPayload = {
  exists?: boolean;
  path?: string;
  target?: string;
  lines?: string[];
};

export type BootstrapPayload = {
  root: string;
  controlUrl: string;
};

export type ChannelLoginStatus = {
  root?: string;
  channel?: string;
  displayName?: string;
  status?: "missing-plugin" | "running" | "started" | "stopped";
  processId?: number;
  command?: string;
  logFile?: string;
  messages?: string[];
};
