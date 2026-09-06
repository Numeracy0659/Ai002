import { describe, expect, it } from "vitest";

import { DocumentSession } from "../lib/codeforge-editor";
import { createSurfaceEvent, EditorSurfaceController } from "../lib/codeforge-surface";

function event(controller: EditorSurfaceController, kind: "commitText" | "setComposingText" | "finishComposingText" | "setSelection" | "deleteSurroundingText" | "surfaceReady" | "surfaceDisposed", payload: Record<string, unknown> = {}) {
  return createSurfaceEvent({
    surfaceId: controller.surfaceId,
    documentId: controller.session.documentId,
    expectedRevision: controller.session.version,
    eventId: `${kind}-${controller.session.version}-${JSON.stringify(payload)}`,
    kind,
    payload,
  });
}

describe("CodeForge editor surface protocol", () => {
  it("accepts composition updates separately from selection and commits them", () => {
    const session = new DocumentSession("main.py", "hello");
    session.setSelection({ anchor: 5, head: 5 });
    const controller = new EditorSurfaceController(session, "surface-1");
    controller.dispatch(event(controller, "setComposingText", { text: "世" }));
    controller.dispatch(event(controller, "setComposingText", { text: "世界" }));
    expect(session.text).toBe("hello世界");
    expect(controller.snapshot.composingRange).toEqual({ from: 5, to: 7 });
    controller.dispatch(event(controller, "finishComposingText"));
    expect(controller.snapshot.composingRange).toBeNull();
  });

  it("returns a snapshot instead of applying a stale surface event", () => {
    const session = new DocumentSession("main.py", "hello");
    const controller = new EditorSurfaceController(session, "surface-1");
    const stale = createSurfaceEvent({ surfaceId: "surface-1", documentId: "main.py", expectedRevision: 99, eventId: "stale-1", kind: "commitText", payload: { text: "!" } });
    const result = controller.dispatch(stale);
    expect(result.message.kind).toBe("snapshot");
    expect(result.snapshot.text).toBe("hello");
  });

  it("is idempotent for duplicate event IDs", () => {
    const session = new DocumentSession("main.py", "hello");
    session.setSelection({ anchor: 5, head: 5 });
    const controller = new EditorSurfaceController(session, "surface-1");
    const first = event(controller, "commitText", { text: "!" });
    controller.dispatch(first);
    const duplicate = controller.dispatch(first);
    expect(session.text).toBe("hello!");
    expect(duplicate.snapshot.text).toBe("hello!");
  });

  it("supports selection-aware deletion and rejects events after disposal", () => {
    const session = new DocumentSession("main.py", "hello world");
    session.setSelection({ anchor: 11, head: 11 });
    const controller = new EditorSurfaceController(session, "surface-1");
    controller.dispatch(event(controller, "deleteSurroundingText", { before: 6, after: 0 }));
    expect(session.text).toBe("hello");
    controller.dispatch(event(controller, "surfaceDisposed"));
    expect(() => controller.dispatch(event(controller, "surfaceReady"))).toThrow("disposed");
  });
});
