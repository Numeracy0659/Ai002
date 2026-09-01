# CodeForge Mobile: Professional Android IDE Implementation Blueprint

**Document status:** Architecture baseline for implementation
**Prototype audited:** repository working tree at revision `50830d0`
**Primary platform:** Android 8.0+ (API 26), with current Android target SDK at each release
**Audience:** mobile platform, native runtime, editor, security, QA, and release engineering teams

## Executive decision

CodeForge Mobile should become an **Android-first, offline-capable IDE whose Android Gradle project, Kotlin services, native runtime libraries, and app-private project store are the product authority**. React Native may remain as the presentation layer during migration, but Expo managed capabilities must not be presented as a shell, interpreter, compiler, package manager, or security sandbox. Release builds must be custom native APKs; they will not run in Expo Go and must not be regenerated with `expo prebuild --clean` after native implementation begins.

The recommended architecture is a **bare React Native Android application with a Kotlin core and NDK/JNI runtime adapters**. This preserves the prototype's usable React UI while putting filesystem integrity, process creation, PTY ownership, Git, package installation, credentials, and Android lifecycle handling in native modules. CodeMirror 6, served from local APK assets in a locked-down WebView, should replace the current `TextInput` editor. A Kotlin `ExecutionService` in a dedicated Android process should own real subprocesses and a native PTY bridge. CPython, QuickJS, and WAMR should be shipped as pinned Android/Bionic builds; each is a distinct runtime provider, not evidence of a general Linux distribution.

The first production claim should be narrow and verifiable:

> **CodeForge edits durable local projects and runs bundled Python and JavaScript runtimes on the Android device, including while offline. It provides a real Android shell/PTY for trusted projects, but it is not root, Debian, Termux, Node.js, apt, or a desktop Linux compatibility layer.**

Pydroid demonstrates that a useful Python interpreter, editor, terminal, and curated wheel ecosystem can execute on-device, while Termux demonstrates that real local commands require Android/Bionic-specific binaries, an app-private prefix, and explicit lifecycle management rather than a web UI claim.[1][2] Acode demonstrates that a JavaScript UI can be paired with native terminal/proot components, but also shows why the runtime must be optional, explicit, and treated as trusted code rather than a security boundary.[3] CodeMirror and Monaco are editor components only; neither supplies files, a shell, Git, or runtimes.[4][5]

## 1. What the current prototype actually is

The current application is a polished **interaction mock with limited file import/export**, not an IDE runtime. That distinction must be made explicit before pilot distribution. The following findings come directly from the repository.

| Area | Current implementation | Professional gap and user-facing consequence |
|---|---|---|
| Project model | Four hard-coded files and their contents live in `lib/codeforge-workspace.ts`. A hard-coded `mobile-lab` name and `~/projects/mobile-lab` path are rendered in the header. | There is no directory tree, canonical URI, manifest, project ID, current working directory, run configuration, dependency state, or actual `~/projects` path. The displayed path is fictional. |
| Persistence | The entire pseudo-workspace is serialized into one `AsyncStorage` value named `codeforge.workspace.v1`. | `AsyncStorage` is UI preference storage, not a durable multi-file project filesystem. It provides no atomic per-file save, conflict detection, large-file behavior, permissions, directory operations, or Git-compatible working tree. |
| Save | `saveFile()` only clears a React dirty flag and displays “saved locally.” | Pressing Save does not write the active buffer to an actual source file. A process cannot consume the same file because no project file exists. |
| Import/export | Import uses Expo Document Picker, copies one text document to cache, reads it, and places its content in the `AsyncStorage` model. Export writes one current buffer into the app document directory and opens the Android share sheet. | There is no persisted SAF tree grant, linked workspace, recursive folder import/export, encoding policy, ZIP project workflow, or reconciliation when an external document changes. |
| Editor | A multiline React Native `TextInput` is shown beside separately rendered line numbers. | There is no syntax tree, token styling, real cursor location, multi-cursor, bracket matching, fold model, incremental search, undo persistence, model URI, large-file strategy, or correct synchronization between wrapped lines and the number gutter. The footer always says `Ln 1, Col 1`. |
| Diagnostics | `analyzeSource()` performs a small delimiter/comment/string heuristic. | This is useful as a unit-tested utility but is not a Python or JavaScript parser, type checker, linter, or language server. It must not be described as real-time language analysis. |
| Run | `runFile()` waits 650 ms and reports success unless the delimiter heuristic finds an error. | No source is passed to an interpreter, no operating-system process starts, and no stdout, stderr, stdin, PID, signal, or exit status exists. Airplane-mode “success” currently proves only that a timer fired. |
| Terminal/output | `OUTPUT_LINES` is a fixed array containing a fictional Python 3.12 command, greeting, and exit code. The screen renders hard-coded `SANDBOX`. | There is no terminal emulator, PTY, shell, scrollback stream, terminal size, process group, Ctrl-C, interactive input, or sandbox. Output does not come from execution. |
| Runtime profiles | Settings displays “Python · JavaScript · HTML/CSS.” | No CPython, QuickJS, Node.js, Wasm engine, compiler, or runtime assets are packaged. Hermes runs the application UI; it is not a user-code Node.js environment. |
| Execution policy | `server/execution/policy.ts` validates a JSON plan with fictional executable names `python-sandbox` and `javascript-sandbox`. | No executables implement those names, the plan is not connected to an API router, and the Express server is not an on-device process broker. A schema is not execution isolation. |
| Git | The UI hard-codes branch `main`; `getWorkingTreeState()` compares two JavaScript objects. `lib/github-api.ts` can list GitHub REST content but is not wired to the UI. | There is no `.git` repository, index, object database, status, diff, commit, branches, clone, fetch, push, credentials, merge, or local Git implementation. GitHub file browsing is not Git. |
| LSP | `lib/lsp-wire.ts` encodes and parses LSP frames and has useful protocol tests. | There is no language server binary, process, transport, document synchronization, diagnostics lifecycle, cancellation, or resource policy. |
| Package management | No package subsystem exists. | There is no catalog, resolver, lockfile, cache, ABI compatibility check, transaction, signature verification, offline bundle, pip/npm/apk integration, license view, or rollback. |
| Project trust | `TRUSTED` is hard-coded in the header. | No trust decision is stored or enforced. Terminal, task, preview, dependency, hook, and network capabilities are not conditioned on a trust state. |
| Native Android | `MainApplication.kt` only registers normal autolinked React Native/Expo packages. No custom service, Binder API, PTY, JNI runtime, native Git, or process bridge exists. | Expo's APIs can select/share files and access other Android facilities, but they do not create an arbitrary native runtime. A custom development APK and native implementation are mandatory. |
| Permissions | The generated manifest includes microphone, overlay, legacy external storage, media playback foreground service, and related permissions from template dependencies. | These are unrelated to a private IDE baseline, enlarge the attack surface, and weaken user trust. SAF should replace legacy broad storage permissions. |
| Release | `android/app/build.gradle` signs the release build with the checked-in debug keystore. CI regenerates Android with `expo prebuild --clean` and uploads `app-release.apk`. | This is not a production signing chain. Regeneration will erase or destabilize custom native code. Debug-signed APKs cannot be upgraded in place by an APK signed with the eventual production key. |
| Tests | Vitest covers model helpers, delimiter checks, REST mapping, execution-plan validation, and LSP framing. | There are no Android instrumentation tests, real file/process/runtime tests, device tests, security tests, upgrade tests, offline tests, or signed-APK installation tests. Several current tests validate simulated output rather than product capability. |

The current prototype should therefore be labeled **Prototype / no local runtime** until the process acceptance tests in this blueprint pass. In particular, the strings `SANDBOX`, `TRUSTED`, `Python 3.12 · execution completed`, `Process finished with exit code 0`, and the pseudo-path must be removed or driven by measured state.

## 2. Product boundaries and non-goals

A clear capability boundary is more valuable than a broad but inaccurate feature list. Termux runs Android-targeted programs under Android's app UID and Bionic libc; it is not an ordinary glibc/FHS Linux installation.[2][6] Pydroid similarly documents an embedded offline Python interpreter, not root or a general Linux distribution.[1] CodeForge should adopt the same honesty.

