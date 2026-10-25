# Validation Report — cycle 5 — 2026-10-26 — feature: browser-use-grade navigation core (v2.6.0)

Baseline = commit `b3cc9ae` (v2.5.0, main); after = the v2.6.0 feature tree on branch `modernization/2026-10-26-c5`.

| Metric | Command | Baseline (b3cc9ae) | After (v2.6.0) |
|---|---|---|---|
| Build | `npm run build` | ✅ exit 0 | ✅ exit 0 |
| Static/syntax checks | `npm run check` | ✅ exit 0 | ✅ exit 0 |
| Node unit tests | `npm run test:extension` | **114 pass / 0 fail** | **122 pass / 0 fail** |
| Python bridge tests | `python -m unittest discover -s native-host/tests` | 12 pass / 0 fail | 12 pass / 0 fail |
| src↔dist parity | `cmp` over all 13 built artifacts | 13/13 | **13/13 byte-identical** |
| Dependency vulns | `npm audit` | N/A — zero deps (ENOLOCK) | N/A — unchanged |
| Secrets scan | grep over src, dist, native-host, scripts, tests, docs, README | clean | clean |
| Bundle size | `du -sb dist` | 339,663 B | 346,567 B (+2.0%) |
| Manifest permissions | `src/manifest.json` | 7 + optional hosts | **unchanged** (version 2.5.0 → 2.6.0 + description only) |
| New tests fail-first | vs `git show HEAD:` sources | — | 5 behavioral tests failed on HEAD dist sources; both hardening gates failed on HEAD src (incl. the extended syncOrigin count ≥ 4) |

## Independent review (cycle 5)

A fresh reviewer subagent returned **FAIL** — two must-fix findings, both real and both fixed in-cycle with fail-first gates:

