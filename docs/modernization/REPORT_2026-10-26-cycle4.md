# Modernization Report — Orbit AI — 2026-10-26 — Cycle 4 — Feature: automatic active-tab context (v2.5.0)

## 1. Executive summary

The owner hit the product's most user-hostile moment live: they asked Orbit about a post on the page they were reading, and the bot replied "I don't have any page content attached… use **Add page**." That reply was the system prompt working as designed — smart context was gated behind a keyword heuristic (`this|current|active` + `page|site|website|tab|article|form`) that "this post" doesn't match, and the prompt then *instructed* the model to send users to Add page. The owner's product decision: page context must be automatic; nobody should have to "add" the page they are visibly looking at. This cycle deleted the heuristic: **every message now auto-attaches a fresh, privacy-filtered snapshot of the active tab** (default on, off in Settings → Context, skipped when something else is attached or the active tab is Orbit's own workspace). The no-context fallback was rewritten to tell the truth (site access not granted → grant and resend) and to route interaction requests (click/fill/multi-step) to Agent mode instead of the model pretending to act. Site access is still requested per-origin exactly as before — Chrome asks once per site; declining sends the message without context and gets an honest explanation. **Status: 114 Node + 12 Python green, check exit 0, parity 13/13, zero new permissions or dependencies, version 2.5.0.**

## 2. What changed

| Change | Where | Behavior |
|---|---|---|
| Heuristic deleted | `src/app.js` | `likelyNeedsPageContext` (regex) is gone. `maybeSmartContext()` gates only on: the Settings toggle, an already-attached reference, and the active tab being Orbit's own workspace (no prompt/error flash in full-tab mode). |
| Always-on auto read | `src/app.js` `send()` | Before building the message, the active tab is read (selection-aware, privacy-filtered, ≤ configured depth, untrusted-wrapped) and attached with a visible chip + status line. Chrome's per-site permission prompt fires on first send to a new site; `quickPageReference` is unchanged. |
| Honest fallback | `src/app.js` system prompt | Replaced "say that page access is unavailable and tell them to use Add page" with: explain the page couldn't be read because access wasn't granted (or the page is unreadable), ask to grant when Chrome prompts and resend; route click/fill/multi-step requests to the Agent button; kept the "never claim tools ran without evidence" line and the screenshot-honesty rule. |
| Settings copy | `dist/index.html` | "Smart page context" now describes always-on behavior and the once-per-site prompt. |
| Version | manifest + package.json | 2.4.0 → 2.5.0. No permission, dependency, storage-schema or protocol change. |

Privacy posture change, documented in SECURITY.md: page text now ships with most messages by default rather than only page-referential ones. Mitigations: the reference is the same privacy-filtered extractor as before (skips form values, hidden/editable/sensitive fields), it is labelled untrusted, the toggle is off-switchable per profile, and manual attachments still suppress it.

## 3. Verification — real commands, this machine

| Metric | Baseline (`9f4a721`) | After (v2.5.0) |
|---|---|---|
| `npm run check` | ✅ exit 0 | ✅ exit 0 |
| Node tests | 113 / 0 fail | **114 / 0 fail** |
| Python bridge tests | 12 / 0 fail | 12 / 0 fail |
| src↔dist parity | 13/13 | **13/13 byte-identical** |
| Manifest permissions | 7 + optional hosts | **unchanged** (version only) |
| Dependencies / secrets | zero / clean | zero / clean (re-run) |
| Bundle | 339,202 B | 339,663 B (+0.14%) |

**Fail-first:** the new hardening gate was run against `git show HEAD:src/app.js` (fails: heuristic present, old prompt) and against the changed file (passes).

## 4. Remaining risks & limits

- **Not run in a real Chrome** (unchanged): the first-send permission prompt cadence, Chrome's handling of repeated `permissions.request` after a block (Chrome may auto-suppress), and the rendered settings copy are unverified — MANUAL-QA 36–38 is the scripted path.
- "Pull anything" remains bounded by the extractor: rendered DOM text and the current selection; non-text media (images/video frames) need the Screenshot path or the Agent's `screenshot` tool (v2.4.0). Cross-provider tool-calling in plain chat was deliberately **not** attempted this cycle: across the BYOK matrix (OpenAI/xAI/OpenRouter/Ollama) tool schemas vary and would break the any-provider guarantee; Agent mode already is the tool-user, and the system prompt now routes users to it.
- Auto-context means page text ships by default — documented with the off switch (SECURITY.md, Settings copy).

## 5. Engineering change summary

Branch `modernization/2026-10-26-c4` off `main` (`9f4a721`). Files: `src/app.js` (heuristic removal, fallback prompt, call site), `dist/index.html` (settings copy), `src/manifest.json` + `package.json` (version), rebuilt `dist/*`, `tests/hardening-static.test.mjs` (+1 gate), docs ×8. Rollback: `git revert` the cycle-4 commit.

## Completion ledger

- ✅ **Completed and verified** — FEAT-002 automatic active-tab context; honest fallback + Agent routing; settings copy; fail-first gate; 114+12 green; check exit 0; parity 13/13; secrets clean; docs reconciled.
- ⚠️ **Completed but unverified in Chrome** — live permission-prompt cadence and rendered copy (MANUAL-QA 36–38).
- 📋 **Deliberately not built** — cross-provider chat tool-calling (documented rationale, §4).
- 🛑 **Blocked / awaiting user** — none.
