import * as FileSystem from "expo-file-system/legacy";
import { decodeProjectArchive, encodeProjectArchive, normalizeProjectPath, validateProjectSnapshot, type ProjectFile, type ProjectManifest, type ProjectSnapshot } from "./codeforge-archives";

export * from "./codeforge-archives";

const ROOT_DIRECTORY = "codeforge/v1";
const PROJECT_STORE_VERSION = 1 as const;
const MAX_ARCHIVE_ENTRIES = 2_000;
const MAX_FILE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 20_000_000;

function requireDocumentDirectory(): string {
  if (!FileSystem.documentDirectory) throw new Error("CodeForge document storage is unavailable on this platform");
  return FileSystem.documentDirectory;
}

function projectRoot(projectId: string): string {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(projectId)) throw new Error("Invalid project ID");
  return `${requireDocumentDirectory()}${ROOT_DIRECTORY}/workspaces/${projectId}/`;
}

export function makeProjectId(now = Date.now()): string {
  return `project-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureDirectory(uri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
}

async function writeAtomic(uri: string, content: string): Promise<void> {
  const temporary = `${uri}.tmp-${Date.now()}`;
  const recovery = `${uri}.codeforge-recovery`;
  await FileSystem.writeAsStringAsync(temporary, content, { encoding: FileSystem.EncodingType.UTF8 });
  const existing = await FileSystem.getInfoAsync(uri);
  if (existing.exists) {
    await FileSystem.deleteAsync(recovery, { idempotent: true });
    await FileSystem.moveAsync({ from: uri, to: recovery });
  }
  await FileSystem.moveAsync({ from: temporary, to: uri });
  await FileSystem.deleteAsync(recovery, { idempotent: true });
}

async function recoverAtomicFile(uri: string): Promise<void> {
  const target = await FileSystem.getInfoAsync(uri);
  if (target.exists) return;
  const recovery = `${uri}.codeforge-recovery`;
  const backup = await FileSystem.getInfoAsync(recovery);
  if (backup.exists) await FileSystem.moveAsync({ from: recovery, to: uri });
}

export async function saveProjectSnapshot(snapshot: ProjectSnapshot): Promise<void> {
  validateProjectSnapshot(snapshot);
  const root = projectRoot(snapshot.manifest.projectId);
  const tree = `${root}tree/`;
  await ensureDirectory(tree);
  await ensureDirectory(`${root}.codeforge/`);
  await ensureDirectory(`${root}.codeforge/recovery/`);
  await recoverAtomicFile(`${root}.codeforge/project.json`);
  await writeAtomic(`${root}.codeforge/project.json`, JSON.stringify(snapshot.manifest, null, 2));
  await writeAtomic(`${root}.codeforge/lock.json`, JSON.stringify({ schemaVersion: 1, updatedAt: snapshot.manifest.updatedAt, files: snapshot.manifest.files }, null, 2));
  const trustInfo = await FileSystem.getInfoAsync(`${root}.codeforge/trust.json`);
  if (!trustInfo.exists) await writeAtomic(`${root}.codeforge/trust.json`, JSON.stringify({ schemaVersion: 1, state: "unknown", capabilities: [] }, null, 2));
  for (const file of snapshot.files) {
    const path = normalizeProjectPath(file.path);
    const uri = `${tree}${path}`;
    await ensureDirectory(uri.slice(0, uri.lastIndexOf("/") + 1));
    await writeAtomic(uri, file.content);
  }
}

async function readProjectFiles(root: string, relative = ""): Promise<ProjectFile[]> {
  const directory = `${root}${relative}`;
  const entries = await FileSystem.readDirectoryAsync(directory);
  const files: ProjectFile[] = [];
  for (const entry of entries) {
    const entryPath = `${relative}${entry}`;
    const uri = `${root}${entryPath}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.isDirectory) files.push(...await readProjectFiles(root, `${entryPath}/`));
    else {
      const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      files.push({ path: normalizeProjectPath(entryPath), content, size: new TextEncoder().encode(content).length });
    }
  }
  return files;
}

export async function loadProjectSnapshot(projectId: string): Promise<ProjectSnapshot> {
  const root = projectRoot(projectId);
  await recoverAtomicFile(`${root}.codeforge/project.json`);
  const manifest = JSON.parse(await FileSystem.readAsStringAsync(`${root}.codeforge/project.json`, { encoding: FileSystem.EncodingType.UTF8 })) as ProjectManifest;
  const files = await readProjectFiles(`${root}tree/`);
  return { manifest, files };
}

export async function importProjectArchive(bytes: Uint8Array, destinationProjectId = makeProjectId()): Promise<ProjectSnapshot> {
  const snapshot = decodeProjectArchive(bytes);
  const manifest = { ...snapshot.manifest, projectId: destinationProjectId, updatedAt: new Date().toISOString() };
  const imported = { ...snapshot, manifest };
  await saveProjectSnapshot(imported);
  return imported;
}

export async function exportProjectArchive(projectId: string): Promise<Uint8Array> {
  return encodeProjectArchive(await loadProjectSnapshot(projectId));
}

export function snapshotFromFiles(name: string, files: ProjectFile[], projectId = makeProjectId(), now = new Date()): ProjectSnapshot {
  const timestamp = now.toISOString();
  return {
    manifest: {
      schemaVersion: PROJECT_STORE_VERSION,
      projectId,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      files: files.map(({ path, size }) => ({ path: normalizeProjectPath(path), size })),
    },
    files,
  };
}

export const PROJECT_LIMITS = { MAX_ARCHIVE_ENTRIES, MAX_FILE_BYTES, MAX_TOTAL_BYTES } as const;
