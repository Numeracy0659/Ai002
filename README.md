# CodeForge Mobile

## Professional handoff and continuation guide

**Document status:** Authoritative engineering handoff for the next account and development team.

**Product status:** CodeForge is currently an Expo/React Native prototype with selected research and native-build preparation. It is **not yet a real mobile IDE**. The current APK contains a visual workspace and limited local text import/export, but it does not yet contain a real terminal, local interpreter, compiler, PTY, package manager, local Git engine, or secure execution sandbox.

**Primary product direction:** Android-first, offline-capable mobile development environment for a limited private user group. iOS is a separate, more constrained target.

**Important rule:** Do not add more simulated capability. A feature must not be presented as available until its implementation and acceptance test prove it on a physical device.

---

## 1. Product vision

CodeForge is intended to combine the most useful patterns from Pydroid 3, Termux, Acode, Code Editor, VS Code, CodeMirror, QuickJS, Pyodide, WebAssembly/WASI, and native Android development.

The intended product is a **real local development workspace**, not a web page that imitates one. It should provide durable projects, a proper editor, a real terminal, supported on-device runtimes, package management, Git operations, project trust, mobile developer input, and observable execution.

The first honest product promise is:

> CodeForge edits durable local projects, runs supported on-device runtimes, provides a real Android terminal for trusted projects, and works offline after the required runtimes and packages are installed.

CodeForge must not claim to be root, Docker, a complete Linux distribution, Node.js, Termux, or a security-grade hostile-code sandbox unless a separately reviewed implementation actually provides those properties.

---

## 2. Current truth: what exists and what does not

The repository began as an Expo SDK 54 mobile template. The following facts must be preserved in all future planning.

| Area | Current state | Required correction |
|---|---|---|
| User interface | A custom dark developer-tool interface exists. | Keep useful presentation work, but connect every status to measured state. |
| Project files | A small pseudo-workspace is serialized in AsyncStorage. | Build a native, durable, multi-file project store. |
| Save | The current save path changes UI state and local model state. | Save atomically to real app-private files. |
| Import/export | Basic document import and single-file sharing exist. | Add recursive project import/export, SAF grants, ZIP validation, and recovery. |
| Editor | A React Native multiline TextInput with line numbers is used. | Replace it with CodeMirror 6 or another tested editor engine. |
| Diagnostics | A small delimiter heuristic exists. | Add real language-aware diagnostics incrementally. |
| Run | The current flow uses simulated timing and fixture output. | Start a real process or runtime and record its actual result. |
| Terminal | The current terminal/output is simulated. | Add a native PTY, terminal emulator, sessions, stdin, signals, and scrollback. |
| Runtime | No user-facing CPython, QuickJS, Node.js, or Wasm runtime is currently installed. | Add explicit runtime providers with exact versions and capabilities. |
| Git | GitHub REST helpers and UI concepts exist, but not local Git. | Add a real local repository service, preferably through embedded libgit2. |
| Packages | No real catalog, resolver, lockfile, or transactional package service exists. | Add curated signed package catalogs and offline bundles. |
| Trust | `SANDBOX` and `TRUSTED` were previously hard-coded. | Use persisted project trust and capability grants. |
| Native Android | The project contains generated Android code but no completed custom PTY/process/runtime core. | Make the checked-in Android Gradle project authoritative. |
| Release | Previous builds included compact private APKs, but release signing and native ownership require further hardening. | Establish a real production signing process before wider distribution. |
| Tests | TypeScript, Vitest, lint, and backend build checks exist. | Add Android instrumentation, physical-device, offline, process, security, upgrade, and APK tests. |

The strings `SANDBOX`, `TRUSTED`, fictional paths, fixed successful output, and fake exit code must not return to production UI.

---

## 3. Research conclusions

### Pydroid 3

Pydroid demonstrates that an Android application can embed an offline Python interpreter, editor, debugger, terminal, package workflow, and native-compatible prebuilt packages. It also demonstrates that Python package support is constrained by Python version, Android ABI, native dependencies, storage, and licensing. Standard Python `venv` is documented as unavailable on Android, so CodeForge must not promise desktop virtual-environment behavior.

### Termux

Termux demonstrates the value of an Android-native terminal and package ecosystem. Its normal execution path uses Android/Bionic-compatible binaries under the app UID rather than a conventional Debian installation. Its private prefix is appropriate for tools and builds, while shared storage is better treated as an import/export area. Android lifecycle and OEM process killing are real constraints.

### Acode

