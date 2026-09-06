# CodeForge Phases 1–3 Platform Research

## Findings

Expo's legacy FileSystem API gives the app read/write access to its private `documentDirectory` and `cacheDirectory`. The document directory is intended for user documents that should remain until the app explicitly deletes them; the cache directory may be cleared by the operating system. FileSystem supports recursive directory copy, directory creation, file reads/writes, moves, metadata queries, and Storage Access Framework URIs on Android.

Expo DocumentPicker returns a local document URI and, with `copyToCacheDirectory: true`, makes the selected document immediately readable by Expo FileSystem. This is appropriate for importing a ZIP into a temporary cache location before validating and copying its contents into the private project store. A future linked-folder flow must retain and model SAF grants rather than treating a `content://` URI as a POSIX path.

Expo's current native workflow is Continuous Native Generation. Prebuild generates Android and iOS projects from app configuration, Expo SDK templates, autolinking, and config plugins. Manual edits to generated native directories can be lost when `prebuild --clean` runs; native customizations should therefore be expressed as config plugins or maintained deliberately when the native project becomes authoritative. For this milestone, the generated Android project is checked in as a build artifact and the custom TypeScript storage layer remains platform-aware so it can later be moved behind a Kotlin native module without changing the UI contract.

## Decisions for this milestone

- Use TypeScript for the domain model, archive validation, storage orchestration, and UI integration because the current product is Expo/React Native.
- Use Expo FileSystem's private document directory for durable project data and cache directory for temporary import/export staging.
- Use `fflate` for deterministic ZIP encode/decode without adding a native dependency.
- Keep archive parsing independent from FileSystem through injected byte and file adapters so path-validation and ZIP-slip tests run on CI.
- Generate and check in the Android project, but do not claim native PTY/process support yet.
- Treat imported archives as untrusted: reject absolute paths, traversal, backslashes, empty components, duplicate normalized paths, directory/file collisions, and unsupported metadata.
- Keep secrets and terminal history outside exported project snapshots.

## Sources

- [Expo FileSystem legacy API](https://docs.expo.dev/versions/latest/sdk/filesystem-legacy/)
- [Expo DocumentPicker](https://docs.expo.dev/versions/latest/sdk/document-picker/)
- [Expo Adopt Prebuild](https://docs.expo.dev/guides/adopting-prebuild/)
- [Expo Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
