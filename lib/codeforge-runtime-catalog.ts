import {
  BUILTIN_RUNTIME_PROVIDERS,
  type AndroidAbi,
  type PolicyDiagnostic,
  type RuntimeArtifact,
  type RuntimeProvider,
  validateProvider,
} from "./codeforge-runtime-trust";

export const RUNTIME_CATALOG_SCHEMA_VERSION = 1 as const;

export type RuntimeCatalog = {
  schemaVersion: typeof RUNTIME_CATALOG_SCHEMA_VERSION;
  catalogId: string;
  generatedAt: string;
  signerKeyId: string;
  signature: string;
  providers: RuntimeProvider[];
};

export type HostRuntimeTuple = { apiLevel: number; abi: AndroidAbi; offline: boolean };

export type CatalogDiagnostic = PolicyDiagnostic & { providerId?: string; artifactId?: string };

function diagnostic(code: string, message: string, providerId?: string, artifactId?: string): CatalogDiagnostic {
  return { code, message, providerId, artifactId };
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function validateRuntimeCatalog(catalog: RuntimeCatalog): CatalogDiagnostic[] {
  const diagnostics: CatalogDiagnostic[] = [];
  if (catalog.schemaVersion !== RUNTIME_CATALOG_SCHEMA_VERSION) diagnostics.push(diagnostic("catalog.schema.unsupported", "Runtime catalog schema is unsupported"));
  if (!catalog.catalogId || !catalog.signerKeyId || !catalog.signature) diagnostics.push(diagnostic("catalog.integrity.missing", "Catalog identity, signer, and signature are required"));
  const providerIds = new Set<string>();
  for (const provider of catalog.providers) {
    if (providerIds.has(provider.providerId)) diagnostics.push(diagnostic("provider.duplicate", "Runtime provider IDs must be unique", provider.providerId));
    providerIds.add(provider.providerId);
    for (const error of validateProvider(provider)) diagnostics.push({ ...error, providerId: provider.providerId });
    const artifactIds = new Set<string>();
    for (const artifact of provider.artifacts) {
      if (artifactIds.has(artifact.artifactId)) diagnostics.push(diagnostic("artifact.duplicate", "Runtime artifact IDs must be unique within a provider", provider.providerId, artifact.artifactId));
      artifactIds.add(artifact.artifactId);
      if (!isSha256(artifact.digestSha256)) diagnostics.push(diagnostic("artifact.digest.invalid", "Runtime artifacts require a SHA-256 digest", provider.providerId, artifact.artifactId));
      if (!artifact.provenance) diagnostics.push(diagnostic("artifact.provenance.missing", "Runtime artifacts require provenance evidence", provider.providerId, artifact.artifactId));
    }
  }
  return diagnostics;
}

export function selectRuntimeProvider(
  catalog: RuntimeCatalog,
  providerId: string,
  host: HostRuntimeTuple,
  installedArtifactDigests: string[],
): { provider: RuntimeProvider; artifact: RuntimeArtifact } | null {
  const provider = catalog.providers.find((candidate) => candidate.providerId === providerId && candidate.status === "verified");
  if (!provider) return null;
  const artifact = provider.artifacts.find((candidate) => candidate.supportedAbis.includes(host.abi)
    && host.apiLevel >= candidate.minApiLevel
    && (candidate.maxApiLevel === undefined || host.apiLevel <= candidate.maxApiLevel)
    && installedArtifactDigests.includes(candidate.digestSha256));
  return artifact ? { provider, artifact } : null;
}

export function createEmptyRuntimeCatalog(generatedAt: string): RuntimeCatalog {
  return {
    schemaVersion: RUNTIME_CATALOG_SCHEMA_VERSION,
    catalogId: "builtin-pending",
    generatedAt,
    signerKeyId: "unsigned-development-catalog",
    signature: "unsigned-development-catalog",
    providers: BUILTIN_RUNTIME_PROVIDERS,
  };
}