| CodeForge will provide | CodeForge will not claim in the first private release |
|---|---|
| Durable app-private projects; explicit SAF import, export, and synchronization | Direct POSIX builds in arbitrary cloud-provider or shared-storage trees |
| Real processes with PID, streamed stdout/stderr, stdin, exit code, signals, and cancellation | That an animated output panel, web worker, Expo module, or server schema is a process |
| A restricted Android `/system/bin/sh` terminal for **trusted** projects plus immutable bundled tools | Root, bash compatibility, apt, apk, Debian/Ubuntu packages, Docker, chroot, or a full Linux distribution |
| Native CPython identified by exact version and Android ABI | That standard desktop `venv` works on Android; Python documents it as unavailable there.[7] |
| QuickJS JavaScript identified as QuickJS | Node.js, npm lifecycle scripts, native Node add-ons, or browser DOM APIs |
| WAMR for imported Wasm/WASI modules with explicit capabilities | A C/C++/Rust compiler merely because Wasm files can run |
| Curated, signed packages and offline package bundles | Unreviewed native executable downloads, arbitrary PyPI compatibility, or arbitrary `npm install` |
| Git working-copy operations through an embedded Git library | That a GitHub REST file browser is a local Git repository |
| A restricted HTML/Markdown preview in a separate WebView | Preview JavaScript with access to the editor's native bridge or credentials |
| Source/project ZIP export | Building an arbitrary user's project into a separately installable APK; that is a distinct future toolchain |
| Protection from other Android applications through the Android app sandbox | Hostile-code multi-tenancy inside one app UID. Android's app sandbox does not protect CodeForge's own files from code CodeForge intentionally runs with the same authority.[8] |

A proot/Alpine distribution is **not recommended for version 1**. It would quickly expose many commands, as Acode does, but it adds a root filesystem, distribution repository, architecture matrix, backup format, significant storage, fragile background behavior, and a larger untrusted package surface. Proot is compatibility translation, not a hardened security boundary. If cohort requirements later justify it, it should be a separately downloadable, explicitly trusted runtime provider—not the foundation of project persistence or basic execution.

## 3. Target Android-first architecture

### 3.1 Architecture principles

The architecture follows six constraints.

First, the **checked-in Android Gradle project is authoritative**. Expo CLI may support JavaScript development temporarily, and selected Expo libraries may remain where they are thin wrappers over stable Android APIs, but release correctness cannot depend on regenerating native projects.

Second, the **project store is independent from editor models and runtime filesystems**. CodeMirror edits a document snapshot; it does not own the file. A runtime consumes a staged, saved project version; it does not own the user's editor session. CodeMirror's own architecture deliberately leaves persistence and projects to the host.[4]

Third, every execution request becomes a **typed `JobSpec`**, not a concatenated shell string. The default Run action resolves a runtime from an immutable registry and supplies a fixed executable, argument vector, environment allowlist, working directory, limits, and capability set. An interactive shell is a separate, prominent trusted-project capability.

Fourth, all executable native code in the initial product is **shipped in the signed APK for a specific Android ABI**. Mutable package storage may hold Python, JavaScript, and Wasm data, but downloadable ELF executables and native extension libraries are excluded until a separately reviewed native-artifact delivery design exists. This avoids pretending that arbitrary desktop binaries or package-manager output will execute on modern Android.

Fifth, execution is **local by default and observable**. Runtime version, ABI, command, working directory, network policy, start/end timestamps, termination reason, and output truncation must be visible. A remote compiler may be offered later only as a separately labeled adapter with explicit source-upload consent.

Sixth, Android lifecycle interruption is a normal outcome. Termux explicitly warns that Android may terminate processes; CodeForge must record the job as interrupted, preserve logs and source, and provide a rerun path instead of implying a daemon survived.[9]

### 3.2 Component topology

```mermaid
flowchart TB
  UI[React Native presentation\nproject tree, commands, panels] --> PS[Kotlin ProjectStore]
  UI --> EW[CodeMirror 6 WebView\nlocal APK assets]
  UI --> TW[xterm.js WebView\nbyte/resize channel only]
  UI --> EB[Kotlin ExecutionBroker client]
  UI --> GS[GitService]
  UI --> PKG[PackageService]

  PS --> FS[(App-private POSIX workspace\nRoom metadata + journal)]
  PS --> SAF[SAF import/export/sync adapter]
  EB --> ES[ExecutionService :runtime process]
  ES --> PTY[NDK PTY/process supervisor]
  ES --> REG[Immutable tool registry]
  REG --> SH[/system/bin/sh + Android tools]
  REG --> PY[Bundled CPython]
  REG --> QJS[Bundled QuickJS]
  REG --> WAMR[Bundled WAMR]
  ES --> LOG[(bounded job logs)]
  GS --> GIT[libgit2 JNI]
  PKG --> CAS[(signed content-addressed package cache)]
  PKG --> ENV[(per-project environment views)]
  ENV --> PY
  ENV --> QJS
  ENV --> WAMR
```

The single-APK private beta may place all components in one package. `ExecutionService` should declare `android:process=":runtime"` so interpreter crashes and large heaps do not directly take down the UI. This is a **crash and lifecycle boundary, not a security boundary**, because Android processes in the same application normally share the app UID and permissions. A later hardened executor can be a second, same-vendor-signed APK with a different UID and no network permission, exchanging workspace archives and results through a signature-protected Binder service. That stronger configuration should be required before claiming execution of intentionally hostile code.

### 3.3 Proposed repository/module layout

| Module | Responsibility | Language/process |
|---|---|---|
| `app/` | React Native screens, commands, panels, onboarding, measured capability labels | TypeScript in UI process |
| `packages/domain/` | Project/run/package/Git DTOs and state machines that contain no Expo imports | TypeScript with generated Kotlin schemas or protocol fixtures |
| `android/app/` | Native application, manifest, dependency injection, release flavors, React host | Kotlin |
| `android/core-project/` | ProjectStore, Room entities, atomic file service, journal, SAF mirror | Kotlin/coroutines |
| `android/core-editor/` | WebViewAssetLoader, CodeMirror message protocol, document sessions, recovery | Kotlin + packaged TypeScript bundle |
| `android/core-execution/` | AIDL client, job state, notification/control integration | Kotlin |
| `android/runtime-service/` | Process supervisor, runtime registry, log quotas, foreground execution | Kotlin in `:runtime` process |
| `android/runtime-native/` | PTY, process-group/signal helpers, CPython/QuickJS/WAMR adapters | C/C++ via NDK/JNI |
| `android/core-git/` | libgit2 wrapper, credentials callback, Git operations and progress | Kotlin/JNI |
| `android/core-packages/` | Catalog verification, dependency plan, transactional install, lockfile, cache | Kotlin; invokes provider installers through broker |
| `web/editor/` | CodeMirror 6 bundle and reviewed language extensions | TypeScript, local WebView only |
| `web/terminal/` | xterm.js renderer and keyboard/selection behavior | TypeScript, local WebView only |
| `runtime-manifests/` | Exact runtime/tool versions, hashes, ABIs, licenses, capabilities | Signed JSON/source-controlled manifests |
| `androidTest/` and `e2e/` | Device, process, SAF, runtime, upgrade, and security acceptance tests | Kotlin + host test orchestration |

A full Compose rewrite is not justified before native capability is proven. The current visual shell can be incrementally retained, while high-risk surfaces—project store, editor WebView host, developer keyboard, runtime, terminal, Git, packages, and release—move to native ownership. Compose can replace React Native later if profiling shows a specific performance or lifecycle problem.

## 4. Durable filesystem and project model

Android app-private internal storage is the correct authoritative location for working projects and tool state because it provides normal private app semantics without broad storage permission. It is removed on uninstall, so backup/export must be first class.[10] SAF grants access to user-selected documents or trees, but Android 11+ restricts selectable roots and `Android/data`; a document URI is not equivalent to an unrestricted POSIX path.[11]

### 4.1 On-disk layout

