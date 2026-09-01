# CodeForge Mobile Launch-Screen Investigation

**Author:** Manus AI  
**Status:** Implemented and verified in TypeScript

## Problem statement

The supplied Android screenshot shows the configured native Expo splash screen remaining visible: a black background with the launch artwork centered, while the CodeForge editor never appears. This is a startup-transition failure, not an editor-layout defect. The most likely failure mode was an uncontrolled transition between native launch UI and the Expo Router root tree, especially on slower or older Android devices.

## Evidence and decision

Expo documents that `preventAutoHideAsync()` should be called in global scope when an application needs to control startup readiness, and that the splash should be hidden once the root content is ready. Expo Router places this initialization in the root layout, where the navigation tree is created.[1] [2]

The existing root layout did not explicitly call `preventAutoHideAsync()` or `hideAsync()`. The editor screen also hydrates its local workspace asynchronously, but that hydration is not required to display the first usable editor frame. Therefore, startup must not wait indefinitely for storage. The implementation now keeps the native splash visible only until the root view has laid out, hides it with Expo's short fade animation, and includes a four-second fallback for devices where a layout callback is delayed.

| Concern | Professional implementation | Reason |
|---|---|---|
| Native-to-JS transition | Root-level splash controller | Startup ownership belongs in the root layout, before route content. |
| Readiness signal | `GestureHandlerRootView` `onLayout` callback | Confirms that the navigation/provider tree has a renderable frame. |
| Failure containment | Four-second `hideAsync()` fallback | Prevents an indefinite splash if a platform callback is delayed. |
| Storage hydration | Remains asynchronous in the editor | Persistence must not block first paint or strand older devices. |
| Platform behavior | Uses `hideAsync()` with rejected promises safely ignored | Works across native platforms and tolerates already-hidden state. |

## Implementation

`app/_layout.tsx` now imports `expo-splash-screen`, calls `preventAutoHideAsync()` at module scope, configures a 180 ms fade, tracks root layout readiness, hides the splash after layout, and schedules a bounded fallback. The change is intentionally small: it fixes the lifecycle boundary without adding a second loading screen, blocking network request, or device-specific workaround.

## Verification plan

The implementation must pass linting, unit tests, TypeScript validation, and the backend build. A new native Android artifact must be generated because splash configuration and native lifecycle behavior are compiled into the application binary. The Android build should continue to include `armeabi-v7a`, `arm64-v8a`, `x86`, and `x86_64`; current iOS toolchains remain 64-bit only.

## References

[1]: https://docs.expo.dev/versions/latest/sdk/splash-screen/ "Expo SplashScreen API documentation"
[2]: https://docs.expo.dev/router/basics/navigation-layouts/ "Expo Router navigation layouts"