Acode demonstrates a strong mobile editor architecture: folder workspaces, document sessions, tabs, SAF paths, remote locations, CodeMirror-related components, xterm.js, and an optional Alpine/proot terminal. Its proot environment is useful compatibility technology but is not a hardened security container.

### Code Editor

Code Editor demonstrates that file navigation, session recovery, search, formatting, preview, cloud providers, and mobile input preferences are important. Its documented compiler feature is remote and single-file, which is not equivalent to a local multi-file toolchain.

### CodeMirror and Monaco

CodeMirror and Monaco are editor engines, not IDEs. They do not provide a filesystem, terminal, compiler, Git implementation, or security boundary. CodeForge must build those services above the editor.

### QuickJS, Pyodide, and Wasm

QuickJS is a small embeddable JavaScript engine. Pyodide provides CPython compiled to WebAssembly with a virtual filesystem and package limitations. WAMR/WASI can provide a capability-controlled Wasm lane. None of these engines is automatically secure; the host controls the APIs, files, network, resources, and native bridges exposed to user code.

### QEMU and proot

QEMU is suitable only for a later, optional compatibility pack for selected foreign-architecture tools. Full-system emulation is too large, slow, hot, and complex for the core product. PRoot/Alpine may be considered later as a trusted Linux-compatibility pack, but it must not be called Docker, root, or a secure container.

---

## 4. Target architecture

The target architecture is an Android-first native system with a temporary React Native presentation layer.

```text
React Native presentation
├── Project screen and file tree
├── Editor host
├── Terminal host
├── Jobs and logs
├── Runtime/package screens
└── Security and settings

Native Kotlin core
├── ProjectStore
├── SAF adapter
├── Editor document host
├── ExecutionBroker client
├── TerminalController
├── GitService
├── PackageService
└── Android lifecycle/notification integration

Runtime process
├── SessionManager
├── Process supervisor
├── PTY bridge
├── Tool registry
├── QuickJS provider
├── CPython provider
└── WAMR/WASI provider

Native/NDK layer
├── PTY creation and resizing
├── Process groups and signals
├── JNI runtime adapters
└── ABI-specific packaged native libraries
```

The checked-in Android Gradle project must become authoritative. Do not use `expo prebuild --clean` after custom native implementation begins because it can remove or destabilize native work.

A separate runtime process can improve crash and lifecycle containment, but it normally shares the application UID. It is therefore **not** a complete security boundary against deliberately hostile code.

---

## 5. Project and filesystem model

The canonical workspace must be in app-private storage:

```text
filesDir/codeforge/v1/
  workspaces/<project-uuid>/
    tree/
    .codeforge/project.json
    .codeforge/lock.json
    .codeforge/trust.json
    .codeforge/recovery/
  environments/<environment-id>/
  packages/objects/<sha256>/
  terminal/home/
  jobs/<job-id>/
  imports/<operation-id>/
```

Each project needs a stable ID. Each file needs a normalized relative path, language, encoding, newline policy, saved generation, content hash, size, and optional SAF origin.

Writes must be atomic. The required pattern is temporary file, flush, synchronize where supported, atomic rename, and metadata transaction. Recovery must complete or roll back interrupted operations.

Android Storage Access Framework documents and folders must be modeled as URI grants, not treated as unrestricted POSIX paths.

Supported flows:

| Flow | Behavior |
|---|---|
| Import project | Copy a selected folder or ZIP into a new private workspace. Validate paths and reject ZIP-slip entries. |
| Export snapshot | Create a versioned ZIP containing source, project metadata, lock data, and checksums. Never include secrets or terminal history. |
| Linked mirror | Keep an explicit SAF grant and synchronize between the external provider and the private workspace through a conflict-aware flow. |

Do not build or run directly from arbitrary cloud-provider or shared-storage paths in the first real release.

---

## 6. Real terminal and execution contract

A real command must start a process on the device, receive actual output, accept input when configured, record a real exit result, and work in airplane mode when all required artifacts are local.

The UI must submit a typed request rather than a generic shell string:

```text
JobSpec {
  projectId
  savedGeneration
  runtimeId
  entryRelativePath
  argv[]
  cwdRelativePath
  environmentAllowlist{}
  ioMode
  stdinPolicy
  networkPolicy
  trustRequirement
  wallTimeMs
  idleTimeMs
  maxOutputBytes
  maxInputBytes
  maxFileBytes
  maxChildProcesses
  terminalRows
  terminalColumns
}
```