```text
filesDir/codeforge/v1/
  workspaces/<project-uuid>/
    tree/                         # authoritative Git-compatible working tree
    .codeforge/project.json       # identity, schema version, run configurations
    .codeforge/lock.json          # runtime/package resolution and hashes
    .codeforge/trust.json         # trust decision and capability grants
    .codeforge/recovery/          # unsaved editor transaction journals
  environments/<environment-id>/ # immutable/project-selected package view
  packages/objects/<sha256>/      # content-addressed package objects
  terminal/home/                  # shell history/config; never user project truth
  jobs/<job-id>/                  # metadata and bounded logs
  imports/<operation-id>/         # transactional staging
noBackupFilesDir/
  credentials-metadata/           # no secrets in project or logs
cacheDir/codeforge/
  runtime-staging/                # safely purgeable execution scratch
```

`ProjectStore` should expose stable `ProjectId` and `FileId` values. A file record includes relative POSIX path, content type/language, encoding, newline policy, saved generation, content hash, size, modified timestamp, open session state, and optional external SAF origin. Paths are normalized, relative, and rejected if empty, absolute, NUL-containing, or traversal-producing. Every operation resolves beneath the known workspace root and verifies symlink behavior before write or delete.

Writes to app-private files use `new-file.tmp`, flush, `fsync`, atomic rename, and parent-directory synchronization where supported. A Room transaction records the intended generation and operation status. On process restart, the recovery worker either completes or rolls back an incomplete operation. Editor deltas are journaled with monotonically increasing sequence numbers; an explicit Save writes a complete new file generation. This design makes “Saved” a measured storage state rather than a UI flag.

### 4.2 SAF behavior

CodeForge should support three explicit flows rather than treating every URI as a path.

| Flow | Behavior | Runtime/Git semantics |
|---|---|---|
| **Import project** | Recursively copy a selected SAF tree or ZIP into a new app-private workspace, validate names, show skipped files, and retain origin metadata only for later export. | Full local POSIX behavior. The imported project becomes authoritative. |
| **Export snapshot** | Write a versioned ZIP or folder snapshot with source, `.codeforge/project.json`, lockfile, and checksums. Never include credentials, terminal history, package cache, or internal Git credentials. | Portable backup/share operation. |
| **Linked mirror** | Persist the URI grant, mirror external content into app-private storage, track hashes/generations, and require explicit Sync In/Sync Out with a conflict screen. | Builds and Git use the private mirror, not the provider. Revoked grants do not corrupt the local workspace. |

Direct building inside shared storage should not be supported. Shared filesystems and document providers may lack executable bits, symlinks, sockets, stable paths, atomic rename, or expected performance; Termux likewise recommends its private prefix for executable/build state and treats shared storage as an exchange area.[2]

The first filesystem milestone must include recursive folder create/read/write/rename/delete, UTF-8 and binary round-trip, path traversal rejection, symlink escape rejection, large-file behavior, storage-full recovery, process-death recovery, SAF revocation, cloud-provider latency, removable-volume loss, ZIP-slip rejection, and uninstall-warning/export UX.

## 5. Real terminal and process bridge

### 5.1 Definition of “real local command”

A command is real only when the APK starts an Android process on the device, records its PID, sends source or arguments to that process, streams the process's actual stdout/stderr bytes, accepts stdin when configured, receives a real exit status or terminating signal, and continues to work in airplane mode when all required artifacts are already installed. Static output, JavaScript evaluation in the UI, a network call, and a delayed success state do not meet this definition.

### 5.2 Broker contract

The JS layer must never receive a generic native method such as `exec(command: string)`. It submits a typed request to Kotlin:

```text
JobSpec {
  projectId, savedGeneration, runtimeId, entryRelativePath,
  argv[], cwdRelativePath, environmentAllowlist{},
  ioMode: PIPES | PTY,
  stdinPolicy, networkPolicy, trustRequirement,
  wallTimeMs, idleTimeMs, maxOutputBytes, maxInputBytes,
  maxFileBytes, maxChildProcesses, terminalRows, terminalColumns
}
```

The broker resolves `runtimeId` through an **immutable tool registry** created from the signed APK manifest. The UI cannot supply an arbitrary executable path for normal Run. Arguments remain a vector from Kotlin through JNI to `execve`; no user value is concatenated into a shell command. The environment begins empty and adds only `PATH`, `HOME`, `TMPDIR`, locale, runtime paths, and declared project variables. App API tokens, Git credentials, Android internals, build secrets, and analytics identifiers are never inherited.

The native PTY layer should use Android/Bionic-compatible primitives to create a pseudo-terminal, establish a session/process group, apply terminal dimensions, and relay bytes through file descriptors. It must support `TIOCSWINSZ`, UTF-8 byte streams, backpressure, bounded scrollback, process-group interrupt/terminate/kill escalation, and orphan cleanup. AIDL/Binder should pass `ParcelFileDescriptor` pipes for bulk data and a small callback interface for state changes; terminal output should not traverse the React Native bridge as thousands of per-character events.

The state machine is `QUEUED → PREPARING → STARTING → RUNNING → EXITED | SIGNALED | TIMED_OUT | CANCELLED | INTERRUPTED | FAILED_TO_START`. Each transition and termination reason is persisted. Output beyond the configured cap is truncated with an explicit marker while the process remains controllable.

### 5.3 Interactive terminal

For a trusted project, CodeForge may start the real Android shell `/system/bin/sh` under a PTY with the workspace as the current directory, a private terminal home, `umask 077`, scrubbed environment, and controlled `PATH`. The command inventory screen must say **Android shell**, list the available `/system/bin`/Toybox commands and CodeForge tools, and state that bash, apt, sudo, root, and arbitrary Linux binaries are absent.

Bundled interpreter launchers and any toolbox executables must be immutable, ABI-specific PIE binaries in the signed APK/native library area and invoked by absolute resolved path. Native executables must not be downloaded into a writable project and added to `PATH` in version 1. Shell startup files can define convenience functions such as `python`, `qjs`, and `wasm` that invoke those real packaged launchers; the capability screen shows the actual path and version behind each name.

Short foreground runs can use a bound service. An interactive terminal or long user-initiated build uses an Android foreground service with a visible notification containing project, duration, and a Stop action. It must use a foreground-service type permitted for the target Android release, not the prototype's unrelated media-playback service. If Android or an OEM terminates the runtime process, the UI reports **Interrupted by Android** from persisted state; it never fabricates exit code 0.

### 5.4 Terminal renderer

Use xterm.js packaged as a local asset for terminal rendering, selection, ANSI behavior, and accessibility, connected only to a byte/resize channel. It receives no project filesystem, package, credential, or generic Android bridge. Terminal URLs are served through an application asset HTTPS origin, not `file://`. The editor and preview use separate WebViews; the preview receives no terminal or native bridge.

## 6. Runtime provider plan

The common interface should be `RuntimeProvider.describe()`, `prepare(project, lock)`, `createJob(runConfiguration)`, `validatePackage(artifact)`, `healthCheck()`, and `invalidateCaches(oldVersion)`. The descriptor reports language name, engine name/version, Android ABI/API requirement, included libraries, supported package types, filesystem mode, network mode, debugger availability, and resource defaults. The UI always displays engine-qualified labels such as **Python 3.x (CodeForge CPython)** and **JavaScript (QuickJS)**.

### 6.1 Python: native CPython, not Pyodide for the core CLI

Pydroid's documented behavior supports the product value of an embedded, offline CPython with pip and curated native wheels, while its separate repository application illustrates the policy and supply-chain sensitivity of distributing executable native packages.[1][12] CodeForge should build a pinned CPython release for `arm64-v8a` and `x86_64`, package the standard library and certificates deliberately, and start it through the native process broker.

The launcher should configure CPython in isolated mode, ignore ambient `PYTHON*` variables, disable the user site, set explicit module search paths, use the project workspace as `cwd`, and add only the selected project environment. A run configuration can invoke `python entry.py`, module mode, arguments, stdin, and environment variables. Multi-file imports, Unicode, exceptions, tracebacks, signals, and interactive REPL behavior must be tested on devices.

