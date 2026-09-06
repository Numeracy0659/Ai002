import { sha256 } from "@noble/hashes/sha256";

export const RUNTIME_CONTRACT_VERSION = 1 as const;
export const TRUST_SCHEMA_VERSION = 1 as const;

export type ProviderStatus = "mock" | "native-pending" | "verified" | "deprecated";
export type TrustState = "unknown" | "unverified" | "verified" | "quarantined" | "revoked";
export type Decision = "granted" | "denied" | "needs-user-consent" | "unsupported" | "invalid" | "deferred";
export type AndroidAbi = "armeabi-v7a" | "arm64-v8a" | "x86" | "x86_64";
export type CapabilityId =
  | "storage.read"
  | "storage.write"
  | "provider.uriRead"
  | "provider.uriWrite"
  | "crypto.sign"
  | "clock"
  | "randomness"
  | "network.endpoint"
  | "background.schedule"
  | "diagnostics.log";

export type ResourceProfile = {
  id: string;
  maxMemoryBytes: number;
  maxStackBytes: number;
  maxThreads: number;
  maxOutputBytes: number;
  wallTimeMs: number;
  idleTimeMs: number;
  maxInputBytes: number;
  cancellation: "cooperative" | "host-termination" | "unsupported";
};

export type RuntimeArtifact = {
  artifactId: string;
  providerId: string;
  version: string;
  digestSha256: string;
  signerKeyId?: string;
  supportedAbis: AndroidAbi[];
  minApiLevel: number;
  maxApiLevel?: number;
  executable: boolean;
  provenance?: string;
};

export type RuntimeProvider = {
  providerId: string;
  displayName: string;
  engineVersion: string;
  contractVersion: typeof RUNTIME_CONTRACT_VERSION;
  status: ProviderStatus;
  supportedAbis: AndroidAbi[];
  minApiLevel: number;
  executionModes: Array<"interpreter" | "aot" | "embedded" | "mock">;
  capabilityVocabulary: CapabilityId[];
  resourceProfiles: ResourceProfile[];
  artifacts: RuntimeArtifact[];
  trustClass: "controlled" | "trusted-code";
};

export type CapabilityRequest = {
  capabilityId: CapabilityId;
  scope?: string;
  reason: string;
  required: boolean;
};

export type ProjectTrustRecord = {
  schemaVersion: typeof TRUST_SCHEMA_VERSION;
  projectId: string;
  artifactDigest?: string;
  signerKeyId?: string;
  trustState: TrustState;
  verificationMethod: "none" | "digest" | "signature" | "native-host";
  evidenceRef?: string;
  verifiedAt?: string;
  policyRevision: number;
  supportedProviderTuple?: { providerId: string; version: string; apiLevel: number; abi: AndroidAbi };
  revocationReason?: string;
};

export type CapabilityGrant = {
  grantId: string;
  projectId: string;
  capabilityId: CapabilityId;
  scope?: string;
  providerId: string;
  artifactDigest?: string;
  issuedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  grantedBy: "user" | "policy" | "system";
  consentRef?: string;
  hostPolicyRevision: number;
  enforcementEvidence: "notAttempted" | "requested" | "confirmed" | "failed" | "unknown";
};

export type HostCapabilities = {
  apiLevel: number;
  abi: AndroidAbi;
  offline: boolean;
  capabilities: CapabilityId[];
  verifiedArtifactDigests: string[];
  policyRevision: number;
  nativeEnforcementAvailable: boolean;
};

export type JobSpec = {
  contractVersion: typeof RUNTIME_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  providerId: string;
  artifactId: string;
  artifactDigestSha256: string;
  resourceProfileId: string;
  requestedCapabilities: CapabilityRequest[];
  input: string;
  offlineOnly: boolean;
  cancellationRequested?: boolean;
};

export type PolicyDiagnostic = { code: string; message: string; field?: string };
export type PolicyDecision = {
  decision: Decision;
  diagnostics: PolicyDiagnostic[];
  grants: CapabilityGrant[];
};

