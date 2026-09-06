# CodeForge Phase 5: Production Editor Surface

## Decision

CodeForge will use a **versioned editor-surface protocol** between the platform-neutral TypeScript document core and any visual/input surface. The current React Native multiline input is implemented as a bounded-document fallback adapter. The production Android path is a future native editable surface, preferably an adapted `TextView` first and a custom native view only after measurement demonstrates that `TextView` cannot meet the requirements.

CodeMirror in a WebView and React Native Skia remain valid experiments, but neither should be promoted to the Android production editing boundary without device evidence for IME composition, selection handles, TalkBack semantics, lifecycle recovery, bridge throughput, and memory behavior.

## Why this boundary is necessary

Android soft keyboards do not behave like hardware keyboards. The Android `InputConnection` contract separates committed text, composing text, selection, deletion, batch edits, and cursor-anchor updates. A production surface therefore cannot rely on `onKeyDown` or a simple controlled full-document string loop. React Native `TextInput` provides useful text, selection, focus, scroll, and lifecycle hooks, but its public contract does not establish composition ranges, atomic transaction acknowledgements, virtualized rendering, or large-file guarantees.

The Phase 5 protocol keeps those platform details replaceable. Every surface event carries a protocol version, surface ID, document ID, event ID, and expected document revision. The core returns accepted revisions or a canonical snapshot for stale-event recovery. Duplicate event IDs are idempotent. Composition range is represented independently from selection.

## Protocol events

Surface-to-core events include:

- `commitText`
- `setComposingText`
- `finishComposingText`
- `deleteSurroundingText`
- `setSelection`
- `editorAction`
- `paste`
- `cut`
- `viewportChanged`
- `surfaceReady`
- `surfaceDisposed`

Core-to-surface messages include accepted revisions, canonical snapshots, selection updates, scroll targets, invalidation, and structured errors.

## Implemented milestone

Phase 5 now includes:

- `EditorSurfaceController` with protocol-version validation
- Stale-revision snapshot recovery
- Duplicate-event idempotence
- Composition-range tracking
- Selection-aware commit, paste, delete, and cut operations
- Surface disposal protection
- A reusable React Native `CodeForgeEditorSurface` adapter
- Controlled selection reconciliation
- `disableFullscreenUI` for Android code-editing ergonomics
- Accessibility labeling and role configuration
- Protocol tests for composition, stale messages, duplicates, deletion, and disposal

The fallback adapter remains intentionally bounded. It does not claim full Android IME parity or large-file editor performance.

## Native Android migration boundary

The future native surface should own latency-sensitive IME state, composing spans, cursor/selection handles, scroll-to-cursor, and accessibility semantics. The TypeScript core should remain the authority for canonical transactions, validation, undo/redo, revision IDs, and persistence orchestration. The native module should exchange compact range operations and snapshots rather than full-document strings per keystroke.

The native milestone requires an Expo development/custom build and physical Android testing. The acceptance matrix must include Gboard, Samsung Keyboard, an alternate IME, CJK, Arabic/RTL, dead keys, emoji, autocorrect, composing while scrolling, paste/cut, hardware shortcuts, selection dragging, rotation, split-screen, font scaling, activity recreation, low-memory behavior, and release builds.

## Sources studied

- [Android InputConnection](https://developer.android.com/reference/android/view/inputmethod/InputConnection)
- [Android keyboard input commands](https://developer.android.com/develop/ui/views/touch-and-input/keyboard-input/commands)
- [Android TextView](https://developer.android.com/reference/android/widget/TextView)
- [Android PrecomputedText](https://developer.android.com/reference/android/text/PrecomputedText)
- [Android activity lifecycle](https://developer.android.com/guide/components/activities/activity-lifecycle)
- [Android saving UI state](https://developer.android.com/topic/libraries/architecture/saving-states)
- [Android custom-view accessibility](https://developer.android.com/guide/topics/ui/accessibility/custom-views)
- [React Native TextInput](https://reactnative.dev/docs/textinput)
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [CodeMirror guide](https://codemirror.net/docs/guide/)
- [CodeMirror reference](https://codemirror.net/docs/ref/)
- [React Native WebView reference](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md)
- [React Native Skia Canvas](https://shopify.github.io/react-native-skia/docs/canvas/overview/)
- [React Native Skia Paragraph](https://shopify.github.io/react-native-skia/docs/text/paragraph/)

## Explicit non-claims

CodeForge does not currently claim native `InputConnection` fidelity, universal IME correctness, custom Android selection handles, large-file virtualization, full TalkBack parity for a custom renderer, or production performance targets. Those capabilities require native implementation and physical-device measurement.