CodeForge must not expose a “Create venv” button. Python's documentation marks `venv` unavailable on Android.[7] Instead, each project selects a CodeForge environment whose pure-Python files live under `environments/<id>/python/site-packages`; the resolved environment ID and every distribution hash are recorded in `.codeforge/lock.json`. The UI calls this **Project package environment**, not venv, and provides rebuild/reset/conflict diagnostics.

The initial Python package lane accepts only curated pure-Python wheels with exact hashes. Installation invokes a pinned installer in a package job with `--only-binary`, no source distribution, no arbitrary index fallback, no dependency drift after lock, staging, RECORD validation, and atomic activation. A later reviewed lane may add CodeForge-built native wheels for exact CPython/ABI/API combinations. Native wheels are executable code; each needs provenance, signature, SBOM/license metadata, and device compatibility validation. Source builds and arbitrary setup scripts are excluded from the private beta.

Pyodide should not be the primary Python CLI runtime. It has valuable Wasm isolation properties and browser integration, but its package ABI differs from Android CPython, it requires compatible Emscripten wheels, and full offline payloads can be large.[13][14] It may later serve an optional notebook/restricted-Python provider after the native Python workflow is stable.

### 6.2 JavaScript: QuickJS, explicitly not Node.js

QuickJS is a small embeddable JavaScript engine with runtime memory limits, stack limits, and an interrupt handler suitable for timeouts.[15] Ship a pinned source revision and build manifest per ABI. Each user job gets a fresh runtime/context; set memory, stack, wall-clock interrupt, module-root, and output limits before evaluation. Untrusted bytecode is not accepted because QuickJS documents compiled bytecode as version-specific and not security-checked before execution.[15]

The default provider exposes ECMAScript modules, `console`, UTF-8 text I/O, declared arguments, and a project-scoped file API. It does not expose native module loading, child processes, environment enumeration, arbitrary host objects, or sockets. A separate **trusted CLI profile** may expose QuickJS's reviewed filesystem functionality inside the project root. The product must never label Hermes as this runtime or call QuickJS “Node.”

JavaScript dependencies use a curated ESM catalog/import map with exact hashes. `package.json` may be read for metadata and a deliberately small scripts subset, but npm lifecycle scripts and Node-native add-ons are unsupported. A real Node.js/Bionic provider is a later product decision requiring its own executable, npm compatibility matrix, native add-on policy, disk budget, and acceptance suite; syntax highlighting for Node files does not imply Node execution.

### 6.3 WebAssembly: WAMR with a pinned WASI profile

WebAssembly isolates linear memory and validated control flow, but security still depends on host imports.[16] WASI's capability model is useful because modules begin without ambient authority and receive explicit capabilities such as preopened directories.[17] WAMR is recommended over a larger desktop runtime for the mobile baseline because it supports Android, embedding, interpreter/AOT modes, WASI, and resource-constrained deployments.[18]

The first Wasm provider runs imported `.wasm` modules; it does not compile C or Rust. It should start with a reviewed WASI snapshot, interpreter mode, no JIT, no dynamic native modules, and no networking imports. The only preopened directory is a staged project snapshot or explicitly designated output directory; read/write rights are separate. Fuel/instruction budget, memory pages, table size, stack, output, file count, and wall time are enforced. Clocks and randomness are explicit capabilities. AOT artifacts are considered disposable cache tied to WAMR version, Android ABI, and CPU features; portable user projects retain the original Wasm module.

### 6.4 Runtime packaging and feasibility gate

Modern Android does not permit treating an arbitrary executable copied into writable app storage as a desktop-style tool. Provider engines should therefore be built either as JNI-loaded native libraries hosted by dedicated Android service processes, or as signed, ABI-specific PIE executables deliberately packaged in the APK's native-library area and resolved from `ApplicationInfo.nativeLibraryDir`. The Gradle/NDK packaging mode, extraction behavior, SELinux behavior, and executable format must be proven on API 26, 29, 30, 33, 34, and the current target release before the architecture gate closes. Runtime assets copied from `assets/` into `filesDir` are **not** an acceptable assumed execution strategy.

The architecture should support both modes behind one provider interface. An embedded provider runs inside a dedicated `:python`, `:quickjs`, or `:wasm` service process with JNI and is restarted after each job or when limits are exceeded. A CLI provider starts a packaged executable through the broker and produces an operating-system exit status. The product UI reports the actual mode; it never converts an embedded evaluation result into a claim that an arbitrary shell command ran.

For the interactive Android shell, CodeForge can execute Android system binaries and any packaged CLI providers proven by the feasibility gate. If CPython can only be safely shipped as an embedded JNI provider on a target release, the terminal must not advertise a `python` shell command; Python remains available through Run and the Python console UI. Accuracy takes precedence over a uniform desktop illusion.

## 7. Editor implementation

### 7.1 Engine selection

Choose **CodeMirror 6**, not Monaco, for the Android baseline. CodeMirror is modular, works around an immutable document state and transaction model, and lets the host ship only the required view, history, search, language, completion, and lint extensions.[4] Monaco has excellent model/provider APIs, but its official project does not claim mobile-browser support, requires correctly hosted worker assets, and carries a larger desktop-oriented surface.[5] A mobile application should not accept that compatibility and memory risk merely to resemble VS Code.

CodeMirror remains an editor component rather than a trust boundary. Package its JavaScript, CSS, themes, parser bundles, and reviewed extensions in the APK. Host it with `WebViewAssetLoader` on a fixed HTTPS application origin. Disable arbitrary navigation, mixed content, file/content URL access, geolocation, media capture, and popups. Permit no remote scripts. The only JavaScript interface is a versioned editor protocol, and every message is schema-validated in Kotlin/TypeScript. WebView debugging is disabled in release builds.

### 7.2 Document session protocol

Each tab maps a stable `codeforge://project/<project-id>/file/<file-id>` identity to a `DocumentSession`. Opening supplies a saved generation, content, language, encoding status, selection, folds, and read-only/large-file flags. CodeMirror returns ordered transactions with session ID, base version, transaction ID, changes, selections, and composition state. Native code acknowledges the new version or requests resynchronization; out-of-order or oversized messages are rejected.

The native `ProjectStore` owns autosave journals and explicit saves. The WebView never writes paths directly. On process death, the app reopens the last saved generation, replays valid acknowledged journal entries, and offers recovery before overwriting external changes. Backgrounding triggers a bounded flush but correctness does not depend on the callback completing.

Version 1 editor scope should include syntax highlighting for Python, JavaScript/TypeScript, JSON, HTML, CSS, Markdown, shell, and plain text; incremental search/replace; undo/redo; bracket matching; indentation; folding; diagnostics gutter; go-to-line; command palette; configurable wrap/font/tab width; visible encoding/newline status; multi-tab dirty indicators; and crash recovery. Large or binary files open in read-only/plain mode with an explicit reason. A 5 MB editable threshold and a configurable line-length guard are reasonable initial defaults, to be tuned through device testing rather than hidden hard failures.

Language intelligence should arrive in layers. Tree-sitter/Lezer parsing and curated local completions come first. Pyright-like or TypeScript language service work belongs in a dedicated worker/process with document synchronization, cancellation, memory budget, and measured device eligibility. The existing LSP frame parser can be retained as a tested utility, but no feature is labeled LSP until an actual server process, initialization, document lifecycle, diagnostics, cancellation, and crash recovery pass device tests.

### 7.3 Preview isolation

HTML and Markdown previews run in a separate, disposable WebView profile/origin with no native bridge, credentials, cookies, service-worker persistence, or app-private file access. Project assets are served through a narrow content handler that resolves only under a chosen preview root. Network is denied by default and can be enabled per trusted preview session with a visible indicator. Navigation outside the preview origin opens through a user-confirmed external browser. This responds directly to the WebView attack-surface risk visible in comparable editor products.[3]

## 8. Git implementation

Use **libgit2 through a narrow Kotlin/JNI service** for local Git rather than parsing Git CLI output or equating GitHub REST APIs with Git. libgit2 avoids dependence on a shell package ecosystem, supports local repository semantics, and gives typed progress and credential callbacks. Pin an exact release, patch it promptly, compile it for supported ABIs with unnecessary protocols disabled, and include it in the SBOM and notice set. A CLI `git` tool can be evaluated later, but the product workflow should not depend on it.

