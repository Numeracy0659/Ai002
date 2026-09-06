import { describe, expect, it } from "vitest";

import {
  decodeProjectArchive,
  encodeProjectArchive,
  ProjectArchiveError,
  validateArchiveEntries,
  validateProjectSnapshot,
} from "../lib/codeforge-archives";

const snapshot = {
  manifest: {
    schemaVersion: 1 as const,
    projectId: "project-demo-1234",
    name: "demo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    files: [
      { path: "src/main.ts", size: 25 },
      { path: "README.md", size: 6 },
    ],
  },
  files: [
    { path: "src/main.ts", content: "export const answer = 42;", size: 25 },
    { path: "README.md", content: "# Demo", size: 6 },
  ],
};

describe("CodeForge project archives", () => {
  it("round-trips metadata and recursive files through ZIP", () => {
    const decoded = decodeProjectArchive(encodeProjectArchive(snapshot));
    expect(decoded.manifest).toMatchObject({ projectId: "project-demo-1234", name: "demo" });
    expect(decoded.files).toEqual([...snapshot.files].sort((left, right) => left.path.localeCompare(right.path)));
  });

  it("rejects ZIP-slip and duplicate paths", () => {
    expect(() => validateArchiveEntries({ "../secret.txt": new Uint8Array([1]) })).toThrow(ProjectArchiveError);
    expect(() => validateArchiveEntries({ "src/a.ts": new Uint8Array([1]), "src\\a.ts": new Uint8Array([2]) })).toThrow("duplicate");
    expect(() => validateArchiveEntries({ "/absolute.txt": new Uint8Array([1]) })).toThrow("absolute");
  });

  it("rejects archives without CodeForge metadata", () => {
    const archive = new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => decodeProjectArchive(archive)).toThrow("project.json");
  });

  it("rejects invalid project snapshots before writing", () => {
    expect(() => validateProjectSnapshot({ ...snapshot, files: [{ path: "../secret", content: "x", size: 1 }] })).toThrow("unsafe path");
    expect(() => validateProjectSnapshot({ ...snapshot, files: [{ path: "src/main.ts", content: "x", size: 99 }] })).toThrow("size metadata");
    expect(() => validateProjectSnapshot({ ...snapshot, files: [snapshot.files[0], { ...snapshot.files[0] }] })).toThrow("duplicate");
  });
});
