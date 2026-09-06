import { describe, expect, it } from "vitest";

import {
  createWorkspaceSnapshot,
  isValidWorkspacePath,
  migrateLegacyWorkspace,
  WorkspaceStore,
} from "../lib/codeforge-store";
import { FILES, INITIAL_CONTENT } from "../lib/codeforge-workspace";

function makeMemoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => void values.set(key, value),
    removeItem: async (key: string) => void values.delete(key),
  };
}

describe("CodeForge workspace store", () => {
  it("creates a normalized snapshot with a valid active file", () => {
    const snapshot = createWorkspaceSnapshot({ files: FILES, activeFile: "missing.ts", contents: INITIAL_CONTENT }, new Date("2026-01-01T00:00:00.000Z"));
    expect(snapshot.activeFile).toBe("main.py");
    expect(snapshot.savedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("migrates the legacy workspace shape", () => {
    const migrated = migrateLegacyWorkspace(JSON.stringify({ files: FILES, activeFile: "app.js", contents: INITIAL_CONTENT }));
    expect(migrated).toMatchObject({ activeFile: "app.js", files: FILES });
  });

  it("recovers an interrupted save and removes the recovery record", async () => {
    const storage = makeMemoryStorage();
    const store = new WorkspaceStore(storage);
    const snapshot = createWorkspaceSnapshot({ files: FILES, activeFile: "main.py", contents: INITIAL_CONTENT });
    await storage.setItem("codeforge.workspace.v2.recovery", JSON.stringify({ schemaVersion: 2, revision: 4, snapshot }));
    const result = await store.load();
    expect(result).toMatchObject({ recovered: true, revision: 4, snapshot });
    expect(await storage.getItem("codeforge.workspace.v2.recovery")).toBeNull();
    expect(await storage.getItem("codeforge.workspace.v2")).not.toBeNull();
  });

  it("writes atomically through the recovery key and increments revisions", async () => {
    const storage = makeMemoryStorage();
    const store = new WorkspaceStore(storage);
    const snapshot = createWorkspaceSnapshot({ files: FILES, activeFile: "main.py", contents: INITIAL_CONTENT });
    await expect(store.save(snapshot, 0)).resolves.toBe(1);
    await expect(store.save(snapshot, 1)).resolves.toBe(2);
    expect(await storage.getItem("codeforge.workspace.v2.recovery")).toBeNull();
    await expect(store.load()).resolves.toMatchObject({ revision: 2, recovered: false });
  });

  it("rejects unsafe project-relative paths", () => {
    expect(isValidWorkspacePath("src/main.ts")).toBe(true);
    expect(isValidWorkspacePath("../secrets.txt")).toBe(false);
    expect(isValidWorkspacePath("/absolute/path")).toBe(false);
    expect(isValidWorkspacePath("src\\main.ts")).toBe(false);
  });
});
