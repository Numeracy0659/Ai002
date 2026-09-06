export type DocumentId = string;
export type EditSource = "typing" | "composition" | "paste" | "delete" | "searchReplace" | "restore" | "undo" | "redo";
export type TextRange = { from: number; to: number };
export type TextChange = TextRange & { insert: string };
export type Selection = { anchor: number; head: number };
export type EditorTransaction = {
  id: string;
  documentId: DocumentId;
  baseVersion: number;
  version: number;
  changes: TextChange[];
  source: EditSource;
  groupId: string;
  selectionBefore: Selection;
  selectionAfter: Selection;
};
export type SearchOptions = { query: string; caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean; maxResults?: number };
export type SearchMatch = TextRange & { value: string; version: number };
export type EditorSnapshot = { documentId: DocumentId; text: string; version: number; selection: Selection; dirty: boolean };

const MAX_HISTORY_GROUPS = 100;
const MAX_HISTORY_BYTES = 1_000_000;
const MAX_DOCUMENT_BYTES = 2_000_000;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function assertRange(range: TextRange, length: number): void {
  if (!Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < 0 || range.to < range.from || range.to > length) {
    throw new Error("Edit range is outside the document");
  }
}

function assertNonOverlapping(changes: TextChange[]): void {
  const ordered = [...changes].sort((left, right) => left.from - right.from || left.to - right.to);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].to > ordered[index].from) throw new Error("Edit ranges overlap");
  }
}

function applyChanges(text: string, changes: TextChange[]): string {
  let result = text;
  for (const change of [...changes].sort((left, right) => right.from - left.from)) {
    result = `${result.slice(0, change.from)}${change.insert}${result.slice(change.to)}`;
  }
  if (byteLength(result) > MAX_DOCUMENT_BYTES) throw new Error("Document exceeds the mobile editor size limit");
  return result;
}

function makeInverseChanges(text: string, changes: TextChange[]): TextChange[] {
  let delta = 0;
  return changes.map((change) => {
    const inverseFrom = change.from + delta;
    const inverse = { from: inverseFrom, to: inverseFrom + change.insert.length, insert: text.slice(change.from, change.to) };
    delta += change.insert.length - (change.to - change.from);
    return inverse;
  });
}

function normalizeSelection(selection: Selection, length: number): Selection {
  return { anchor: Math.max(0, Math.min(length, selection.anchor)), head: Math.max(0, Math.min(length, selection.head)) };
}

export class DocumentSession {
  private textValue: string;
  private versionValue = 0;
  private selectionValue: Selection = { anchor: 0, head: 0 };
  private dirtyValue = false;
  private transactionCounter = 0;
  private undoStack: Array<{ transaction: EditorTransaction; inverse: TextChange[]; bytes: number }> = [];
  private redoStack: Array<{ transaction: EditorTransaction; inverse: TextChange[]; bytes: number }> = [];
  private historyBytes = 0;

  constructor(readonly documentId: DocumentId, initialText = "") {
    if (byteLength(initialText) > MAX_DOCUMENT_BYTES) throw new Error("Document exceeds the mobile editor size limit");
    this.textValue = initialText;
  }