The initial Git scope is repository initialization, discovery, status, staged/unstaged diff, stage/unstage, commit, branches, checkout with dirty-worktree protection, local log, clone, fetch, pull with fast-forward or explicit merge, and push. Rebase, submodules, Git LFS, hooks, signed commits, worktrees, and arbitrary credential helpers are deferred until each has a security and recovery design. Git hooks are disabled/ignored in the private beta because checkout or commit must not silently execute project code.

Git repositories live only in the app-private project tree. SAF-linked folders are synchronized through the mirror model and never used directly as `.git` working trees. Every mutating operation acquires the project write lock, flushes or blocks on dirty editor sessions, creates a recovery checkpoint when feasible, and returns structured conflicts. The UI must never discard modified files to satisfy checkout without an explicit, file-listed confirmation.

Credential handling is protocol-specific. HTTPS tokens are stored with Android Keystore-backed encryption and referenced by opaque credential IDs; they never enter URLs, command arguments, environment variables, project files, terminal history, or logs. SSH support should use app-generated/imported keys stored encrypted, known-host verification with SHA-256 fingerprints, no silent `StrictHostKeyChecking=no`, and an explicit trust-on-first-use screen. Logs redact userinfo and authorization headers. Project export excludes credentials and known-host decisions unless the user explicitly exports a separate encrypted settings backup.

The existing GitHub REST client can survive as a clearly labeled **Remote browser/import adapter**. It is useful for repository metadata and one-off file import, but it does not provide local branches, commits, or a working tree and must not drive the branch badge.

## 9. Package manager and offline environments

CodeForge needs a product package service, not a universal desktop package-manager prompt. The service resolves a **signed CodeForge catalog** whose entries declare package name/version, provider, package type, dependency constraints, engine version range, Android ABI where relevant, content hash, size, license, source URL, build provenance, and whether install/build/import executes code. A catalog signature is verified against a pinned release key separate from the APK signing key; the complete artifact hash is always verified after download.

The resolver creates a deterministic plan and lockfile before changing the active environment. Downloads are resumable into quarantine, scanned/validated by package type, unpacked with path/size/count limits, and installed to a staging environment. Activation is an atomic pointer/metadata change only after health checks pass. Cancellation or process death leaves the previous environment active. A content-addressed object store deduplicates packages; the UI reports total, reclaimable, and per-project usage and never evicts an active lock silently.

| Lane | Private-beta support | Safety/compatibility contract |
|---|---|---|
| Baseline runtimes | Included in APK | Exact engine/ABI manifest, works offline after APK install, upgraded only with signed app release |
| Python packages | Curated pure-Python wheels; later curated CodeForge-built native wheels | Exact hash and dependency lock; no sdists or setup/build scripts; native wheels must match CPython ABI and Android ABI |
| JavaScript packages | Curated ESM archives/import maps | No npm lifecycle scripts, Node native add-ons, shell hooks, or arbitrary postinstall; exact hash |
| Wasm packages | Validated `.wasm` modules/components plus manifest | Imports/capabilities reviewed; module hash pinned; no native dynamic library |
| Offline bundle | Signed `.cfbundle` imported through SAF | Catalog subset, artifacts, hashes, licenses, and compatibility manifest; no network required |
| Native tools | APK release only in version 1 | No downloaded ELF executables or writable-path `PATH` extension |

Package operations are separate from code execution. Network-offline behavior is explicit: an installed locked environment runs offline; a cached package installs offline; an unavailable artifact reports its exact package/hash/size instead of a generic failure. The user can export a lockfile and optionally a compatible `.cfbundle` for another device. Pydroid's prebuilt-wheel lane and pip's documented `--find-links`/`--no-index` workflow both support treating offline installation as a cache/provenance problem rather than an interpreter toggle.[1][19]

There should be no unrestricted package index or remote URL field in the first release. An advanced catalog-import capability can come later with administrator policy, signature verification, and visible provenance. Package licenses and third-party notices must be viewable before install and in an installed-environment inventory.

## 10. Developer keyboard and mobile interaction

The developer keyboard is an IDE-owned **accessory row above the user's IME**, not a replacement keyboard and not an accessibility overlay. It should use a native Android view integrated with React Native so it follows insets and focus without `SYSTEM_ALERT_WINDOW`. Remove the prototype's overlay permission. The row supplies Esc, Tab, Shift-Tab, Ctrl, Alt, arrow/navigation clusters, brackets, braces, parentheses, quotes, backtick, slash, backslash, pipe, underscore, equals, colon, semicolon, and a configurable snippet key. Keys dispatch structured editor commands or PTY byte sequences; text symbols enter through the active editor input connection so IME composition is not corrupted.

The design must support one-handed compact, full, and hardware-keyboard-hidden layouts. Ctrl and Alt can latch for one subsequent key with obvious visual state; long-press exposes alternatives without stealing selection handles. Terminal mode includes Ctrl-C, Ctrl-D, Ctrl-Z, Tab, Esc, arrows, and a paste-confirm option for multiline/control-character content. Password prompts disable clipboard logging and screen suggestions where possible.

Physical keyboard shortcuts should cover Save, Quick Open, command palette, find/replace, Run, Stop, terminal, next/previous tab, and line navigation, with conflict handling for Android system shortcuts. IME acceptance covers Gboard, Samsung Keyboard, AOSP LatinIME, hardware keyboards, composition languages, emoji/surrogate pairs, RTL text around code, TalkBack, font scaling, switch access, copy/paste, selection handles, rotation/multi-window, and focus recovery after dialogs. Monaco's lack of a mobile support claim is one reason these tests must be treated as product functionality, not assumed browser behavior.[5]

## 11. Security and trust architecture

### 11.1 Threat model and honest boundary

The private cohort reduces exposure; it does not make downloaded projects, dependencies, HTML previews, Git servers, or copied commands safe. Android gives CodeForge an app UID and isolates it from other applications, but code CodeForge executes can generally damage everything the CodeForge UID exposes.[8] A separate `:runtime` process improves crash containment and killability but normally shares that UID. QuickJS and Wasm can enforce strong host-defined capability boundaries when privileged imports are absent, yet native CPython and Android shell commands are not hostile-code sandboxes.

Another critical limitation is network authority. If the single CodeForge APK declares `INTERNET` for Git/package operations, a native child process under the same UID can potentially use sockets. A `network: denied` field in a JavaScript schema does not revoke the Android permission. In the single-APK beta, full CPython and shell execution must therefore be restricted to trusted projects and labeled **network available when the device is online**, unless a separately tested syscall policy actually enforces denial. QuickJS/WAMR providers can truthfully deny network by exposing no network host imports.

For intentionally untrusted native code, the target architecture is a separately installed **CodeForge Executor APK** signed by the same vendor but assigned a different UID and declaring no `INTERNET`, storage, camera, microphone, contacts, or location permissions. CodeForge transfers a bounded project snapshot through signature-protected Binder/content URI file descriptors, and receives bounded logs/results. The executor has no ambient access to the main app's project store or credentials. Both APKs must share one release/signing channel. This is still not a formally verified multi-tenant platform, but it is materially stronger than a same-UID service. It is a post-beta security gate, not a marketing shortcut.

### 11.2 Workspace trust

Every project begins `RESTRICTED`, including imports, clones, archives, and externally opened files. Browsing, editing, search, and non-executing syntax services are allowed. The following require an explicit project trust decision with a capability summary: terminal, native Python, package changes, tasks, preview JavaScript/network, Git authentication, environment variables, and external path synchronization. Trust is keyed to project identity, visible in the header, revocable, and invalidated or reviewed when an imported project is replaced. A hard-coded green badge is prohibited.

Trust is policy, not a sandbox. VS Code's Restricted Mode is a useful UX model, but its documentation also warns that extensions can ignore trust; CodeForge should ship no arbitrary extension host in the private beta.[20] Reviewed editor extensions are statically bundled. A future plugin model must have signed manifests, narrow host capabilities, network destinations, audit logs, disable/rollback, and a security review; JavaScript plugin code must never receive a generic native execution bridge.

