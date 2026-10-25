# Modernization Changelog

## Cycle 3 — 2026-10-26 — feature: active-tab screenshot & analysis — v2.4.0 — branch `modernization/2026-10-25-c2`

Scope: "take a screenshot and analyze the active browser tab" as a first-class capability. Cycle 2's audit had noted `captureVisibleTab` was never verified end-to-end and the agent was text-only; this cycle closes both gaps.

### User-visible features
- **Analyze now** in the screenshot preview dialog: one click attaches the reviewed screenshot and immediately sends it with a built-in analysis prompt ("describe what the page shows, its purpose and main content, and anything unusual or worth acting on"). The button reuses the capture you previewed — it never takes a new one — and is hidden for text references.
- **Agent `screenshot` tool**: the supervised agent can now propose capturing the visible target page. The image is attached to its next observation as vision content (both Chat Completions `image_url` and Responses `input_image` shapes), behind the same per-step confirm() gate as every other action.
- Safety/budget behavior: a capture is refused when the target tab is not the visible tab of its window (e.g. after a background `read-tab` switch) instead of silently capturing the wrong page; at most two captures (~3 MB) attach per step; earlier steps' images are pruned to a text note so an 8-step run cannot stack captures past the 5 MB request budget.

### Internal / verification
- Tests 105 → **113 Node** (0 fail), Python 12 unchanged; `npm run check` exit 0; src↔dist parity 13/13 byte-identical; no new permissions, dependencies, or manifest surface beyond a version bump to 2.4.0.
- All 8 new tests (5 feature + 3 remediation) demonstrated fail-first against the pre-change sources, then pass.
- Independent review (fresh subagent, diff + criteria + commands only): **PASS-WITH-NOTES**, four Low findings — all fixed in-cycle: a pre-switch capture in a `[screenshot, read-tab]` batch is now discarded with an explicit note instead of misattributed to the new page; a capture dropped by a failed re-snapshot is now reported to the model; Analyze now no longer overwrites a typed draft (canned prompt only when the composer is empty); the Responses-format image path now has a test (`input_image` parts asserted).
- Docs updated: README (features + limits), SECURITY.md (tool surface 13 → 14, new capture path), MANUAL-QA 31–35, roadmap, validation, test results.
- Still not verified in a real Chrome: live `captureVisibleTab` pixels, the permission prompt flow, and provider vision round-trips — MANUAL-QA 31–35 is the verification path.

## Cycle 2 — 2026-10-25 — profile: Full Modernization — branch `modernization/2026-10-25-c2`

Scope: the v2.2/v2.3 delta (≈700 lines of new agent/page code) had never been audited and its loop had no tests. Cycle 2 audited it, fixed every confirmed defect, added a browser-execution verification path that cycle 1 recorded as impossible, and corrected the two competitor claims that had gone stale within the same day.

### User-visible fixes
- **The Agent-mode approval dialog now names the site the actions will actually run on.** Previously, if an approved click navigated the page, the *next* approval still printed the original origin — the safety gate could ask consent about the wrong site.
- **A `read-tab` switch ends its step.** Actions batched after a tab switch are no longer executed against the new tab's elements using refs the model saw on the previous page; they are deferred and the model is told to re-propose.
- Agent mode is resilient when Chrome refuses an action (navigated/closed tab): the failure is reported back to the model instead of aborting the whole run.
- A malformed action block no longer silently consumes one of the eight steps: it gets two free corrective retries, matching the research loop.
- **Accessibility:** the conversation is no longer an ARIA live region (it was rebuilt every ~75 ms while streaming, which re-announced the entire thread); labelled containers gained the roles their `aria-label` requires; the brand SVG is `role="img"`; the shortcut hint now reads `Ctrl+K` on Windows/Linux and `⌘K` on macOS.
- The all-tabs digest now filters hidden and `aria-hidden` text like the other extractors, and also skips `[contenteditable]` regions — **a deliberate behavior change** (see MANUAL-QA 26 for the editor-tab consequence).
- The URL fetch enforces its 2 MB cap **while** downloading instead of after buffering the whole response.
- The right-click "Ask Orbit about selection" action no longer throws when Chrome delivers no selection text.
- **Boot resilience:** if `chrome.storage` can't be read — or `setAccessLevel` doesn't exist on an older Chrome — Orbit now renders the panel with a clear warning and **refuses to write**, instead of showing a blank panel and then saving empty state over the user's data.
- **Welcome screen** now states the four differentiators established by competitive research (any-provider BYOK with no credits, local models, per-action approval, no telemetry/open source).

