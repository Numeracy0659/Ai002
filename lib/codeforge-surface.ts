import type { DocumentSession, EditSource, Selection, TextRange } from "./codeforge-editor";

export const EDITOR_SURFACE_PROTOCOL_VERSION = 1 as const;
export type SurfaceProtocolVersion = typeof EDITOR_SURFACE_PROTOCOL_VERSION;
export type SurfaceId = string;

export type SurfaceToCoreEvent = {
  protocolVersion: SurfaceProtocolVersion;
  surfaceId: SurfaceId;
  documentId: string;
  expectedRevision: number;
  eventId: string;
  kind:
    | "commitText"
    | "setComposingText"
    | "finishComposingText"
    | "deleteSurroundingText"
    | "setSelection"
    | "editorAction"
    | "paste"
    | "cut"
    | "viewportChanged"
    | "surfaceReady"
    | "surfaceDisposed";
  payload: Record<string, unknown>;
};

export type CoreToSurfaceMessage = {
  protocolVersion: SurfaceProtocolVersion;
  surfaceId: SurfaceId;
  documentId: string;
  revision: number;
  kind: "accepted" | "snapshot" | "selection" | "scrollToCursor" | "invalidate" | "error";
  payload: Record<string, unknown>;
};

export type SurfaceSnapshot = {
  documentId: string;
  revision: number;
  text: string;
  selection: Selection;
  composingRange: TextRange | null;
};

export type SurfaceDispatchResult = {
  message: CoreToSurfaceMessage;
  snapshot: SurfaceSnapshot;
};

function stringPayload(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string") throw new Error(`Surface payload ${key} must be a string`);
  return value;
}

function numberPayload(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`Surface payload ${key} must be an integer`);
  return value;
}

function rangePayload(payload: Record<string, unknown>, key = "range"): TextRange {
  const value = payload[key];
  if (!value || typeof value !== "object") throw new Error(`Surface payload ${key} must be a range`);
  const range = value as Record<string, unknown>;
  const from = range.from;
  const to = range.to;
  if (typeof from !== "number" || typeof to !== "number" || !Number.isInteger(from) || !Number.isInteger(to)) throw new Error(`Surface payload ${key} must contain integer offsets`);
  return { from, to };
}

function selectionPayload(payload: Record<string, unknown>): Selection {
  const anchor = numberPayload(payload, "anchor");
  const head = numberPayload(payload, "head");
  return { anchor, head };
}

function messageFor(event: SurfaceToCoreEvent, revision: number, kind: CoreToSurfaceMessage["kind"], payload: Record<string, unknown>): CoreToSurfaceMessage {
  return { protocolVersion: EDITOR_SURFACE_PROTOCOL_VERSION, surfaceId: event.surfaceId, documentId: event.documentId, revision, kind, payload };
}

function snapshotFor(session: DocumentSession, composingRange: TextRange | null): SurfaceSnapshot {
  return { documentId: session.documentId, revision: session.version, text: session.text, selection: session.selection, composingRange };
}

export class EditorSurfaceController {
  private composingRange: TextRange | null = null;
  private lastEventId: string | null = null;
  private disposed = false;

  constructor(readonly session: DocumentSession, readonly surfaceId: SurfaceId) {}

  get snapshot(): SurfaceSnapshot { return snapshotFor(this.session, this.composingRange); }

  dispatch(event: SurfaceToCoreEvent): SurfaceDispatchResult {
    if (this.disposed) throw new Error("Editor surface has been disposed");
    if (event.protocolVersion !== EDITOR_SURFACE_PROTOCOL_VERSION) throw new Error("Unsupported editor surface protocol version");
    if (event.surfaceId !== this.surfaceId || event.documentId !== this.session.documentId) throw new Error("Surface identity does not match the bound document");
    if (event.eventId === this.lastEventId) return this.accepted(event);
    if (event.expectedRevision !== this.session.version && event.kind !== "surfaceReady") return this.resync(event, "Stale surface revision");
    this.lastEventId = event.eventId;

    switch (event.kind) {
      case "surfaceReady":
        return this.accepted(event);
      case "surfaceDisposed":
        this.dispose();
        return this.accepted(event);
      case "setSelection": {
        const selection = selectionPayload(event.payload);
        this.session.setSelection(selection);
        return this.accepted(event);
      }
      case "commitText":
      case "paste": {
        const text = stringPayload(event.payload, "text");
        const range = this.composingRange ?? { from: Math.min(this.session.selection.anchor, this.session.selection.head), to: Math.max(this.session.selection.anchor, this.session.selection.head) };
        this.session.apply([{ ...range, insert: text }], { source: event.kind === "paste" ? "paste" : "typing", groupId: `${this.session.documentId}:surface` });
        this.composingRange = null;
        return this.accepted(event);
      }
      case "setComposingText": {
        const text = stringPayload(event.payload, "text");
        const range = this.composingRange ?? { from: Math.min(this.session.selection.anchor, this.session.selection.head), to: Math.max(this.session.selection.anchor, this.session.selection.head) };
        this.session.apply([{ ...range, insert: text }], { source: "composition", groupId: `${this.session.documentId}:composition` });
        this.composingRange = { from: range.from, to: range.from + text.length };
        return this.accepted(event);
      }
      case "finishComposingText":
        this.composingRange = null;
        return this.accepted(event);
      case "deleteSurroundingText": {
        const before = Math.max(0, numberPayload(event.payload, "before"));
        const after = Math.max(0, numberPayload(event.payload, "after"));
        const cursor = this.session.selection.head;
        this.session.apply([{ from: Math.max(0, cursor - before), to: Math.min(this.session.text.length, cursor + after), insert: "" }], { source: "delete", groupId: `${this.session.documentId}:delete` });
        this.composingRange = null;
        return this.accepted(event);
      }
      case "cut": {
        const range = rangePayload(event.payload);
        this.session.apply([{ ...range, insert: "" }], { source: "delete", groupId: `${this.session.documentId}:cut` });
        this.composingRange = null;
        return this.accepted(event);
      }
      case "editorAction":
      case "viewportChanged":
        return this.accepted(event);
      default:
        return this.accepted(event);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.composingRange = null;
  }

  private accepted(event: SurfaceToCoreEvent): SurfaceDispatchResult {
    return { message: messageFor(event, this.session.version, "accepted", { eventId: event.eventId, selection: this.session.selection, composingRange: this.composingRange }), snapshot: this.snapshot };
  }

  private resync(event: SurfaceToCoreEvent, reason: string): SurfaceDispatchResult {
    return { message: messageFor(event, this.session.version, "snapshot", { reason, eventId: event.eventId, text: this.session.text, selection: this.session.selection, composingRange: this.composingRange }), snapshot: this.snapshot };
  }
}

export function createSurfaceEvent(input: Omit<SurfaceToCoreEvent, "protocolVersion">): SurfaceToCoreEvent {
  return { protocolVersion: EDITOR_SURFACE_PROTOCOL_VERSION, ...input };
}

export type NativeEditorSource = Extract<EditSource, "typing" | "composition" | "paste" | "delete">;
