# Verified test results

Last verified: 2026-10-26 (modernization cycle 4 — v2.5.0 automatic active-tab context, branch `modernization/2026-10-26-c4`).

- Build: `npm run build` copies 10 extension modules, `src/manifest.json` and the native-host installer into `dist/` — passed. `index.html` and `styles.css` still live only in `dist/` and are edited there (see README).
- Node syntax checks (`npm run check`): dist/app.js, core.js, page-access.js, agent.js, agent-run.js, background.js, reach-core.js, reach-client.js, research-protocol.js, research-loop.js — all passed; `python -m py_compile` on both native-host files — passed (exit 0).
- Node built-in test suite: **114 passed, 0 failed** (core, agent, agent-loop, reach-core, research-loop, research-panel, a11y-static, hardening-static).
- Python native-bridge suite: **12 passed, 0 failed** (`python -m unittest discover -s native-host/tests`).
- src↔dist parity: all 13 built artifacts byte-identical (`cmp`).
- Secret scan across src, dist, native-host, scripts, tests and docs: clean.
- New in cycle 3 (8 new tests total; the 5 feature tests and 3 post-review remediation tests were each demonstrated **failing on the pre-change sources**, then passing):
  - `agent` — `screenshot` validates as a ref-less capture tool (rejects ref/text, prompt documents it).
  - `agent-loop` — a screenshot action passes the confirm() gate, captures from the active tab's window, and arrives as a well-formed `image_url` part on the next observation; a non-visible target tab refuses capture; consecutive capture steps prune earlier images to a text note; a pre-switch capture in a `[screenshot, read-tab]` batch is discarded with a note instead of misattributed; a capture dropped by a failed re-snapshot is reported; the Responses format attaches `input_image` parts.
  - `hardening-static` — the Analyze-now button may only act on a preview opened through the review dialog, must reuse the reviewed capture, must send through the normal `send()` path, and must not overwrite a typed draft with the canned prompt.
- Not covered by automated tests (unchanged from cycle 2): real-Chrome `captureVisibleTab` pixels, permission prompts, live provider vision round-trips, rendered dialog behavior — see MANUAL-QA 31–35.
- New in cycle 4 (demonstrated **failing on the pre-change `src/app.js`**, then passing):
  - `hardening-static` — active-tab context is automatic: the keyword heuristic is gone; the auto-read is gated only on the Settings toggle, an already-attached reference, and Orbit's own workspace tab; `send()` runs it before building the message; the no-context system prompt explains grant-and-resend and routes interaction requests to Agent mode.

## Previous: cycle 2 (2026-10-25)


- Build: `npm run build` copies 10 extension modules, `src/manifest.json` and the native-host installer into `dist/` — passed. `index.html` and `styles.css` still live only in `dist/` and are edited there (see README).
- Node syntax checks (`npm run check`): dist/app.js, core.js, page-access.js, agent.js, agent-run.js, background.js, reach-core.js, reach-client.js, research-protocol.js, research-loop.js — all passed; `python -m py_compile` on both native-host files — passed (exit 0).
- Node built-in test suite: **105 passed, 0 failed** (core, agent, agent-loop, reach-core, research-loop, research-panel, a11y-static, hardening-static).
- Python native-bridge suite: **12 passed, 0 failed** (`python -m unittest discover -s native-host/tests`).
- No external npm dependencies, so no dependency installation/audit applies (no lockfile exists; `npm audit` exits ENOLOCK). The native host imports Python stdlib only. Absence of dependencies is not a security certification.
- Secret scan across src, dist, native-host, scripts, tests and docs: clean.

## What the suites cover