### Internal / verification
- New tests: `tests/agent-loop.test.mjs` (10 tests — drives `runAgentLoop` against a scripted `chrome`, provider and `confirm()`), `tests/hardening-static.test.mjs` (11 regression locks for browser-only code paths), 3 new gates in `tests/a11y-static.test.mjs`. Node suite 81 → **105**; Python bridge unchanged at 12.
- **Every behavioral fix was reproduced first** against the pre-fix files, then shown passing after the fix (per-run fail/pass table in TEST-RESULTS.md).
- First real in-browser execution of the app UI on this project: `dist/` served over loopback HTTP with `app.js` loaded as-is against a stubbed `chrome` API. Confirmed boot, theme/font toggles, settings dialog naming and focus, welcome-strip CSS application, message/source rendering and chat-history repair on a dangling id, plus three failure branches: storage read rejecting, `setAccessLevel` absent, and stored chats with missing or malformed structure.
- Bundle: 330,389 B → 335,370 B (+1.51%); JS 113,658 B → 118,268 B. No new dependencies; secret scan clean before and after; all 13 built artifacts byte-identical to source.

### Post-review remediation (same cycle, re-verified)

An independent reviewer (separate context, read-only, briefed not to trust the implementer) returned **PASS-WITH-NOTES** with 11 findings. 8 were fixed and each fix was shown to be caught by a gate that fails on the pre-remediation code:

- **REV-001 (High, a defect in my own fix):** the digest's hidden-text filter only checked the direct parent, and `display:none` does not propagate into a descendant's computed style — CSS-hidden wrappers still leaked. Replaced with an ancestor style climb; the claim of "parity with the other extractors" is now actually true.
- **REV-002 (regression I introduced):** the bounded-download rewrite dropped `charset=` handling; decoding is now charset-aware with a UTF-8 fallback.
- **REV-003:** the approval origin was still stale when a post-action snapshot threw; `syncOrigin()` now re-reads the tab URL from Chrome on both paths.
- **REV-004:** Settings and "Forget key & revoke" reported success even when the persistence guard had disabled all writes — both now state the session-only truth.
- **REV-005:** `orbitKeys`/`orbitModels`/`orbitUI` bypassed the write guard; routed through `writeLocal()`, with a gate permitting exactly two direct write sites.
- **REV-006:** guarded the session read separately, validated stored chats, and made render unreachable only by render itself. The subsequent browser run then exposed a related crash the reviewer had not named — a stored chat missing `messages` broke `renderMessages()`; fixed by normalizing at the load boundary.
- **REV-007:** two more `aria-label`-without-role elements, and the gate was generalized from a hardcoded id list to scanning every labelled element.
- **REV-008:** removing the conversation live region had left Agent-mode step progress unannounced; the agent now publishes progress to the status region too.
- **REV-010:** five documentation over-claims corrected — README "any OpenAI-compatible endpoint" (HTTPS or loopback only), "nothing clicks Submit for you" (a submit-capable element can be clicked if you approve that step), the digest parity line, TEST-RESULTS' inconsistent counts, and the welcome pill "every page action waits for your approval" → "every action **step**…", since approval gates up to 3 actions at once.
- Declined-with-reason and routed to the roadmap: **REV-009** (`tabRefs` never refreshed mid-run) and **REV-011** (user-activation lifetime on the digest's multi-origin prompt) — both need in-Chrome verification this environment cannot perform.

### Documentation corrected
- `docs/SECURITY.md`: added the **`tabs` permission** (cycle 1's "docs match behavior" gate had silently gone false when v2.2/v2.3 introduced it), the blanket `http://*/*` optional host with its plain-HTTP caveat, the true 13-tool agent surface, the approval-origin/tab-switch semantics, and the digest + URL-fetch privacy notes.
- `docs/TEST-RESULTS.md`: rewritten from real runs (81 at cycle start → 105), with the verification method and the honest UNVERIFIED/BLOCKED list.
- `README.md`: new "What this is for" positioning section, `tabs`/digest disclosure in the privacy section, and the Agent-mode limits added to "Limits and lifecycle" (they were absent).
- `docs/MANUAL-QA.md`: items 22–30 for this cycle's changes.
- `docs/modernization/`: competitor analysis refreshed — **ChatGPT Atlas is defunct (2026-08-09)** and replaced by OpenAI's Chromium extension; **Edge "Copilot Mode" was retired 2026-05-13** in favor of "Browse with Copilot"; the previously High-graded "Edge reads 30 tabs" claim is **downgraded to unverified (L)**; **Claude for Chrome** added as the closest supervision competitor, which is why the positioning line was narrowed to "no auto-approve path".

### Breaking changes
- None to data shapes, storage keys, the manifest, or the native bridge. The only intentional behavior change is the digest's hidden/`[contenteditable]` text filtering (user-visible, privacy-positive).

### Rollback
- All cycle-2 work is uncommitted on `modernization/2026-10-25-c2`; `git checkout main` restores the pre-cycle tree. Two new test files are untracked and are removed by `git clean -n` review, not by any automated step. Nothing outside the repo was modified except temp files under the OS temp directory (a static file server script and screenshot attempts), which are not part of the project.
