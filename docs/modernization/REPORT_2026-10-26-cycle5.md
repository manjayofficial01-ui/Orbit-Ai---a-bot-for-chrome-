# Modernization Report — Orbit AI — 2026-10-26 — Cycle 5 — Feature: browser-use-grade navigation core (v2.6.0)

## 1. Executive summary

The owner asked for computer-use/browser-use-style "total control over the active webpage" — a real agentic bot. Orbit already had the actuator half since v2.3/v2.4 (click with blocker detection, fill/type/select, scroll, hover, safe keys, structured extract, vision screenshot, tab switching). What browser-use has and Orbit lacked was **navigation**: the agent could act only on pages the user had already opened. This cycle adds it. `goto` navigates the target tab to any plain http(s) URL — credential-bearing and non-http destinations refused, the destination URL shown in the step approval dialog (up to 600 characters), the destination site's grant settled **before** any navigation (denial = "nothing was opened"), a commit wait until the tab record leaves the previous URL (redirects land on their final URL, which then gets its own grant check), and origin verification of every post-navigation snapshot so the still-committed previous document can never be presented as the destination. `nav-history` goes back/forward through the tab's history with the same grant-and-read handling and an honest "start or end of history" refusal. Both end their step exactly like `read-tab`, so actions batched after a navigation are deferred rather than run against refs from the previous page — the SEC-002 rule, generalized. At the owner's explicit request, `press` now allows **Enter** — previously "never synthesised" — with an explicit "Enter can submit the focused form" warning in the approval dialog; the real safety line (per-step approval, no auto-submit) is unchanged. The system prompt now teaches the full observe → navigate → act → verify loop. An independent reviewer returned **FAIL** with two must-fix findings — Enter was admitted by validation but still blocked by the in-page executor allowlist, and `goto` could accept the previous still-committed document as the destination — both fixed in-cycle behind fail-first gates, plus three backlog notes (denial-message swallowing, abort latency, URL truncation). **Status: 122 Node + 12 Python green, check exit 0, parity 13/13, zero new permissions or dependencies, version 2.6.0.** The deliberate boundary: Orbit controls the browser, not the OS — "computer use" outside a browser is not something a Chrome extension can or should do.

## 2. What was built

| Tool | Behavior | Guards |
|---|---|---|
| `goto` (16th tool) | `{"tool":"goto","text":"https://…"}` → grant → `chrome.tabs.update` → poll until the new document is snapshot-readable (≤ ~8 s) → fresh observation | http(s) only, no credentials, URL ≤ 2000 chars; destination URL in the approval dialog; grant settled before navigation; navigation ends the step; failed/never-readable pages reported honestly |
| `nav-history` (17th tool) | `{"tool":"nav-history","text":"back"|"forward"}` → injected `history.back()/forward()` → wait for the tab URL to change (≤ ~5 s) → grant the new origin if needed → snapshot | Refuses when no navigation actually occurred; new-origin grant denied → honest error; ends the step |
| Enter in `press` | `{"tool":"press","ref":"12","text":"Enter"}` runs like any key | Approval description carries "Enter can submit the focused form; approve deliberately"; Tab/arrows carry no warning; nothing runs without the step approval |

Framing: the agent's system prompt now describes Orbit as "a supervised browser operator… work like a browser-use agent: observe, navigate, act, verify" with the full tool catalog — the model knows it can drive from page to page, not just poke the one page it started on.

## 3. Verification — real commands, this machine

| Metric | Baseline (`b3cc9ae`) | After (v2.6.0) |
|---|---|---|
| `npm run check` | ✅ exit 0 | ✅ exit 0 |
| Node tests | 114 / 0 fail | **122 / 0 fail** |
| Python bridge tests | 12 / 0 fail | 12 / 0 fail |
| src↔dist parity | 13/13 | **13/13 byte-identical** |
| Manifest permissions | 7 + optional hosts | **unchanged** (version + description only) |
| Dependencies / secrets | zero / clean | zero / clean (re-run) |
| Bundle | 339,663 B | 346,567 B (+2.0%) |