  get text(): string { return this.textValue; }
  get version(): number { return this.versionValue; }
  get selection(): Selection { return { ...this.selectionValue }; }
  get dirty(): boolean { return this.dirtyValue; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  setSelection(selection: Selection): void {
    this.selectionValue = normalizeSelection(selection, this.textValue.length);
  }

  markSaved(): void { this.dirtyValue = false; }

  apply(changes: TextChange[], options: { source?: EditSource; groupId?: string; selectionAfter?: Selection } = {}): EditorTransaction {
    if (!changes.length) throw new Error("An editor transaction must contain at least one change");
    changes.forEach((change) => assertRange(change, this.textValue.length));
    assertNonOverlapping(changes);
    const before = this.textValue;
    const inverse = makeInverseChanges(before, changes);
    const selectionBefore = this.selection;
    this.textValue = applyChanges(before, changes);
    this.versionValue += 1;
    this.dirtyValue = true;
    this.selectionValue = normalizeSelection(options.selectionAfter ?? { anchor: changes[0].from + changes[0].insert.length, head: changes[0].from + changes[0].insert.length }, this.textValue.length);
    const transaction: EditorTransaction = {
      id: `${this.documentId}:${++this.transactionCounter}`,
      documentId: this.documentId,
      baseVersion: this.versionValue - 1,
      version: this.versionValue,
      changes: changes.map((change) => ({ ...change })),
      source: options.source ?? "typing",
      groupId: options.groupId ?? `${this.documentId}:group:${this.versionValue}`,
      selectionBefore,
      selectionAfter: this.selection,
    };
    if (transaction.source !== "undo" && transaction.source !== "redo" && transaction.source !== "restore") {
      const bytes = byteLength(JSON.stringify(transaction)) + byteLength(JSON.stringify(inverse));
      this.undoStack.push({ transaction, inverse, bytes });
      this.historyBytes += bytes;
      this.redoStack = [];
      while (this.undoStack.length > MAX_HISTORY_GROUPS || this.historyBytes > MAX_HISTORY_BYTES) {
        const removed = this.undoStack.shift();
        if (removed) this.historyBytes -= removed.bytes;
      }
    }
    return transaction;
  }

  undo(): EditorTransaction | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.historyBytes -= entry.bytes;
    const transaction = this.apply(entry.inverse, { source: "undo", groupId: entry.transaction.groupId, selectionAfter: entry.transaction.selectionBefore });
    this.redoStack.push(entry);
    return transaction;
  }

  redo(): EditorTransaction | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    const transaction = this.apply(entry.transaction.changes, { source: "redo", groupId: entry.transaction.groupId, selectionAfter: entry.transaction.selectionAfter });
    this.undoStack.push(entry);
    this.historyBytes += entry.bytes;
    return transaction;
  }

  search(options: SearchOptions): SearchMatch[] {
    if (!options.query) return [];
    const maxResults = Math.max(1, Math.min(options.maxResults ?? 500, 2_000));
    const flags = `${options.caseSensitive ? "g" : "gi"}${options.regex ? "" : ""}`;
    let expression: RegExp;
    try {
      const source = options.regex ? options.query : options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wrapped = options.wholeWord ? `\\b${source}\\b` : source;
      expression = new RegExp(wrapped, flags);
    } catch {
      throw new Error("Search pattern is not a valid regular expression");
    }
    const matches: SearchMatch[] = [];
    for (const match of this.textValue.matchAll(expression)) {
      const value = match[0] ?? "";
      const from = match.index ?? 0;
      matches.push({ from, to: from + value.length, value, version: this.versionValue });
      if (matches.length >= maxResults) break;
    }
    return matches;
  }

  snapshot(): EditorSnapshot {
    return { documentId: this.documentId, text: this.textValue, version: this.versionValue, selection: this.selection, dirty: this.dirtyValue };
  }
}

export class EditorSessionManager {
  private sessions = new Map<DocumentId, DocumentSession>();
  open(documentId: DocumentId, initialText = ""): DocumentSession {
    const existing = this.sessions.get(documentId);
    if (existing) return existing;
    const session = new DocumentSession(documentId, initialText);
    this.sessions.set(documentId, session);
    return session;
  }
  get(documentId: DocumentId): DocumentSession | undefined { return this.sessions.get(documentId); }
  close(documentId: DocumentId): void { this.sessions.delete(documentId); }
  snapshots(): EditorSnapshot[] { return [...this.sessions.values()].map((session) => session.snapshot()); }
}

export const EDITOR_LIMITS = { MAX_DOCUMENT_BYTES, MAX_HISTORY_GROUPS, MAX_HISTORY_BYTES } as const;
