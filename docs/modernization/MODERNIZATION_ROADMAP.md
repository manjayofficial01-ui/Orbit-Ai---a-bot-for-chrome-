# Modernization Roadmap — after cycle 1 (2026-10-25)

Status legend: done ✓ | next | later | rejected (reason)

## P0 — Critical
- (none open — audit found no security/data-integrity/release blockers)

## P1 — High impact
- ✓ DOC-001 SECURITY.md numeric drift (5 MB/60 chats → 8 MB/100 + research cap)
- ✓ DOC-002 TEST-RESULTS.md rewritten from real runs
- ✓ A11Y-001 accessible names for all dialogs + static gate test (tests/a11y-static.test.mjs)
- ✓ Research protocol robustness (earlier in cycle 1 session): research runs drop the conflicting standard system prompt; one prose-directive retry at planning stage
- ✓ Agent Reach integration end-to-end (bridge, installer, UI, tests, machine install)

## P2 — Important (next cycles)
| Item | Rationale (evidence) | Status |
|---|---|---|
| Agent-mode protocol retry consistency | invalid blocks burn one of 8 steps; research loop already retries once (TECHNICAL_AUDIT REL-002) | next |
| Consolidate page extractors | inspectPage/snapshotPage duplication in page-access.js (ARCH-001) | next |
| Multi-tab context | Edge Copilot reads up to 30 tabs (H); Orbit limited to 1 tab/ref, 3 refs | next |
| Plain-text PDF extraction | all five competitors handle PDFs (FEATURE_GAP_ANALYSIS) | later |
| Firefox port | only Page Assist covers Firefox (H); MV3 portable | later (large) |
| README/welcome differentiation copy | credit-metering is rivals' top pain (M, multi-source) | next (copy-only) |
| Knowledge base / RAG | Page Assist ships it (H); needs architecture decision | later |
| ROB-001 background selectionText guard | defensive | next (one-liner) |

## P3 — Optional
- MCP support evaluation (Page Assist has it, H)
- Surface persisted researchTrace in message UI/export
- renderText odd-fence edge case; per-message incremental render if caps ever grow
- Web-app-style full UI outside the extension (Page Assist pattern)

## Rejected this cycle
- Framework migration (React/Svelte): no evidence current vanilla architecture fails at this scale; zero-dep posture is a differentiator.
- Headless E2E harness build-out: extension requires manual unpacked load; MANUAL-QA checklist is the honest gate until a Chrome-with-extension automation path exists.
