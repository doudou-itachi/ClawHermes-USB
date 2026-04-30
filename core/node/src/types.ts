export type RuntimeDiagnostic = {
  name: string;
  label: string;
  path: string;
  found: boolean;
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
};

export type ServiceStatus = {
  id: string;
  displayName: string;
  status: string;
  pidFile: string;
  logFile: string;
  portalUrl: string | null;
};
