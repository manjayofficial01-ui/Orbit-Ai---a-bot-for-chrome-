# Feature Gap Analysis — cycle 2 — 2026-10-25

Matrix from COMPETITOR_ANALYSIS.md (same sources/dates/confidence). **Orbit cells were re-verified from code on this branch**, not carried over: the digest/`read-tab` row in particular changed status.

| Capability | Orbit | Sider | Merlin | Page Assist | ChatGPT ext. | Claude for Chrome | Gap priority |
|---|---|---|---|---|---|---|---|
| BYOK any provider | Yes | Partial (OpenAI only, H) | Partial (M) | Yes (H) | No | No | none — differentiator |
| Local/Ollama models | Yes | No | No | Yes (H) | No | No | none — differentiator |
| Side panel / full-tab / detached window | Yes (all three) | Yes | Yes | Yes + web UI | Yes | Yes | P3: no standalone web app |
| Page context | Yes | Yes | Yes | Yes | Yes | Yes | none |
| **Multi-tab context** | **Yes — all-tabs digest (≤12 tabs, one previewed reference) + agent `read-tab` (≤15 tab refs)** | Unknown | Unknown | No | Unknown | Unknown | **closed this cycle-tree (v2.3)** |
| Screenshot attach | Yes | Partial | Unknown | Experimental | Unknown | Unknown | differentiator (M) |
| Web search | Provider-hosted + local Reach bridge | Yes | Yes | Yes | Yes | Yes | none |
| Page automation | Supervised, 13 tools, ≤8 steps, ≤3 actions/step | Hand + Browser Agent (H) | browser agent (M) | Page Action (H) | Yes (H) | Yes (H) | none — parity |
| **Per-action approval** | **Yes, and no auto-approve path or off-switch** | Unknown (L) | Unknown | Yes default (H) | Site-scope grants, not per-action (H) | Default "Ask Before Acting", **but a risk-based auto-approve classifier exists** (M) | narrow — restate, don't overclaim |
| Local research agent (Reach) | Yes | No | No | No | No | No | none — unique |
| No desktop-app dependency | Yes | Yes | Yes | Yes | **No — requires ChatGPT desktop app** (H) | Unknown | differentiator vs OpenAI (H) |
| Open source | Yes | No | No | Yes | No | No | — |
| No telemetry/accounts | Yes | No (collects PII, H) | No | Yes | No | No | — |
| Multi-browser | Chrome MV3 | C/E/Safari | Chrome/Edge/Brave (H) | 7 browsers incl. Firefox (H) | 5 Chromium browsers (H) | Chrome | **P2: Firefox port** |
| Knowledge base / RAG | No | Yes | Yes | Yes (H) | Yes | Yes | **P2: largest remaining feature gap** |
| MCP support | No | Unknown | Unknown | Yes (H) | Unknown | Unknown | P3: evaluate |
| PDF handling | No (plain-text files only) | Yes (ChatPDF/OCR, H) | Yes | Reported (M) | Yes | Yes (form-fill from PDF, H) | **P2: table stakes** |
| Runs with browser closed / cloud execution | No | No | No | No | Yes (desktop app) | Unknown | P3 — would break the local-first posture |
| Purchase / payment flows | No | Unknown | Unknown | No | Yes | Yes | **rejected for this product** (irreversible spend, no human-finance controls) |

## What changed vs cycle 1's gap list

- **Multi-tab context: closed.** Cycle 1 ranked this the top real gap, citing Edge's "30 tabs". v2.3 shipped `digestScan` (all open tabs → one bounded 24,000-char reference behind a single permission prompt) and agent `read-tab`. Cycle 2 hardened the digest so it filters hidden text like the other extractors, and fixed the ref-aliasing hazard when the agent switches tabs mid-step.
- **The "30 tabs" bar was unsubstantiated** (L, secondary blogs only). Recording that honestly: we built to a real need (cross-tab reasoning), not to a fabricated number.
- **Per-action approval is no longer uncontested.** Claude for Chrome ships ask-before-acting as a default. Orbit's defensible claim is narrower and still true: the gate has no auto-approve classifier and no setting that turns it off. README/welcome copy was written to that line and is locked by a static test that forbids "unlimited"-style claims.

## Ranked differentiation backlog (impact × confidence ÷ effort)

1. **Message the anti-metering + no-desktop-app posture** — Sider/Merlin credit opacity is corroborated by fresh complaints (M, multi-source) and OpenAI's extension now requires its desktop app (H). Effort: **Small** — copy only. **Done this cycle** (README "What this is for" + welcome strip, gated by `hardening-static`).
2. **Plain-text PDF extraction** — every primary competitor now handles PDFs (H/M). Bounded, local extraction fits the privacy posture. Effort **Medium**, but it is the only backlog item that would break the zero-dependency stance: text extraction needs a vendored parser (pdf.js ≈ 1 MB+) → **supply-chain escalation gate, needs your decision.**
3. **Knowledge base / RAG** — Page Assist, Sider, Merlin, ChatGPT ext and Claude all ship it (H/M). Largest remaining functional gap. Effort **Large**: needs a local embedding/retention architecture decision and a storage-budget redesign (8 MB local cap today).
4. **Firefox port** — Merlin confirmed Chromium-only (H), OpenAI's extension is Chromium-only (H), so Page Assist remains the *only* common competitor covering Firefox. MV3 portability is real but the native-messaging bridge, `sidePanel`, `captureVisibleTab` and `userAgentData` all need review. Effort **Large**.
5. **MCP support** — Page Assist has it (H); would subsume/partly replace the bespoke Reach bridge. Effort **Medium**, decide only after the Reach integration has real usage data.

## Deliberately not pursued

- **Agentic purchase/payment flows** — irreversible spend on a user's behalf with no independent finance controls; conflicts with the supervised-action principle the product is built on.
- **Auto-approve / "trusted site" bypass for Agent mode** — would discard the one gate that distinguishes Orbit from Gemini Auto-browse and Claude for Chrome.
- **Framework migration (React/Svelte)** — no evidence the vanilla architecture fails at this size; zero dependencies is a differentiator, not debt (cycle-1 rejection stands, re-affirmed after v2.3 added ~700 lines without strain).
