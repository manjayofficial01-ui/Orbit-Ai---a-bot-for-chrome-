# Modernization Report — Orbit AI — 2026-10-26 — Cycle 3 — Feature: active-tab screenshot & analysis (v2.4.0)

## 1. Executive summary

The request was "make this extension able to take screenshot and analyze the active browser tab." Baseline mapping found the capability half-existed: a manual Screenshot button captured the visible tab and attached it to the next message, and `buildMessages()` already spoke both vision dialects (Chat Completions `image_url`, Responses `input_image`) — but "analyze" required four manual steps, and the supervised agent (the product's centerpiece since v2.3) was text-only and blind. This cycle closed both gaps: a one-click **Analyze now** action on the reviewed screenshot, and an agent `screenshot` tool that attaches the visible page to the model's next observation behind the same per-step approval gate. Two correctness hazards were designed out rather than discovered late: a capture is refused when the target tab is not the visible tab of its window (after a background `read-tab` switch, `captureVisibleTab` would otherwise silently return the *wrong page's* pixels), and earlier steps' images are pruned so an 8-step run cannot stack captures past the request budget. An independent reviewer verified every claim from the diff alone and returned **PASS-WITH-NOTES**; all four Low findings were fixed in-cycle with fail-first tests. **Status: 113 Node + 12 Python green, check exit 0, parity 13/13, zero new permissions or dependencies, version 2.4.0.** Cycle 2's uncommitted tree was committed first (`7cd57a5`) so none of that work could be lost.

## 2. What was built

| Capability | Where | Behavior |
|---|---|---|
| Analyze now (chat) | `src/app.js` + `dist/index.html` | In the screenshot preview dialog, one click attaches the already-reviewed capture and immediately sends it with a built-in analysis prompt through the normal `send()` path. The button appears only for screenshots, reuses the previewed capture (never takes a new one), no-ops while busy, and leaves a typed draft alone (the canned prompt applies only when the composer is empty). |
| Agent `screenshot` tool | `src/agent.js`, `src/agent-run.js` | The model can propose `{"tool":"screenshot"}` like any action. It passes the same per-step `confirm()` gate, captures the visible tab of the target's window as JPEG q82, and the image is attached to the next observation as vision content in both provider formats (shapes mirror the manual path in `buildMessages()`). |
| Safety bounds | `src/agent-run.js` | Refused when the target tab is not the visible tab of its window; ≤2 captures / ~3 MB per step; earlier steps' images pruned to a text note; a capture taken before a `read-tab` switch is discarded with an explicit note instead of misattributed to the new page; a capture dropped by a failed re-snapshot is reported. |

The user problem solved: *"look at this page and tell me about it"* now works in one click, and works for pages whose meaning is visual (layouts, images, charts) — including inside supervised agent runs. No manifest permission changed: `captureVisibleTab` is covered by the existing `activeTab` + site grants, which every capture path already requests.

## 3. Verification — real commands, this machine

| Metric | Baseline (`7cd57a5`) | After (v2.4.0) |
|---|---|---|
| `npm run check` | ✅ exit 0 | ✅ exit 0 |
| Node tests | 105 / 0 fail | **113 / 0 fail** |
| Python bridge tests | 12 / 0 fail | 12 / 0 fail |
| src↔dist parity | 13/13 | **13/13 byte-identical** |
| Manifest permissions | 7 + optional hosts | **unchanged** (2.3.0 → 2.4.0 only) |
| Dependencies | zero | zero (nothing added) |
| Secrets scan | clean | clean (re-run) |
| Bundle | 335,756 B | 339,202 B (+1.03%) |

**Fail-first discipline:** the 5 feature tests were run against `git show HEAD:` sources (all failed), the 3 remediation tests against reverse-patched pre-fix sources (all failed); all 8 pass on the final tree. The independent reviewer reproduced the fail-first claim a second way (base commit via `git archive`).

## 4. Independent review

Fresh subagent, given only the diff, acceptance criteria and test commands — not the implementation summary. It re-ran check/tests/parity/manifest-diff itself, traced the control flow by hand (including the `budgetView` data-URL masking in `core.js`, which correctly exempts image-bearing observations from the 60,000-char text budget), and returned **PASS-WITH-NOTES**: no High, no Medium, four Low findings — pre-switch image misattribution, silent capture drop on failed re-snapshot, draft overwrite, untested Responses image path. All four were fixed the same cycle, each with a gate that fails on the pre-fix code (§3).

## 5. Remaining risks & limits

- **Still never run in a real Chrome** (unchanged from cycle 2): live `captureVisibleTab` pixels, permission prompts, and a real provider accepting the vision parts are unverified; MANUAL-QA 31–35 is the scripted path. The vision message shapes are byte-mirrored with the manual screenshot path that cycle 2's browser harness exercised.
- A text-only provider will reject agent/chat image requests; the failure surfaces as an honest provider error, and the system prompt tells the model the tool is "only useful with a vision-capable model."
- Known TOCTOU: the visibility guard reads the tab record just before capture; a user switching tabs in that instant can still change what is captured. Best-effort by design (reviewer concurred).
- One informational nit kept as-is: a single 3.0–3.5 MB capture gets the "two captures / 3 MB" refusal message rather than the size message; refusal is correct either way.

## 6. Next priorities (carried forward)

Cycle 2's list stands: in-Chrome verification path (now also covering MANUAL-QA 31–35), the PDF decision (yours), knowledge base / RAG, mid-run tab-corpus refresh (REV-009), surfacing `researchTrace`.

## 7. Engineering change summary

Branch `modernization/2026-10-25-c2`; cycle 2 committed first as `7cd57a5`, this feature as a second commit. 20 tracked files changed (+~300/−~30): source `src/agent.js`, `src/agent-run.js`, `src/app.js`, `src/manifest.json` (version only), UI `dist/index.html` (one button), rebuilt `dist/*`, tests ×3, docs ×8. No new files outside docs. Rollback: `git revert` the feature commit.

## Completion ledger

- ✅ **Completed and verified** — FEAT-001 both halves; 8 new fail-first tests; 113+12 green; check exit 0; parity 13/13; secrets clean; reviewer PASS-WITH-NOTES with all findings remediated and re-gated; docs reconciled (README/SECURITY/QA/roadmap/changelog/validation/test-results).
- ⚠️ **Completed but unverified in Chrome** — live capture pixels, permission prompts, provider vision round-trips (MANUAL-QA 31–35).
- 📋 **Not implemented** — none requested beyond scope; cycle-2 P2 backlog unchanged.
- 🛑 **Blocked / awaiting user** — real-Chrome E2E (environment); nothing awaiting decision this cycle.
