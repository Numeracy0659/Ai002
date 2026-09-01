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

## 11. Delivery phases and acceptance gates

### Phase 0: Remove false capability

Remove simulated output, hard-coded trust, fictional paths, and fake Git state. Make unsupported capabilities visibly unavailable.

**Gate:** No UI success state is possible without measured implementation state.

### Phase 1: Filesystem

Implement the native project store, atomic saves, recovery journals, recursive operations, SAF import/export, ZIP validation, and storage-full recovery.

**Gate:** Kill the app during a write and verify that the file is complete and recoverable.

### Phase 2: Terminal

Implement Kotlin execution service, native PTY, process groups, stdin, output streaming, resize, Ctrl-C, cancellation, and interrupted-state recovery.

**Gate:** In airplane mode, run a nonce-producing command and independently verify that output came from the device process.

### Phase 3: Editor

Replace TextInput with CodeMirror 6 or a tested native editor surface. Add real sessions, tabs, recovery, search, language modes, and split layout.

**Gate:** Force-stop the app during unsaved editing and restore the correct document state.

### Phase 4: Runtime providers

Add QuickJS, CPython, and WAMR/WASI with explicit limits and capability profiles.

**Gate:** Run offline, receive real output, enforce timeout/output limits, cancel execution, and verify denied capabilities.

### Phase 5: Git and packages

Add local Git, remote GitHub synchronization, signed package catalog, lockfiles, offline bundles, rollback, and license inventory.

**Gate:** Import or clone, modify, diff, commit, export, restore offline, and reproduce the locked environment.

### Phase 6: Release engineering

Create production signing, ABI-specific APKs, SBOM, reproducibility metadata, upgrade tests, rollback tests, and a physical-device matrix.

**Gate:** Install, upgrade, downgrade/recover, run offline, test process interruption, and verify signature continuity.

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
