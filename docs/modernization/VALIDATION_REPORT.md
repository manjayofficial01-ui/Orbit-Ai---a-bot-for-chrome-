# Validation Report — cycle 1 — 2026-10-25 — profile: Standard

## Baseline / after metrics (real commands, this machine)

| Metric | Command | Before (cycle start) | After (cycle end) |
|---|---|---|---|
| Build | `npm run build` | ✅ | ✅ |
| Node unit tests | `npm test` (extension part) | 69 pass / 0 fail | **73 pass / 0 fail** |
| Python bridge tests | `python -m unittest discover -s native-host/tests` | 12 pass / 0 fail | 12 pass / 0 fail |
| Static checks | `npm run check` | ✅ | ✅ |
| Dependency vulns | `npm audit` | N/A — zero dependencies, no lockfile | N/A — unchanged |
| Secrets scan | grep pattern scan (src/dist/native-host/scripts/tests/docs) | clean | clean (re-run after changes) |
| Bundle size | `du -sb dist` / JS sum | 312,064 B total / 95,874 B JS | 312,647 B / 96,111 B (+0.2%, a11y + platform command) |
| A11y (static gates) | `node --test tests/a11y-static.test.mjs` | not present | **4/4 pass** (added this cycle) |
| A11y (live axe/Lighthouse) | browser run | — | **UNVERIFIED** — no automation path can load an unpacked extension here; MANUAL-QA item 15 added |
| E2E in Chrome | manual | — | **UNVERIFIED** — same reason; bridge itself e2e-verified outside Chrome (framed status → 13 channels; real read via jina) and independently re-run by the reviewer |

## Quality gates

1. Build succeeds — PASS
2. Static/syntax checks — PASS (`node --check` ×10, `py_compile` ×2)
3. Unit tests (full suite) — PASS (73 + 12)
4. Integration tests — PASS (native bridge suite; framed native-messaging round-trip verified live)
5. Critical E2E workflows in a browser — UNVERIFIED (extension requires manual unpacked load; checklist in docs/MANUAL-QA.md items 11–15)
6. No new critical vulnerabilities — PASS (reviewer security scrutiny clean; no innerHTML/eval/secrets; argv fixed-shape re-verified)
7. No breaking API/schema changes — PASS (manifest gains nativeMessaging; storage shapes backward-compatible; 2.1.0→dist reload only)
8. UI responsive + accessible — static gates PASS; live check UNVERIFIED (reason above)
9. Existing functionality preserved — PASS (baseline 69 tests all still pass; suite only grew)
10. Performance not regressed — PASS (+0.2% bundle; no hot-path changes)
11. Documentation matches behavior — PASS (SECURITY/TEST-RESULTS corrected; reviewer independently diffed docs vs code, zero material mismatches)
12. Tasks meet acceptance criteria — PASS (each P1 fixed and gated by a test or a doc re-verified against code)

## Independent reviewer verdict

Reviewer subagent (separate context, no access to implementer reasoning): **PASS-WITH-NOTES.**
- Independently observed: 73/73 Node, 12/12 Python, check exit 0, byte-identical dist↔src parity for all copied files, and a live framed `status` call returning 13 sanitized channels.
- Notes raised (all LOW/INFO): vendored `Agent-Reach-main/` tree untracked; `__pycache__` untracked; Windows-only installer command shown on all platforms; ASCII-encode crash path in the .cmd launcher; `python` vs `python3` portability; dead duplicate returncode check; minor host inefficiency (channels() re-spawned per execute); researchTrace write-only.

## Post-review remediation (same cycle, re-verified)

- `Agent-Reach-main/`, `__pycache__/`, `*.pyc` added to .gitignore (untracked-noise count 25 → 16; vendored tree no longer visible to git). VERIFIED
- Settings → Reach installer command now platform-aware (`py -3` + backslashes on Windows, `python3` + forward slashes elsewhere). VERIFIED (src/app.js; rebuild green)
- Installer .cmd launcher: UnicodeEncodeError now exits with a clean remediation message instead of a crash. VERIFIED (py_compile + suite green)
- Dead duplicate returncode check removed from orbit_reach_host.py. VERIFIED (12/12 bridge tests green)
- README developer-checks note for `python3` on Linux. VERIFIED

Remaining reviewer items deliberately not changed (roadmap): host re-spawns `channels()` per execute (efficiency, safe); researchTrace surfacing (P3); loopback URL acceptance (review-gated by design, documented).

## Open defects

None at P0/P1. P2/P3 backlog in MODERNIZATION_ROADMAP.md.
