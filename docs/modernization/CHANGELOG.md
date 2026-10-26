# Modernization Changelog

## Cycle 12 — 2026-10-26 — polish: distinguish the owner's message from an Orbit answer — v2.9.2

Owner request, with a screenshot showing the two roles hard to tell apart. The cause was structural: the user bubble was a low-contrast `--offset` box and **the assistant answer had no container at all** — just bare text on the page background.

- **You**: tinted with `--primary-soft` plus a primary-tinted border, right-aligned, and the `YOU` label now carries the accent colour.
- **Orbit**: a real card — `--surface-2` background, 1 px border, a 3 px primary left spine, and a small accent dot before the `ORBIT` label.
- Existing tokens only; no new colours, so light and dark stay consistent. Contrast measured, not assumed: user surface `rgb(38,62,62)` vs answer card `rgb(32,37,36)` vs page background, spine `3px rgb(88,175,178)`, role labels `rgb(88,175,178)` vs `rgb(164,173,169)`.

`verify-in-chrome` grew three measured checks plus dark and light conversation captures — **41/41**, 155 Node + 12 Python tests, `check` exit 0.

**Two harness bugs fixed on the way, both of which could have produced false confidence:** `child.kill('SIGTERM')` does not tear down Chrome's process tree on Windows, so repeated runs leaked headless browsers and hung on the debug port — the harness now uses `taskkill /T /F` on an `exit` hook and refuses to start if the port is already taken. And `Page.captureScreenshot` never resolves for a background tab, so the new screenshots needed the page foregrounded first. A third, self-inflicted: the fallback test left the mock provider returning whitespace, so the first two answer cards rendered empty and looked like a product regression.

## Cycle 11 — 2026-10-26 — fix: screenshots were dropped on the first message and replayed forever after — v2.9.1

Owner report: Orbit read an X post's image correctly once, then stayed "stuck in the same image" across refreshes and new posts.

**Two independent defects, both real, both found by driving the real extension against a local stand-in provider:**

1. **The first attachment was silently discarded.** `send()` auto-creates a chat when none exists, and `newChat()` clears `pending` — so on the very first message of a workspace the screenshot you had just attached was thrown away before the message was built. Confirmed directly: the stored user message had `refs:[]` while the dialog held 33 KB of image data. Fixed with `ensureChat()`, which snapshots `pending` across the auto-create and restores it; chat, Agent mode and Reach research all now use it.
2. **Every earlier screenshot was replayed on every turn.** `buildMessages` attached image data from *all* retained user messages, so an old capture was re-sent ahead of a new one — which is what "stuck in the same image" looked like from the model's side — and re-billed each turn. Fixed: only the most recent image-bearing turn keeps its image data; earlier ones become a text note telling the model the screenshot is no longer attached. Follow-up questions about the current screenshot still work.

The agent loop already pruned step captures; the chat path had no equivalent, which is why the bug was chat-only.

**Verification.** 150 → **155** Node tests (4 for `latestImageTurnIndex`, 1 gate for `ensureChat`) + 12 Python, `check` exit 0. `verify:chrome` extended to **38/38** with a two-turn replay test on a fresh page and empty chat: turn 1 attaches and sends exactly one image, turn 2 sends **only the new** image, the retained payload hashes differently from the first, and the replaced screenshot is announced rather than silently dropped. Two consecutive clean runs; one earlier run flaked while the harness was mid-edit.

**Honest note on the process:** three of the intermediate failures were my test's fault, not the product's — comparing JPEG base64 at a fixed offset hit Chrome's identical metadata header and EOI padding, so the "different capture" assertion only became meaningful once it hashed the whole payload. The `refs:[]` dump is what turned speculation into a diagnosis.

## Cycle 10 — 2026-10-26 — fix + feature: separate model listing from model testing; Google Gemini preset — v2.9.0 — branch `modernization/2026-10-26-c7`

Owner report: a working OpenAI model appeared "not working", and fetching models and testing them should be separate actions.

