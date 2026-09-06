import type { FileItem } from "./codeforge-workspace";

export const WORKSPACE_SCHEMA_VERSION = 2 as const;
export const WORKSPACE_STORAGE_KEY = "codeforge.workspace.v2";
const RECOVERY_STORAGE_KEY = `${WORKSPACE_STORAGE_KEY}.recovery`;

export type WorkspaceSnapshot = {
  files: FileItem[];
  activeFile: string;
  contents: Record<string, string>;
  savedAt: string;
};

type StoredWorkspace = {
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  revision: number;
  snapshot: WorkspaceSnapshot;
};

type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type WorkspaceLoadResult = {
  snapshot: WorkspaceSnapshot | null;
  recovered: boolean;
  revision: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileItem(value: unknown): value is FileItem {
  if (!isRecord(value)) return false;
  const hasStringMetadata = ["id", "name", "language", "icon", "color"].every((key) => typeof value[key] === "string");
  return hasStringMetadata && typeof value.id === "string" && typeof value.name === "string" && value.id.length > 0 && value.name.length > 0;
}

function parseStoredWorkspace(serialized: string): StoredWorkspace | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.schemaVersion !== WORKSPACE_SCHEMA_VERSION || typeof value.revision !== "number" || !isRecord(value.snapshot)) {
      return null;
    }
    const { snapshot } = value;
    if (!Array.isArray(snapshot.files) || !snapshot.files.every(isFileItem) || typeof snapshot.activeFile !== "string" || !isRecord(snapshot.contents) || typeof snapshot.savedAt !== "string") {
      return null;
    }
    if (!Object.values(snapshot.contents).every((content) => typeof content === "string")) return null;
    return value as unknown as StoredWorkspace;
  } catch {
    return null;
  }
}

export function createWorkspaceSnapshot(input: Omit<WorkspaceSnapshot, "savedAt">, now = new Date()): WorkspaceSnapshot {
  const files = input.files.map((file) => ({ ...file }));
  const contents = Object.fromEntries(Object.entries(input.contents).map(([name, content]) => [name, content]));
  const activeFile = files.some((file) => file.id === input.activeFile) ? input.activeFile : files[0]?.id ?? "";
  return { files, activeFile, contents, savedAt: now.toISOString() };
}

export function migrateLegacyWorkspace(serialized: string, now = new Date()): WorkspaceSnapshot | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || !Array.isArray(value.files) || !value.files.every(isFileItem) || typeof value.activeFile !== "string" || !isRecord(value.contents)) return null;
    if (!Object.values(value.contents).every((content) => typeof content === "string")) return null;
    return createWorkspaceSnapshot({ files: value.files, activeFile: value.activeFile, contents: value.contents as Record<string, string> }, now);
  } catch {
    return null;
  }
}

export class WorkspaceStore {
  private latestRevision = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: StorageAdapter, private readonly key = WORKSPACE_STORAGE_KEY) {}

  async load(legacySerialized?: string): Promise<WorkspaceLoadResult> {
    const primary = parseStoredWorkspace(await this.storage.getItem(this.key) ?? "");
    if (primary) {
      this.latestRevision = primary.revision;
      return { snapshot: primary.snapshot, recovered: false, revision: primary.revision };
    }

    const recovery = parseStoredWorkspace(await this.storage.getItem(`${this.key}.recovery`) ?? "");
    if (recovery) {
      await this.storage.setItem(this.key, JSON.stringify(recovery));
      await this.storage.removeItem(`${this.key}.recovery`);
      this.latestRevision = recovery.revision;
      return { snapshot: recovery.snapshot, recovered: true, revision: recovery.revision };
    }

    const migrated = legacySerialized ? migrateLegacyWorkspace(legacySerialized) : null;
    return { snapshot: migrated, recovered: false, revision: 0 };
  }

  async save(snapshot: WorkspaceSnapshot, revision: number): Promise<number> {
    let savedRevision = this.latestRevision;
    this.writeQueue = this.writeQueue.then(async () => {
      const next: StoredWorkspace = {
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        revision: Math.max(this.latestRevision, revision) + 1,
        snapshot,
      };
      const serialized = JSON.stringify(next);
      await this.storage.setItem(`${this.key}.recovery`, serialized);
      await this.storage.setItem(this.key, serialized);
      await this.storage.removeItem(`${this.key}.recovery`);
      this.latestRevision = next.revision;
      savedRevision = next.revision;
    });
    await this.writeQueue;
    return savedRevision;
  }
}

export function isValidWorkspacePath(path: string): boolean {
  return path.length > 0 && !path.startsWith("/") && !path.split("/").some((part) => part === "" || part === "." || part === "..") && !path.includes("\\");
}
