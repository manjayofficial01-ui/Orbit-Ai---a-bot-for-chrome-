# Technical Audit — cycle 2 — 2026-10-25

Method: full static read of every module on this branch (src ≈ 1,250 lines plus `dist/index.html` and `dist/styles.css`, which are hand-authored there), scanner/secret runs, docs-vs-code diffing, **plus real in-browser execution of `app.js` against a stubbed `chrome` API** (see VALIDATION_REPORT.md) and an independent reviewer pass on the diff.

Scope note: `reach-core.js`, `reach-client.js`, `research-protocol.js`, `research-loop.js` and everything under `native-host/` are **byte-identical to what cycle 1 audited** — confirmed with `git diff main --stat`, which shows no changes to those paths. Cycle 1's findings for them stand and are not repeated here. The unaudited surface this cycle was the v2.2/v2.3 delta: `page-access.js` (+255), `agent-run.js` (+70), `agent.js` (+55), which had **no test coverage of the loop at all**.

## Dependency, supply chain and secrets

- npm: still zero runtime dependencies, no lockfile. `npm audit` exits **ENOLOCK** — not applicable, by design. Native host imports Python stdlib only. (VERIFIED)
- Secret scan (`sk-`, `AKIA`, `ghp_`, `xoxb-`, `BEGIN … PRIVATE KEY`) across src, dist, native-host, scripts, tests, docs, README: clean; the only hit is the *description of the scan* in cycle 1's audit document. (VERIFIED)
- No dependency added this cycle, so the supply-chain surface is unchanged.

## Findings register

| ID | Severity | Title | Status |
|---|---|---|---|
| SEC-001 | High | Approval gate could name the wrong site | FIXED-VERIFIED |
| SEC-002 | High | Cross-tab ref aliasing let an approved batch act on an unapproved page | FIXED-VERIFIED |
| SEC-003 | Medium | `tabs` permission and the 13-tool agent surface were undocumented | FIXED-VERIFIED |
| SEC-004 | Medium | All-tabs digest collected hidden text the other extractors skip | FIXED-VERIFIED |
| SEC-005 | Info | Digest requests many origins after an `await` (user-activation lifetime) | ACCEPTED — documented, MANUAL-QA 27 |
| REL-001 | Medium | `init()` could blank the panel and then overwrite unreadable data | FIXED-VERIFIED (in-browser) |
| REL-002 | Medium | An `executeScript` rejection aborted the whole agent run | FIXED-VERIFIED |
| REL-003 | Medium | A malformed action block consumed one of eight real steps | FIXED-VERIFIED |
| REL-004 | Low | `info.selectionText.slice` unguarded in the service worker | FIXED-VERIFIED |
| REL-005 | Low | URL fetch buffered a whole response before checking its 2 MB cap | FIXED-VERIFIED |
| REL-006 | Low | A non-JSON provider error body surfaces as a raw `JSON.parse` message | OPEN (P3) |
| REL-007 | Info | `runAgent` has no outer wall-clock cap (chat 300 s, research 600 s) | OPEN (P3) — bounded in practice by 8 × 120 s |
| A11Y-001 | High | Conversation region was a live region rebuilt every 75 ms | FIXED-VERIFIED (in-browser) |
| A11Y-002 | Medium | `aria-label` on role-less containers is ignored by AT | FIXED-VERIFIED (in-browser) |
| A11Y-003 | Low | Mac-only shortcut glyph shown on all platforms | FIXED-VERIFIED (in-browser) |
| ARCH-001 | Medium | (cycle 1) "consolidate page extractors" — mis-framed, see below | RECLASSIFIED-ACCEPTED |
| ARCH-002 | Medium | `agent-run.js` had zero test coverage | FIXED-VERIFIED |
| REL-008 | Low | `dist/index.html` + `styles.css` have no `src/` counterpart | OPEN (P3), documented in README |

## Independent review round — findings and disposition

