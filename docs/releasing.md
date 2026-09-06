# CodeForge Release Engineering

## Scope

The corrected product plan places release hardening in **Phase 10**. The runtime and trust work belongs to Phases 6 and 7 and is documented separately in [`phase-6-7-runtime-trust-architecture.md`](phase-6-7-runtime-trust-architecture.md). This document remains the release-engineering foundation for the later release milestone.

## Release identity

The Android package identity is currently `com.app.codeforgemobile`. Every production release must use one controlled production signing identity, a monotonically increasing `versionCode`, and the exact application package expected by installed users and any signature-protected companion services. The release private key must never be committed to Git, placed in an APK, written to CI logs, or stored in a project export.

The repository contains a separate release signing configuration in `android/app/build.gradle`. A release Gradle task fails closed unless all four protected values are present: `CODEFORGE_RELEASE_STORE_FILE`, `CODEFORGE_RELEASE_STORE_PASSWORD`, `CODEFORGE_RELEASE_KEY_ALIAS`, and `CODEFORGE_RELEASE_KEY_PASSWORD`. Debug signing is not a valid production release path.

## Local release verification

A controlled release operator or protected CI environment should set the signing values, run the checked-in Gradle wrapper, and then verify the final APK. The signing key itself belongs in a protected secret store or encrypted offline backup, not in this repository.

```bash
cd android
./gradlew clean test lintRelease assembleRelease --no-daemon
cd ..
CODEFORGE_EXPECTED_CERT_SHA256='AA:BB:...:FF' \
  CODEFORGE_EXPECTED_PACKAGE='com.app.codeforgemobile' \
  ./scripts/verify-release.sh android/app/build/outputs/apk/release/app-release.apk
```

The verification script uses `apksigner` with warnings treated as errors, checks the expected signer certificate when configured, checks the package identity when `aapt2` is available, and prints the APK SHA-256. The artifact tested must be the artifact distributed. Post-signing modifications are prohibited.

## Evidence bundle

Every release should retain an immutable evidence bundle containing the exact APK, APK SHA-256, public signer certificate/fingerprint, release manifest, source commit, Gradle/JDK/Android SDK/toolchain versions, dependency lock and verification state, SBOM, provenance or attestation reference, test logs, device matrix results, migration results, and known limitations. The release manifest shape is defined in [`release/release-manifest.schema.json`](../release/release-manifest.schema.json).

A CycloneDX SBOM and signed provenance are release requirements for the production process, but they cannot be honestly generated or verified in this sandbox until the Android dependency-resolution environment and protected CI release environment are provisioned. The CI workflow therefore validates the checked-in project and JavaScript build; release signing remains protected and explicit.

## Upgrade and rollback policy

A normal Android update requires the same signing identity and a higher `versionCode`. A lower-version APK is not the normal rollback mechanism. The safe corrective path is a new higher-version release built from known-good source and signed with the same production identity. Every release must test installation from the previous release, data migration, interrupted migration, process death, and recovery.

Keeping an old APK is useful evidence and recovery material, but it does not guarantee that its data schema, backend compatibility, or distribution channel can safely roll back. A release operator must verify the actual recovery procedure on representative physical devices.

## CI boundaries

`.github/workflows/ci.yml` runs JavaScript checks and debug Android compilation on pull requests and protected branch pushes. It grants only read access, does not expose release signing secrets, uses the checked-in Android project, and pins the GitHub Actions used by the workflow to verified commit SHAs. A future protected release workflow must use a protected environment and required reviewers before accessing production signing material.

Fork pull requests and untrusted branches must never receive production secrets. CI caches are performance inputs only and must not contain signing keys, credentials, release APKs, or decoded secret files.

## Phase 7: conditional hardening

Phase 7 is not a repository-defined delivery phase. If release evidence shows a material issue, it becomes a focused post-release hardening response. Possible triggers include crash or ANR clusters, migration failures, device-specific incompatibility, a dependency or action compromise, signing-key exposure, incomplete SBOM/provenance, or unexplained release non-reproducibility.

A hardening response should add privacy-reviewed crash/startup/migration observability, release pause controls, dependency and certificate monitoring, evidence retention, incident/quarantine procedures, credential rotation, and a tested forward-fix release. It must not be described as automatic rollback, Google Play staged rollout, or proof of secure hostile-code execution.

## Not validated here

This sandbox does not contain the production keystore, Android SDK, protected secret manager, physical device matrix, signing certificate, attestation identity, or an independent second build environment. Therefore this repository change establishes the release engineering structure and fail-closed checks; it does not claim a production-signed APK, byte-for-byte reproducibility, successful device qualification, or completed rollback certification.
