import { describe, expect, it } from "vitest";

import { DocumentSession, EditorSessionManager } from "../lib/codeforge-editor";

describe("CodeForge document sessions", () => {
  it("applies range transactions and preserves versions and dirty state", () => {
    const session = new DocumentSession("main.ts", "const answer = 41;");
    const transaction = session.apply([{ from: 15, to: 17, insert: "42" }], { source: "typing" });
    expect(session.text).toBe("const answer = 42;");
    expect(transaction.baseVersion).toBe(0);
    expect(transaction.version).toBe(1);
    expect(session.dirty).toBe(true);
    session.markSaved();
    expect(session.dirty).toBe(false);
  });

  it("supports grouped edits, undo, and redo without whole-document fixtures", () => {
    const session = new DocumentSession("main.ts", "hello world");
    session.apply([{ from: 0, to: 5, insert: "hello" }], { source: "typing", groupId: "typing-1" });
    session.apply([{ from: 6, to: 11, insert: "CodeForge" }], { source: "typing", groupId: "typing-1" });
    expect(session.text).toBe("hello CodeForge");
    session.undo();
    expect(session.text).toBe("hello world");
    session.redo();
    expect(session.text).toBe("hello CodeForge");
  });

  it("handles UTF-16 ranges used by JavaScript and native text inputs", () => {
    const session = new DocumentSession("emoji.txt", "A😀B");
    session.apply([{ from: 1, to: 3, insert: "X" }], { source: "delete" });
    expect(session.text).toBe("AXB");
    session.undo();
    expect(session.text).toBe("A😀B");
  });

  it("returns versioned literal, whole-word, and regex search matches", () => {
    const session = new DocumentSession("notes.md", "cat scatter cat");
    expect(session.search({ query: "cat", wholeWord: true }).map((match) => match.from)).toEqual([0, 12]);
    expect(session.search({ query: "c.t", regex: true }).map((match) => match.value)).toEqual(["cat", "cat", "cat"]);
    session.apply([{ from: 0, to: 3, insert: "dog" }]);
    expect(session.search({ query: "dog" })[0]?.version).toBe(1);
  });

  it("rejects overlapping and out-of-bounds edits", () => {
    const session = new DocumentSession("main.ts", "12345");
    expect(() => session.apply([{ from: 0, to: 3, insert: "x" }, { from: 2, to: 4, insert: "y" }])).toThrow("overlap");
    expect(() => session.apply([{ from: 0, to: 8, insert: "x" }])).toThrow("outside");
  });

  it("deduplicates sessions by document identity", () => {
    const manager = new EditorSessionManager();
    expect(manager.open("src/main.ts", "one")).toBe(manager.open("src/main.ts", "two"));
    expect(manager.get("src/main.ts")?.text).toBe("one");
    manager.close("src/main.ts");
    expect(manager.get("src/main.ts")).toBeUndefined();
  });
});
