export type RuntimeDiagnostic = {
  name: string;
  label: string;
  path: string;
  found: boolean;
  version: string | null;
  versionPolicy: string;
  packageType: string;
  sourceUrl: string;
  installDir: string;
  candidates: string[];
  notes: string;
};

export type RuntimeManifest = {
  platform: string;
  runtimes: Array<{
    name: string;
    label: string;
    versionPolicy: string;
    packageType: string;
    sourceUrl: string;
    installDir: string;
    candidates: string[];
    notes: string;
  }>;
};

export type RuntimePreparationStep = {
  name: string;
  label: string;
  action: "extract";
  versionPolicy: string;
  packageType: string;
  sourceUrl: string;
  installDir: string;
  expectedExecutables: string[];
  notes: string;
  found: boolean;
};

export type RuntimeInstallResult = {
  runtime: string;
  dryRun: boolean;
  archive: string;
  installDir: string;
  expectedExecutables: string[];
  sha256: string | null;
  checksumVerified: boolean | null;
  wouldExtract: boolean;
  installed: boolean;
  message: string;
};

export type AdapterRuntimeRequirementDiagnostic = {
  serviceId: string;
  runtime: string;
  requiredExecutable: string;
  versionRequirement: string | null;
  executablePath: string | null;
  found: boolean;
  version: string | null;
  satisfies: boolean | null;
  message: string;
};

export type AdapterDescriptor = {
  id: string;
  displayName: string;
  description?: string;
  type: string;
  enabled: boolean;
  appDir: string;
  runtime?: {
    kind: string;
    platform: string;
    requiredExecutable: string;
    versionRequirement?: string;
  };
  upstream?: {
    name: string;
    repositoryUrl: string;
    installDocs?: string;
    checkoutRef?: string;
    installMode: "source-checkout" | "package" | "manual" | "unknown";
    notes?: string;
  };
  commands: {
    setup?: string | null;
    start?: string | null;
    stop?: string | null;
  };
  env?: {
    files?: string[];
    variables?: Record<string, string>;
  };
  dataDir: string;
  logFile: string;
  pidFile: string;
  health?: Record<string, unknown>;
  portal?: {
    label?: string;
    url?: string | null;
    group?: string;
  };
  integration?: {
    status?: string;
    productionReady?: boolean;
    verifiedAt?: string | null;
    summary?: string;
    sources?: string[];
    platform?: string;
    strategy?: string;
  };
  dependsOn?: string[];
};

export type AdapterValidation = {
  id: string;
  valid: boolean;
  errors: string[];
};

export type IntegrationReadiness = {
  id: string;
  status: string;
  productionReady: boolean;
  verifiedAt: string | null;
  summary: string;
  sources: string[];
  platform: string | null;
  strategy: string | null;
};

export type ServiceStatus = {
  id: string;
  displayName: string;
  status: string;
  pidFile: string;
  logFile: string;
  portalUrl: string | null;
  processId: number | null;
  placeholder: boolean | null;
  health: {
    type: string;
    ready: boolean;
    reason: string;
    url?: string | null;
    statusCode?: number | null;
  };
};

export type PortDiagnostic = {
  name: string;
  host: string;
  port: number;
  available: boolean;
};

export type PathDiagnostic = {
  path: string;
  type: "directory" | "file";
  required: boolean;
  exists: boolean;
};

export type SetupAction = {
  id: string;
  category: "runtime" | "adapter-integration" | "env-file" | "port" | "path" | "data" | "wsl2";
  severity: "info" | "warning" | "error";
  title: string;
  detail: string;
  command?: string;
  path?: string;
  docs?: string;
  serviceId?: string;
};

export type EnvFileDiagnostic = {
  serviceId: string;
  path: string;
  exists: boolean;
  examplePath: string;
  exampleExists: boolean;
};

export type EnvInitSkipped = {
  serviceId: string;
  path: string;
  examplePath: string;
  reason: "exists" | "missing-example";
};

export type EnvInitFileResult = {
  serviceId: string;
  path: string;
  examplePath: string;
  action: "created" | "would-create" | "skipped";
  reason: "exists" | "missing-example" | null;
};

export type EnvInitResult = {
  root: string;
  dryRun: boolean;
  files: EnvInitFileResult[];
  created: string[];
  skipped: EnvInitSkipped[];
  messages: string[];
};

export type ServiceEnvFileResult = {
  path: string;
  exists: boolean;
  loaded: boolean;
  variables: string[];
  errors: string[];
};

export type ServiceEnvironment = {
  root: string;
  serviceId: string;
  env: Record<string, string>;
  files: ServiceEnvFileResult[];
  messages: string[];
};

export type ServiceEnvironmentDiagnostic = {
  root: string;
  serviceId: string;
  files: ServiceEnvFileResult[];
  variables: string[];
  messages: string[];
};

export type WslDistroDiagnostic = {
  name: string;
  state: string | null;
  version: number | null;
  default: boolean;
};

export type WslDiagnostic = {
  root: string;
  executablePath: string | null;
  found: boolean;
  statusSucceeded: boolean;
  statusText: string | null;
  listSucceeded: boolean;
  listText: string | null;
  distros: WslDistroDiagnostic[];
  defaultDistro: string | null;
  hasWsl2Distro: boolean;
  messages: string[];
};