export type AuditEvent = {
  schemaVersion: typeof TRUST_SCHEMA_VERSION;
  sequence: number;
  eventId: string;
  previousEventHash: string;
  eventHash: string;
  occurredAt: string;
  actor: "user" | "system" | "native" | "mock";
  projectId: string;
  jobId?: string;
  providerId?: string;
  artifactDigest?: string;
  action: string;
  decision?: Decision;
  capabilityId?: CapabilityId;
  policyRevision: number;
  nativeEnforcementStatus: "notAttempted" | "requested" | "confirmed" | "failed" | "unknown";
  errorCode?: string;
  metadata: Record<string, string | number | boolean>;
};

export type RuntimeExecutionResult = {
  source: "mock" | "native";
  status: "completed" | "failed" | "cancelled" | "timed-out" | "denied";
  output: string;
  outputBytes: number;
  runtimeVersion: string;
  providerId: string;
  diagnostics: PolicyDiagnostic[];
};

export interface NativeRuntimeAdapter {
  verifyArtifact(artifact: RuntimeArtifact): Promise<{ verified: boolean; evidenceRef?: string; diagnostic?: PolicyDiagnostic }>;
  execute(job: JobSpec, grants: CapabilityGrant[]): Promise<RuntimeExecutionResult>;
  cancel(jobId: string): Promise<void>;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function sha256Hex(value: string): string {
  return Array.from(sha256(new TextEncoder().encode(value))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function diagnostic(code: string, message: string, field?: string): PolicyDiagnostic {
  return { code, message, field };
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function validateProvider(provider: RuntimeProvider): PolicyDiagnostic[] {
  const errors: PolicyDiagnostic[] = [];
  if (!provider.providerId || !provider.engineVersion) errors.push(diagnostic("provider.identity.required", "Provider identity and engine version are required"));
  if (provider.contractVersion !== RUNTIME_CONTRACT_VERSION) errors.push(diagnostic("provider.contract.unsupported", "Provider contract version is unsupported", "contractVersion"));
  if (provider.minApiLevel < 1) errors.push(diagnostic("provider.api.invalid", "Provider minimum API level must be positive", "minApiLevel"));
  if (provider.supportedAbis.length === 0) errors.push(diagnostic("provider.abi.empty", "Provider must declare at least one ABI", "supportedAbis"));
  if (provider.artifacts.some((artifact) => artifact.providerId !== provider.providerId || !isSha256(artifact.digestSha256))) errors.push(diagnostic("provider.artifact.invalid", "Every artifact must belong to the provider and have a SHA-256 digest", "artifacts"));
  if (provider.resourceProfiles.some((profile) => profile.maxMemoryBytes <= 0 || profile.maxStackBytes <= 0 || profile.maxOutputBytes <= 0 || profile.wallTimeMs <= 0 || profile.maxThreads < 1)) errors.push(diagnostic("provider.resource.invalid", "Resource limits must be positive and bounded", "resourceProfiles"));
  return errors;
}

export function validateJobSpec(job: JobSpec, provider: RuntimeProvider, host: HostCapabilities, trust: ProjectTrustRecord): PolicyDiagnostic[] {
  const errors: PolicyDiagnostic[] = [];
  if (job.contractVersion !== RUNTIME_CONTRACT_VERSION) errors.push(diagnostic("job.contract.unsupported", "Job contract version is unsupported", "contractVersion"));
  if (provider.status === "deprecated") errors.push(diagnostic("provider.deprecated", "The selected runtime provider is deprecated", "providerId"));
  if (provider.status === "mock" && !provider.executionModes.includes("mock")) errors.push(diagnostic("provider.mock.invalid", "Mock provider must declare mock execution mode"));
  const artifact = provider.artifacts.find((item) => item.artifactId === job.artifactId && item.digestSha256 === job.artifactDigestSha256);
  if (!artifact) errors.push(diagnostic("artifact.mismatch", "The artifact is not registered with the exact requested digest", "artifactDigestSha256"));
  if (artifact && (!artifact.supportedAbis.includes(host.abi) || host.apiLevel < artifact.minApiLevel || (artifact.maxApiLevel !== undefined && host.apiLevel > artifact.maxApiLevel))) errors.push(diagnostic("artifact.incompatible", "The artifact is incompatible with this Android API/ABI tuple"));
  if (!isSha256(job.artifactDigestSha256)) errors.push(diagnostic("artifact.digest.invalid", "Executable artifacts require a valid SHA-256 digest", "artifactDigestSha256"));
  if (artifact?.executable && !host.verifiedArtifactDigests.includes(artifact.digestSha256)) errors.push(diagnostic("artifact.unverified", "Executable artifact lacks native verification evidence"));
  if (trust.projectId !== job.projectId || ["unknown", "unverified", "quarantined", "revoked"].includes(trust.trustState)) errors.push(diagnostic("trust.not_verified", "Project trust is not verified for execution"));
  if (job.input.length > (provider.resourceProfiles.find((profile) => profile.id === job.resourceProfileId)?.maxInputBytes ?? 0)) errors.push(diagnostic("job.input.too_large", "Job input exceeds the selected resource profile", "input"));
  if (job.offlineOnly && !host.offline) errors.push(diagnostic("job.offline_required", "This job requires offline mode but the host is online"));
  const unknownCapabilities = job.requestedCapabilities.filter((request) => !provider.capabilityVocabulary.includes(request.capabilityId));
  if (unknownCapabilities.length > 0) errors.push(diagnostic("capability.unsupported", "Job requests capabilities that the provider does not declare"));
  return errors;
}

function grantIsActive(grant: CapabilityGrant, now: Date): boolean {
  if (grant.revokedAt || (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime())) return false;
  return true;
}

export function evaluateCapabilityPolicy(input: { job: JobSpec; provider: RuntimeProvider; host: HostCapabilities; trust: ProjectTrustRecord; grants: CapabilityGrant[]; now?: Date }): PolicyDecision {
  const now = input.now ?? new Date();
  const diagnostics = validateJobSpec(input.job, input.provider, input.host, input.trust);
  const activeGrants = input.grants.filter((grant) => grant.projectId === input.job.projectId && grant.providerId === input.job.providerId && grant.hostPolicyRevision === input.host.policyRevision && grantIsActive(grant, now));
  const resolved: CapabilityGrant[] = [];
  for (const request of input.job.requestedCapabilities) {
    const grant = activeGrants.find((candidate) => candidate.capabilityId === request.capabilityId && candidate.scope === request.scope);
    if (!grant) diagnostics.push(diagnostic("capability.grant.missing", `Capability ${request.capabilityId} has no active scoped grant`, request.capabilityId));
    else if (grant.enforcementEvidence === "failed" || grant.enforcementEvidence === "unknown") diagnostics.push(diagnostic("capability.enforcement.unconfirmed", `Native enforcement is not confirmed for ${request.capabilityId}`, request.capabilityId));
    else resolved.push(grant);
  }
  if (diagnostics.length > 0) {
    const denialCodes = new Set(["trust.not_verified", "artifact.unverified", "artifact.mismatch", "artifact.incompatible", "artifact.digest.invalid"]);
    return { decision: diagnostics.some((item) => denialCodes.has(item.code)) ? "denied" : "invalid", diagnostics, grants: [] };
  }
  if (!input.host.nativeEnforcementAvailable && resolved.length > 0) return { decision: "deferred", diagnostics: [diagnostic("host.native_pending", "Native enforcement is not available on this host")], grants: [] };
  return { decision: "granted", diagnostics: [], grants: resolved };
}

export function createAuditEvent(input: Omit<AuditEvent, "eventHash" | "previousEventHash">, previousEventHash = "0".repeat(64)): AuditEvent {
  const withoutHashes = { ...input, previousEventHash };
  return { ...withoutHashes, eventHash: sha256Hex(canonicalJson(withoutHashes)) };
}

export function redactTrustExport(input: { trust: ProjectTrustRecord; grants: CapabilityGrant[]; audit: AuditEvent[] }): Record<string, unknown> {
  return {
    schemaVersion: TRUST_SCHEMA_VERSION,
    trust: { ...input.trust, evidenceRef: input.trust.evidenceRef ? "redacted-evidence-ref" : undefined },
    grants: input.grants.map(({ grantId, projectId, capabilityId, scope, providerId, artifactDigest, issuedAt, expiresAt, revokedAt, revocationReason, grantedBy, hostPolicyRevision, enforcementEvidence }) => ({ grantId, projectId, capabilityId, scope, providerId, artifactDigest, issuedAt, expiresAt, revokedAt, revocationReason, grantedBy, hostPolicyRevision, enforcementEvidence })),
    audit: input.audit.map(({ schemaVersion, sequence, eventId, previousEventHash, eventHash, occurredAt, actor, projectId, jobId, providerId, artifactDigest, action, decision, capabilityId, policyRevision, nativeEnforcementStatus, errorCode }) => ({ schemaVersion, sequence, eventId, previousEventHash, eventHash, occurredAt, actor, projectId, jobId, providerId, artifactDigest, action, decision, capabilityId, policyRevision, nativeEnforcementStatus, errorCode })),
  };
}

export function migrateTrustRecord(input: unknown): { record: ProjectTrustRecord | null; migrated: boolean; diagnostics: PolicyDiagnostic[] } {
  if (!input || typeof input !== "object") return { record: null, migrated: false, diagnostics: [diagnostic("trust.invalid", "Trust record is not an object")] };
  const value = input as Record<string, unknown>;
  if (value.schemaVersion === TRUST_SCHEMA_VERSION && typeof value.projectId === "string" && typeof value.trustState === "string") return { record: value as unknown as ProjectTrustRecord, migrated: false, diagnostics: [] };
  if (typeof value.projectId !== "string") return { record: null, migrated: false, diagnostics: [diagnostic("trust.project.required", "Trust record has no project identity")] };
  return {
    record: {
      schemaVersion: TRUST_SCHEMA_VERSION,
      projectId: value.projectId,
      trustState: "unverified",
      verificationMethod: "none",
      policyRevision: 1,
    },
    migrated: true,
    diagnostics: [diagnostic("trust.legacy_reconsent", "Legacy trust fields were not treated as verified; explicit verification and consent are required")],
  };
}

export const BUILTIN_RUNTIME_PROVIDERS: RuntimeProvider[] = [
  {
    providerId: "wasm-wasi",
    displayName: "WebAssembly / WASI",
    engineVersion: "native-pending",
    contractVersion: RUNTIME_CONTRACT_VERSION,
    status: "native-pending",
    supportedAbis: ["arm64-v8a", "x86_64"],
    minApiLevel: 26,
    executionModes: ["interpreter", "aot"],
    capabilityVocabulary: ["clock", "randomness", "diagnostics.log", "storage.read", "storage.write"],
    resourceProfiles: [{ id: "wasm-default", maxMemoryBytes: 64 * 1024 * 1024, maxStackBytes: 1024 * 1024, maxThreads: 1, maxOutputBytes: 256 * 1024, wallTimeMs: 10_000, idleTimeMs: 5_000, maxInputBytes: 256 * 1024, cancellation: "host-termination" }],
    artifacts: [],
    trustClass: "controlled",
  },
  {
    providerId: "quickjs-embedded",
    displayName: "JavaScript (QuickJS)",
    engineVersion: "native-pending",
    contractVersion: RUNTIME_CONTRACT_VERSION,
    status: "native-pending",
    supportedAbis: ["arm64-v8a", "x86_64"],
    minApiLevel: 26,
    executionModes: ["embedded"],
    capabilityVocabulary: ["clock", "randomness", "diagnostics.log"],
    resourceProfiles: [{ id: "quickjs-default", maxMemoryBytes: 32 * 1024 * 1024, maxStackBytes: 512 * 1024, maxThreads: 1, maxOutputBytes: 128 * 1024, wallTimeMs: 5_000, idleTimeMs: 2_000, maxInputBytes: 128 * 1024, cancellation: "cooperative" }],
    artifacts: [],
    trustClass: "controlled",
  },
  {
    providerId: "cpython-android",
    displayName: "Python (embedded CPython)",
    engineVersion: "native-pending",
    contractVersion: RUNTIME_CONTRACT_VERSION,
    status: "native-pending",
    supportedAbis: ["arm64-v8a", "x86_64"],
    minApiLevel: 26,
    executionModes: ["embedded"],
    capabilityVocabulary: ["clock", "randomness", "diagnostics.log", "storage.read"],
    resourceProfiles: [{ id: "cpython-default", maxMemoryBytes: 128 * 1024 * 1024, maxStackBytes: 2 * 1024 * 1024, maxThreads: 1, maxOutputBytes: 256 * 1024, wallTimeMs: 10_000, idleTimeMs: 5_000, maxInputBytes: 256 * 1024, cancellation: "host-termination" }],
    artifacts: [],
    trustClass: "trusted-code",
  },
];
