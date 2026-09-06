# CodeForge Phase 5 Terminal Research and Implementation Boundary

## Product decision

CodeForge now implements a real Android shell session for development APKs. The session launches `/system/bin/sh` with an explicit executable path, an app-private working directory, a sanitized environment, bounded input, bounded output, and visible interrupt/stop controls. The UI reports the transport honestly as Android process pipes and does not claim PTY support or root access.

A normal Android APK cannot become Linux root on a stock device. Native Kotlin code runs under the application UID and remains constrained by Android’s application sandbox, SELinux, filesystem permissions, and process permissions. A rooted-device mode, if ever considered, would require a separate device-specific product, threat model, user consent, and security review. It must not be presented as a capability of the normal CodeForge APK.

## Research findings

Termux and AOSP demonstrate the mature architecture for a full interactive terminal: a native PTY, a session owner that can outlive the visible Activity, bounded byte queues, terminal parsing, resize forwarding, process cleanup, and explicit lifecycle state. A PTY is a bidirectional asynchronous byte stream, not a line protocol. It normally merges standard output and standard error and requires a terminal emulator to interpret ANSI/VT bytes.

Android foreground services can improve continuity for a user-visible terminal session, but they do not guarantee survival across force-stop, low memory, vendor policy, reboot, or host-process death. Any future service must be private, user-started, notification-visible, and tolerant of session loss.

## Current implementation

The native `CodeForgeRuntime` module provides a bounded local shell vertical slice. It creates a unique directory under the app’s private files directory, launches `/system/bin/sh` with `ProcessBuilder`, clears the inherited environment, sets a minimal `HOME`, `PATH`, `TERM`, and `LANG`, merges output into one bounded stream, emits base64-encoded output events, accepts bounded UTF-8 input, sends Ctrl-C as byte `0x03`, and supports graceful termination with forced termination fallback.

The React Native screen provides transcript display, command input, Send, Ctrl-C, Stop, output truncation, exit/error states, and a visible “App UID sandbox · no root” disclosure. The terminal session is not treated as a source-code runtime: the editor’s Run action opens the app-owned shell and does not claim that Python or JavaScript execution is installed.

## Next device-gated step

A complete PTY terminal requires an audited NDK/JNI bridge. That bridge must be validated on the supported Android API/ABI matrix before release. The planned sequence is `/dev/ptmx`, `grantpt`, `unlockpt`, slave open, `fork`, `setsid`, `TIOCSCTTY`, `dup2` of the slave to standard streams, close-on-exec hygiene, nonblocking master I/O, `TIOCSWINSZ`, verified process-group signalling, `waitpid`, and idempotent cleanup. The implementation must be tested on physical Android devices because the Android NDK and vendor policy do not guarantee desktop Linux PTY behavior.

The current sandbox cannot build the APK because no Android SDK is installed. JavaScript tests, TypeScript, lint, backend build, and diff checks pass. The Android Gradle build must run on an SDK-equipped CI runner or workstation before the APK is called verified.

## Sources

- [Termux application](https://github.com/termux/termux-app)
- [Termux native terminal bridge](https://raw.githubusercontent.com/termux/termux-app/master/terminal-emulator/src/main/jni/termux.c)
- [AOSP forkpty implementation](https://android.googlesource.com/platform/packages/apps/Terminal/+/6a142b6/jni/forkpty.cpp)
- [PTY semantics](https://man7.org/linux/man-pages/man7/pty.7.html)
- [TTY ioctls](https://man7.org/linux/man-pages/man4/tty_ioctl.4.html)
- [Android application sandbox](https://source.android.com/docs/security/app-sandbox)
- [Android process lifecycle](https://developer.android.com/guide/components/activities/process-lifecycle)
- [Android foreground services](https://developer.android.com/develop/background-work/services/fgs)
- [xterm.js flow control](https://xtermjs.org/docs/guides/flowcontrol/)
- [xterm.js security guidance](https://xtermjs.org/docs/guides/security/)
