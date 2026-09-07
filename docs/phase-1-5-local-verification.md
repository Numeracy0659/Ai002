# CodeForge Phases 1–5 Local Verification

## Rule

Do not push additional changes until Phases 1–5 have been fixed, tested, and reviewed as one complete change set. A phase is not accepted from source inspection alone; Android build and physical-device evidence are required.

## Working state

- Local branch: `phase-1-5-complete-local`
- Base commit: `91ca3a7`
- GitHub changes after `91ca3a7` are diagnostic only; no new local changes are pushed.
- Target device evidence is still required.

## Phase 1 — Native Android foundation

### Repository checks

- [x] Checked-in Android project is authoritative.
- [x] CI no longer runs `expo prebuild --clean` for Android.
- [x] `MainApplication` manually registers `CodeForgeRuntimePackage`.
- [x] CMake PTY source is checked in.
- [x] CI verifies `libcodeforge_pty.so` in the selected ABI.
- [ ] Corrected GitHub Android verification workflow passes.
- [ ] APK installs on the target physical device.
- [ ] `NativeModules.CodeForgeRuntime` loads on the target device.
- [ ] Native host-state probe returns API level, ABI, signer, and capabilities.

### Acceptance result

**Pending.** The previous Android build compiled successfully but its APK verification assertion was incorrect. Commit `91ca3a7` corrects that assertion; the monitored workflow must finish before Phase 1 is accepted.

## Phase 2 — Durable project storage

- [x] Canonical app-private project-store code exists.
- [x] Snapshot validation and archive tests exist.
- [x] Atomic replacement and recovery metadata are implemented.
- [ ] Physical-device create/edit/save/reopen test.
- [ ] Interrupted-write recovery test on device.
- [ ] Offline import/export test on device.

## Phase 3 — Real shell vertical slice

- [x] Typed native terminal contract exists.
- [x] Fixed executable remains `/system/bin/sh`.
- [ ] Start shell on device.
- [ ] Send input and observe device output.
- [ ] Record real exit status.
- [ ] Stop and restart without a false running state.

## Phase 4 — Production PTY

- [x] PTY bridge, replay, resize, and lifecycle foundations exist.
- [ ] Verify native PTY transport on device.
- [ ] Verify Ctrl-C and process-group cleanup.
- [ ] Verify `stty size` after resize.
- [ ] Verify replay after Activity recreation.
- [ ] Verify bounded output and process-death state.

## Phase 5 — Controlled runtime provider

- [x] Runtime catalog and digest-verification contracts exist.
- [ ] Select exactly one provider for implementation, beginning with QuickJS.
- [ ] Package a real versioned provider artifact.
- [ ] Enforce ABI, digest, capability, output, time, and cancellation policies.
- [ ] Run a deterministic offline program on the physical device.
- [ ] Record measured output, exit status, and artifact evidence.

## Acceptance policy

Do not mark a checkbox complete from a successful JavaScript test alone. JavaScript tests establish contract behavior; Android build tests establish packaging; physical-device tests establish runtime behavior. All three evidence classes are required for Phases 1–5.

## Next local action

When the monitored Android workflow finishes, download and inspect the verification APK if it passes. If it passes, use it only for Phase 1 device acceptance. If it fails, diagnose and patch locally on this branch without pushing.

## Final push gate

Only after every required checkbox passes, the complete diff is reviewed, TypeScript tests/lint/build pass, Android verification builds pass, and device evidence is recorded may the full change set be committed and pushed.

Generated locally on 2026-09-07.

— Manus

## Current evidence log

| Date | Evidence | Result |
|---|---|---|
| 2026-09-07 | `pnpm check` on base branch | Passed |
| 2026-09-07 | `pnpm test` on base branch | 39 passed, 1 skipped |
| 2026-09-07 | GitHub Android Gradle build for `0a3156b` | Passed; packaging assertion failed |
| 2026-09-07 | Corrected workflow at `91ca3a7` | Running; not yet accepted |
| 2026-09-07 | Local physical-device test | Pending |

This document is a working verification record, not a claim that Phases 1–5 are complete.

## Local change policy

Changes made after `91ca3a7` must remain on `phase-1-5-complete-local` until the final push gate passes.

## Startup finding from device testing

The target phone is 32-bit ARM, so the correct artifact is `armeabi-v7a`, not `arm64-v8a`. The downloaded debug verification APK remained on the white splash. The build configuration indicates that debug variants are treated as debuggable and may skip embedding the JavaScript bundle, which can leave a standalone phone install waiting for Metro.

The local branch now changes the verification build to use the release variant with `-PcodeforgeVerification=true`. This mode uses the standard debug keystore only for verification, keeps the production release-signing guard intact, and allows the release variant to embed the JavaScript bundle. The workflow remains local and has not been pushed.

The local TypeScript check and test suite pass after this change: 39 tests passed and 1 test was skipped. A GitHub build using this local change is still required before downloading a replacement `armeabi-v7a` APK.

## APK inspection evidence

The downloaded artifact from workflow `34091630211` was `app-debug.apk`. It contained `classes.dex` files and `lib/arm64-v8a/libcodeforge_pty.so`, but its ZIP contents contained no JavaScript bundle or Hermes bytecode asset; the only matching asset was `assets/app.config`. This confirms that the old debug APK was not a standalone bundle and explains the white splash on a phone without Metro.

The local verification workflow has been changed from `assembleDebug` to `assembleRelease -PcodeforgeVerification=true`. The corresponding Gradle configuration uses the debug keystore only for this verification mode, while leaving production release signing protected. This is the required correction for a standalone `armeabi-v7a` verification APK.
