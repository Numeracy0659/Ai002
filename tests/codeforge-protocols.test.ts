import { describe, expect, it } from "vitest";

import { createExecutionPlan, isPrivateOrMetadataHost } from "../server/execution/policy";
import { getRepository, listContents } from "../lib/github-api";
import { encodeLspMessage, LspFrameParser, makeRequest } from "../lib/lsp-wire";

describe("execution policy", () => {
  it("creates a fixed, network-denied plan", () => {
    expect(createExecutionPlan({ language: "python", source: "print(1)" })).toMatchObject({
      executable: "python-sandbox",
      network: "denied",
      args: ["--network=denied", "--timeout-ms=2000"],
    });
  });

  it("rejects unsafe execution policy expansion and private hosts", () => {
    expect(() => createExecutionPlan({ language: "python", source: "x", network: "allowed" })).toThrow();
    expect(isPrivateOrMetadataHost("169.254.169.254")).toBe(true);
    expect(isPrivateOrMetadataHost("example.com")).toBe(false);
  });
});

describe("GitHub REST client", () => {
  it("maps repository and contents responses without a token", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const url = String(input);
      return new Response(url.endsWith("/contents") ? JSON.stringify([{ name: "package.json", path: "package.json", sha: "abc", type: "file", size: 120, download_url: null }]) : JSON.stringify({ id: 1, full_name: "Numeracy0659/Ai002", default_branch: "main", private: false, html_url: "https://github.com/Numeracy0659/Ai002" }), { status: 200 });
    };
    await expect(getRepository("Numeracy0659", "Ai002", undefined, fetchImpl)).resolves.toMatchObject({ fullName: "Numeracy0659/Ai002", defaultBranch: "main" });
    await expect(listContents("Numeracy0659", "Ai002", "", undefined, fetchImpl)).resolves.toEqual([{ name: "package.json", path: "package.json", sha: "abc", type: "file", size: 120, downloadUrl: null }]);
    expect(calls).toHaveLength(2);
  });

  it("rejects traversal paths", async () => {
    await expect(listContents("Numeracy0659", "Ai002", "../secrets")).rejects.toThrow("Invalid repository path");
  });
});

describe("LSP wire protocol", () => {
  it("encodes byte length and parses fragmented UTF-8 messages", () => {
    const encoded = encodeLspMessage(makeRequest("1", "initialize", { message: "✓" }));
    const parser = new LspFrameParser();
    expect(parser.push(encoded.slice(0, 9))).toEqual([]);
    expect(parser.push(encoded.slice(9))).toEqual([{ jsonrpc: "2.0", id: "1", method: "initialize", params: { message: "✓" } }]);
  });

  it("rejects malformed LSP headers and methods", () => {
    expect(() => new LspFrameParser().push(new TextEncoder().encode("Content-Length: 1\r\n\r\n{"))).toThrow();
    expect(() => makeRequest(1, "bad method")).toThrow("Invalid LSP method");
  });
});
