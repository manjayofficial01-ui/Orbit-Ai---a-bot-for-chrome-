# Modernization Report — Orbit AI — 2026-10-25 — Cycle 2 — Profile: Full Modernization

## 1. Executive summary

Orbit AI is a zero-dependency, bring-your-own-key Chrome MV3 copilot (side panel, full tab, or detached window) with page context, screenshots, a supervised page agent, and supervised local research through an Agent Reach native bridge. Cycle 1 ran the same day and closed its P0/P1 backlog; since then v2.2 and v2.3 added ~700 lines of agentic page-automation code **that had never been audited and whose control loop had no tests at all**. This cycle audited that surface and found two High-severity defects in the product's central safety mechanism: the per-step approval dialog could name a site the agent was no longer on, and a mid-batch tab switch let the next action resolve its element reference against the *new* tab's page — an element the model never saw and the user never approved. Both are fixed with tests that were demonstrated to fail beforehand. It also fixed a boot path that could blank the panel and then overwrite the user's unreadable data, an accessibility defect that re-announced the entire conversation on every paint, and a batch of reliability gaps. Every reviewer finding against my own fixes was remediated and re-verified. **Status: all waves complete; 105 Node + 12 Python tests green; two High + eight Medium/Low defects closed; competitor baseline materially corrected.** Nothing is committed, pending your word.

## 2. Competitive intelligence

Five primary competitors studied, all with URL + access date + confidence (`COMPETITOR_ANALYSIS.md`). Sources were treated as untrusted data; sider.ai, getmerlin.in's homepage and Trustpilot returned 403, so a few items are graded M/L with the blocking named.

| Competitor | Positioning | Standout capability | Source quality |
|---|---|---|---|
| Sider (Vidline) | Multi-model sidebar, ~5M users, credits | "Hand" + Browser Agent (research preview) | H store/vendor; approval UX **Unknown** |
| Merlin | 26-in-1 sidebar, credits | Broad summarization; now confirmed Chrome/Edge/Brave | H official; Safari **Unknown** |
| Page Assist (MIT) | Closest direct rival | Local/Ollama + RAG + MCP + 7 browsers | H |
| ChatGPT browser extension (OpenAI) | Replaced Atlas (defunct 2026-08-09) | Site-scope approval; **requires the desktop app** | H |
| Claude for Chrome (Anthropic) | The real supervision rival | Per-action "Ask Before Acting" default, **plus a risk-based auto-approve classifier** | M |
| *(built-ins)* Gemini Auto-browse, Edge "Browse with Copilot", Comet | Platform-locked, subscription-gated | Multi-step agentic tasks | H |

Chosen differentiators, evidence-based: any-provider BYOK **plus** local models with no credits; per-action gate with **no auto-approve path and no off-switch**; local research bridge; no desktop-app dependency; zero telemetry, open source. Two honesty corrections were forced by the research: Edge's "30 tabs" (cycle 1 graded it **H**) is **unsubstantiated (L)**, and per-action approval is no longer an uncontested niche — so the positioning line was narrowed accordingly.

## 3. Features implemented

| Feature | Purpose | Modules | Status | Evidence |
|---|---|---|---|---|
| Welcome-screen differentiator strip | Sider/Merlin credit opacity and OpenAI's desktop-app dependency are corroborated pains; the empty state now answers them | `src/app.js`, `dist/index.html`, `dist/styles.css` | **VERIFIED** (rendered + computed CSS in a real browser; claim-to-code static gate) | 4 pills render; gate asserts BYOK/`ollama` preset/`confirm()` anchors and forbids "unlimited" wording |
| Agent-mode step-budget parity | A malformed JSON block no longer wastes one of 8 real steps | `src/agent.js`, `src/agent-run.js` | **VERIFIED** | 2 loop tests (free retry + bounded), fail pre-fix |
| In-browser app-boot verification path | Cycle 1 recorded live UI checks as impossible; a stubbed-`chrome` harness now runs the real `app.js` | temp harness (outside repo) + `tests/hardening-static.test.mjs` | **VERIFIED** for DOM/boot logic; **BLOCKED** for extension runtime | boot, toggles, dialog naming/focus, 3 storage-failure branches, corrupt-state recovery |

No provider API, storage schema, manifest permission or bridge-protocol change was introduced.

## 4. Bugs & technical debt resolved