The native broker resolves `runtimeId` through an immutable registry. User values remain separate argument-vector elements. No UI method named `exec(command: String)` is acceptable.

The process state machine is:

```text
QUEUED → PREPARING → STARTING → RUNNING
RUNNING → EXITED | SIGNALED | TIMED_OUT | CANCELLED | INTERRUPTED
STARTING → FAILED_TO_START
```

The first real terminal should use a native PTY and support:

- Interactive `/system/bin/sh`
- Real stdin and stdout/stderr
- Terminal resize
- Ctrl-C and process-group termination
- Bounded scrollback
- UTF-8 and wide characters
- ANSI colors and cursor movement
- Alternate screen support where practical
- Session switching
- Android foreground notification for continued jobs
- Explicit interrupted state after process death

The product label should be **Android shell**, not “Linux shell.” It must explain that bash, apt, sudo, root, and arbitrary desktop Linux binaries are not included.

---

## 7. Runtime roadmap

### Version 1 runtime lane

1. Android shell through a native PTY.
2. QuickJS for local JavaScript.
3. Bundled CPython with an exact version and ABI declaration.
4. WAMR/WASI for selected Wasm modules with explicit capabilities.

Each runtime needs a provider interface, version, ABI list, package policy, capability policy, memory policy, timeout policy, and test suite.

### Deferred runtime lane

- PRoot/Alpine trusted compatibility pack.
- Selected QEMU linux-user tools if measured demand justifies the size and performance cost.
- Additional native toolchains only after signing, provenance, licensing, resource, and update design is complete.

### Prohibited initial claims

- No Node.js claim unless Node.js is actually shipped and tested.
- No standard desktop Python `venv` claim.
- No arbitrary native executable downloads.
- No unrestricted npm, PyPI, apk, or apt package manager.
- No hostile-code sandbox guarantee from a same-UID process, QuickJS, or Wasm alone.

---

## 8. Editor and mobile developer UX

The editor must be a real document session system above CodeMirror 6 or another selected engine. It must support multiple files, tabs, dirty state, cursor restoration, undo/redo, search, syntax modes, bracket matching, recovery journals, and measured save state.

The mobile developer keyboard must contain:

- Escape
- Tab
- Ctrl
- Alt
- Shift
- Arrow keys
- Page Up and Page Down
- Brackets and braces
- Slash and pipe
- Tilde and dollar sign
- Quotes and backslash
- Command history
- Autocomplete
- Interrupt
- Plain-text paste

The UI information architecture should contain four primary destinations:

| Destination | Function |
|---|---|
| Terminal | Interactive sessions and current output. |
| Editor | Current files and document tabs. |
| Project | File tree, run configurations, trust, and Git summary. |
| More | Jobs, packages, runtimes, storage, settings, security, and licenses. |

On launch, the app must restore a real project or show Create Project, Import Project, and Link Folder. It must not open a fictional project path.

---

## 9. Trust and security

Projects begin in `RESTRICTED` mode. Editing and inspection remain available. Terminal, project scripts, package installation, network access, Git credentials, and native capabilities require explicit grants.

Every capability grant must be:

- Visible
- Project-scoped
- Revocable
- Persisted
- Auditable
- Explained in plain language

The app must use least-privilege permissions and avoid unrelated template permissions. It should prefer SAF over broad all-files access.

A private APK is not a privileged APK. Sideloading does not grant root, bypass Android lifecycle rules, or create a secure hostile-code environment.

Downloaded packages and plugins require provenance, hashes, licenses, version compatibility, and rollback. Untrusted JavaScript extensions must not receive a broad native bridge.

---

## 10. Git and package management

GitHub REST content browsing is not local Git. The target Git service must provide a real working tree, object database, index, status, diff, commit, branch, merge conflict, clone, fetch, and push behavior.

Use Android Keystore-backed credential storage. Never store tokens in source, project ZIP exports, logs, AsyncStorage, or README files.

The initial package service should use:

- Curated signed catalog
- Exact versions
- SHA-256 hashes
- Content-addressed storage
- Transactional activation
- Rollback
- Offline bundle import
- Runtime and ABI compatibility checks
- License and provenance display

---

## 11. Implementation roadmap — current terminal slice to professional release

This is the authoritative hand-off plan. Implement phases in order, preserve the non-claims in this README, and never mark a phase complete from a desktop-only or mocked result. The repository has completed the filesystem/editor foundations, runtime/trust contracts, release preparation, and a first Android shell process-pipes slice. The next production-critical item is the NDK PTY terminal.

