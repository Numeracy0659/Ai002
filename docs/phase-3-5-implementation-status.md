# CodeForge Phase 3–5 Implementation Status

## Scope delivered

This change implements the next native and policy foundation without claiming that an Android APK or language runtime has been device-verified.

### Phase 3

The terminal bridge now has explicit typed operations for terminal start, input, interrupt, stop, state, resize, and replay. Terminal events may carry a monotonically increasing sequence number. The mobile UI tracks the cursor, requests bounded replay when attaching to a session, and derives an approximate PTY size from the visible terminal card. The fixed executable remains `/system/bin/sh` in the app-private workspace. Python and JavaScript files are not falsely presented as installed runtimes.

### Phase 4

The Android terminal service now retains a bounded replay buffer, reports the current terminal dimensions and last event sequence, and exposes native PTY resize through the Kotlin and React Native layers. Resize is rejected when the process is using the non-interactive pipe fallback rather than being silently presented as supported. Native PTY close no longer performs a second `waitpid` after the exit owner has reaped the child.

The implementation is still subject to physical-device verification. The service remains a single-session owner, and its foreground-service continuity remains bounded by Android lifecycle and OEM policy. These limits are intentional and remain visible in the product contract.

### Phase 5

`lib/codeforge-runtime-catalog.ts` adds a platform-independent runtime catalog contract. Catalog validation checks schema identity, signer/signature presence, unique provider and artifact IDs, provider contracts, SHA-256 digests, and provenance. Runtime selection requires a verified provider, compatible Android API/ABI, and an installed exact artifact digest.

The existing runtime trust contract remains the execution policy boundary. The built-in WAMR/WASI, QuickJS, and CPython providers remain `native-pending` until real artifacts and native provider implementations are built, measured, and tested on devices.

## Required next verification

Run the Android Gradle build on an SDK-equipped runner. Install the resulting APK on a supported physical Android device in airplane mode. Verify save, shell start, device nonce output, input, exit status, replay after Activity recreation, native PTY resize with `stty size`, Ctrl-C, process-group cleanup, output bounds, service behavior, and explicit lost state after process death.

Do not change provider status from `native-pending` to `verified` until the provider artifact, native enforcement, exact API/ABI tuple, cancellation behavior, resource limits, and offline acceptance evidence are recorded.
