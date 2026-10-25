# Modernization Roadmap — after cycle 3 (2026-10-26)

Legend: done ✓ | next | later | rejected (reason)

## P0 — Critical
- (none open)

## P1 — High impact
- ✓ FEAT-001 (cycle 3, v2.4.0) active-tab screenshot & analysis: one-click **Analyze now** on the reviewed screenshot in chat, plus an agent `screenshot` tool that attaches the visible page as vision content behind the per-step gate; refuses to capture a non-visible tab, bounds step captures (2 / ~3 MB) and prunes earlier images. Verified by 5 fail-first tests (110 Node); live-Chrome behavior routed to MANUAL-QA 31–35.
- ✓ SEC-001 approval dialog could name the wrong site after a navigation (informed-consent defect in the core safety gate)
- ✓ SEC-002 mid-batch `read-tab` let stale refs act on the newly focused tab
- ✓ REL-001 `init()` could blank the panel on a storage failure and then overwrite unreadable data
- ✓ A11Y-001 conversation region was a live region rebuilt every ~75 ms (announcement storm)
- ✓ REL-002 / REL-003 an `executeScript` rejection aborted the agent run; a malformed action block burned one of eight steps
- ✓ ARCH-002 `agent-run.js` had zero test coverage — now 9 behavioral tests over a scripted Chrome harness
- ✓ SEC-003 `tabs` permission + the 13-tool agent surface missing from SECURITY.md (cycle 1's "docs match behavior" gate had silently gone false)

## P2 — Important (next cycles)
| Item | Rationale (evidence) | Status |
|---|---|---|
| Plain-text PDF extraction | every primary competitor handles PDFs (H/M); the **only** backlog item that breaks zero-dependency — needs a vendored parser | next — **escalation gate: your decision on adding pdf.js (~1 MB) or declining** |
| Knowledge base / RAG | Page Assist, Sider, Merlin, ChatGPT ext, Claude all ship it (H/M); largest remaining functional gap; needs a storage-budget + embedding architecture decision against the 8 MB local cap | later (large) |
| Firefox port | Page Assist is the only common competitor with Firefox; Merlin (H) and OpenAI's extension (H) are Chromium-only, so the gap is real but narrow | later (large) |
| Surface `answer.researchTrace` | already persisted, never shown; trust win for research answers | next (small) |
| Distinct "not run" rendering for `deferred` agent results | the safety behavior is currently visible only as an ordinary log line | next (small) |
| MCP support | Page Assist has it (H); would partly subsume the bespoke Reach bridge | later — decide after real Reach usage |
| Export omits research activity | minor completeness gap in `markdown()` | next (small) |
| REL-006 non-JSON provider error shows a raw parse message | captive portals / HTML error pages | next (one-line) |
| REL-007 `runAgent` has no outer wall-clock cap | chat uses 300 s, research 600 s; agent is bounded only by 8 × 120 s | next (one-line consistency) |
| REL-009 `tabRefs` is snapshotted once per agent run | found by the independent reviewer: `agent-run.js` builds the Open-tabs list at start and never refreshes it, so tabs opened mid-run stay unreachable and switched-to tabs keep reporting their earlier title/URL to the model | next (small) |
| SEC-005 `permissions.request()` after an `await` | reviewer re-raised it: Chrome's sticky activation is expected to cover it, but the digest path requests many origins after `tabs.query`, and no source here can prove it. Currently only disclosed (MANUAL-QA 27) | next — verify in Chrome, then either assert it or restructure the gesture |
| In-browser verification of the extension itself | cycle 2 proved a stubbed-`chrome` boot harness works for DOM logic, but permission prompts, real automation and the review dialogs still need a loaded unpacked extension | next — needs a Chrome-with-extension automation path or a manual pass |

## P3 — Optional
- `renderText` odd-fence edge case; per-message incremental rendering if caps ever grow.
- Standalone web-app UI (Page Assist pattern) alongside the panel.
- Localized shortcut hints beyond Ctrl/⌘; other key labels.

## Rejected / closed
- **Multi-tab context** — closed in-tree: v2.3 shipped the all-tabs digest + agent `read-tab`; cycle 2 hardened it (hidden-text filtering, ref-aliasing safety). The "30 tabs" figure that motivated it turned out to be **unsubstantiated (L)** — kept in the record so the next cycle does not re-import it as fact.
- **Consolidate the three page extractors** (cycle 1 ARCH-001) — **reclassified, not fixable as framed**: `chrome.scripting.executeScript({func})` serializes only that function, so injected extractors cannot share a helper. Rejected as a rewrite (untestable here, risks all four read paths); replaced by static gates that pin each extractor's filtering rules, plus the actual bug fix. See TECHNICAL_AUDIT.md.
- **Agentic purchase/payment flows** — irreversible spend on the user's behalf; contradicts the supervised-action premise.
- **Auto-approve or per-site "trusted" bypass for Agent mode** — would discard the product's central safety control. Note that Claude for Chrome *does* ship a risk-based auto-approve classifier; we are deliberately not following it there, and our positioning copy now says "no auto-approve path" rather than "only supervised agent".
- **Framework migration (React/Svelte)** — re-affirmed: ~700 lines of v2.3 agent code were added to the vanilla architecture without strain; zero dependencies is a differentiator.
- **Headless E2E harness** — still blocked on loading an unpacked MV3 extension; the stubbed-`chrome` boot harness is the partial replacement adopted this cycle.
- **Moving `index.html`/`styles.css` into `src/`** — deferred (REL-008): documented in README, no build-drift hazard today, and moving them would churn the only hand-authored UI files for an organizational gain.