- **core / agent / reach / research-loop** — as before: endpoint validation, protocol request mapping, optional parameters, budgets, SSE split UTF-8/CRLF/multiline/comment/EOF cases, JSON fallback, completion/failure detection, error-body privacy, safe fetch flags, exports and manifest constraints; Agent-mode action parsing/guards; Reach allowlisting, sanitization, transport errors, the supervised research loop (review gates, decline/unsupported budgets, upstream errors, call caps, cancellation, citation finalizer, prose-directive retry) and Reach panel wiring.
- **a11y-static** — form-control names, dialog names, aria target resolution, dynamic page-tools naming, plus cycle-2 gates: the conversation region must not be a live region, labelled containers must carry a role, and the shortcut hint must stay localisable.
- **agent-loop** *(new in cycle 2)* — drives `runAgentLoop` against a scripted `chrome`, provider and `confirm()`: step budget vs. malformed blocks, bounded free retries, the origin named in the approval dialog after a navigation, ref aliasing across a mid-batch `read-tab`, injected-action rejection handling, cancel-at-gate and unknown-tab-ref paths.
- **hardening-static** *(new in cycle 2)* — regression locks for fixes that live in browser-only code paths (boot degradation, selection-menu guard, digest hidden-text filtering, bounded URL fetch, agent origin refresh, tab-switch deferral, welcome-screen claims). These assert the source shape is safe; they are **not** behavioral browser tests.

## Verification method for the cycle-2 fixes

Every fix was reproduced before it was accepted, by running the new tests against the pre-fix files (`git checkout main -- <file>`) and then against the fixed ones. Observed on this machine:

| Test file | Run against cycle-start (`main`) sources | Run against fixed sources |
|---|---|---|
| `agent-loop` (9 tests at the time) | 5 failed / 4 passed | 9 passed |
| `hardening-static` + `a11y-static` vs pre-fix `src/` | 5 of the hardening gates failed (a11y gates unaffected — `index.html` was not reverted in that run) | all passed |
| `a11y-static` vs pre-fix `dist/index.html` | 3 of 3 new a11y gates failed | 3 passed |
| `hardening-static` vs pre-review-remediation `src/` | 7 of 11 gates failed | 11 passed |
| `agent-loop` vs pre-review-remediation `agent-run.js` | 1 of 10 failed (the residual stale-origin path) | 10 passed |

After the independent review, three additional gates and one additional loop test were written for the findings it raised, and shown to fail against the pre-remediation code before the code was restored. That before/after pair is the evidence the tests detect the defects rather than merely agreeing with the code.

## Still not verified here

- **Extension runtime: not browser-tested.** No Chrome/Chromium automation could load an unpacked MV3 extension in this environment. Permission prompts, side-panel hosting, real page automation against a live site, the in-Chrome Reach review flow and `captureVisibleTab` were NOT exercised; see docs/MANUAL-QA.md items 11–30.
- **What the browser harness did cover:** `dist/` was served over loopback HTTP and the real `app.js` was executed against a stubbed `chrome` API. That verifies the app's own DOM/boot/persistence logic — not the extension runtime, and not that a real Chrome would behave the same.
- **Pixel screenshots and responsive widths: BLOCKED.** The available in-app browser reported a 0×0 hidden surface, so no image could be captured and the 375 px / 720 px / 900 px layouts were not re-observed.
- **Screen-reader behavior: UNVERIFIED** — no assistive technology here; MANUAL-QA item 22 covers it.
- The Chrome version that introduced `chrome.storage.setAccessLevel` could not be confirmed from official docs, so the boot fix makes that call non-load-bearing rather than encoding an unverified version number.
- Live download behavior of the 2 MB fetch cap, and real charset handling of legacy-encoding pages, were not exercised against a live server.
- No provider credentials supplied. Live inference, actual model compatibility and hosted search were NOT verified.

## Raw automated test output (summary, 2026-10-25)

```text
$ npm test
ℹ tests 105
ℹ pass 105
ℹ fail 0

$ python -m unittest discover -s native-host/tests
Ran 12 tests in 1.995s
OK
```

Counts: **105 Node / 12 Python.** The 24 added tests are 10 in `agent-loop`, 11 in `hardening-static`, and 3 new gates in `a11y-static`.

Historical note: the original 2.1 reconstruction run was 26 tests; cycle 1 recorded **73**; the cycle-start baseline on this branch was **81** (v2.2/v2.3 added 8 tests); cycle 2 ends at **105**. Per-test TAP logs of the earlier runs are preserved in this file's git history.
