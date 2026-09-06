import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const PROJECT_STORE_VERSION = 1 as const;
const ROOT_DIRECTORY = "codeforge/v1";
const MAX_ARCHIVE_ENTRIES = 2_000;
const MAX_FILE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 20_000_000;

export type ProjectFile = { path: string; content: string; size: number };
export type ProjectManifest = {
  schemaVersion: typeof PROJECT_STORE_VERSION;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  files: Array<{ path: string; size: number; sha256?: string }>;
};
export type ProjectSnapshot = { manifest: ProjectManifest; files: ProjectFile[] };

export type ByteArchive = Record<string, Uint8Array>;

export class ProjectArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectArchiveError";
  }
}

export function normalizeProjectPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) throw new ProjectArchiveError("Archive contains an absolute or invalid path");
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new ProjectArchiveError(`Archive contains an unsafe path: ${path}`);
  return parts.join("/");
}

export function validateArchiveEntries(entries: ByteArchive): string[] {
  const normalized = new Set<string>();
  let totalBytes = 0;
  const paths = Object.keys(entries);
  if (paths.length > MAX_ARCHIVE_ENTRIES) throw new ProjectArchiveError("Archive contains too many entries");
  for (const path of paths) {
    const safePath = normalizeProjectPath(path);
    if (normalized.has(safePath)) throw new ProjectArchiveError(`Archive contains a duplicate path: ${safePath}`);
    const bytes = entries[path];
    if (bytes.length > MAX_FILE_BYTES) throw new ProjectArchiveError(`File is too large: ${safePath}`);
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new ProjectArchiveError("Archive expands beyond the project size limit");
    normalized.add(safePath);
  }
  return [...normalized].sort();
}

export function encodeProjectArchive(snapshot: ProjectSnapshot): Uint8Array {
  const files: ByteArchive = {};
  files[".codeforge/project.json"] = strToU8(JSON.stringify(snapshot.manifest, null, 2));
  for (const file of snapshot.files) {
    const path = normalizeProjectPath(file.path);
    files[`tree/${path}`] = strToU8(file.content);
  }
  validateArchiveEntries(files);
  return zipSync(files, { level: 6 });
}

export function decodeProjectArchive(bytes: Uint8Array): ProjectSnapshot {
  let entries: ByteArchive;
  try {
    entries = unzipSync(bytes) as ByteArchive;
  } catch {
    throw new ProjectArchiveError("The selected file is not a readable ZIP archive");
  }
  const paths = validateArchiveEntries(entries);
  const manifestBytes = entries[".codeforge/project.json"];
  if (!manifestBytes) throw new ProjectArchiveError("Archive is missing .codeforge/project.json");
  let manifest: ProjectManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as ProjectManifest;
  } catch {
    throw new ProjectArchiveError("Project metadata is not valid JSON");
  }
  if (manifest.schemaVersion !== PROJECT_STORE_VERSION || typeof manifest.projectId !== "string" || typeof manifest.name !== "string") {
    throw new ProjectArchiveError("Unsupported project metadata version");
  }
  const files = paths.filter((path) => path.startsWith("tree/")).map((path) => {
    const relativePath = normalizeProjectPath(path.slice("tree/".length));
    const content = strFromU8(entries[path]);
    return { path: relativePath, content, size: entries[path].length };
  });
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { manifest, files };
}

