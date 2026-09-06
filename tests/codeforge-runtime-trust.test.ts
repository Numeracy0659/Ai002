import { describe, expect, it } from "vitest";

import {
  BUILTIN_RUNTIME_PROVIDERS,
  canonicalJson,
  createAuditEvent,
  evaluateCapabilityPolicy,
  migrateTrustRecord,
  redactTrustExport,
  sha256Hex,
  validateProvider,
  type CapabilityGrant,
  type HostCapabilities,
  type JobSpec,
  type ProjectTrustRecord,
  type RuntimeProvider,
} from "../lib/codeforge-runtime-trust";

const digest = sha256Hex("wasm-runtime-fixture");
const provider: RuntimeProvider = {
  ...BUILTIN_RUNTIME_PROVIDERS[0],
  status: "verified",
  artifacts: [{ artifactId: "wasm-fixture", providerId: "wasm-wasi", version: "1", digestSha256: digest, supportedAbis: ["arm64-v8a"], minApiLevel: 26, executable: true }],
};
const host: HostCapabilities = {
  apiLevel: 35,
  abi: "arm64-v8a",
  offline: true,
  capabilities: ["diagnostics.log"],
  verifiedArtifactDigests: [digest],
  policyRevision: 7,
  nativeEnforcementAvailable: true,
};
const trust: ProjectTrustRecord = {
  schemaVersion: 1,
  projectId: "project-1",
  artifactDigest: digest,
  trustState: "verified",
  verificationMethod: "native-host",
  policyRevision: 7,
};
const job: JobSpec = {
  contractVersion: 1,
  jobId: "job-1",
  projectId: "project-1",
  providerId: "wasm-wasi",
  artifactId: "wasm-fixture",
  artifactDigestSha256: digest,
  resourceProfileId: "wasm-default",
  requestedCapabilities: [{ capabilityId: "diagnostics.log", reason: "show program output", required: true }],
  input: "nonce",
  offlineOnly: true,
};
const grant: CapabilityGrant = {
  grantId: "grant-1",
  projectId: "project-1",
  capabilityId: "diagnostics.log",
  providerId: "wasm-wasi",
  artifactDigest: digest,
  issuedAt: "2026-01-01T00:00:00.000Z",
  grantedBy: "user",
  hostPolicyRevision: 7,
  enforcementEvidence: "confirmed",
};

describe("runtime provider and trust policy", () => {
  it("canonicalizes object keys and hashes deterministically", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(sha256Hex("hello")).toHaveLength(64);
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
  });

  it("validates the built-in provider registry without claiming native readiness", () => {
    expect(validateProvider(provider)).toEqual([]);
    expect(BUILTIN_RUNTIME_PROVIDERS.every((item) => item.status === "native-pending")).toBe(true);
  });

  it("grants only an exact artifact, trust, policy revision, and scoped enforcement record", () => {
    expect(evaluateCapabilityPolicy({ job, provider, host, trust, grants: [grant] }).decision).toBe("granted");
    expect(evaluateCapabilityPolicy({ job, provider, host, trust, grants: [] }).decision).not.toBe("granted");
    expect(evaluateCapabilityPolicy({ job: { ...job, artifactDigestSha256: "f".repeat(64) }, provider, host, trust, grants: [grant] }).decision).toBe("denied");
    expect(evaluateCapabilityPolicy({ job, provider, host: { ...host, nativeEnforcementAvailable: false }, trust, grants: [grant] }).decision).toBe("deferred");
  });

  it("denies unverified projects even when a capability grant exists", () => {
    const result = evaluateCapabilityPolicy({ job, provider, host, trust: { ...trust, trustState: "unverified" }, grants: [grant] });
    expect(result.decision).toBe("denied");
    expect(result.diagnostics.some((item) => item.code === "trust.not_verified")).toBe(true);
  });

  it("migrates legacy trust without silently granting verification", () => {
    const result = migrateTrustRecord({ projectId: "legacy-project", trusted: true });
    expect(result.migrated).toBe(true);
    expect(result.record?.trustState).toBe("unverified");
    expect(result.diagnostics[0]?.code).toBe("trust.legacy_reconsent");
  });

  it("creates a tamper-evident audit chain and redacts evidence details", () => {
    const first = createAuditEvent({ schemaVersion: 1, sequence: 1, eventId: "event-1", occurredAt: "2026-01-01T00:00:00.000Z", actor: "user", projectId: "project-1", action: "grant", policyRevision: 7, nativeEnforcementStatus: "confirmed", metadata: { secret: "must-not-export" } });
    const second = createAuditEvent({ schemaVersion: 1, sequence: 2, eventId: "event-2", occurredAt: "2026-01-01T00:00:01.000Z", actor: "system", projectId: "project-1", action: "run", policyRevision: 7, nativeEnforcementStatus: "requested", metadata: {} }, first.eventHash);
    expect(second.previousEventHash).toBe(first.eventHash);
    expect(second.eventHash).not.toBe(first.eventHash);
    const exported = redactTrustExport({ trust, grants: [grant], audit: [first, second] });
    expect(JSON.stringify(exported)).not.toContain("must-not-export");
    expect(exported).not.toHaveProperty("privateKey");
  });
});
