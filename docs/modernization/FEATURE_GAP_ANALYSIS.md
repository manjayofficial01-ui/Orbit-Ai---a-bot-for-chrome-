# Feature Gap Analysis — cycle 1 — 2026-10-25

Matrix from COMPETITOR_ANALYSIS.md (same sources/confidence). Orbit cells verified from code this cycle.

| Capability | Orbit | Sider | Merlin | Page Assist | Edge Copilot | Gemini in Chrome | Gap priority |
|---|---|---|---|---|---|---|---|
| BYOK any provider | Yes | Partial (H) | Partial (M) | Yes (H) | No | No | none — differentiator |
| Local/Ollama models | Yes | No | No | Yes (H) | No | No | none — differentiator |
| Side panel UI | Yes | Yes | Yes | Yes + web UI | Yes | Yes | P3: full-tab web UI exists; no separate web app |
| Page context | Yes | Yes | Yes | Yes | Yes (30 tabs, H) | Yes | P2: multi-tab context (Edge sets the bar) |
| Screenshot attach | Yes | Partial | Unknown | Experimental | Unknown | Partial | differentiator (M) |
| Web search | Provider-hosted | Yes | Yes | Yes | Yes | Yes | covered via provider + Reach |
| Page automation | Supervised | Operator (H) | Unknown | Page Action (H) | Actions (H) | Auto-browse (H) | none — parity |
| Human-approval automation | Yes | Unknown | Unknown | Yes default (H) | Unknown | Yes (H) | none — differentiator |
| Local research agent (Reach) | Yes | No | No | No | No | No | none — unique |
| Open source | Yes | No | No | Yes | No | No | — |
| No telemetry/accounts | Yes | No | No | Yes | No | No | — |
| Multi-browser | Chrome MV3 | C/E/Safari | Chrome | 7 browsers (H) | Edge | Chrome | P2: Firefox port |
| Knowledge base / RAG | No | Yes | Yes | Yes (H) | Yes | Partial | P2: roadmap, needs design |
| MCP support | No | Unknown | Unknown | Yes (H) | Unknown | Unknown | P3: evaluate |
| PDF handling | No (text files only) | Yes | Yes | Reported (M) | Yes | Partial | P2: plain-text PDF extract |

## Ranked differentiation backlog (impact × confidence ÷ effort)
1. **Lead with the anti-credit-metering positioning** — Sider/Merlin's top corroborated pain is credit opacity; Orbit's zero-credit any-BYOK answers it directly. Effort: copy only. (P1 — done in README this cycle; consider welcome-screen copy P3)
2. **Multi-tab context** — Edge Copilot reads up to 30 tabs; Orbit reads one tab per reference (max 3 refs). Moderate effort, clear gap. (P2)
3. **Firefox port** — only Page Assist covers Firefox today; MV3 portability widens reach vs platform-locked built-ins. (P2, large)
4. **Plain-text PDF extraction** — table-stakes across all five; bounded local extraction fits the privacy posture. (P2)
5. **Knowledge base/RAG + MCP** — Page Assist ships both; larger architecture decisions required. (P2/P3, design first)
