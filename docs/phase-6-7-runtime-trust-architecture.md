# Corrected Phase 6–7 Runtime and Trust Architecture

## Corrected roadmap

The attached product plan is authoritative for this milestone. It defines **Phase 6 as controlled runtimes** and **Phase 7 as project trust and capabilities**. The earlier release-engineering work was mislabelled as Phases 6–7; release hardening belongs to the plan's later release phase and remains useful infrastructure, but it is not the runtime milestone.

## Research decisions

**WASI/WAMR is the preferred first controlled-runtime target** because WASI is explicitly capability-oriented and WAMR documents Android embedding, interpreter/AOT modes, caller-supplied memory pools, stack/heap parameters, and native API boundaries. QuickJS is a suitable small native provider behind a minimal custom host facade, but its `std`/`os` modules are powerful and QuickJS is not a security sandbox. CPython should be treated as an app-embedded, trusted-code-oriented provider requiring Android-specific dynamically linked artifacts, ABI/API metadata, and native packaging; it is not a desktop Python installation or an untrusted-code sandbox.

The TypeScript layer implemented in this milestone is deliberately a **domain contract and policy layer**. It validates provider manifests, runtime artifacts, JobSpecs, capability requests, resource profiles, trust records, grants, migrations, redacted exports, and audit events. It provides a mock adapter for orchestration tests. It does not claim to execute JavaScript, Python, or Wasm, and it cannot enforce Android permissions, Keystore, JNI, memory quotas, process isolation, or native cancellation.

The checked-in Android project now also contains a real Kotlin bridge named `CodeForgeRuntime`. It reports the installed package signer/API/ABI, computes SHA-256 for supplied artifact bytes, persists project trust in app-private preferences, and evaluates a deliberately small safe capability set. It is a host-policy foundation, not yet a QuickJS/CPython/WAMR executor or hostile-code sandbox. Runtime execution remains denied until a provider artifact is natively packaged, verified, and connected to a process/runtime adapter.

## Phase 6 architecture

A runtime provider is selected only by an exact provider/version/API/ABI/artifact tuple. Each provider declares its lifecycle status (`mock`, `native-pending`, `verified`, or `deprecated`), capability vocabulary, execution modes, resource profiles, artifact digest/provenance, and trust class. The job contract is serialized and versioned; it does not expose QuickJS values, WAMR pointers, JNI objects, or shell strings.

The first native follow-on is still gated on the corrected Phase 5 Android shell/PTY milestone: NDK/JNI packaging, provider loading, actual execution, native resource enforcement, cancellation, device tests, and physical-device evidence.

## Phase 7 architecture

Project trust is separate from capability authorization. A trust record describes verified provenance/integrity under a declared policy; it does not mean code is safe. Grants are scoped, expiring, revocable, and tied to the project, provider, artifact digest, and policy revision. The fail-closed evaluator denies or defers when trust, host enforcement evidence, scope, compatibility, or consent is missing.

Audit events are append-only, hash-chained, transactional, bounded, and redacted. Exports contain policy metadata and evidence references, never private keys, tokens, URI grants, host paths, raw environment values, runtime heaps, or unverified executable payloads.

## Native gates still required

A production gate must later verify WAMR/QuickJS/CPython per ABI, Android signer and Keystore evidence, native capability enforcement, actual WASI preopens/imports, QuickJS interrupt behavior, CPython JNI/extraction, memory/RSS/startup/battery measurements, cancellation of blocking work, and emulator/physical-device compatibility. Until those gates pass, UI and release metadata must label runtime results as mock or native-pending rather than successful execution. The current sandbox cannot complete the final APK build because it has no Android SDK (`ANDROID_HOME`/`ANDROID_SDK_ROOT`); CI or a device-equipped build host must run `android/gradlew assembleDebug` and the physical-device gate.

## Sources

- [QuickJS documentation](https://bellard.org/quickjs/quickjs.html)
- [WASI security model](https://wasi.dev/security)
- [WAMR embedding guide](https://github.com/bytecodealliance/wasm-micro-runtime/blob/main/doc/embed_wamr.md)
- [WAMR Android build guidance](https://github.com/bytecodealliance/wasm-micro-runtime/blob/main/product-mini/README.md#android)
- [CPython Android usage](https://docs.python.org/3/using/android.html)
- [PEP 738](https://peps.python.org/pep-0738/)
- [Android security checklist](https://developer.android.com/training/articles/security-tips)
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore)
