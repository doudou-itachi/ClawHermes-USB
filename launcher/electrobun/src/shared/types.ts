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
  lines?: string[];
};

export type BootstrapPayload = {
  root: string;
  controlUrl: string;
};
