import { describe, expect, it } from "vitest";

import { analyzeSource, getWorkingTreeState } from "../lib/codeforge-analysis";

describe("CodeForge source analysis", () => {
  it("finds an unmatched closing delimiter with a source location", () => {
    expect(analyzeSource("print(hello))")).toContainEqual({
      message: "Unexpected ')'",
      line: 1,
      column: 13,
      severity: "error",
    });
  });

  it("ignores delimiters inside comments and strings", () => {
    expect(analyzeSource("print('not a bracket: )') # {ignored}" )).toEqual([]);
  });

  it("reports working-tree changes without requiring a Git binary", () => {
    expect(getWorkingTreeState({ "main.py": "changed" }, { "main.py": "original", "app.js": "same" })).toEqual({
      changedFiles: ["main.py", "app.js"],
      changedCount: 2,
      clean: false,
    });
  });
});
