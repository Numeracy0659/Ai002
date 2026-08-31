# CodeForge Architecture Research and Security Decision

**Author:** Manus AI  
**Date:** 1 September 2026

## Executive decision

CodeForge should use a staged architecture: the Expo/React Native client is the editing and interaction layer; the existing Node backend is an authenticated API boundary; arbitrary execution and language servers run only in separately managed, least-privilege workers. The current session can honestly implement and test contracts, validators, protocol parsers, public GitHub reads, mocks, and local editor behavior. It cannot honestly claim hostile-code isolation, production GitHub OAuth, native binary security, or a production language-server runtime without external infrastructure, credentials, and device/build validation.

| Capability | Implementable and testable now | Requires external validation or infrastructure |
|---|---|---|
| Source diagnostics | Yes: local static diagnostics and bounded error navigation | Compiler-grade semantic analysis |
| Code execution | Policy contract, fixed runtime mapping, mock executor tests | Deno Sandbox, Firecracker, or gVisor worker with OS-level isolation |
| GitHub | Public repository metadata and contents reads | GitHub App/OAuth registration, write permissions, token storage, callbacks |
| Editor | Native editor plus tested protocol foundations | CodeMirror DOM/WebView device matrix and native rebuild |
| LSP | Strict LSP framing/request helpers | WSS gateway, language-server workers, TLS, quotas, lifecycle management |
| Supply chain | Frozen-lockfile checks and repository workflow design | Protected branch, admin settings, signed attestations, EAS builds |

## Secure execution boundary

QuickJS, Pyodide, Node `vm`, and Deno isolates are not equivalent to a kernel or microVM boundary for hostile code. Firecracker is the strongest general-purpose direction when Linux/KVM infrastructure is available; gVisor is a defense-in-depth container option; a managed service such as Deno Sandbox can be considered after its Node-version, region, retention, policy, and cost requirements are verified. The CodeForge API must never execute submitted source inside Express, the Expo client, a database host namespace, or a JavaScript `vm` presented as a security boundary.

The immediate implementation therefore uses a strict execution request schema with JavaScript/Python allowlisting, denied network by default, bounded source/input/time/dependencies, fixed executable identifiers, and no shell interpolation. The contract is deliberately incomplete as an executor: it prepares a safe seam for a future isolated worker without claiming that validation itself provides isolation.

> Resource limits, interpreter controls, and WebAssembly are useful defense-in-depth, but they are not a substitute for separate OS-level isolation when code is adversarial.

## GitHub integration

For public read-only access to `Numeracy0659/Ai002`, the REST API can be called without a token. The app now has a typed client that sends GitHub's recommended media type, API version, and User-Agent, validates owner/repository/path input, bounds returned file sizes, and maps API data into app types. Write access must remain backend-only. The preferred production model is a GitHub App installation restricted to the selected repository and required permissions. An OAuth authorization-code flow with PKCE is the fallback when user-delegated access is required.

Long-lived PATs, OAuth client secrets, GitHub App private keys, and backend signing keys must never enter the Expo bundle, editor content, URL parameters, or logs. Writes should use an approved branch, current blob SHA, serialized operations, and pull-request review rather than direct mutation of `main`.

## Editor and language intelligence

CodeMirror 6 is a browser DOM editor, not a direct React Native view. The correct mobile route is a bundled Expo DOM component or tightly controlled local WebView, with EditorState and EditorView kept inside the DOM engine and only debounced, versioned, schema-validated messages crossing the bridge. The existing native editor remains the fallback until iOS and Android keyboard, IME, selection, paste, scrolling, reload, and large-file behavior are validated in a development/release build.

LSP is a protocol, not a language runtime. A production design is mobile client → authenticated WSS gateway → isolated language-server worker. The gateway must validate strict JSON-RPC/LSP framing, initialize before use, authorize virtual workspace URIs and methods, enforce message/request/queue limits, and discard stale document revisions. It must not expose arbitrary file paths, shell commands, `workspace/executeCommand`, or server credentials.

## Verification performed

The implementation is validated with TypeScript and Vitest. The test plan covers malformed and oversized execution inputs, SSRF/metadata host rejection, GitHub path validation and response mapping, UTF-8 byte-accurate LSP framing, fragmented frame parsing, invalid JSON-RPC rejection, and request-method validation. These are contract and integration tests; they do not replace device, worker, escape, or production authorization tests.

## Security gates before production

1. Run execution only in a separately managed worker with CPU, memory, process, disk, wall-clock, output, filesystem, network-egress, and concurrency limits.
2. Keep credentials server-side, use short-lived scoped sessions, and enforce per-user authorization on every repository or execution operation.
3. Replace reflected-origin-with-credentials CORS on sensitive routes with an explicit trusted-origin policy and HTTPS.
4. Protect `main`, require reviewed pull requests and green CI, pin third-party workflow actions to full commit SHAs, and enable dependency review, secret scanning, Dependabot, SBOM, and artifact attestation.
5. Require real iOS and Android development/release-build testing before shipping WebView/DOM editor, OAuth deep links, secure storage, WSS lifecycle, or native runtime features.

## References

[1]: https://firecracker-microvm.github.io/ "Firecracker MicroVM"
[2]: https://gvisor.dev/docs/architecture_guide/security/ "gVisor Security Architecture"
[3]: https://docs.deno.com/sandbox/ "Deno Sandbox Documentation"
[4]: https://docs.deno.com/api/node/vm/ "Deno Node VM Documentation"
[5]: https://docs.github.com/en/rest/repos/contents "GitHub Contents API"
[6]: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app "GitHub OAuth App Best Practices"
[7]: https://codemirror.net/docs/guide/ "CodeMirror System Guide"
[8]: https://docs.expo.dev/versions/v54.0.0/sdk/webview/ "Expo SDK 54 WebView"
[9]: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/ "Language Server Protocol 3.18"
[10]: https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html "OWASP WebSocket Security Cheat Sheet"
[11]: https://scorecard.dev/ "OpenSSF Scorecard"
[12]: https://docs.github.com/en/actions/concepts/security/artifact-attestations "GitHub Artifact Attestations"
[13]: https://mas.owasp.org/MASVS/ "OWASP MASVS"
