# Verified test results

Last verified: 2026-10-25 (modernization cycle, branch `modernization/2026-10-25`).

- Build: `npm run build` copies 10 extension modules, `src/manifest.json` and the native-host installer into `dist/` — passed.
- Node syntax checks (`npm run check`): dist/app.js, core.js, page-access.js, agent.js, agent-run.js, background.js, reach-core.js, reach-client.js, research-protocol.js, research-loop.js — all passed; `python -m py_compile` on both native-host files — passed.
- Node built-in test suite: **73 passed, 0 failed** (core, agent, reach-core, research-loop, research-panel, a11y-static).
- Python native-bridge suite: **12 passed, 0 failed** (`python -m unittest discover -s native-host/tests`).
- No external npm dependencies, so no dependency installation/audit applies (no lockfile exists). The native host imports Python stdlib only. Absence of dependencies is not a security certification.
- Tests cover: endpoint validation, protocol request mapping, optional parameters, budgets, SSE split UTF-8/CRLF/multiline/comment/EOF cases, JSON fallback, completion/failure detection, error-body privacy, safe fetch flags, exports and manifest constraints; Agent-mode action parsing/guards; Reach request allowlisting, capability sanitization, result sanitization, native transport errors, the supervised research loop (review gates, decline/unsupported budgets, structured upstream errors, call caps, cancellation, citation finalizer, prose-directive retry), Reach panel/manifest wiring, and static accessibility gates (form-control names, dialog names, aria target resolution).
- Generation and research-loop tests use mock fetch/transport responses, NOT paid inference.
- End-to-end bridge check (2026-10-25, this machine): framed native-messaging `status` returned 13 sanitized channels; a real `read https://example.com` through the bridge returned 1 item via the jina backend. This was run against the locally installed Agent Reach 1.6.0, outside Chrome.
- No Chrome/Chromium automation was available for this extension. Native UI, extension loading, permission prompts, live side-panel behavior and the in-Chrome Reach review flow were NOT browser-tested here; see docs/MANUAL-QA.md.
- No provider credentials supplied. Live inference, actual model compatibility and hosted search were NOT verified.

## Raw automated test output (summary, 2026-10-25)

```text
$ npm test
ℹ tests 73
ℹ pass 73
ℹ fail 0

$ python -m unittest discover -s native-host/tests
Ran 12 tests in 2.098s
OK
```

Historical note: the original 2.1 reconstruction run (26 tests) is superseded by the counts above; the full per-test TAP log of that run is preserved in git history of this file.
