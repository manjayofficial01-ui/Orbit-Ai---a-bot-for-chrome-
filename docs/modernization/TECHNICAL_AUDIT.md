# Technical Audit — cycle 1 — 2026-10-25

Method: full static read of every source module (no fan-out needed; ~1.9k lines), scanner runs, docs-vs-code diffing. All statuses honest.

## Dependency & supply chain
- npm: zero runtime dependencies, no lockfile — `npm audit` not applicable (VERIFIED: package.json has no dependencies key).
- Python native host: stdlib imports only (json/os/pathlib/re/shutil/struct/subprocess/sys/tempfile/urllib/argparse/winreg) — no pip surface (VERIFIED via import scan).
- Secret scan (grep sk-/AKIA/ghp_/BEGIN/xoxb-/key assignments across src, dist, native-host, scripts, tests, docs): clean (VERIFIED).

## Security review (OWASP-mapped, extension context)
- Injection/XSS: all model/page text rendered via textContent; no innerHTML in app paths (VERIFIED by read + existing tests). Links restricted to http(s) with noopener noreferrer.
- Native bridge: fixed argv shapes only (channels / <channel> search|read / read <url>), double validation (extension + host), output size caps, credential scrubbing, extension-ID allowlist, per-user install, no shell. 12 dedicated tests (VERIFIED).
- Prompt injection: untrusted wrappers on page/reach content, system rules, citation finalizer strips unobserved sources; delimiters explicitly documented as non-enforcement (accepted residual risk, documented in SECURITY.md).
- CSP: script-src 'self', object-src none, base-uri none (VERIFIED, tested). connect-src https: is intentional — real gate is optional host permissions.
- Keys: chrome.storage.local, endpoint-bound, never in exports/history; revoke + delete-all controls present.

## Findings register
| ID | Severity | Finding | Status |
|---|---|---|---|
| DOC-001 | P1 | docs/SECURITY.md claimed 5 MB / 60 chats; code enforces 8 MB / 100 (src/app.js save()/newChat), and research cap undocumented | FIXED-VERIFIED (docs rewritten; numbers re-checked against code) |
| DOC-002 | P1 | docs/TEST-RESULTS.md claimed 26 tests and 3 syntax checks; actual 73+12 and 10 files; no Reach coverage described | FIXED-VERIFIED (rewritten from fresh runs) |
| DOC-003 | P2 | docs/MANUAL-QA.md had no Reach research or a11y checklist | FIXED-VERIFIED (items 11–15 appended, marked not executed) |
| A11Y-001 | P1 | settingsDialog and contextDialog had no accessible name; dynamic page-tools dialog (page-access.js) unnamed | FIXED-VERIFIED (aria-labelledby added; new static gate tests/a11y-static.test.mjs enforces) |
| REL-001 | P2 | renderMessages re-renders all messages per paint (throttled 75 ms) | ACCEPTED at current caps (250k-char answers, 100 chats) — perf unchanged this cycle |
| REL-002 | P2 | Agent-mode invalid action block burns one of 8 steps; research loop got a protocol retry this cycle, agent did not | roadmap (consistency improvement) |
| ROB-001 | P3 | background.js assumes info.selectionText non-null in selection context | roadmap (defensive one-liner) |
| ARCH-001 | P2 | inspectPage/snapshotPage in page-access.js are near-duplicate extractors | roadmap consolidation |

## Dead code inventory
None confirmed. All modules imported and exercised; dist/native-host required for shipping the installer. No removals made (rule: verify dynamic usage first).

## Baseline health
Build green, 69→73 Node tests + 12 Python tests green at cycle end; `npm run check` green. No P0 security findings.