### 11.3 Defense controls

| Control domain | Required implementation |
|---|---|
| Android permissions | Minimal manifest. Keep `INTERNET`, notification permission only when needed, vibration if retained, and correct user-visible foreground-service permission/type. Remove microphone, audio, overlay, media playback, legacy read/write external storage, and unused URL schemes/dependencies. Request SAF grants through system pickers. |
| File authority | Relative normalized paths, descriptor-based traversal where possible, symlink checks, atomic writes, per-project locks, quotas, ZIP-slip/bomb defenses, no project access to credentials or runtime registry. |
| Process authority | Immutable executable registry for Run, argv arrays, scrubbed environment, project-scoped cwd, process groups, cancellation, wall/output/input/file/child limits, no inherited secret descriptors. Interactive arbitrary shell only after trust. |
| Runtime authority | Fresh QuickJS/WAMR instance per run, no native modules/JIT/network by default, explicit WASI preopens; CPython isolated configuration and clear trusted-code warning. No `LD_PRELOAD`, writable native-library path, or project-controlled interpreter bootstrap. |
| Network | HTTPS only for first-party catalogs, certificate/platform validation, bounded redirects, SSRF/private-address defense in service clients, explicit Git host trust, proxy settings policy, per-action online indicator. Do not promise native-child network denial inside the network-enabled app. |
| Secrets | Android Keystore-backed encrypted credential records, opaque references, biometric/device-credential option, redaction at sources and logs, clipboard warning, no secret export by default. |
| WebView | Local asset origin, no remote scripts, navigation allowlist, mixed content disabled, file/content access disabled, release debugging disabled, distinct editor/terminal/preview contexts, no native bridge in preview. |
| Supply chain | Lock all Gradle/npm/native dependencies, verify catalogs/artifacts, generate SBOM and third-party notices, retain build provenance and source offers, dependency and secret scans, reproducible-build variance monitoring. |
| Availability | Job quotas, low-storage preflight, package transactions, log caps, Android interruption states, crash-loop safe mode, environment rebuild, backup/export, and a one-action stop control. |
| Telemetry | No ads. Private builds default to no source/output/filename/command/credential collection. Crash reporting is opt-in and strips project data; publish retention and deletion behavior. |

Resource limits are defense in depth, not promises Android can enforce every desktop-style quota. The feasibility spike must determine reliable `setrlimit`, cgroup, seccomp, and process enumeration behavior across target Android releases and OEMs. Unsupported controls must be removed from the UI claim, with coarse enforcement through watchdog termination and job-level quotas instead.

## 12. Phased implementation plan and exit gates

The plan is capability-vertical: each phase ends in a demonstrable device behavior, measured state in the UI, tests, and an upgrade path. Calendar duration depends on team size; gates, not dates, determine readiness.

| Phase | Deliverables | Mandatory exit gate |
|---|---|---|
| **0 — Truthful prototype and native feasibility** | Remove/label simulated Run, terminal, branch, path, trust, and runtime text. Check in Android as authority; stop clean prebuild. Remove unused permissions/dependencies. Prototype Kotlin TurboModule/AIDL, PTY with `/system/bin/sh`, JNI hello engine, packaged executable/JNI modes, foreground service, and API/ABI matrix. Write architecture decision records. | On a physical arm64 device in airplane mode, a debug development APK starts a real shell process, records PID, streams an unpredictable device-generated value and actual exit status, accepts input, handles resize/Ctrl-C, and leaves no child after Stop. APK native packaging works on the target API matrix. |
| **1 — Project store and migration** | Room schema, app-private workspaces, atomic file service, journal/recovery, project manifest, SAF import/export/mirror, ZIP validation, storage UI, migration adapter from `codeforge.workspace.v1`. | A multi-directory project survives force-stop, reboot, upgrade, low-storage failure, and recovery; recursive import/export round-trips hashes; revoked SAF grant is recoverable; no broad storage permission is used. |
| **2 — Process broker and terminal** | Runtime service process, typed `JobSpec`, Binder FD streams, PTY JNI, terminal renderer, job state/log store, notifications, Stop/escalation, lifecycle interruption UI, command inventory. | Interactive shell acceptance passes on physical API 26/current devices and x86_64 emulator: stdin, ANSI, resize, 5 MB backpressure, exit codes, signals, background/foreground, OEM interruption, and orphan cleanup. No output line is static. |
| **3 — Python and QuickJS** | Pinned CPython and QuickJS providers, runtime manifests, health checks, run configurations, REPL/console, staging, limits, capability UI, ABI builds, offline runtime tests. | Multi-file Python and ESM JavaScript projects run locally in airplane mode and produce real stdout/stderr/exit status. Timeout, memory/output limits, syntax/runtime errors, Unicode, stdin, cancellation, and runtime crash recovery pass. Engine name/version is measured. |
| **4 — Professional editor and keyboard** | CodeMirror local WebView, document protocol, transactions, diagnostics API, tabs/session restoration, search/fold/gutter, native developer accessory, hardware shortcuts, accessibility, isolated preview. | No keystroke loss through 10,000 randomized edits; editor/native hashes match after kill/restart; IME matrix, 5 MB file, 100k-line navigation, TalkBack, multi-window, and preview-origin security tests pass on low/mid/high devices. |
| **5 — Git** | libgit2 integration, status/diff/stage/commit/branch/clone/fetch/pull/push, HTTPS token vault, SSH known-host flow, conflicts, progress/cancel, no hooks, remote browser relabeling. | A private repository can clone, edit, commit, push, force-stop mid-fetch, resume safely, reject a changed SSH host key, and keep tokens absent from logs/export/process environment. Local status matches a desktop Git oracle fixture. |
| **6 — Curated package manager and Wasm** | Signed catalog, resolver/lock, CAS cache, transactional environments, pure-Python/ESM/Wasm validators, offline bundles, license UI, storage/rollback, WAMR provider. | Clean devices install online and from `.cfbundle`; tampered catalog/artifact, incompatible ABI, path traversal, archive bomb, cancellation, storage-full, dependency conflict, and process death all fail closed without changing the active environment. Wasm capabilities/limits are enforced. |
| **7 — Security hardening and private release** | Threat-model closure, permission audit, fuzzing, SAST/dependency scans, SBOM/notices, release signing, update/rollback drills, cohort docs, opt-in crash policy, executor-APK decision. | Release APKs are production-signed, reproducibly traceable, install/upgrade on the device matrix, pass backup/restore and rollback drills, contain no debug bridge/server/keys, and satisfy all release acceptance criteria below. Security review signs the exact hashes. |
| **8 — Later expansion** | Optional language services, native curated Python wheels, stronger separate-UID executor, Node provider, debugger, proot distribution, APK project builder—each behind its own ADR and gate. | No feature inherits a capability claim from its editor mode or package name; each provider has version/ABI/security/offline acceptance evidence. |

The highest-risk technical question is native engine/process packaging under current Android executable-code rules. It must be retired in Phase 0, before investing in package UX or broad editor polish.

## 13. Acceptance test strategy

Unit tests remain useful for pure path normalization, resolver rules, lockfiles, protocol framing, editor transactions, redaction, and state machines. They cannot certify native execution. The release test pyramid therefore includes Kotlin/JNI tests, Android instrumentation, x86_64 emulator matrices, physical arm64 devices, host-driven black-box scripts, fuzzers, and signed-APK install tests.

### 13.1 Release-critical end-to-end tests

