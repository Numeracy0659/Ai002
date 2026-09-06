# CodeForge Phase 4 Editor Architecture

## Recommendation

CodeForge should not transplant Monaco, VS Code, or Zed's desktop process and rendering topology into React Native. The immediate Phase 4 implementation uses a platform-neutral TypeScript document-session core and a deliberately small React Native surface adapter. The existing multiline input remains a bootstrap surface for small documents, while the durable model owns versions, transactions, selection-independent history, recovery snapshots, and search.

This follows the strongest shared patterns from VS Code's model/view separation, CodeMirror's immutable transaction model and viewport discipline, Monaco's model-per-file and provider boundaries, and Zed's versioned buffers and transaction identity. The design keeps a reversible boundary for a future native editor or an isolated CodeMirror WebView adapter.

## Layered design

| Layer | Responsibility | Phase 4 implementation |
|---|---|---|
| Document core | Text, version IDs, range edits, undo/redo, dirty state, snapshots | Dependency-light TypeScript |
| Session manager | One logical session per project-relative path, tab identity, lifecycle, recovery metadata | TypeScript registry |
| Search service | Versioned literal/regex searches with result caps and stale-result protection | TypeScript, cancellable by request ID |
| Surface adapter | Input, focus, selection, line display, mobile keyboard integration | Existing React Native `TextInput` bootstrap adapter |
| Future language layer | Syntax, diagnostics, LSP, semantic tokens | Deferred and capability-gated |

## Transaction contract

Every edit carries a document ID, base version, ordered range changes, source, and grouping metadata. The core validates ranges against the base version, applies all changes atomically, increments the document version, and records inverse changes in a bounded undo stack. Typing and composition events can share a group; paste, delete, and search-replace form isolated groups. Undo and redo operate on transactions rather than whole-document snapshots.

## Mobile constraints

A multiline React Native input is not a production large-file engine. Phase 4 therefore applies explicit size and history limits, keeps only the active surface mounted, treats IME/composition as a first-class input concern, and avoids claiming syntax or semantic intelligence. A future native or CodeMirror adapter must conform to the same session protocol and must be measured on real Android devices for typing latency, scroll behavior, memory, selection, accessibility, and keyboard lifecycle.

## Sources studied

- [VS Code architecture](https://code.visualstudio.com/docs/getstarted/architecture)
- [VS Code text buffer](https://github.com/microsoft/vscode-textbuffer)
- [VS Code undo/redo service](https://github.com/microsoft/vscode/blob/main/src/vs/platform/undoRedo/common/undoRedo.ts)
- [CodeMirror guide](https://codemirror.net/docs/guide/)
- [CodeMirror state](https://github.com/codemirror/state)
- [CodeMirror view](https://github.com/codemirror/view)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Monaco Editor README](https://github.com/microsoft/monaco-editor/blob/main/README.md)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [Zed buffer architecture](https://github.com/zed-industries/zed/blob/main/crates/language/src/buffer.rs)
- [Zed editor architecture](https://github.com/zed-industries/zed/blob/main/crates/editor/src/editor.rs)
- [Zed performance guidance](https://zed.dev/docs/performance)

## Deferred work

Tree-sitter/Lezer parsing, semantic tokens, LSP, extensions, collaboration, minimaps, complex decorations, and a full virtualized renderer are intentionally deferred. They should be added only after the core transaction protocol and device measurements are stable.
