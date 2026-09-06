import { describe, expect, it } from "vitest";

import { createEmptyRuntimeCatalog, selectRuntimeProvider, validateRuntimeCatalog } from "../lib/codeforge-runtime-catalog";

const digest = "a".repeat(64);

function verifiedCatalog() {
  const catalog = createEmptyRuntimeCatalog("2026-09-06T00:00:00.000Z");
  catalog.catalogId = "catalog-1";
  catalog.signerKeyId = "test-key";
  catalog.signature = "test-signature";
  catalog.providers = [{
    providerId: "test-runtime",
    displayName: "Test runtime",
    engineVersion: "1.0.0",
    contractVersion: 1,
    status: "verified",
    supportedAbis: ["arm64-v8a"],
    minApiLevel: 26,
    executionModes: ["interpreter"],
    capabilityVocabulary: ["diagnostics.log"],
    resourceProfiles: [{ id: "default", maxMemoryBytes: 1024, maxStackBytes: 1024, maxThreads: 1, maxOutputBytes: 1024, wallTimeMs: 1000, idleTimeMs: 1000, maxInputBytes: 1024, cancellation: "host-termination" }],
    artifacts: [{ artifactId: "test-artifact", providerId: "test-runtime", version: "1.0.0", digestSha256: digest, supportedAbis: ["arm64-v8a"], minApiLevel: 26, executable: true, provenance: "test-source" }],
    trustClass: "controlled",
  }];
  return catalog;
}

describe("CodeForge runtime catalog", () => {
  it("rejects duplicate providers, duplicate artifacts, and missing provenance", () => {
    const catalog = verifiedCatalog();
    catalog.providers.push(catalog.providers[0]);
    catalog.providers[0].artifacts.push({ ...catalog.providers[0].artifacts[0], provenance: undefined });
    const codes = validateRuntimeCatalog(catalog).map((item) => item.code);
    expect(codes).toContain("provider.duplicate");
    expect(codes).toContain("artifact.duplicate");
    expect(codes).toContain("artifact.provenance.missing");
  });

  it("selects only verified, compatible, installed artifacts", () => {
    const catalog = verifiedCatalog();
    expect(selectRuntimeProvider(catalog, "test-runtime", { apiLevel: 34, abi: "arm64-v8a", offline: true }, [digest])?.artifact.artifactId).toBe("test-artifact");
    expect(selectRuntimeProvider(catalog, "test-runtime", { apiLevel: 25, abi: "arm64-v8a", offline: true }, [digest])).toBeNull();
    expect(selectRuntimeProvider(catalog, "test-runtime", { apiLevel: 34, abi: "x86_64", offline: true }, [digest])).toBeNull();
    expect(selectRuntimeProvider(catalog, "test-runtime", { apiLevel: 34, abi: "arm64-v8a", offline: true }, [])).toBeNull();
  });
});
