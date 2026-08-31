export type DiagnosticSeverity = "error" | "warning";

export type SourceDiagnostic = {
  message: string;
  line: number;
  column: number;
  severity: DiagnosticSeverity;
};

const OPEN_TO_CLOSE: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE_TO_OPEN: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export function analyzeSource(source: string): SourceDiagnostic[] {
  const diagnostics: SourceDiagnostic[] = [];
  const stack: Array<{ token: string; line: number; column: number }> = [];
  const lines = source.split("\n");
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  lines.forEach((lineText, lineIndex) => {
    for (let columnIndex = 0; columnIndex < lineText.length; columnIndex += 1) {
      const character = lineText[columnIndex];
      const nextCharacter = lineText[columnIndex + 1];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\" && (inSingleQuote || inDoubleQuote)) {
        escaped = true;
        continue;
      }
      if (character === "#" && !inSingleQuote && !inDoubleQuote) break;
      if (character === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        continue;
      }
      if (character === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }
      if (inSingleQuote || inDoubleQuote || (character === "/" && nextCharacter === "/")) continue;
      if (OPEN_TO_CLOSE[character]) {
        stack.push({ token: character, line: lineIndex + 1, column: columnIndex + 1 });
      } else if (CLOSE_TO_OPEN[character]) {
        const previous = stack.pop();
        if (!previous || previous.token !== CLOSE_TO_OPEN[character]) {
          diagnostics.push({
            message: `Unexpected '${character}'`,
            line: lineIndex + 1,
            column: columnIndex + 1,
            severity: "error",
          });
        }
      }
    }
  });

  stack.reverse().forEach((entry) => {
    diagnostics.push({
      message: `Missing '${OPEN_TO_CLOSE[entry.token]}'`,
      line: entry.line,
      column: entry.column,
      severity: "error",
    });
  });

  if (inSingleQuote || inDoubleQuote) {
    diagnostics.push({
      message: "Unterminated string literal",
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
      severity: "error",
    });
  }

  return diagnostics.sort((left, right) => left.line - right.line || left.column - right.column);
}

export function getWorkingTreeState(current: Record<string, string>, baseline: Record<string, string>) {
  const names = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  const changed = [...names].filter((name) => current[name] !== baseline[name]);
  return { changedFiles: changed, changedCount: changed.length, clean: changed.length === 0 };
}
