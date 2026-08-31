import { describe, expect, it } from "vitest";

import { FILES, INITIAL_CONTENT, getWorkspaceStats, makeScratchFile, OUTPUT_LINES } from "../lib/codeforge-workspace";

describe("CodeForge workspace model", () => {
  it("ships with runnable starter files across common mobile runtimes", () => {
    expect(FILES.map((file) => file.id)).toEqual(["main.py", "app.js", "index.html", "styles.css"]);
    expect(INITIAL_CONTENT["main.py"]).toContain('print(message)');
    expect(INITIAL_CONTENT["app.js"]).toContain("console.log");
  });

  it("derives file, line, and character stats from the active buffer", () => {
    expect(getWorkspaceStats(FILES, "one\ntwo\nthree")).toEqual({ files: 4, lines: 3, chars: 13 });
  });

  it("creates a predictable scratch file for the new-file flow", () => {
    expect(makeScratchFile()).toMatchObject({ id: "scratch.js", language: "JavaScript" });
    expect(OUTPUT_LINES.at(-1)?.text).toContain("exit code 0");
  });
});
