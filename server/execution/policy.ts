import { z } from "zod";

const MAX_SOURCE_BYTES = 256_000;
const MAX_INPUT_BYTES = 64_000;
const MAX_TIMEOUT_MS = 10_000;

export const ExecutionRequestSchema = z.object({
  language: z.enum(["javascript", "python"]),
  source: z.string().min(1).max(MAX_SOURCE_BYTES),
  input: z.string().max(MAX_INPUT_BYTES).default(""),
  timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).default(2_000),
  network: z.literal("denied").default("denied"),
  dependencies: z.array(z.string().regex(/^[a-zA-Z0-9._-]+$/)).max(10).default([]),
}).strict();

export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

export type ExecutionPlan = ExecutionRequest & {
  executable: "javascript-sandbox" | "python-sandbox";
  args: readonly string[];
};

export function createExecutionPlan(input: unknown): ExecutionPlan {
  const request = ExecutionRequestSchema.parse(input);
  return {
    ...request,
    executable: request.language === "python" ? "python-sandbox" : "javascript-sandbox",
    // Arguments are fixed constants. User data is passed through a structured job payload,
    // never concatenated into a shell command.
    args: ["--network=denied", `--timeout-ms=${request.timeoutMs}`],
  };
}

export function isPrivateOrMetadataHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" || normalized === "metadata.google.internal" || normalized === "metadata" ||
    normalized === "0.0.0.0" || normalized === "127.0.0.1" || normalized === "::1" ||
    normalized.startsWith("10.") || normalized.startsWith("192.168.") || normalized.startsWith("169.254.") ||
    normalized.startsWith("172.16.") || normalized.startsWith("172.17.") || normalized.startsWith("172.18.") ||
    normalized.startsWith("172.19.") || normalized.startsWith("172.2");
}

export const EXECUTION_LIMITS = { MAX_SOURCE_BYTES, MAX_INPUT_BYTES, MAX_TIMEOUT_MS } as const;