The reviewer (separate context, read-only, briefed not to trust this agent's claims) returned **PASS-WITH-NOTES**: 6 of 8 fixes confirmed correct, and it found one High defect in my own remediation, one regression I introduced, and several over-claims. Every finding is listed with what was actually done.

| ID | Sev | Finding (reviewer) | Disposition |
|---|---|---|---|
| REV-001 | **High** | `digestScan`'s hidden-text filter was ineffective: `display:none` is **not** inherited into a descendant's computed style, and only the direct parent was checked — so any CSS-hidden wrapper still leaked its text. My "parity with the other extractors" claim was wrong. | **FIXED-VERIFIED** — replaced with an `hiddenByStyle()` ancestor climb to `documentElement`; gate now asserts the climb exists and forbids layout calls. Proven: gate fails against the pre-remediation source. |
| REV-002 | **Low (regression)** | The bounded-fetch rewrite dropped charset handling — `res.text()` honoured `charset=`, `new TextDecoder()` is always UTF-8 → mojibake on legacy-encoded pages. | **FIXED-VERIFIED** — label parsed from `content-type`, validated, with a UTF-8 fallback; gate asserts both. |
| REV-003 | **Medium** | Residual stale-origin path: when the post-action snapshot **threw**, `continue` skipped the `activeUrl` refresh, so the next approval still named the old site. | **FIXED-VERIFIED** — added `syncOrigin()`, which re-reads the tab URL from `chrome.tabs.get` (authoritative on navigation) on both the success and failure paths; new loop test drives exactly that scenario and fails without it. |
| REV-004 | **Medium** | `save()` silently no-ops when persistence is disabled, yet Settings still reported "Connection saved. Your local key will be reused after restart." — a user would lose a key believing it stuck. `revoke` had the same false-success shape. | **FIXED-VERIFIED** — both messages now branch on `storageWritable` and state the session-only truth; gate forbids the unconditional success line. |
| REV-005 | **Medium** | `orbitModels` / `orbitKeys` / `orbitUI` were written **directly**, bypassing the `storageWritable` guard, so "unreadable data is not overwritten" was only partly true. | **FIXED-VERIFIED** — added `writeLocal()`; gate asserts exactly two direct `chrome.storage.local.set(` sites (inside `save()` and `writeLocal()`). |
| REV-006 | **Medium** | Still-outside-the-guard boot throws: `session.remove('keys')` and the `state.chats` normalization loop could abort before `render()` — the same blanking class BOOT-001 was supposed to end. | **FIXED-VERIFIED** — local read, session read, profile hydration and chat normalization are separately guarded; a session-read failure no longer disables local persistence. **The reviewer's point was sharper than my fix:** the real-browser run then exposed a related defect it had not named — a stored chat missing `messages` survived boot but crashed `renderMessages()` on `chat.messages.length`. Now normalized at the boundary (`if(!Array.isArray(c.messages))c.messages=[]`). |
| REV-007 | **Low** | A role-less `.panel-size` div and the `#reachReviewRequest` `<pre>` still carried ignored `aria-label`s, and my gate only checked a hardcoded id pair, so it structurally could not catch them. | **FIXED-VERIFIED** — roles added; gate **generalized** to scan every `aria-label`-bearing element in `index.html` instead of a fixed list. |
| REV-008 | **Low** | Removing `aria-live` from `#messages` left Agent-mode step progress unannounced (research mode still used `status()`, agent mode did not). | **FIXED-VERIFIED** — the agent's `onEvent` now also writes to `#status`; gate asserts it. |
| REV-009 | **Low** | `tabRefs` is built once per run and never refreshed, so tabs opened mid-run are unreachable and switched-to tabs keep reporting a stale title/URL. | **OPEN → roadmap P2** (real, but a feature-level change to the tab corpus; not safe to restructure this cycle without in-browser tests). |
| REV-010 | **Info** | Over-claims in docs: "digest applies the same filtering" (REV-001), README "nothing clicks Submit for you" (a submit-capable element *can* be clicked if you approve that step), README "any OpenAI-compatible endpoint" (HTTPS or loopback HTTP only — a LAN IP fails), the pill "every page action waits for your approval" (approval is per **step**, up to 3 actions), and internally inconsistent test counts in TEST-RESULTS. | **FIXED-VERIFIED** — each line rewritten to what the code supports; pill now reads "Every action step waits for your approval"; TEST-RESULTS replaced with the observed per-run fail/pass table. |
| REV-011 | **Info** | `permissions.request()` after an `await` in the digest path may lose the user gesture. | **ACCEPTED, disclosed** — cannot be settled without real Chrome; MANUAL-QA 27, roadmap P2. |

### Details for the High items

**SEC-001 — stale origin in the per-step approval dialog.** Reproduction: run Agent mode on a page whose approved `click` navigates to a different site; the *next* step's `confirm()` still printed the original origin. Root cause: `src/agent-run.js` updated `snapshot`/`activeDocumentId` after every action batch but only updated `activeUrl` on a `read-tab` switch, while the dialog text was built from `new URL(activeUrl).origin`. Why it matters: `confirm()` is the product's central safety control — a wrong origin there is not a cosmetic bug, it is invalid informed consent. Fix: `syncOrigin()` re-reads the tab's URL from `chrome.tabs.get` after every step and also on the snapshot-failure path — the tab record is the authority for what the user is looking at, and the injected action itself is pinned to a `documentId`, so a document that navigated out from under the run fails (see SEC/REL-002) rather than acting somewhere else. Verification: `tests/agent-loop.test.mjs` "the approval prompt names the page the actions will actually run on" and "the approval origin still follows the tab when the re-snapshot fails" — the first fails on cycle-start source, the second additionally fails on my initial partial fix. That is the shape of the fix in code.

**SEC-002 — refs alias across a mid-batch tab switch.** Reproduction: approve a batch of `[{read-tab tab1}, {click e0}]`. Root cause: refs are per-snapshot (`st.map` keyed by token), and `switchTab` reassigned `snapshot` in place, so the following `execAction` looked up `e0` in the *new* tab's element map — an element the model never saw and the user never approved, on a site whose grant had just been requested. Fix: a successful switch ends the step, a synthetic `deferred` result tells the model why, and the system prompt now states a switch uses the whole step. Verification: test "a mid-batch tab switch defers the remaining actions instead of reusing stale refs" asserts **zero** page actions were dispatched and that the deferral reaches the model.

**A11Y-001 — live-region rebuild storm.** `renderMessages()` calls `box.replaceChildren()` and rebuilds every message, and is called on each ~75 ms throttled paint while streaming; `#messages` carried `aria-live="polite"`, so a screen reader would re-announce the entire conversation repeatedly. Fix: removed `aria-live` from `#messages` (it keeps `tabindex="-1"` + `aria-label`, and remains the skip-link target). `#status` (`role="status" aria-live="polite"`) still announces Connecting/Generating/Done, so completion is announced without the spam — a deliberate trade-off: per-token content is no longer announced, which is also how the previous behavior would have been unusable in practice. Verification: computed DOM in a real browser shows `aria-live: null` and `role="status"` intact; static gate locks it. Live screen-reader confirmation: **UNVERIFIED** (no AT in this environment) → MANUAL-QA 22.

### ARCH-001 reclassification (honest correction to cycle 1)

Cycle 1 logged `inspectPage`/`snapshotPage` duplication in `page-access.js` as consolidation debt. That is not freely fixable: `chrome.scripting.executeScript({func})` serializes **only that function**, so injected extractors cannot share a module-level helper — the duplication is forced by the extension API, not laziness. Consolidating into one mode-switching injected function was considered and rejected: it cannot be tested here (needs a real page), and it would risk all four read paths for an organizational gain. What was actually wrong was behavioral drift — the third extractor (`digestScan`) was missing the hidden-text filter the others apply. That is fixed, and a static gate now pins each extractor's filtering rules so drift fails a test instead of shipping. Status: ACCEPTED with reason.

### Security review (OWASP-mapped, extension context)

- **A03 Injection / XSS:** still no `innerHTML`, `eval`, or `document.write` in app paths; all model/page text via `textContent`/`element()`; citation links restricted to http(s) with `noopener noreferrer`. New `welcome-points` and `deferred`/`skip` strings follow the same pattern. (VERIFIED by read + `npm run check`)
- **A10 SSRF:** the direct URL fetch rejects non-HTTPS (loopback HTTP excepted), rejects embedded credentials, uses `redirect:'error'`, `credentials:'omit'`, `referrerPolicy:'no-referrer'`, and now caps the download at 2 MB **during** the read loop rather than after buffering. (VERIFIED by static gate; live hostile-server behavior UNVERIFIED)
- **A01 Access control / action authorization:** the agent's token-bound refs, `expectedURL` guards, sensitive-field blocks, `documentIds` pinning and the `press` key allowlist remain; SEC-001/002 were the two holes in that chain and both are now test-locked. `Enter` is still never synthesised and no tool clicks Submit.
- **A09 Logging:** no console logging of page content or keys; service worker uses `.catch(console.error)` on API errors only.
- **A06 Vulnerable components:** N/A (no dependencies).
- **Residual, accepted:** delimiters (`<untrusted_page>`, `<untrusted_reference>`) are convention, not enforcement; a malicious page can still try to steer the model, mitigated by the per-step gate. Documented in `docs/SECURITY.md`.

### Permission review against `src/manifest.json`

Declared: `sidePanel, storage, activeTab, scripting, contextMenus, tabs, nativeMessaging`; optional hosts `https://*/*`, `http://*/*`, `http://localhost/*`, `http://127.0.0.1/*`. `tabs` (added with v2.2/v2.3 for the digest and `read-tab`) exposes every open tab's **title and URL** to the extension without a per-site grant — legitimate for those features, but it was absent from `docs/SECURITY.md`, which is how cycle 1's "docs match behavior" gate quietly became false. Fixed (SEC-003) with an explicit note that tab titles can themselves be sensitive and that page *text* still requires an origin grant. The blanket `http://*/*` optional host is also now called out with the plain-HTTP caveat.

`minimum_chrome_version` is declared as **116**; the version that introduced `chrome.storage.setAccessLevel` could **not be confirmed** from the official Chrome docs (two fetches returned no availability statement), so no version number was written into the docs. The fix instead makes that call non-load-bearing, which is correct whatever the answer is.

### Dead-code and duplication inventory

No dead modules: all ten built modules are imported by `index.html` or by another module, and `dist/native-host/*` exists to ship the installer. Unused-symbol check: `agent.js` exports `snapshotSnapshotForModel` (used internally), `AGENT_KEYS`/`AGENT_TOOLS`/`AGENT_PROTOCOL_RETRIES` (used), `listTabs`/`execAction` (used by the new tests). No removals made. Remaining known duplication: the three injected extractors (see ARCH-001) and the two `getComputedStyle`/sensitive-field regex copies in `page-access.js`, which are API-forced for the same reason.

### Baseline health

Build green, `npm run check` green. Tests at cycle start: **81 Node + 12 Python**, all passing. At cycle end: **105 Node + 12 Python**, all passing — 24 new tests (10 in `agent-loop`, 11 in `hardening-static`, 3 new `a11y-static` gates). Bundle `dist/` 330,389 B → 335,370 B (+1.51%); JS total 113,658 B → 118,268 B. No hot-path change.