**Diagnosis.** There is no "Not Working" string anywhere in the codebase, so the report was about behaviour, not a label. The real defect: the single **Test & fetch models** button only ever called `GET /models`. That is a *list* request, not a test of anything — so a provider that refuses or fails `/models` (permissions, quota, an endpoint that simply does not implement it) reported a perfectly usable model as broken, while a successful list implied a health it had never checked. Orbit had **no way at all to verify that a selected model answers.**

- **Split into two actions.** **Fetch models** only lists (`Listing only proves the endpoint answers…`). **Test connection** is new: one small live generation request to the selected model, reporting the model name, elapsed time and a reply excerpt, and stating that a request was made and may be billed.
- **Every list failure now says it is only the list** and points at Test connection, so a refused `/models` can no longer read as a dead model.
- **The probe is deliberately inert:** hosted provider tools (web/X search, code interpreter) and optional parameters are stripped, temperature/effort cleared, output capped at 64 tokens, 60 s timeout, and an HTTP 200 with no text is reported as a failure rather than a pass.
- **Failures are mapped to actions:** 401/403 → key or permission; 404 → wrong model ID, and if the format is Responses it tells you to switch to Chat Completions; 429 → quota, not breakage; network → endpoint reachability.
- **Google Gemini added** via its documented OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai`, Bearer auth). Verified against Google's docs first: that layer supports Chat Completions and `models.list()` but **ignores the Responses API**, and it ignores unrecognised fields — so the preset selects Chat Completions and uses `max_tokens`, otherwise a user's output cap would silently do nothing.
- The convenience auto-fetch on endpoint change is now non-fatal, so a background list failure cannot masquerade as a hard error.

**Verification.** 144 → **150** Node tests (new `tests/provider-settings.test.mjs`, 6 gates) + 12 Python, `check` exit 0. `verify:chrome` extended to **34/34** and now drives the real buttons with **trusted mouse events** (Chrome refuses `permissions.request` without a genuine gesture) against a local stand-in provider, proving behaviourally: Fetch models hits only `/models`; Test connection hits only `/chat/completions` with the selected model and a 64-token cap and no `tools`; a 404 on the list is worded as list-only; **the same model still tests working after that refused list** — the reported bug, reproduced and fixed; and the Gemini preset loads the right base, format and token field.

Two harness bugs found on the way, both worth remembering: a fresh page target resets device metrics, and the settings dialog is taller than the default 800×600 window, so the action buttons sat at y=587 in a 484-high viewport and every "click" silently missed. `clickEl` now throws if a target is off-screen instead of reporting a false pass.

## Cycle 9 — 2026-10-26 — change: image text reading now uses the owner's configured model — branch `modernization/2026-10-26-c7`

Owner direction: *"for the ocr work use the ai model user provided for this extension."*

- "Read text (OCR)" and the File→image path now send the image to **the provider configured in Settings** and return the model's transcription as editable text, instead of going straight to the bundled engine.
- The local Tesseract engine is kept as an explicitly **labelled fallback** (no vision support, missing grant, empty reply) — the dialog and the attached reference both say which engine produced the text, so a provider round-trip can never be mistaken for an on-device read.
- Preconditions are checked before anything leaves the machine: model selected, provider host granted, key present. A dedicated transcription instruction orders text-only output and tells the model to treat instructions rendered inside the image as content, not commands.
- New shared `imageUserMessage()` in `src/core.js` — the responses/chat image payload now lives in one place, used by both normal attachments and image reading (previously duplicated inline).
- Docs corrected: README previously claimed image reading used "no vision model, no network, no provider", which is now false, and SECURITY.md gained an explicit section that **the image leaves the machine** on the model path.
- Tests 140 → **144** Node (4 for the message builder incl. rejecting `javascript:` and remote URLs as image data, and the transport-budget guard; rewrote the image-reading gate to assert model-first ordering, pre-flight checks and labelled fallback). `npm run check` exit 0; `verify:chrome` 20/20.
- **Not verified here:** the model path itself needs a real API key and a vision-capable model — no credentials were used in this environment, so only the local fallback and the request construction are covered by executed tests.

## Cycle 8 — 2026-10-26 — research + feature: provider-hosted X search and code interpreter — branch `modernization/2026-10-26-c7`

The owner added a reference folder, `orbit-agent/`, and asked that Orbit be upgraded with its "engines". Reviewed all 11 files. **It is not a library of engines and not Orbit's own earlier code** — it is a smaller xAI-only sibling extension, and its README states plainly that the original repository could not be fetched and this is "an independently implemented replacement scaffold". Full analysis in `docs/modernization/ORBIT_AGENT_REVIEW.md`.

- **Verified, not assumed:** `node --check` shows `orbit-agent/panel.js` **does not parse** (unterminated string literal at line 8), so that extension cannot run at all; its own `check_package.py` passes 4/4 only because it never checks syntax — which `VALIDATION.txt` admits. No LICENSE file exists in the folder. It is now gitignored, matching `Agent-Reach-main/` and `ChromeBot-Ai/`.
- On 13 of 14 comparison axes Orbit is already ahead (providers, 16 agent tools vs 6, shadow DOM, documentId-pinned targets, navigation commit-wait, local OCR, error-body privacy, CSP, tests). Adopting it wholesale would have been a downgrade.
- **Adopted — the one additive capability:** xAI hosted server tools. Settings → Advanced now offers **X search** (`x_search` with `enable_image_understanding`) and **code interpreter** (`code_interpreter`) alongside the existing web search. Tool type strings were verified against docs.x.ai before building, and `enable_image_understanding` is sent only where it is documented.
- Guardrails: Responses format only; `x_search`/`code_interpreter` refused on any host other than `https://api.x.ai`; and **all hosted tools are stripped from Agent-mode and Reach-research requests** so a supervised run cannot start billing without a prompt.
- 8 new behavioral tests in `tests/core.test.mjs` (140 Node + 12 Python), plus a real-Chrome assertion that the three controls render in Settings → Advanced (20/20).
- Rejected with reasons recorded in the review: its indexed-at-write-time element lookup, `innerText` reading, provider error-body passthrough, 12-round budget, single-provider client.
- **Open decision:** its native function-calling loop is the one architectural idea worth taking — Orbit's fenced-JSON protocol exists to support endpoints without tool calling, so this would be an optional per-profile mode, not a replacement. Needs its own cycle.

