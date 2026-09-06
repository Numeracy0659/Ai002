#!/usr/bin/env bash
set -euo pipefail

APK_PATH="${1:-}"
EXPECTED_CERT_SHA256="${CODEFORGE_EXPECTED_CERT_SHA256:-}"
EXPECTED_PACKAGE="${CODEFORGE_EXPECTED_PACKAGE:-com.app.codeforgemobile}"

if [[ -z "$APK_PATH" || ! -f "$APK_PATH" ]]; then
  echo "usage: CODEFORGE_EXPECTED_CERT_SHA256=<colon-separated SHA-256> $0 path/to/release.apk" >&2
  exit 2
fi
if [[ -z "$EXPECTED_CERT_SHA256" ]]; then
  echo "CODEFORGE_EXPECTED_CERT_SHA256 is required; never skip release certificate verification" >&2
  exit 2
fi

ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$ANDROID_HOME" || ! -d "$ANDROID_HOME" ]]; then
  echo "ANDROID_HOME or ANDROID_SDK_ROOT must point to the Android SDK" >&2
  exit 2
fi

APKSIGNER="${APKSIGNER_PATH:-}"
if [[ -z "$APKSIGNER" ]]; then
  APKSIGNER="$(find "$ANDROID_HOME/build-tools" -name apksigner -type f -perm -111 | sort -V | tail -1 || true)"
fi
if [[ -z "$APKSIGNER" || ! -x "$APKSIGNER" ]]; then
  echo "Could not locate an executable apksigner" >&2
  exit 2
fi

"$APKSIGNER" verify -v -Werr --print-certs "$APK_PATH"
CERT_OUTPUT="$($APKSIGNER verify -v --print-certs "$APK_PATH" 2>&1)"
ACTUAL_CERT_SHA256="$(printf '%s\n' "$CERT_OUTPUT" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | tr -d '\r' | head -1)"
if [[ "$ACTUAL_CERT_SHA256" != "$EXPECTED_CERT_SHA256" ]]; then
  echo "Release certificate mismatch" >&2
  echo "expected: $EXPECTED_CERT_SHA256" >&2
  echo "actual:   $ACTUAL_CERT_SHA256" >&2
  exit 1
fi

if command -v aapt2 >/dev/null 2>&1; then
  PACKAGE_OUTPUT="$(aapt2 dump packagename "$APK_PATH" 2>/dev/null || true)"
  if [[ -n "$PACKAGE_OUTPUT" && "$PACKAGE_OUTPUT" != "$EXPECTED_PACKAGE" ]]; then
    echo "Package identity mismatch: expected $EXPECTED_PACKAGE, got $PACKAGE_OUTPUT" >&2
    exit 1
  fi
fi

sha256sum "$APK_PATH"
echo "Verified signed APK: $APK_PATH"