| ID | Acceptance scenario | Pass condition |
|---|---|---|
| `FS-01` | Create nested text/binary files, rename directory, force-stop during atomic save, restart. | Last acknowledged editor generation is recovered; saved file is either old or new, never partial; binary hash is unchanged. |
| `FS-02` | Import malicious ZIP with `../`, absolute names, symlink escape, duplicate/case-colliding names, extreme ratio/count. | Import fails safely with no write outside staging and a specific audit/error result. |
| `FS-03` | Link a SAF tree, revoke the grant, edit locally, reconnect provider with changed external file. | Local project remains usable; Sync shows a conflict and never overwrites either side silently. |
| `PROC-01` | PTY command reads stdin, prints a device timestamp/nonce, emits stdout/stderr, returns nonzero. | Captured bytes and real nonzero status match the process; result changes between runs and cannot come from a fixture. |
| `PROC-02` | Start a child tree, press Stop, then inspect process table/file descriptors. | Interrupt→terminate→kill policy completes; no CodeForge-owned job child or leaked stream remains. |
| `PROC-03` | Produce output faster than UI consumption and exceed cap. | UI stays responsive; bytes are ordered until a single truncation marker; job remains stoppable. |
| `LIFE-01` | Run interactively, background app, lock device, return; separately force-stop runtime service. | Foreground notification controls the live job; killed job becomes `INTERRUPTED`, source/logs persist, no fabricated exit code. |
| `PY-01` | Airplane mode; run multi-file Python with import, stdin, Unicode, exception, and file I/O. | Bundled CPython executes locally from selected saved generation, project I/O stays under root, exact version/ABI shown. |
| `PY-02` | Attempt project import through symlink/traversal and access app credential storage. | Path adapter denies escape. Security statement notes that unrestricted native CPython remains trusted-code only rather than claiming an unproven sandbox. |
| `JS-01` | QuickJS infinite loop, memory growth, module imports, and attempted socket/native-module use. | Limits terminate runaway jobs; project modules work; absent capabilities are unavailable; UI process survives. |
| `WASM-01` | Module requests undeclared preopen/network and exceeds fuel/memory. | Instantiation or call fails closed with capability/limit diagnostics; declared output directory works. |
| `EDIT-01` | Randomized Unicode/IME edit sequence with kills between native acknowledgements. | Native saved/recovery hash equals the reference transaction model; no duplicate/drop/reorder. |
| `EDIT-02` | Paste HTML that navigates, fetches local secrets, opens popup, or calls native bridge. | Preview cannot access secrets or any bridge; blocked actions are visible; allowed project assets still render. |
| `GIT-01` | Clone fixture, edit/stage/commit/branch/push, induce conflict, cancel network. | libgit2 result matches desktop Git oracle; conflict preserves all content; cancellation leaves a valid repository. |
| `AUTH-01` | Authenticate HTTPS/SSH, inspect logs, environment, exported ZIP, backups, and crash payload. | No token/private key/authorization header appears; changed SSH host key blocks connection. |
| `PKG-01` | Install locked set online then on clean offline device from signed bundle; tamper one byte. | Valid environments match hashes; tampered install fails before activation; rollback retains old environment. |
| `PERM-01` | Fresh install and exercise editor/runtime/Git/package flows while denying optional prompts. | Manifest/requested permissions match the approved matrix; editing/local runs need no microphone, overlay, broad storage, or media permission. |
| `APK-01` | Install previous production version with data, upgrade, run migrations, attempt debug/wrong-key update, roll back using documented procedure. | Correct-key upgrade preserves projects; wrong-key APK is rejected; failed migration restores/reopens backup safely. |
| `OFF-01` | Fresh APK install with network blocked from first launch; create/edit/run baseline Python, JS, and Wasm samples. | Baseline advertised features work without any CDN, npm, PyPI, remote compiler, Metro, Expo server, or backend. |

### 13.2 Nonfunctional budgets

Budgets should be ratified after the Phase 0/1 measurements. The initial target is cold UI launch under 2.5 seconds on a representative mid-range arm64 device, editor first paint under 750 ms after project open, shell start under 800 ms, QuickJS start under 300 ms, CPython start under 1.5 seconds, terminal sustained output without ANR, and idle memory low enough that the editor plus one runtime remains stable on a 4 GB device. Every performance report records device, API, thermal state, APK/runtime version, project fixture, and percentile; a single flagship measurement is not acceptance.

Fuzz path/archive parsers, editor message schemas, LSP framing, ANSI/UTF-8 streams, package manifests, lockfiles, and Git URL/redaction logic. Run AddressSanitizer/UBSan in dedicated native test variants and continuous native dependency vulnerability scanning. Test API 26, 29, 30, 33, 34, and current; arm64 physical hardware is release-mandatory, while x86_64 is for emulation and CI. Include at least one aggressive OEM battery policy device.

## 14. APK packaging and private distribution

### 14.1 Build products

The private production product should be an **arm64-v8a release APK** for the cohort and an **x86_64 internal-test APK** for emulators. Drop `armeabi-v7a` and `x86` unless the device inventory proves a requirement; every extra ABI multiplies native runtime, libgit2, security, and package testing. Retain API 26 only if the complete native dependency set and security posture pass there. Produce a universal internal APK only when operational convenience outweighs size.

Create Gradle flavors such as `private` and `internal`, with stable `applicationId`, monotonic `versionCode`, semantic `versionName`, explicit ABI splits, R8/resource shrinking validated against JNI keep rules, symbols archived privately, and deterministic runtime manifests. The APK includes editor/terminal assets, baseline packages, native libraries, notices, SBOM reference, and a machine-readable `codeforge-build.json` containing source revision, dependency/runtime versions, ABI, minimum/target API, and artifact hashes. No production capability depends on Metro, Express, tRPC, Manus services, Expo Go, a remote compiler, or first-launch download.

Release signing uses a dedicated production key in controlled signing infrastructure or a protected CI environment, never `android/app/debug.keystore` and never a shared test key. Separate upload/build and final-sign roles if possible. Record certificate SHA-256, protect the signing environment with approval and least privilege, back up the key offline, and define compromise/key-rotation response before pilot. All companion APKs must follow one signing lineage/channel.

The CI release pipeline should perform pinned dependency installation, TypeScript/Kotlin/native checks, unit/instrumentation tests, native sanitizers in test variants, clean Gradle assemble, SBOM/notices generation, secret scan, signing, `apksigner verify --verbose --print-certs`, APK content/ABI/permission inspection, fresh install, upgrade-from-prior, airplane-mode smoke tests, malware/vulnerability scanning, checksum generation, and provenance attestation. Security and product owners approve the immutable SHA-256 digests; CI artifacts are not considered releases merely because Gradle completed.

### 14.2 Distribution and updates

For a small private cohort, distribute through an authenticated MDM/private artifact portal or a Google Play closed/internal track if policy permits the runtime/package design. Direct APK distribution must use HTTPS, named users, expiring links, SHA-256 and certificate fingerprint display, release notes, minimum/target Android, backup warning, and installation instructions. Avoid email/chat attachments. Devices must verify Android's signer on upgrade; CodeForge may check a signed update manifest but should not silently bypass Android's user-confirmed installer flow.

Retain the current and prior signed releases, migration notes, native symbols, SBOMs, source revision, and exact runtime catalogs. Before an irreversible schema migration, create an app-private checkpoint and prompt for project export when risk warrants it. Android ordinarily rejects downgrade version codes, so “rollback” means a prepared forward-fix APK or an explicitly tested uninstall/restore workflow; it must never be improvised after data corruption.

The current CI workflow is insufficient because it regenerates Android with `expo prebuild --clean`, builds only a generic Expo shell, and signs release with the debug key. Replace it as part of Phase 0. Remove the iOS simulator job from the release gate until Android reaches the private-beta acceptance bar; Android-first means native correctness is not delayed by maintaining an unsupported iOS capability mirror.

## 15. Migration away from the Expo-only prototype

Migration should preserve useful UI work without preserving false abstractions.

### Step 1: Freeze claims and establish native authority

Add an in-app prototype banner and capability screen. Disable the current Run button or relabel it **Preview simulated output** until `PROC-01` passes; remove fixed `OUTPUT_LINES`, hard-coded `SANDBOX`, `TRUSTED`, branch, pseudo-path, and runtime version. Check in `android/` as reviewed source, remove `expo prebuild --clean` from CI, add Gradle builds as the release path, and document that Expo Go is unsupported. `npx expo run:android` may remain a developer convenience only if it does not regenerate or hide native state.

### Step 2: Reduce the template surface