## Cycle 7 — 2026-10-26 — feature + fix: local OCR and real-Chrome verification — v2.7.0 — branch `modernization/2026-10-26-c7`

### User-visible
- **The screenshot dialog now shows the captured image itself.** It previously displayed only a sentence *describing* a screenshot, so there was no way to confirm a capture happened or see what would be sent. The dialog now renders the actual image with an `alt` description, a note that nothing is sent until you submit, and the captured size. OCR progress and failures are reported **inside** the dialog too — they used to go only to the status line hidden behind the modal, which made a failed read look like a failed capture. The button was renamed "Read text (OCR)" so the four actions fit a 2×2 grid at 420 px instead of stacking out of view.
- **Local OCR.** Attach any PNG/JPEG/WebP/GIF/BMP image, or press "Read text (OCR)" on a screenshot, and Orbit extracts the text **on-device** with a bundled Tesseract engine — no vision model, no network, no provider. The result lands in the existing editable preview, labelled with its confidence, so a misread can be fixed before it is ever sent. Per the owner's decision the OCR text replaces the image rather than being sent alongside it; "Analyze now" (vision) is unchanged.
- **Send is reachable again at side-panel widths.** The composer toolbar overflowed by 600 px at 400 px wide and clipped Screenshot, File, the style select, Expand and **Send** — with the scrollbar hidden below 720 px, so the primary action looked absent in the default side panel. The toolbar now wraps.

### Internal
- New `npm run verify:chrome`: installs the real unpacked extension into headless Chrome over CDP (`Extensions.loadUnpacked` — Chrome ignores `--load-extension` now) and asserts boot, layout and control visibility at 400/720/1280 px, honest capture refusal without a grant, a real capture, and OCR of that capture. 15/15 checks pass. Zero dependencies, throwaway profile, never touches the owner's browser.
- `src/ocr.js` (lazy engine, latched failure state, bounds checked before startup), `vendor/tesseract/*` with sha256 pins in `vendor/VENDOR.md`, build step copies the engine, 6 new gates in `tests/ocr-static.test.mjs` including a tamper-demonstrated hash check.
- Tests 126 → **132 Node**, Python unchanged at 12. `dist/` 347,332 B → **7,434,635 B**.