**Fail-first:** all new behavioral tests fail on `git show HEAD:` sources (goto/nav-history were unknown tools; Enter was rejected); both new/extended hardening gates fail on pre-change `src/agent-run.js`; the three post-review remediation tests fail on reverse-patched pre-fix sources.

## Independent review — FAIL verdict, remediated in-cycle

The reviewer (fresh context, diff + criteria + commands only; it probe-verified the race itself) returned **FAIL**:

- **F1 (Critical) — Enter was never actually pressed:** validation (`AGENT_KEYS`) admitted Enter but the in-page executor (`agentAct`'s own `KEYS` allowlist in page-access.js) still hard-blocked it — the user would approve a warned Enter that then fails in the page. Fixed: Enter added to the executor allowlist; new hardening gate pins executor/validation parity so the lists cannot drift again.
- **F2 (High) — goto could present the previous document as the destination:** `tabs.update` resolves at navigation start, so the first readable snapshot could still be the old page ("loaded b.test" while showing a.test — reviewer-demonstrated). Fixed: commit wait (tab URL must leave the previous value) + per-snapshot origin verification against the observed committed URL; redirects now get the correct grant instead of a misleading "still loading" (B2).
- Backlog fixed same-cycle: B1 (a denied nav-history origin's step result was swallowed by a failed re-snapshot — now included), B3 (abort honored inside both wait loops), B4 (destination URL shown up to 600 chars in the approval dialog). B5 (stale Open-tabs list) = the known REL-009 backlog item, unchanged.

**Found by the new tests (test-infra):** the harness `tabs.update` mock mutated the shared module-level `TAB_A` fixture, leaking one test's navigation into later tests (bogus startup-permission denial and a wrong approval origin in unrelated tests). Fixtures are now copied per harness instance. No product code was affected.

## 4. Remaining risks & limits

- **Not run in a real Chrome** (unchanged): live `chrome.tabs.update` timing, the ~8 s readable-wait against slow sites, repeated permission prompts after a block, and rendered dialog wording are unverified — MANUAL-QA 39–42 is the scripted path.
- The readable-wait polls with 500 ms sleeps inside the side-panel context; a very slow site can still be "still loading — snapshot again" at the 8 s mark, which the model is told to handle.
- Enter closes a documented safety ceiling at the owner's request; the mitigations are the per-step gate + the dialog warning + SECURITY.md/README wording that a submit-capable activation is possible **only** with an approved step.
- `nav-history`'s URL-change detection cannot distinguish a same-URL navigation (rare, e.g. same page reload) from no navigation; worst case it reports "no back navigation happened" and the model retries — safe direction.

## 5. Engineering change summary

Branch `modernization/2026-10-26-c5` off `main` (`b3cc9ae`). Files: `src/page-access.js` (`navHistoryStep`), `src/agent.js` (tools/keys/validation/descriptions/prompt), `src/agent-run.js` (gotoUrl/navHistory/snapshotAfterNavigation helpers, dispatch, generalized step-ending, syncOrigin refresh sites), `src/manifest.json` + `package.json` (2.6.0 + description), rebuilt `dist/*`, `tests/agent.test.mjs`, `tests/agent-loop.test.mjs` (harness + 3 tests), `tests/hardening-static.test.mjs` (2 gates), docs ×8. Rollback: `git revert` the cycle-5 commit.

## Completion ledger

- ✅ **Completed and verified** — FEAT-003 goto (commit-wait + origin-verified) + nav-history + Enter-with-warning (executor + validation in parity) + operator prompt; 9 fail-first tests total (6 feature + 3 remediation); 122+12 green; check exit 0; parity 13/13; secrets clean; docs reconciled (README, SECURITY Enter stance rewritten, MANUAL-QA 39–42 with the synthetic-Enter nuance).
- ⚠️ **Completed but unverified in Chrome** — live navigation timing, prompts, dialog wording (MANUAL-QA 39–42).
- 📋 **Deliberately not built** — OS-level computer use (out of scope for a browser extension); vendoring the browser-use framework (Orbit already is the in-browser driver).
- 🛑 **Blocked / awaiting user** — none.
