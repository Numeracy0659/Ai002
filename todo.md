# CodeForge continuation checklist

## Current status

- [x] Research Pydroid 3, Termux, Acode, Code Editor, CodeMirror, Monaco, VS Code, QuickJS, Pyodide, WAMR/WASI, proot, QEMU, Android storage, and Android security.
- [x] Write the professional architecture blueprint.
- [x] Write the terminal and sandbox decision plan.
- [x] Write the complete account-independent handoff README.
- [ ] Remove simulated capability labels and fixture output.
- [ ] Remove unrelated template permissions and dependencies.
- [ ] Make the checked-in Android Gradle project authoritative.
- [ ] Implement the native app-private ProjectStore.
- [ ] Implement atomic writes and recovery journals.
- [ ] Implement SAF import/export and ZIP-slip/path-traversal protection.
- [ ] Implement Kotlin ExecutionBroker and runtime process.
- [ ] Implement native PTY with real stdin/stdout/stderr.
- [ ] Implement process groups, Ctrl-C, termination, timeout, and orphan cleanup.
- [ ] Implement real Android shell sessions.
- [ ] Replace TextInput with a production editor engine.
- [ ] Add the developer keyboard accessory row.
- [ ] Add QuickJS, CPython, and WAMR/WASI providers.
- [ ] Add trust and capability enforcement.
- [ ] Add local Git through an embedded Git implementation.
- [ ] Add signed package catalogs and offline bundles.
- [ ] Add physical-device, offline, lifecycle, security, upgrade, and APK tests.
- [ ] Establish production signing and private distribution.

## Immediate next milestone

The next implementation must prove, on a physical Android device and in airplane mode, that CodeForge can save a real project and run one real `/system/bin/sh` command with measured output and exit status. No new simulated execution UI should be added before this gate passes.

## Non-goals for the first real release

- Root, sudo, Docker, chroot, namespaces, cgroups, systemd, or kernel modules.
- Full-system QEMU.
- Arbitrary downloaded native executables.
- Unrestricted apt, apk, npm, or PyPI package installation.
- A hostile-code security guarantee inside the same Android application UID.
- Reliable unattended background daemons.
- Direct builds from arbitrary shared-storage or cloud-provider paths.