### Phase 5 — Complete the Android terminal

**Current status:** Partial. CodeForge launches an app-private `/system/bin/sh` process through bounded Android process pipes. It is not yet a PTY terminal.

Implement an NDK/JNI PTY backend behind a narrow Kotlin interface: `/dev/ptmx`, `grantpt`, `unlockpt`, slave open, `TIOCSWINSZ`, `fork`, `setsid`, `TIOCSCTTY`, `dup2` to standard streams, close-on-exec hygiene, nonblocking master I/O, partial-read/write handling, bounded queues, EOF/EIO handling, and `waitpid` reaping. Use explicit argv, app-private cwd, sanitized environment, and a fixed approved executable before widening command support.

Add a typed session state machine: `NEW → STARTING → RUNNING → STOPPING → EXITED | FAILED | LOST`. Implement stdin, Ctrl-C byte input, resize, a narrowly allowlisted TERM/INT/KILL policy, verified process-group cleanup, timeout, cancellation, and idempotent close. Add a private foreground-service owner only for user-visible sessions that need to continue while the editor is hidden; service death must produce `LOST`, not a fake running state.

Add a bounded terminal model: preserve bytes in transport, incrementally decode UTF-8, parse a scoped ANSI/VT subset, support colors/cursor/scrollback and alternate screen where tested, and render immutable snapshots. Never interpret terminal output as Android commands, trusted URLs, clipboard actions, or HTML.

**Acceptance gate:** On supported physical devices and airplane mode, launch the fixed shell, prove output came from the device with a nonce, type input, send Ctrl-C, resize with `stty size`, terminate the owned group, observe the real exit state, flood output without memory growth, rotate the Activity, stop the service, and verify no zombie or leaked session remains. Record API, ABI, device, and artifact.

### Phase 6 — Ship controlled runtime providers

Implement providers in this order: **QuickJS**, **WAMR/WASI**, then **bundled CPython**. Every provider requires immutable metadata: exact version, ABI, artifact digest, entrypoint, capability profile, memory/wall-time/idle limits, input/output quotas, and cancellation behavior. Use the existing typed `JobSpec` and runtime-trust contracts; never add `exec(command: String)`.

QuickJS exposes no filesystem/network/native bridge by default and must support interruption and memory limits. WAMR/WASI uses explicit preopens/imports. CPython is an exact Android build with documented standard-library and native-extension limitations; do not promise desktop `venv` behavior. Provider artifacts require provenance, SHA-256 verification, licenses, ABI checks, transactional installation, rollback, and offline operation.

**Acceptance gate:** In airplane mode, run deterministic nonce programs for every enabled provider, verify real output and exit status, enforce limits, cancel a running job, deny undeclared capabilities, restart after interruption, and reject uninstalled or hash-mismatched providers.

### Phase 7 — Project trust and capability grants

Connect trust policy to every execution, package, Git, credential, terminal, and external-storage operation. New/imported projects begin `unknown` or `unverified`; inspection remains available, while privileged capabilities require visible project-scoped grants.

Each grant must be plain-language, persisted, revocable, auditable, and optionally expiring. External access is an explicit SAF URI grant, not broad all-files access. Revocation affects new jobs and interrupts active jobs where supported. Emit redacted hash-chained audit events and never export secrets.

**Acceptance gate:** Import an untrusted project, prove privileged actions are denied, grant one capability, verify only that operation, revoke it, verify denial, export redacted audit evidence, restart, and confirm malformed/legacy records cannot silently grant access.

### Phase 8 — Local Git and package management

Add real local Git: working tree, object database, index, status, diff, commit, branches, clone/fetch/push, conflict recovery, credential isolation, and Keystore-backed secrets. Add a curated signed package catalog with exact versions, hashes, runtime/ABI compatibility, licenses, provenance, offline bundles, transactional activation, rollback, and reproducible lockfiles. Do not expose unrestricted `apt`, `npm`, PyPI, or arbitrary native downloads in the first release.

**Acceptance gate:** Import or clone, modify/diff/commit, export and restore offline, reproduce the lockfile, reject bad signatures/digests/licenses, recover interrupted activation, and prove no credential enters project export.

### Phase 9 — Professional mobile IDE UX and observability

Complete the four primary destinations: Terminal, Editor, Project, and More. Add tabs/session recovery, large-file safeguards, syntax modes, bracket matching, diagnostics, command history, mobile developer keys, autocomplete, accessibility, split layouts, search/replace, job history, and explicit offline/device capability indicators.

