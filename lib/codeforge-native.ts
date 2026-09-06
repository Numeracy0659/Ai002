import { DeviceEventEmitter, NativeModules, Platform, type EmitterSubscription } from "react-native";

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

export type TerminalStartResult = {
  sessionId: string;
  state: "running";
  cwd: string;
  pty: boolean;
  transport: "android-process-pipes";
};

export type TerminalEvent = {
  sessionId: string;
  kind: "started" | "output" | "output-truncated" | "signal" | "exit" | "error";
  payload?: string;
};

type CodeForgeRuntimeNativeModule = {
  getHostState(): Promise<NativeHostState>;
  verifyArtifactSha256(base64Bytes: string, expectedSha256: string): Promise<ArtifactVerification>;
  setProjectTrust(projectId: string, requestedState: NativeTrustState["trustState"], artifactDigest: string | null, nativeVerified: boolean): Promise<NativeTrustState & { nativeVerified: boolean }>;
  getProjectTrust(projectId: string): Promise<NativeTrustState>;
  evaluateCapability(projectId: string, capabilityId: string): Promise<NativeCapabilityDecision>;
  startTerminal(): Promise<TerminalStartResult>;
  writeTerminalInput(sessionId: string, input: string): Promise<void>;
  interruptTerminal(sessionId: string): Promise<void>;
  terminateTerminal(sessionId: string): Promise<void>;
  getTerminalState(sessionId: string): Promise<{ sessionId: string; state: string; pty: boolean; transport: string }>;
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
  async startTerminal(): Promise<TerminalStartResult | null> {
    if (!nativeModule || Platform.OS !== "android") return null;
    return nativeModule.startTerminal();
  },
  async writeTerminalInput(sessionId: string, input: string): Promise<void> {
    if (!nativeModule || Platform.OS !== "android") throw new Error("The Android terminal bridge is unavailable");
    return nativeModule.writeTerminalInput(sessionId, input);
  },
  async interruptTerminal(sessionId: string): Promise<void> {
    if (!nativeModule || Platform.OS !== "android") throw new Error("The Android terminal bridge is unavailable");
    return nativeModule.interruptTerminal(sessionId);
  },
  async terminateTerminal(sessionId: string): Promise<void> {
    if (!nativeModule || Platform.OS !== "android") throw new Error("The Android terminal bridge is unavailable");
    return nativeModule.terminateTerminal(sessionId);
  },
  subscribeTerminalEvents(listener: (event: TerminalEvent) => void): EmitterSubscription | null {
    if (!nativeModule || Platform.OS !== "android") return null;
    return DeviceEventEmitter.addListener("CodeForgeTerminalEvent", listener);
  },
};