| ID | Severity | Root cause | Fix | Verification |
|---|---|---|---|---|
| SEC-001 | **High** | `activeUrl` refreshed only on tab switch, not after a navigating action, while the approval dialog printed it | `syncOrigin()` re-reads the tab URL from Chrome on every path | 2 loop tests; second one also fails on my initial partial fix |
| SEC-002 | **High** | Refs are per-snapshot; a mid-batch `read-tab` reassigned the snapshot, so the next action hit a different tab's element | Tab switch ends the step; synthetic `deferred` result tells the model | loop test asserts zero page actions dispatched |
| SEC-003 | Medium | `tabs` permission + 13-tool agent surface missing from SECURITY.md (cycle-1 doc gate had silently gone false) | Permissions and agent sections rewritten against the manifest | docs re-diffed vs code; reviewer independently checked manifest |
| SEC-004 | Medium | `digestScan` collected hidden text; first fix only checked the direct parent (`display:none` isn't inherited) | Ancestor style climb, layout-independent | gate fails on both the original and the incomplete first fix |
| REL-001 | Medium | Unguarded `setAccessLevel` await before `render()`; failed read then wrote empty state over it | Guarded hardening + per-branch boot recovery + `storageWritable` | **executed in a browser**: panel renders, zero writes issued |
| REL-002 | Medium | `execAction` had no try/catch; a rejection aborted the run | Catch → failed action to the model | loop test |
| REL-003 | Medium | Invalid action block consumed a step | 2 free retries (`step--` idiom, mirrors research loop) | 2 loop tests |
| REL-004 | Low | `info.selectionText.slice` unguarded | `String(\|\|'')` + empty guard | static gate |
| REL-005 | Low | Whole response buffered before the 2 MB check | Stream-capped read, charset preserved (regression found in review) | static gate |
| REV-004 | Medium | Settings/Revoke claimed success while writes were disabled | Branch on `storageWritable` | gate forbids the unconditional line |
| REV-005 | Medium | Three direct `storage.local.set` calls bypassed the guard | `writeLocal()`; exactly two write sites allowed | gate counts them |
| REV-006 | Medium | Session read + chat normalization could still throw before render; a chat missing `messages` crashed `renderMessages()` | Per-branch guards + boundary normalization | browser run reproduced the crash, then confirmed recovery |
| REV-007/008 | Low | Two more role-less `aria-label`s; agent step progress left the live channel | Roles added; agent progress published to `#status`; gate generalized to all labelled elements | a11y gates |
| A11Y-001 | **High** | `#messages` was `aria-live` while fully rebuilt every ~75 ms | Live region removed; `#status` retained as the channel | computed DOM in browser (`aria-live: null`) + gate |
| A11Y-002/003 | Med/Low | `aria-label` without role; Mac-only `⌘K` glyph | roles added; platform-aware `modLabel` | browser read on Windows host |

Scanner deltas: `npm audit` N/A both before and after (**zero dependencies, nothing added**); Python stdlib only; secret scan clean before and after. Reviewer independently confirmed parity, exit codes and a clean diff.

## 5. UI/UX improvements

Design system is a single hand-authored stylesheet on CSS custom properties; cycle 2 added one component (`.welcome-points`), reusing the existing pill recipe and adding no colors or media queries. Accessibility saw the most substantive change: the conversation stopped being a live region (an announcement storm during streaming), labelled containers gained the roles their names require, the brand SVG is `role="img"`, and shortcut hints match the platform. Agent-mode progress remains announced via the status region.

**Screenshot evidence: BLOCKED.** The available in-app browser reported a 0×0 hidden surface, so no pixel image could be captured and responsive widths were not re-observed. What *was* verified: real rendering, computed styles, dialog focus and naming, and theme/font toggles — see `UI_UX_AUDIT.md`.

## 6. Architecture & dependency updates

No dependencies added or removed; no framework change (re-affirmed: v2.3's ~700 lines landed on the vanilla architecture without strain). `test:extension` now runs 8 files. `agent-run.js` went from untested to 10 behavioral tests over a scripted Chrome/provider/`confirm()`. One cycle-1 roadmap item was **reclassified rather than implemented**: consolidating the three page extractors is not freely possible, because `chrome.scripting.executeScript({func})` serializes only that function, so injected code cannot share helpers — the duplication is API-forced. It was replaced by static gates that pin each extractor's filtering rules, which is what actually prevented the drift that caused SEC-004.

## 7. Quality verification — before/after

Real commands on this machine, full table in `VALIDATION_REPORT.md`.

| Metric | Before | After |
|---|---|---|
| `npm run build` | ✅ exit 0 | ✅ exit 0 |
| `npm run check` | ✅ exit 0 | ✅ exit 0 |
| Node tests | 81 / 0 fail | **105 / 0 fail** |
| Python bridge tests | 12 / 0 fail | 12 / 0 fail |
| src↔dist parity | unchecked | **13/13 byte-identical** |
| Dependency vulns | N/A (zero deps, ENOLOCK) | N/A — unchanged |
| Secrets | clean | clean |
| Bundle | 330,389 B | 335,370 B (+1.51%) |
| Live-browser app boot | **UNVERIFIED** (cycle 1: no path) | **partially VERIFIED** |
| Screenshots / responsive / AT | BLOCKED | **still BLOCKED**, reasons stated |
| Extension-runtime E2E | BLOCKED | **still BLOCKED** — MANUAL-QA 11–30 |

Method: each fix was reproduced first. Observed — 5/9 loop tests failed on cycle-start source; 5 hardening gates and 3/3 a11y gates failed on the pre-fix files; after review, 7 remediation gates failed on the pre-remediation code and 1 loop test isolated the residual origin path. All pass now.

## 8. Remaining risks & limitations

- **The extension itself was never run in Chrome.** Permission prompts, real page automation, `captureVisibleTab` and the in-Chrome Reach review dialog are **BLOCKED**, not verified. The stubbed-`chrome` harness validates app logic, not Chrome's behavior.
- **No screen reader, no pixels, no narrow viewports** were observed. The live-region change is spec-reasoned plus DOM-confirmed.
- **REV-009**: the agent's tab corpus is built once per run, so tabs opened mid-run are unreachable and switched-to tabs keep a stale title/URL in the model's view. Deliberately not restructured without in-Chrome tests.
- **REV-011**: the digest requests many origins after an `await`; sticky activation should cover it, but that is unproven here.
- Residual prompt-injection from page/web content is mitigated (wrappers, protocol, citation finalizer, per-step gate) but cannot be eliminated — documented.
- `chrome.storage.setAccessLevel`'s minimum Chrome version could not be confirmed from official docs, so no version was written into the docs; the fix makes the call non-load-bearing instead.

## 9. Next modernization priorities

1. **Get an in-Chrome verification path** — the single highest-value thing left; it unblocks every BLOCKED gate and would have caught SEC-001/002 earlier.
2. **Decide the PDF question** — table stakes across all five competitors, but it is the one backlog item that breaks the zero-dependency posture (vendoring pdf.js ≈ 1 MB). **Your call.**
3. **Knowledge base / RAG** — largest remaining feature gap; needs a storage/embedding architecture decision against the 8 MB local cap.
4. **Refresh the agent tab corpus mid-run** (REV-009) and settle the digest permission-gesture question (REV-011) — both small, both need item 1.
5. **Surface `researchTrace`** and give deferred agent actions a distinct visual state — trust-facing, cheap.

## 10. Engineering change summary

Branch `modernization/2026-10-25-c2` off `main` (8016e0d); **nothing committed, nothing pushed.** 25 tracked files changed (+626 / −224), of which 5 are `src/`, 7 are `dist/` (rebuilt or hand-authored UI), 1 is `package.json`, and the rest are docs; 3 files added untracked — `tests/agent-loop.test.mjs`, `tests/hardening-static.test.mjs` and this report. Source touched: `src/agent.js`, `src/agent-run.js`, `src/app.js`, `src/background.js`, `src/page-access.js`, `dist/index.html`, `dist/styles.css`, `tests/a11y-static.test.mjs`. Docs: `README.md`, `docs/SECURITY.md`, `docs/TEST-RESULTS.md`, `docs/MANUAL-QA.md`, and all seven `docs/modernization/*` knowledge files refreshed for cycle 2. Nothing outside the repo changed except temp files in the OS temp dir (a static file server for the boot check); the repo working tree is otherwise untouched and the pre-existing untracked `.workbuddy-ai/` was left alone. Rollback: `git checkout main`.

## Completion ledger

- ✅ **Completed and verified** — SEC-001, SEC-002, SEC-003, SEC-004, REL-002, REL-003, REL-004, REL-005, A11Y-001, A11Y-002, A11Y-003, REV-001…008, REV-010; the `agent-run.js` test harness (10 tests); the welcome differentiator strip; docs-vs-code reconciliation; 105+12 green; build/check green; src↔dist parity 13/13; secrets clean; reviewer remediation round.
- ⚠️ **Completed but not fully verified** — REL-001 boot recovery and the a11y live-region change are verified against the app's own code in a browser with a **stubbed** Chrome API, not against real Chrome; the digest charset fix was not exercised against a live legacy-encoded server; the 2 MB cap was not tested against a hostile server.
- 📋 **Planned but not implemented** — REL-006 (raw non-JSON provider error), REL-007 (no outer agent cap), REL-008 (UI files authored only in `dist/`), REV-009, and the P2/P3 backlog (PDF, RAG, Firefox, MCP, `researchTrace`).
- 🛑 **Blocked / awaiting approval** — in-Chrome extension E2E, pixel screenshots, responsive-width checks and screen-reader validation; **committing this branch** (awaiting your request); **adding a vendored PDF parser** (supply-chain decision that is yours, not mine).