### Breaking / costs
- CSP is now `script-src 'self' 'wasm-unsafe-eval'` — the one relaxation WebAssembly requires, pinned by a test so it cannot creep further. No new permission and no new host access.
- ~6.8 MB of vendored binaries is now part of the product; English only; SIMD core only (older CPUs get an explicit "OCR unavailable").

### Rollback
- Two local commits on `modernization/2026-10-26-c7`; nothing pushed. `git revert` them, or `git checkout main` (v2.6.1) to discard the branch.

## Cycle 6 — 2026-10-26 — fix: capture permission flow — v2.6.1 — branch `modernization/2026-10-26-c6`

Trigger: the owner hit "Either the '<all_urls>' or 'activeTab' permission is required" on a live capture. Root cause: Chrome's `captureVisibleTab` **ignores per-origin grants** — it accepts only a fresh activeTab gesture (toolbar-icon click on that tab) or all-sites host access, so the per-site grant the capture path relied on was never sufficient. The owner chose (asked directly) the one-time contextual all-sites option.

- `<all_urls>` added to `optional_host_permissions` (optional only — never requested at install, never required; a hardening gate pins that).
- New shared helper `captureVisibleTabImage()` in page-access.js: on Chrome's permission error it requests `<all_urls>` once, contextually, retries the capture a single time, and on decline explains the honest path (approve and retry, or click the Orbit toolbar icon on the page). Both capture paths use it: the Screenshot / Analyze-now buttons and the agent's screenshot tool.
- Page-text reading, the digest and URL fetch keep using per-origin grants exactly as before; only captures use the blanket grant.
- Tests 122 → **126 Node** (2 loop tests + 2 hardening gates incl. the manifest optionality gate, all demonstrated fail-first), Python 12 unchanged; check exit 0; parity 13/13; SECURITY.md Permissions + Screenshots sections rewritten; MANUAL-QA 43 added.

## Cycle 5 — 2026-10-26 — feature: browser-use-grade navigation core — v2.6.0 — branch `modernization/2026-10-26-c5`

Trigger: the owner asked for computer-use/browser-use-style "total control over the active webpage" with real agentic capability. Orbit already had the actuator surface (click/fill/select/scroll/hover/screenshot since v2.3/v2.4); what browser-use has and Orbit lacked was **navigation**. This cycle closes that gap — the right form for an extension that already lives inside Chrome (no vendored Python framework; Orbit *is* the browser driver).