- **F1 (Critical):** Enter was admitted by the validation layer but still hard-blocked by the in-page executor (`agentAct`'s separate `KEYS` allowlist) — the user would approve a warned Enter that then fails in the page. Fixed; a new gate pins executor/validation key parity.
- **F2 (High):** `goto`'s readable-wait accepted the first readable snapshot, which can be the still-committed previous document (the reviewer demonstrated the race with a probe harness). Fixed with a commit wait (tab URL must leave the previous value) plus per-snapshot origin verification against the **observed committed URL** — which also fixes redirected destinations (B2) reporting a misleading "still loading".
- Backlog fixed same-cycle: B1 (denied-origin step results swallowed by a failed re-snapshot — now included), B3 (abort honored inside both wait loops), B4 (approval dialog shows the destination URL up to 600 chars). B5 (stale Open-tabs list) remains the known REV-009/REL-009 backlog item.

The 3 remediation tests were demonstrated failing on reverse-patched pre-fix sources, then passing. Final: **122 Node / 0 fail**, 12 Python, check exit 0, parity 13/13, secrets clean.

Behavioral coverage: goto passes the approval gate with the destination URL, performs exactly one navigation, defers batched actions, and the next observation is the destination page; nav-history navigates back without opening URLs and reads the previous page; a denied destination grant blocks goto with zero navigations; Enter validates and its approval description carries the submit warning (Tab's does not).

Test-infra fix during the cycle: the harness `tabs.update` mock mutated the shared module-level `TAB_A` fixture, leaking a goto test's navigation into later tests (surfaced as a bogus startup permission denial and a wrong approval origin); fixtures are now copied per harness instance.

Not verified here (unchanged limits): real `chrome.tabs.update` navigation timing, the ~8 s readable-wait against slow sites, live permission prompts, and a real provider round-trip — MANUAL-QA 39–42.

---

# Validation Report — cycle 4 — 2026-10-26 — feature: automatic active-tab context (v2.5.0)

Baseline = commit `9f4a721` (v2.4.0, main); after = the v2.5.0 feature tree on branch `modernization/2026-10-26-c4`.

| Metric | Command | Baseline (9f4a721) | After (v2.5.0) |
|---|---|---|---|
| Build | `npm run build` | ✅ exit 0 | ✅ exit 0 |
| Static/syntax checks | `npm run check` | ✅ exit 0 | ✅ exit 0 |
| Node unit tests | `npm run test:extension` | **113 pass / 0 fail** | **114 pass / 0 fail** |
| Python bridge tests | `python -m unittest discover -s native-host/tests` | 12 pass / 0 fail | 12 pass / 0 fail |
| src↔dist parity | `cmp` over all 13 built artifacts | 13/13 | **13/13 byte-identical** |
| Dependency vulns | `npm audit` | N/A — zero deps (ENOLOCK) | N/A — unchanged |
| Secrets scan | grep over src, dist, native-host, scripts, tests, docs, README | clean | clean |
| Bundle size | `du -sb dist` | 339,202 B | 339,663 B (+0.14%) |
| Manifest permissions | `src/manifest.json` | 7 + optional hosts | **unchanged** (version 2.4.0 → 2.5.0 only) |
| New gate fail-first | hardening gate vs `git show HEAD:src/app.js` | fails (keyword heuristic present, old prompt) | passes |

Behavioral scope of the gate: heuristic absent; auto-context attempt gated only on toggle + existing refs + self-tab skip; `send()` runs it before building the message; system prompt routes interaction to Agent mode and explains grant-and-resend instead of "use Add page".

Not verified here (unchanged limits): a real Chrome permission prompt on first send, the rendered settings copy, and a live provider round-trip — MANUAL-QA 36–38.

---

# Validation Report — cycle 3 — 2026-10-26 — feature: active-tab screenshot & analysis (v2.4.0)

## Baseline / after metrics (real commands, this machine, this branch `modernization/2026-10-25-c2`)

Baseline = commit `7cd57a5` (cycle 2, as committed); after = the v2.4.0 feature tree.

| Metric | Command | Baseline (7cd57a5) | After (v2.4.0) |
|---|---|---|---|
| Build | `npm run build` | ✅ exit 0 | ✅ exit 0 |
| Static/syntax checks | `npm run check` | ✅ exit 0 | ✅ exit 0 |
| Node unit tests | `npm run test:extension` | **105 pass / 0 fail** | **113 pass / 0 fail** |
| Python bridge tests | `python -m unittest discover -s native-host/tests` | 12 pass / 0 fail | 12 pass / 0 fail |
| src↔dist parity | `cmp` over all 13 built artifacts | 13/13 identical | **13/13 byte-identical** |
| Dependency vulns | `npm audit` | N/A — zero deps (ENOLOCK) | N/A — unchanged, nothing added |
| Secrets scan | grep `sk-`/`AKIA`/`ghp_`/`xoxb-`/`BEGIN … PRIVATE KEY` over src, dist, native-host, scripts, tests, docs, README | clean | clean (re-run after all changes) |
| Bundle size | `du -sb dist` | 335,756 B | 339,202 B (**+1.03%**) |
| JS total | `git show HEAD:dist/*.js \| wc -c` vs `cat dist/*.js \| wc -c` | 117,435 B | 121,393 B (+3.4%) |
| Manifest permissions | `src/manifest.json` | 7 permissions + optional hosts | **unchanged** (version 2.3.0 → 2.4.0 only) |
| New tests fail-first | run new tests against pre-change sources | 4/4 agent-loop+agent tests failed; 1/1 hardening gate failed | all pass |

## Independent review (cycle 3)

A fresh reviewer subagent (separate context, given only the diff, acceptance criteria and commands — not the implementation summary) re-ran every check itself (check exit 0; 110 tests at the time; 12 Python; 13/13 parity via `cmp`; fail-first independently reproduced from a `git archive` of the base commit; manifest diff = version string only) and returned **PASS-WITH-NOTES** with four Low findings, all fixed in the same cycle:

1. `[screenshot, read-tab]` in one batch attached the pre-switch tab's image to the post-switch observation → a switch now discards the capture with an explicit note (2 loop tests fail-first).
2. A capture was silently dropped when the post-action re-snapshot failed → the failure message now says so (loop test fail-first).
3. Analyze now overwrote a typed draft → the canned prompt is only applied when the composer is empty (updated hardening gate fails on the pre-fix line).
4. The `responses`-format image path had no test → the harness is format-parameterized and asserts `input_image` parts (loop test).

Final suite after remediation: **113 Node / 0 fail**, 12 Python, check exit 0, parity 13/13.

## Verification method

- The 5 new tests were run against the pre-change sources (`git show HEAD:src/agent.js`/`agent-run.js` written into `dist/`; `git show HEAD:src/app.js` swapped in for the static gate), where **all 5 failed**, then against the changed sources, where **all pass**. That pair is the evidence the tests detect the feature rather than agree with the code.
- Behavioral coverage: capture passes the approval gate, targets the active tab's window, and arrives as a well-formed `image_url` part on the next observation (Chat Completions shape); a background-tab target refuses capture; consecutive screenshot steps prune earlier images to a text note.
- **Not verified here (same limits as cycle 2):** real `captureVisibleTab` pixels, Chrome permission prompts, a live provider accepting the vision parts, and the rendered Analyze-now dialog — MANUAL-QA 31–35 is the verification path. The vision-content shapes mirror `buildMessages()` in `app.js`, which the cycle-2 browser harness exercised for the manual screenshot path.

---

# Validation Report — cycle 2 — 2026-10-25 — profile: Full Modernization

## Baseline / after metrics (real commands, this machine, this branch)

| Metric | Command | Baseline (cycle start) | After (cycle end) |
|---|---|---|---|
| Build | `npm run build` | ✅ exit 0 | ✅ exit 0 |
| Static/syntax checks | `npm run check` | ✅ exit 0 (10 `node --check` + 2 `py_compile`) | ✅ exit 0 |
| Node unit tests | `npm run test:extension` | **81 pass / 0 fail** | **105 pass / 0 fail** |
| Python bridge tests | `python -m unittest discover -s native-host/tests` | 12 pass / 0 fail | 12 pass / 0 fail |
| src↔dist parity | `cmp` over all 13 built artifacts (10 modules + manifest + 2 native-host files) | not checked this cycle | **13/13 byte-identical** (VERIFIED) |
| Dependency vulns | `npm audit` | N/A — zero deps, no lockfile (ENOLOCK) | N/A — unchanged, nothing added |
| Secrets scan | grep `sk-`/`AKIA`/`ghp_`/`xoxb-`/`BEGIN … PRIVATE KEY` over src, dist, native-host, scripts, tests, docs, README | clean | clean (re-run after all changes) |
| CSS integrity | brace-depth scan of `dist/styles.css` | not measured | depth 0 / min 0 — balanced, 3 new rules present |
| Bundle size | `du -sb dist` | 330,389 B | 335,370 B (**+1.51%**) |
| JS total | `cat dist/*.js \| wc -c` | 113,658 B | 118,268 B (+4.1%) |
| UI in a real browser | loopback HTTP + stubbed `chrome`, real `app.js` | **UNVERIFIED** (cycle 1 recorded no path) | **Partially VERIFIED** — boot, dialogs, theme/font toggles, welcome-strip CSS, corrupt-state handling, and all three storage-degradation branches |
| Pixel screenshots / responsive widths | browser screenshot at 375/768/1280 | BLOCKED | **still BLOCKED** — in-app browser reported a 0×0 hidden surface |
| Screen-reader behavior | real AT | BLOCKED | **still BLOCKED** — no AT here (MANUAL-QA 22) |
| Extension-runtime E2E (permissions, live page automation, Reach review) | loaded unpacked in Chrome | BLOCKED | **still BLOCKED** — no extension-capable automation (MANUAL-QA 11–30) |

## Verification method: reproduce, then fix, then re-run

For each behavioral fix the failing state was observed **before** the fix, on this machine:

- `tests/agent-loop.test.mjs` run against `git checkout main` copies of `src/agent-run.js` + `src/agent.js`: **5 failed / 4 passed**. With the fixes restored: **9/9 passed**.
- `tests/hardening-static.test.mjs` + `tests/a11y-static.test.mjs` run against pre-fix `src/` files: **5 of the new hardening gates failed**; against pre-fix `dist/index.html`: **3 of 3 new a11y gates failed**. After the fixes: all pass.
- That before/after pair is the evidence that these tests detect the defects rather than merely agreeing with the code.

Two fixes went further than a static gate and were confirmed by **executing the app's own code in a browser**:

- **REL-001 (boot):** with `chrome.storage.local.get` made to reject, `app.js` still rendered the panel (composer present, 4 welcome pills) and issued **zero** `set()` calls — so the "unreadable data is not overwritten" claim is observed, not asserted. Separately, with `setAccessLevel` absent entirely (older-Chrome simulation), the app booted fully and persistence still worked.
- **A11Y-001/002/003:** computed DOM confirmed `#messages` has `aria-live: null`, `#status` keeps `role="status"`, `#attachments`/`#reachCapabilities` report `role="group"`, the brand SVG reports `role="img"`, and the shortcut hint read `Ctrl+K` on this Windows host.

## Quality gates

| # | Gate | Result |
|---|---|---|
| 1 | Build succeeds | **PASS** (exit 0) |
| 2 | Lint/static analysis | **PASS** — no linter configured in this project; `npm run check` (syntax) exit 0, exception documented |
| 3 | Unit + integration tests | **PASS** — 105 Node + 12 Python, 0 failures |
| 4 | Critical E2E workflows in a browser | **PARTIAL** — app UI booted and driven in a real browser against a stubbed `chrome` (VERIFIED, incl. all storage-degradation and corrupt-state branches); the extension-runtime paths (permission prompts, live page automation, Reach review) remain **BLOCKED** |
| 5 | No new critical vulnerabilities | **PASS** — no new deps; two High action-authorization defects (SEC-001/002) found and fixed with tests; secret scan clean; reviewer pass (below) |
| 6 | No breaking API/schema changes | **PASS** — manifest, storage shapes and bridge protocol untouched; only behavior change is digest hidden/`[contenteditable]` filtering, disclosed |
| 7 | UI responsive + accessible | **PARTIAL** — static+computed a11y PASS; screenshots/responsive/AT **BLOCKED** with reasons |
| 8 | Existing functionality preserved | **PASS** — all 81 baseline tests still pass; suite only grew |
| 9 | Performance not regressed | **PASS** — +0.95% bundle, no hot-path change; REL-001 (full re-render per paint) unchanged and still accepted at current caps |
| 10 | Documentation matches behavior | **PASS after remediation** — SECURITY/TEST-RESULTS/README re-diffed against code; the `tabs` omission and stale tool list were the drifts found in audit, and five further over-claims (including my own digest-parity line) were corrected after review |
| 11 | Every task meets acceptance criteria | **PASS** for all 8 committed items plus the 8 remediated review findings; REL-006, REL-007, REV-009 and REV-011 deliberately deferred to the roadmap with reasons |

## Independent reviewer verdict

Reviewer subagent (separate context, read-only, explicitly briefed not to trust the implementer's claims and to inspect `git diff main`): **PASS-WITH-NOTES.**

Independently reproduced: `npm test` exit 0 with **101 pass / 0 fail** at the time it ran, `npm run check` exit 0, `md5sum` src↔dist parity for all built modules, `npm audit` ENOLOCK (confirming the zero-dependency claim), a clean secret scan of the diff, and a telemetry check (no hosts beyond the four provider presets, no `content_scripts`, MIT license). It confirmed 6 of 8 fixes outright — AGT-002/003/004, A11Y-001, and the background/fetch hardening — and verified by reading `git show main:src/*` that the pre-fix failures were real.

**The review earned its keep.** It found 11 items, 8 of which I had missed or misjudged, including:

- **One High defect in my own fix (REV-001):** the digest's hidden-text filter was ineffective, because `display:none` does not propagate into a descendant's computed style and I only checked the direct parent. My "parity with the other extractors" claim was therefore an over-claim.
- **One regression I introduced (REV-002):** the bounded-download rewrite dropped the `charset=` handling that `res.text()` used to provide.
- **One residual path in a security fix (REV-003):** the approval origin was still stale when the post-action snapshot threw.
- **Two truthfulness defects (REV-004):** Settings and Revoke reported success while the persistence guard silently no-oped — a user could lose an API key believing it was saved.
- **A guard that was only partly applied (REV-005)** and a **blank-panel boot path still open (REV-006)**.
- **Two accessibility items (REV-007/008):** two more role-less `aria-label`s my hardcoded gate structurally could not see, plus an announcement regression caused by the live-region removal.
- **Five doc over-claims (REV-010)**, each since rewritten to match the code.

All of REV-001…008 and REV-010 were remediated and re-verified: **7 new/updated static gates and 1 new loop test were each demonstrated to fail against the pre-remediation source before passing on the final code** (procedure and outputs in TEST-RESULTS.md). REV-009 (`tabRefs` never refreshed) and REV-011 (user-activation lifetime on the digest prompt) are carried to the roadmap rather than changed blind — both need in-Chrome verification this environment cannot do.

One finding the reviewer did *not* name was surfaced afterwards by the real-browser boot check: a stored chat missing its `messages` array survived boot but crashed `renderMessages()` on `chat.messages.length`. Fixed by normalizing at the load boundary, with a gate. This is why the boot harness was worth building.

## Final metric snapshot (after remediation)

| Metric | Value | Status |
|---|---|---|
| `npm run check` | exit 0 | VERIFIED |
| `npm test` | **105 pass / 0 fail** Node, **12 pass** Python, `OK` | VERIFIED |
| src↔dist parity | 0 drifted of 12 compared artifacts | VERIFIED |
| Secret scan | clean | VERIFIED |
| Bundle | 330,389 B → **335,370 B** (+1.51%); JS 113,658 → 118,268 B | VERIFIED |
| CSS integrity | brace depth 0, min 0 | VERIFIED |


## Open defects after this cycle

None at P0. Deferred to the roadmap with evidence: REL-006 (raw non-JSON provider error), REL-007 (no outer wall-clock cap on Agent mode), REL-008 (UI files authored only in `dist/`), and the P2 feature gaps in MODERNIZATION_ROADMAP.md.

## Honest limits of this report

- Anything labeled BLOCKED was not performed here; it is covered by MANUAL-QA items 22–30 rather than claimed as verified.
- The Chrome version that introduced `chrome.storage.setAccessLevel` could not be confirmed from official docs (two fetches returned no availability statement), so no version number was written into README or SECURITY — the fix makes the call non-load-bearing instead, which is correct regardless of the answer.
- Competitive claims rest on sources fetched today; sider.ai, getmerlin.in's homepage and Trustpilot returned 403, so a handful of items are graded M/L with the blocking named.