Remove unused backend/template and device capabilities from the mobile artifact: microphone/audio/video playback, overlay, broad external-storage permissions, unrelated OAuth/deep links, media foreground service, and any unneeded Manus/backend modules. Retain Expo packages only where they remain useful and permission-minimal, such as haptics during transition. Introduce lint/architecture rules preventing UI code from importing file/process/Git/package implementation directly; all operations go through domain interfaces.

### Step 3: Introduce interfaces and feature flags

Define `ProjectRepository`, `DocumentRepository`, `ExecutionClient`, `RuntimeCatalog`, `GitClient`, `PackageClient`, `CredentialVault`, and `TrustPolicy`. Implement a `PrototypeAdapter` only for temporary UI development and a `NativeAndroidAdapter` for device builds. The app displays adapter provenance; release flavor compilation excludes the simulator adapter. Feature flags remain local, signed build configuration—not remotely enabled native authority.

### Step 4: Migrate data into real projects

On first launch after ProjectStore ships, read `codeforge.workspace.v1`, validate its object/size limits, create one project named **Imported prototype workspace**, write each recognized buffer atomically, preserve unknown text buffers with safe filenames, and store a migration marker only after every file commits. Retain the old key until the user opens the imported project and the next successful backup checkpoint. If migration fails, remain read-only with export/retry; never clear the legacy value first.

### Step 5: Replace vertical slices

Replace file tabs with ProjectStore sessions, then Save, import/export, editor, Run/output, terminal, trust badge, runtime settings, branch status, Git actions, and packages in that order. A vertical slice is complete only when fixture output is removed and a device test verifies the native source of truth. No screen should mix a real status badge with simulated content without a conspicuous prototype label.

### Step 6: Remove Expo as an architectural dependency

After the native core and CodeMirror shell are stable, remove Expo Router/build/config plugins where they no longer provide value, convert configuration to ordinary React Native/Gradle resources, and own Android lifecycle directly. This can be incremental: React Native is compatible with an Android-first native core, while Expo managed workflow is not compatible with pretending native runtimes do not need native engineering. The final criterion is that a clean checkout builds the signed-capability-equivalent APK through Gradle without generating native source and without contacting an Expo service.

## 16. Architecture decisions and deferred choices

| Decision | Selected direction | Rationale |
|---|---|---|
| Platform | Android-first API 26+, reassessed against device inventory | Real native runtimes and filesystem/process behavior differ materially by platform; one tested contract is safer than nominal parity. |
| UI migration | Retain React Native initially; Kotlin owns privileged state/services | Preserves prototype value while preventing JS/Expo APIs from becoming the security or process authority. |
| Native project | Checked-in bare Android Gradle project | Required for services, AIDL, JNI, PTY, native dependencies, release signing, and predictable manifests. |
| Workspace | App-private POSIX tree with SAF copy/mirror | Reliable Git/build semantics plus explicit external access; avoids fragile shared-storage execution. |
| Terminal | Real Android shell through native PTY, trusted projects only | Honest local command capability without claiming a Linux distribution. |
| Python | Bundled native CPython, CodeForge project environments | On-device compatibility and offline CLI semantics; no false standard-venv claim. |
| JavaScript | QuickJS first; Node deferred | Small, controllable runtime; avoids npm/Node compatibility and native add-on promises. |
| Wasm | WAMR interpreter with explicit WASI capabilities | Mobile footprint and controllable imports/limits; compiler toolchains deferred. |
| Editor | CodeMirror 6 in locked local WebView | Smaller modular mobile fit than unsupported-on-mobile Monaco; persistence remains native. |
| Git | Embedded libgit2 | Real Git semantics without requiring a distribution/package manager or parsing CLI text. |
| Packages | Curated signed catalog, lockfiles, CAS, transactional activation | Offline reproducibility, ABI clarity, rollback, and license/provenance control. |
| Extensions | No arbitrary third-party extensions in private beta | Editor/provider code otherwise inherits broad host authority; static reviewed set is auditable. |
| Sandbox claim | Trusted native execution in one APK; separate-UID executor for untrusted native code | Same-process/same-UID and app-wide network permissions are not a hostile-code sandbox. |
| Distribution | Production-signed ABI APKs through controlled private channel | Supports small cohort, deterministic artifacts, update lineage, and rollback planning. |

Deferred choices must not leak into current labels. In particular, proot/Alpine, Node/npm, source compilation, arbitrary native wheels, plugin marketplaces, debugging, cloud workspaces, user-project APK generation, and iOS are separate initiatives with their own storage, ABI, supply-chain, security, licensing, and acceptance gates.

## 17. Immediate next milestone

The next milestone is the **Phase 0 Android Native Capability Spike**, not another simulated IDE screen. Its deliverables are a checked-in non-regenerated Android build; a minimal-permission manifest; Kotlin `ExecutionClient` and `ExecutionService`; Binder FD streaming; a native PTY that starts `/system/bin/sh`; resize, stdin, Ctrl-C, real exit status, Stop, and orphan cleanup; one JNI QuickJS or minimal native-engine health check; an APK native packaging matrix on API 26/current arm64 and x86_64; and a truthful capability screen that reads measured versions and state.

The demonstration must occur on a physical arm64 phone with airplane mode enabled. A reviewer types a command that emits a run-specific nonce and device/kernel data, provides interactive stdin, observes actual stderr and a chosen nonzero exit code, starts a cancellable child process, backgrounds/returns to the app, and confirms through a second inspection that Stop leaves no child. The build is installed as an APK with no Metro or backend connection. Until that gate passes, filesystem and editor improvements may proceed, but CodeForge must not claim local Python/JavaScript execution or a sandbox.

## 18. Evidence base

The blueprint synthesizes the supplied research and uses authoritative project/platform material where available. Product comparisons establish observable capabilities and constraints; they are not invitations to infer proprietary internals.

[1]: https://play.google.com/store/apps/details?id=ru.iiec.pydroid3&hl=en_US "Pydroid 3 official Google Play listing"
[2]: https://github.com/termux/termux-packages/wiki/Termux-execution-environment "Termux execution environment"
[3]: https://github.com/Acode-Foundation/Acode "Acode source repository"
[4]: https://codemirror.net/docs/guide/ "CodeMirror System Guide"
[5]: https://github.com/microsoft/monaco-editor "Monaco Editor repository and support statement"
[6]: https://github.com/termux/termux-packages/wiki/Termux-file-system-layout "Termux filesystem layout"
[7]: https://docs.python.org/3/library/venv.html "Python venv availability"
[8]: https://source.android.com/docs/security/app-sandbox "Android application sandbox"
[9]: https://github.com/termux/termux-app/blob/master/README.md "Termux app architecture and lifecycle caveats"
[10]: https://developer.android.com/training/data-storage/app-specific "Android app-specific storage"
[11]: https://developer.android.com/training/data-storage/shared/documents-files "Android Storage Access Framework"
[12]: https://play.google.com/store/apps/details?id=ru.iiec.pydroid3.quickinstallrepo&hl=en_US "Pydroid repository plugin"
[13]: https://pyodide.org/en/stable/usage/index.html "Pyodide usage and execution model"
[14]: https://jupyterlite.readthedocs.io/en/latest/howto/configure/advanced/offline.html "JupyterLite offline distribution guidance"
[15]: https://bellard.org/quickjs/quickjs.html "QuickJS manual"
[16]: https://webassembly.org/docs/security/ "WebAssembly security model"
[17]: https://wasi.dev/ "WASI capability model"
[18]: https://github.com/bytecodealliance/wasm-micro-runtime "WebAssembly Micro Runtime"
[19]: https://pip.pypa.io/en/stable/cli/pip_download/ "pip download and offline installation workflow"
[20]: https://code.visualstudio.com/docs/editing/workspaces/workspace-trust "VS Code Workspace Trust"

Additional reviewed comparisons include Code Editor by Rhythm Software, whose documented compiler is remote and single-file rather than an on-device toolchain, and VS Code/Code - OSS, whose terminal and extension hosts are separate capabilities from Monaco itself. These reinforce the central design rule: **editing, local execution, package acquisition, and distribution are separate subsystems with separately testable trust boundaries**.