### User-visible features
- **`goto`**: the agent can navigate the target tab to any plain http(s) URL (credential-bearing and non-http URLs refused). The full destination URL appears in the step approval dialog; the destination site's access is requested and settled **before** any navigation; denial means "nothing was opened". After navigating, the loop waits up to ~8 s for the page to become readable, then re-reads it.
- **`nav-history`**: back/forward through the tab's history, with the same grant-and-read handling; if no navigation actually happens (start/end of history) the model is told instead of being shown a stale page.
- **Enter key** (policy change at owner's request): `press` now allows Enter — previously "never synthesised". Every Enter proposal carries an explicit "Enter can submit the focused form; approve deliberately" warning in the approval dialog. The real safety line is unchanged: every action, navigation and Enter included, runs only behind the per-step approval gate, and nothing auto-submits.
- Both navigation tools end their step exactly like `read-tab`: any action batched after a navigation is deferred with a "refs belong to the previous page" note (the SEC-002 rule, generalized). The system prompt now teaches the full observe → navigate → act → verify operator loop.

### Internal
- `navHistoryStep` added to the page-injected surface (`src/page-access.js`); `gotoUrl`/`navHistory`/`snapshotAfterNavigation` helpers in `src/agent-run.js`; validation + descriptions + prompt in `src/agent.js`; harness gains `tabs.update`, `navHistoryStep` and origin-denial mocks. Test-infra fix found by the new tests: the `tabs.update` mock mutated the shared module-level TAB_A fixture across tests; fixtures are copied per harness now (test-only change). SECURITY.md Enter stance rewritten; README agent bullet + limits updated; MANUAL-QA 39–42 added; roadmap FEAT-003.

### Independent review and remediation (same cycle)

A fresh reviewer subagent (diff + criteria + commands only) returned **FAIL** with two must-fix findings and four backlog notes; both must-fixes and the top notes were fixed in-cycle, each behind a gate that fails on the pre-fix code:

- **F1 (Critical): Enter was approved but never executed** — the validation layer (`AGENT_KEYS`) allowed Enter while the in-page executor (`agentAct` in page-access.js) still hard-blocked it: the user would approve a warned Enter that then fails in the page. Fixed by adding Enter to the executor allowlist; a new hardening gate pins executor/validation key parity so the two lists can never drift again.
- **F2 (High): goto could accept the previous document as the destination** — `tabs.update` resolves at navigation start, so the first readable snapshot could still be the old page, presented as "loaded <destination>". Fixed with a commit wait (the tab record must move off the previous URL) plus origin verification of every post-navigation snapshot; the observed committed URL (post-redirect) now drives the grant and the snapshot check, which also fixes redirected destinations reporting a misleading "still loading" (B2).
- **B1:** when back/forward lands on a denied origin and the re-snapshot fails, the step's own results (including the honest denial) were swallowed — the failure message now carries them.
- **B3:** both navigation wait loops now honor the abort signal. **B4:** the approval dialog shows the destination URL up to 600 characters (was 160).
- Documented nuance for MANUAL-QA 42: Enter dispatches synthetic keydown/keyup — sites submitting via JavaScript handlers respond; a purely native form submit (default action) is not triggered by synthetic events. The submit warning in the dialog remains the correct caution.

Tests after remediation: 119 → **122 Node** (0 fail), Python 12 unchanged; check exit 0; parity 13/13; secrets clean; no new permissions or dependencies; version 2.6.0 (manifest description now mentions navigation).

## Cycle 4 — 2026-10-26 — feature: automatic active-tab context — v2.5.0 — branch `modernization/2026-10-26-c4`

Trigger: the owner asked about "this post" on a live page and the bot replied "use Add page" — the smart-context keyword gate only matched page/site/tab/article phrasings, so nothing was attached and the system prompt instructed the model to send users to Add page. Product decision (owner): page context must be automatic; the bot should pull from the active tab itself.

### User-visible changes
- **Every message now auto-attaches a fresh, privacy-filtered snapshot of the active tab** (up to the configured context depth, selection-aware, untrusted-wrapped). No keyword matching, no Add page step. Chrome asks once per site for access on first send; grant it and every later message on that site just works.
- Skipped automatically when the message already carries a manually attached reference, or when the active tab is Orbit's own workspace (full-tab / detached mode — no error flash, no prompt).
- **Honest fallback:** if you decline the site prompt, the message still sends and the model now says the page couldn't be read because access wasn't granted, and asks you to grant and resend — replacing the old "page access unavailable, use Add page" lecture. Interaction requests (click/fill/multi-step) are routed to the Agent button instead of the model pretending to act.
- Settings → Context copy updated to describe always-on behavior; off switch unchanged.

### Internal / verification
- `likelyNeedsPageContext` heuristic deleted; `maybeSmartContext()` now gates only on the toggle, existing refs, and the self-tab check. System-prompt fallback rewritten (kept the no-pretend-tools line).
- Tests 113 → **114 Node** (0 fail; new hardening gate demonstrated fail-first on the pre-change app.js), Python 12 unchanged; check exit 0; parity 13/13; version 2.5.0; no new permissions or dependencies.
- SECURITY.md rewritten for the new data-flow posture (page text ships with most messages by default — documented with the off switch); MANUAL-QA 36–38 added; README and roadmap updated.

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