All visible statuses must come from measured state machines. Distinguish unavailable bridge, missing runtime, denied capability, truncation, interruption, session loss, and storage-full states. Add redacted structured diagnostics, bounded retention, support bundles, and no raw secret or terminal-input logging by default.

**Acceptance gate:** Test phones/tablets in portrait/landscape, keyboard and IME, rotation, accessibility, large files, output floods, offline mode, low storage, process death, and recovery. No fictional path, fake branch, simulated success, or root/unrestricted-Linux claim may remain.

### Phase 10 — Release engineering and production distribution

Make the checked-in Android Gradle project authoritative. Build with pinned toolchains, immutable CI actions, controlled dependency updates, protected release signing, ABI-specific artifacts where justified, SBOM, provenance, checksums, and signature continuity. Never use the debug keystore for distribution or commit keystore material.

Qualify minimum/current Android APIs, ARM64, supported ARMv7/x86_64 test targets, low-memory/OEM battery policies, notifications, foreground-service restrictions, SELinux, PTY behavior, SAF providers, upgrades, migrations, rollback, and staged rollout. Add crash/ANR monitoring and emergency capability-disable switches.

**Acceptance gate:** CI builds the checked-in project; installs the signed artifact; verifies bundle, ABI, signer, version, and SBOM; upgrades from the prior release; runs offline terminal/runtime/trust tests; force-stops and recovers; rolls back according to policy; and verifies no leaked credentials.

### Deferred compatibility options

PRoot/Alpine and QEMU linux-user may be evaluated only after Phase 10 measurements demonstrate demand. They are compatibility packs, not root, Docker, or security sandboxes. Remote execution requires authenticated transport and a separate threat model. A rooted-device mode is out of scope for the normal APK and must never be implied by Android shell support.

### Handoff execution rules

For every phase, create a design note, implement the smallest vertical slice, add unit/instrumentation/device tests before widening scope, derive UI from measured state, run all JavaScript/native checks, document environment limits, and commit code, tests, workflows, and documentation together. A phase is complete only when its acceptance gate passes on the supported physical-device matrix and the README truth table is updated.

---

## 12. Android and iOS strategy

Android is the primary platform for the full local IDE because it permits the most practical native process, PTY, NDK, foreground-service, and runtime integration.

iOS should initially focus on project editing, Git, WebAssembly, controlled JavaScript, preview, and selected local capabilities. It should not promise a Termux/Pydroid-style unrestricted terminal or arbitrary compiler environment.

Target Android device coverage must be measured rather than assumed:

- ARM64 physical devices
- ARMv7 devices where the complete runtime supports it
- x86_64 emulator/internal test builds
- Android API 26 and current supported API
- Low-memory and aggressive battery-management devices
- Portrait, landscape, tablets, and keyboard-visible layouts

---

## 13. Build and contribution workflow

Use the repository selected for this project as the source of truth. The repository is currently `Numeracy0659/Ai002`, but future account owners may change it.

### Safe account handoff

1. Create or select the new GitHub account.
2. Create a private repository if the project must remain limited to selected users.
3. Grant the development account access.
4. Configure repository secrets only through GitHub Settings or the chosen CI provider.
5. Never paste tokens into chat, code, commits, workflow files, logs, or README files.
6. Update the repository remote to the new repository.
7. Push the complete history or a reviewed migration commit.
8. Revoke the old token after verifying the new workflow.
9. Rotate any credential that may have been exposed during migration.

### Local validation

```bash
cd codeforge-mobile
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm check
pnpm build
```

### Native validation

```bash
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleDebug
```

Once custom native code is authoritative, do not use `expo prebuild --clean` as part of release CI. Replace it with checked-in Android Gradle compilation.

### GitHub Actions requirements

CI must:

- Pin actions to reviewed immutable revisions where practical.
- Install pnpm before dependency caching or installation.
- Run lint, tests, TypeScript, and backend build checks.
- Compile the checked-in Android project.
- Verify the APK contains the required embedded bundle and ABI.
- Produce separate compact APKs only when they are actually tested.
- Never use the debug keystore for production distribution.
- Publish checksums, build metadata, and SBOM for private releases.

---

## 14. Definition of done for a real IDE milestone

A milestone is complete only when all of the following are true:

