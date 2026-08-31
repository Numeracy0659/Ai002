export type FileItem = {
  id: string;
  name: string;
  language: string;
  icon: string;
  color: string;
};

export const FILES: FileItem[] = [
  { id: "main.py", name: "main.py", language: "Python", icon: "PY", color: "#FFD166" },
  { id: "app.js", name: "app.js", language: "JavaScript", icon: "JS", color: "#F7DF1E" },
  { id: "index.html", name: "index.html", language: "HTML", icon: "<>", color: "#FF6B35" },
  { id: "styles.css", name: "styles.css", language: "CSS", icon: "#", color: "#61DAFB" },
];

export const INITIAL_CONTENT: Record<string, string> = {
  "main.py": `def greet(name):
    return f"Hello, {name}!"


if __name__ == "__main__":
    message = greet("CodeForge")
    print(message)`,
  "app.js": `const greet = (name) => {
  return \`Hello, \${name}!\`;
};

console.log(greet("CodeForge"));`,
  "index.html": `<main class="hero">
  <h1>Build anywhere.</h1>
  <p>Your mobile development workspace.</p>
</main>`,
  "styles.css": `.hero {
  display: grid;
  gap: 12px;
  color: #f8fafc;
}`,
};

export const OUTPUT_LINES = [
  { tone: "muted", text: "$ codeforge run main.py" },
  { tone: "success", text: "✓ Python 3.12 · execution completed" },
  { tone: "normal", text: "Hello, CodeForge!" },
  { tone: "muted", text: "Process finished with exit code 0" },
] as const;

export function getWorkspaceStats(files: FileItem[], content: string) {
  return {
    files: files.length,
    lines: content.split("\n").length,
    chars: content.length,
  };
}

export function makeScratchFile(): FileItem {
  return { id: "scratch.js", name: "scratch.js", language: "JavaScript", icon: "JS", color: "#F7DF1E" };
}
