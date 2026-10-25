# Competitor Analysis — cycle 1 — accessed 2026-10-25

Confidence: H = official current source; M = credible secondary / stale official; L = single uncorroborated. Research performed via web research subagent; all claims carry source + date above.

## Sider (Vidline Inc.)
- Multi-model sidebar (GPT-5, Claude, DeepSeek, Gemini, Grok, Llama), Group Chat, ChatPDF/OCR, Deep Search, YouTube summarizer, text-to-image, artifacts, "Sider Operator" automation companion, audio read-aloud. ~5M users. (Chrome Web Store listing, 2026-10-25, H)
- BYOK: OpenAI key only (H). Pricing: freemium credits, tiers ~$100–1,000/yr (M). Collects PII + website content (H).
- Pain: opaque expiring credits; "Unlimited" plans with hard limits; cancel friction (M, multi-source: Trustpilot, review-data analysis).

## Merlin
- 26-in-1 sidebar: multi-model chat, page context, YouTube/blog summaries, web search. (getmerlin.in, H)
- Free 102 queries/day; Pro $29/mo ($19 annual) (M). BYOK OpenAI key, other providers "in progress" (Canny, M).
- Pain: fast-draining opaque credits, hard caps on paid, billing friction (M, multi-source).

## Page Assist (n4ze3m, MIT) — closest direct competitor
- Open-source sidebar + web UI; providers: Ollama, LM Studio, any OpenAI-compatible endpoint, Chrome AI, Vertex AI. (docs.pageassist.xyz, H)
- Internet search, knowledge base (RAG), MCP support, experimental Sidebar Vision, Page Action automation extension (approval-before-action default-on, Chromium-only). Firefox/Edge/Brave/etc. supported. 8.3k stars. (GitHub, H)
- Pain: Ollama connection/CORS failures are the top support issue (H, official troubleshooting doc).

## Microsoft Edge Copilot
- Copilot Mode: agentic Actions (navigate/purchase/book), multi-tab reasoning (30 tabs business), tab/history search, enterprise data protection. (Windows Blog 2025-10-23, H)
- Free limited US preview; Copilot Pro $20/mo optional. Edge-only, no BYOK/local models. (H)
- Pain: Edge 149 retired legacy sidebar; user backlash. "Copilot Mode folded into Edge natively (May 2026)" — single source, L.

## Gemini in Chrome
- Side panel with open-tab context, summaries, tab comparison; AI Mode in address bar. (google.com/chrome/ai-innovations, H)
- Auto-browse (2026-01-28): multi-step agentic tasks, pauses on sensitive actions; US-only preview, requires AI Pro/Ultra subscription. (Google Blog, H)
- Pain: regional exclusion (EU paying users excluded) and staged rollout complaints (M, corroborated Reddit threads).

## Net positioning (evidence-based)
Orbit is the only product in this set combining: any-provider BYOK **and** local Ollama models, supervised page automation, a supervised local research agent (Agent Reach bridge), open source, zero telemetry/accounts, and no credit metering. Page Assist matches on local+open-source+BYOK but lacks any-provider cloud reach research; Sider/Merlin monetize credits and collect data; Edge/Chrome built-ins are closed, region/subscription gated, no BYOK.

Key unknowns to re-check next cycle: Merlin multi-browser support; Sider/Merlin automation supervision details; Edge Copilot Mode branding status (L).