1. The feature is implemented in source rather than represented by fixture data.
2. The feature works on a physical Android device.
3. The feature works in airplane mode when advertised as offline-capable.
4. Android process death and app restart behavior are defined and tested.
5. Errors expose actual causes rather than generic success/failure text.
6. Security capabilities are least-privilege and visible to the user.
7. Tests cover normal, failure, cancellation, storage, lifecycle, and recovery paths.
8. The APK is signed through the correct release process.
9. The feature is documented with limitations.
10. GitHub contains the implementation, tests, workflow, and documentation together.

---
research and plan followed this mindset 
Here is a research-based presentation on the best programming languages, structures, and design patterns for building terminals, code editors, and IDEs.

---

Slide 1: Title Slide

Building Terminals, Code Editors & IDEs: Languages, Architecture & Design
Research Overview & Technology Recommendations

---

Slide 2: The Landscape – Three Tiers of Tooling

Category Primary Goal Key Challenge
Terminal Emulator Render ANSI/VT streams with low latency Real-time I/O, escape sequence parsing
Code Editor Text manipulation, syntax highlighting Performance at scale (large files)
Programming IDE Code intelligence, debugging, extensibility State management, plugin isolation

---

Slide 3: The Language Choice – Overview

No single language fits all — but modern tooling is converging.

· Rust: The rising star for performance-critical, safe systems programming
· C/C++: The traditional foundation, still widely used
· TypeScript/JavaScript: Dominant for web-based and Electron-based tools
· Python: Popular for scripting, AI integration, and rapid prototyping
· Go: Used for cloud-native and lightweight tooling

---

Slide 4: Rust – The Modern Choice

Memory safety without garbage collection, zero-cost abstractions

· Performance: Within 5–10% of C/C++, often beating it in benchmarks
· Safety: Compile-time checks eliminate entire classes of bugs
· Ecosystem: cargo build system, vte (VT parsing), wgpu (GPU rendering)
· Real-world Examples:
  · Zed Editor: Entirely in Rust with custom GPU-accelerated UI (GPUI)
  · par-term: GPU-accelerated terminal emulator in Rust
  · Alacritty: Fast terminal emulator using Rust

---

Slide 5: C/C++ – The Established Foundation

Mature, battle-tested, maximum control

· Performance: Unmatched low-level control, direct hardware access
· Maturity: Decades of libraries and tooling
· Challenges: Manual memory management, security vulnerabilities
· Real-world Examples:
  · VS Code's Monaco Editor: Core written in TypeScript, but relies on C++ via Node.js
  · Eclipse: Java-based, but JVM written in C++
  · Visual Studio: C++ core for performance

Key Insight: Modern tools are increasingly moving from C++ to Rust for new development due to safety and productivity gains.

---

Slide 6: TypeScript/JavaScript – The Web Stack

Cross-platform reach, rich ecosystem

· Advantages: Runs everywhere via browser/Electron, huge package ecosystem
· Frameworks: React, Next.js, Vue for UI
· Editor Integration: Monaco Editor (core of VS Code) is TypeScript-based
· Real-world Examples:
  · VS Code: Electron + TypeScript + Monaco
  · VibeCode: Next.js + React + Tauri (Rust backend)
  · SmartIDE: Supports multiple languages via web-based interface

Caveat: Performance for large-file handling requires careful optimization.

---

Slide 7: Architecture Pattern – Layered Architecture

Separation of Concerns at the highest level

The Three-Layer Model (adopted by par-term and similar projects):

```
┌─────────────────────────────────────┐
│  Application Layer                   │ ← OS events, state, tabs, windows
├─────────────────────────────────────┤
│  Emulation / Core Layer              │ ← PTY sessions, VT state, parsing
├─────────────────────────────────────┤
│  Presentation / Rendering Layer      │ ← Screen rendering, GPU/CPU output
└─────────────────────────────────────┘
```

Benefits: Modular testing, independent evolution of each layer.

---

Slide 8: Design Pattern – Model-View-Controller (MVC) & Model-View-ViewModel (MVVM)

The dominant pattern for GUI-driven applications

· MVC separates business logic (Model) from presentation (View) and user input (Controller)
· MVVM (used in Monaco/VS Code) binds View directly to ViewModel for richer data binding
· Terminal Example: MVC is used in terminal emulator design — PTY as Model, renderer as View, input handler as Controller

MVVM in Monaco Editor:

· Model: Document data, buffer state
· View: Rendered text on screen
· ViewModel: Binds model state to view updates

---

Slide 9: Design Pattern – Plugin/Extension Architecture

Extensibility without compromising core stability

Key Principles:

1. Core is minimal — Replit IDE core ~3000 LOC
2. Everything is a plugin — Eclipse pioneered this pattern
3. Protocol-based communication — Extensions run in separate processes

