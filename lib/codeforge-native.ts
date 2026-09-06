import { NativeModules, Platform } from "react-native";

export type NativeHostState = {
  apiLevel: number;
  abi: string;
  offline: boolean;
  nativeEnforcementAvailable: boolean;
  capabilities: string[];
  packageName: string;
  signerSha256: string;
};

export type ArtifactVerification = {
  verified: boolean;
  actualSha256: string;
  verificationId: string;
};

export type NativeTrustState = {
  projectId: string;
  trustState: "unknown" | "unverified" | "verified" | "quarantined" | "revoked";
  artifactDigest?: string;
};

export type NativeCapabilityDecision = {
  capabilityId: string;
  trustState: NativeTrustState["trustState"];
  decision: "granted" | "denied";
  nativeEnforcementConfirmed: boolean;
  reason?: string;
};

type CodeForgeRuntimeNativeModule = {
  getHostState(): Promise<NativeHostState>;
  verifyArtifactSha256(base64Bytes: string, expectedSha256: string): Promise<ArtifactVerification>;
  setProjectTrust(projectId: string, requestedState: NativeTrustState["trustState"], artifactDigest: string | null, nativeVerified: boolean): Promise<NativeTrustState & { nativeVerified: boolean }>;
  getProjectTrust(projectId: string): Promise<NativeTrustState>;
  evaluateCapability(projectId: string, capabilityId: string): Promise<NativeCapabilityDecision>;
};

const nativeModule = NativeModules.CodeForgeRuntime as CodeForgeRuntimeNativeModule | undefined;

export const codeForgeNative = {
  available: Platform.OS === "android" && nativeModule !== undefined,
  async getHostState(): Promise<NativeHostState | null> {
    if (!nativeModule || Platform.OS !== "android") return null;
    return nativeModule.getHostState();
  },
  async verifyArtifactSha256(base64Bytes: string, expectedSha256: string): Promise<ArtifactVerification | null> {
    if (!nativeModule || Platform.OS !== "android") return null;
    return nativeModule.verifyArtifactSha256(base64Bytes, expectedSha256);
  },
  async setProjectTrust(projectId: string, requestedState: NativeTrustState["trustState"], artifactDigest: string | null, nativeVerified: boolean) {
    if (!nativeModule || Platform.OS !== "android") return null;
    return nativeModule.setProjectTrust(projectId, requestedState, artifactDigest, nativeVerified);
  },
  async getProjectTrust(projectId: string): Promise<NativeTrustState | null> {
    if (!nativeModule || Platform.OS !== "android") return null;
    return nativeModule.getProjectTrust(projectId);
  },
  async evaluateCapability(projectId: string, capabilityId: string): Promise<NativeCapabilityDecision | null> {
    if (!nativeModule || Platform.OS !== "android") return null;
    return nativeModule.evaluateCapability(projectId, capabilityId);
  },
};