VS Code's Approach:

· Extension Host: Isolated Node.js runtime per extension
· Registry Pattern: Type-safe registration of extensions and features
· Dependency Injection: Loose coupling through services

---

Slide 10: Design Pattern – Protocol-Based Architecture

LSP, DAP, and MCP — the modern communication backbone

· Language Server Protocol (LSP): Standardizes code intelligence across editors
· Debug Adapter Protocol (DAP): Standardizes debugging
· Model Context Protocol (MCP): Emerging standard for AI-tool integration
· Benefits: Language-agnostic, enables remote/cloud development

Architecture:

```
Editor → LSP Manager → Language Server → Code Intelligence
Editor → DAP Manager → Debug Adapter → Debugging
Editor → MCP Server → AI Services → Copilot/Chat
```

---

Slide 11: Terminal Emulator – Specific Architecture

Real-time I/O and VT state tracking

Key Components:

· PTY Management: Dedicated OS threads for blocking I/O (avoids async executor starvation)
· Event-driven I/O: PTY reads/writes decoupled via broadcast channels
· Byte-level state tracking: Mode changes tracked without full VT parsing
· Ring Buffer: Circular buffer for scrollback with double-mapping

State Machine:

```
Spawned → Running → Exited → Cleaned Up
```

---

Slide 12: Code Editor – Specific Architecture

Headless core + rich UI

Headless Editor Architecture:

Component Responsibility
Document Manager Versioning, change tracking, sync with LSP
Session Manager Edit history, validation state, resource usage
Edit Operation Handler Validation, format preservation, history
LSP Manager Language server lifecycle, request routing

Design Principles:

1. Separation of Concerns
2. Protocol-Based Communication
3. Centralized State Management
4. Immutable Edit History

---

Slide 13: IDE – Specific Architecture

Integrating editors, compilers, debuggers, and plugins

Cloud/Web-based IDE Architecture:

· Client-Server Model: UI in browser, backend handles heavy computation
· Workspace Management: Isolated per-user environments
· Plugin System: Extensible through well-defined APIs

Responsive IDE Architectures:

· Map-Reduce: Per-file indexing + full analysis phase
· Pros: Fast incremental updates, embarrassingly parallel
· Cons: Full analysis may be slower

---

Slide 14: Recommended Tech Stack – Summary

Component Recommended Language Recommended Frameworks/Patterns
Terminal Emulator Rust (or C++) VTE crate, wgpu, PTY, layered architecture
Code Editor Core Rust / TypeScript Monaco (TS), LSP, MVVM, headless architecture
IDE Backend Rust / Go / Java Plugin system, LSP/DAP, service-based
IDE UI (Web) TypeScript + React/Next.js Tauri (Rust backend), WebAssembly for plugins
IDE UI (Desktop) Rust (Zed approach) or Electron/TS GPUI (Rust) or Electron + Monaco

---

Slide 15: Case Study – Zed Editor

"The VS Code Challenger"

· Language: 100% Rust
· UI Framework: Custom GPU-accelerated GPUI (like a game engine)
· Architecture: Entity graph + GPU view system
· Extensions: Run as WebAssembly modules
· Performance: Opens 2GB log files in 600ms, memory <40MB
· Key Takeaway: Rust + GPU rendering = extreme performance

---

Slide 16: Case Study – VS Code

"The Industry Standard"

· Architecture: Electron + TypeScript + Monaco Editor
· Layered: Base → Platform → Editor → Workbench
· Extension Model: Isolated processes, protocol-based
· Services: Dependency injection, interface-based design
· MVVM: Monaco follows MVVM pattern
· Key Takeaway: Web technologies + smart architecture = massive ecosystem

---

Slide 17: Case Study – Eclipse Theia

"The Open-Source VS Code Alternative"

· Architecture: Cloud & desktop IDE framework
· Technology: Web-based, can be packaged as desktop app
· Plugin System: Compatible with VS Code extensions
· Use Case: Enterprise cloud IDEs, custom tooling
· Key Takeaway: Protocol-based architecture enables ecosystem compatibility

---

Slide 18: Key Design Principles – Consolidated

What all successful tools share

1. Separation of Concerns — Layers, MVC/MVVM
2. Protocol-Based Communication — LSP, DAP, MCP
3. Plugin/Extension Architecture — Isolated, modular
4. Minimal Core — Keep core small, extend via plugins
5. Performance First — Rust for new systems, GPU rendering
6. State Management — Immutable history, transactional updates

---

Slide 19: Decision Matrix – Which Language?

Criteria Rust C++ TypeScript Go
Performance ★★★★★ ★★★★★ ★★★ ★★★★
Memory Safety ★★★★★ ★★ ★★★★ ★★★★★
Productivity ★★★★ ★★★ ★★★★★ ★★★★★
Ecosystem ★★★★ ★★★★★ ★★★★★ ★★★★
Learning Curve ★★★ ★★ ★★★★★ ★★★★★
Modern Choice ★★★★★ ★★★ ★★★★ ★★★★

---

Slide 20: Recommendations

For New Projects:

1. Terminal Emulator → Rust (vte, wgpu, alacritty_terminal)
2. Code Editor → TypeScript + Monaco OR Rust (if performance-critical)
3. IDE → TypeScript/React for UI + Rust for backend (Tauri pattern)
4. Cloud IDE → Web-based with LSP/DAP, minimal core + plugins

Avoid:

· Electron for performance-critical desktop apps (Zed proves this)
· Monolithic architectures without clear layering

---

Slide 21: References & Further Reading

· rust-analyzer blog: "Three Architectures for a Responsive IDE"
· EclipseSource: "Modern Web-based Tool and IDEs"
· VS Code Architecture Documentation
· Zed Editor Architecture
· par-term Architecture
· Headless Code Editor Architecture

---

Slide 22: Q&A

Thank you!

---

This presentation is based on research across GitHub architecture documents, official blogs, and industry analyses of tools including VS Code, Zed, Eclipse, par-term, and VibeCode.
## 15. Immediate next work

The next engineering milestone is **Phase 0 followed by Phase 1 and Phase 2**:

1. Remove misleading simulated capability labels and fixture output.
2. Remove unrelated template permissions and dependencies.
3. Establish the checked-in native Android project as authoritative.
4. Implement the native project store with atomic file operations and recovery.
5. Implement the Kotlin execution service and native PTY.
6. Start `/system/bin/sh` through a typed execution contract.
7. Verify real stdin, stdout, stderr, exit status, Ctrl-C, resize, and process cleanup on physical Android hardware.
8. Only after those gates pass, redesign the terminal/editor UI around measured state.

Do not begin with QEMU, a broad Linux distribution, arbitrary package downloads, or a large visual redesign. The product must first prove that it can safely save a real project and run one real local command.

---

## 16. Research documents in this repository

- [Professional IDE research and architecture blueprint](docs/professional-ide-research.md)
- [Terminal, sandbox, QEMU, proot, and runtime plan](docs/codeforge-terminal-sandbox-plan.md)
- [Launch-screen investigation](docs/launch-screen-research.md)

These documents contain the evidence, source links, detailed component choices, risks, and acceptance-test recommendations behind this handoff.

---

## References

[1]: https://play.google.com/store/apps/details?id=ru.iiec.pydroid3 "Pydroid 3 official Google Play listing"
[2]: https://termux.dev/en/ "Termux official site"
[3]: https://github.com/Acode-Foundation/Acode "Acode official source repository"
[4]: https://codemirror.net/docs/guide/ "CodeMirror official system guide"
[5]: https://github.com/microsoft/monaco-editor "Monaco Editor official repository"
[6]: https://bellard.org/quickjs/ "QuickJS official project"
[7]: https://pyodide.org/en/stable/usage/index.html "Pyodide official documentation"
[8]: https://webassembly.org/docs/security/ "WebAssembly official security documentation"
[9]: https://github.com/bytecodealliance/wasm-micro-runtime "WebAssembly Micro Runtime official repository"
[10]: https://developer.android.com/training/data-storage "Android official data-storage documentation"
[11]: https://developer.android.com/training/data-storage/shared/documents-files "Android official Storage Access Framework documentation"
[12]: https://github.com/termux/termux-packages/wiki/Termux-file-system-layout "Termux official filesystem-layout documentation"
[13]: https://github.com/bytecodealliance/wasmtime "Wasmtime official repository"
[14]: https://docs.acode.app/user-guide/terminal "Acode official terminal documentation"
[15]: https://docs.acode.app/docs/editor-components/editor-file "Acode official EditorFile documentation"
[16]: https://code.visualstudio.com/docs/editing/workspaces/workspace-trust "VS Code official workspace-trust documentation"
[17]: https://github.com/libgit2/libgit2 "libgit2 official repository"
[18]: https://github.com/Acode-Foundation/acode-plugin "Acode official plugin template"
