# Competitor Analysis — cycle 2 — accessed 2026-10-25

Confidence: H = official current source; M = credible secondary or official-but-stale; L = single uncorroborated signal. Research run by a web research subagent; all claims carry source + access date. Fetched pages were treated as untrusted data; no page contained agent-directed instructions, though sider.ai, getmerlin.in's homepage and Trustpilot returned 403 (bot-blocked), so a few claims rest on search-surfaced official snippets and are marked accordingly.

## What changed since cycle 1 (same date, later run)

Two of the five competitors cycle 1 tracked are no longer the right comparison points:

- **ChatGPT Atlas is defunct** — shut down 2026-08-09 (announced 2026-07-09). OpenAI's browser agent moved into the ChatGPT desktop app plus a new **ChatGPT browser extension** for Chrome/Edge/Brave/Opera/Vivaldi. ([learn.chatgpt.com/docs/chrome-extension](https://learn.chatgpt.com/docs/chrome-extension), 2026-10-25, H; [community.openai.com](https://community.openai.com/t/atlas-is-scheduled-to-stop-working-on-august-9-2026/1389473), H/M)
- **Microsoft retired standalone "Copilot Mode" on 2026-05-13**, folding it into Edge; Copilot Actions was renamed **"Browse with Copilot"**, now GA (no longer limited preview) for Microsoft 365 Premium subscribers, US only, with usage limits. ([blogs.windows.com](https://blogs.windows.com/msedgedev/2026-05-13/new-updates-to-edge-across-desktop-and-mobile/), H; [support.microsoft.com](https://support.microsoft.com/en-us/edge/copilot/browse-with-copilot), H)
- **Cycle 1's "Edge reads up to 30 tabs (H)" claim is refuted as an evidence grade**: no official source confirms a 30-tab figure; only secondary blogs repeat it. Downgraded to **L / unverified**. This mattered because that number was the stated bar for our own multi-tab roadmap item.
- **Claude for Chrome is now a first-order comparison** and is the closest rival on supervision: an explicit approval-mode selector, defaulting to "Ask Before Acting" per action, with a 2026 risk-based auto-approve classifier. ([kevinwelter.com](https://kevinwelter.com/en/blog/claude-in-chrome), 2026-10-08, M; [aitoolanalysis.com](https://aitoolanalysis.com/claude-in-chrome-review/), 2026-03-04, M)

## Primary competitor set (cycle 2)

### Sider (Vidline Inc.)
Multi-model sidebar (GPT-5, Claude, DeepSeek, Gemini, Grok, Llama), Group Chat, ChatPDF/OCR, Deep Search, YouTube summarizer, text-to-image, artifacts, audio read-aloud; ~5M users. Agentic line: **"Sider Hand"** ([sider.ai/agents/hand](https://sider.ai/agents/hand), H existence) and a **"Browser Agent (Research Preview)"** shipped in v5.20.0 ([sider.ai/whats-new](https://sider.ai/whats-new/browser-extension/sider-v5_20_0), 2025-10-25, H). BYOK: OpenAI key only (H). Collects PII + website content (H).
- **Approval model: Unknown.** Hand's own FAQ asks "Will it take actions without my approval?" but the answer was unretrievable (403); secondary sources note it "uses your logged-in sessions" without corroborating per-action approval ([zerotwo.ai](https://zerotwo.ai/compare/vs-sider-ai), L). Do not claim Sider is unsupervised.
- Pain: still credit-metered — free ≈ "30 basic credits/day, 10 msgs/60 min", paid from ~$4.20/mo annual, "plans and credit allowances changed often" ([prompt-architects.com](https://prompt-architects.com/blog/693-sider-ai-review-2026-hands-on-30-days), M; [aionx.co](https://aionx.co/ai-comparisons/sider-ai-review/), 2026-10-15, M). Exact current dollar tiers: not verified.

### Merlin
26-in-1 sidebar: multi-model chat, page context, YouTube/blog summaries, web search ([getmerlin.in](https://www.getmerlin.in/feature/chatgpt-with-internet-access), H). **Browser support now confirmed: Chrome, Edge, Brave** — install "from Chrome Web Store or Edge Add-Ons" (H, H). **No Firefox**: add-on long removed, open Canny request remains ([merlin-ai.canny.io](https://merlin-ai.canny.io/feature-requests/p/make-an-extension-for-firefox), 2025-01, M). Safari: **Unknown — no source found.**
- Pain (fresh): credits now only "top-ups" after caps, ~$100/mo usage ceiling reported ([prompt-architects.com](https://prompt-architects.com/blog/684-merlin-ai-review-credits-limits-real-cost), 2026-09-25, M — figures partially garbled on fetch); Reddit complaints of an unexpected annual charge, "hidden credits" surfaced at cancellation time, usage-limit friction ([r/Merlin_AI](https://www.reddit.com/r/Merlin_AI/comments/1rg1hex/tried_to_cancel_subscription_unlocked_hidden/), L; [charge thread](https://www.reddit.com/r/Merlin_AI/comments/1wbf0mh/merlin_ai_charged_me_24_for_an_annual/), L). Approval model for its browser agent: **Unknown — no source found.**

### Page Assist (n4ze3m, MIT) — closest direct competitor
Open-source sidebar + web UI; Ollama, LM Studio, any OpenAI-compatible endpoint, Chrome AI, Vertex AI ([docs.pageassist.xyz](https://docs.pageassist.xyz), H). Internet search, **knowledge base (RAG)**, **MCP support**, experimental Sidebar Vision, "Page Action" automation sub-extension (approval-before-action default-on, Chromium-only), Chrome/Brave/Firefox/Edge/Vivaldi support, ~8.3k stars ([github.com/n4ze3m/page-assist](https://github.com/n4ze3m/page-assist), H). Agentic reach is shallower than ours: no cross-tab supervised task runtime or local research-CLI bridge.
- Pain: Ollama connection/CORS failures are the top support issue (H, official troubleshooting doc).

### ChatGPT browser extension (OpenAI) — replaces Atlas in this matrix
Chrome/Edge/Brave/Opera/Vivaldi. Default approval: "ChatGPT asks before it interacts with each new website", with once / per-site / all scopes — i.e. **site-scope grants, not per-action**. Requires the ChatGPT desktop app ([learn.chatgpt.com/docs/chrome-extension](https://learn.chatgpt.com/docs/chrome-extension), H). No BYOK, no local models, closed source.

### Claude for Chrome (Anthropic)
Explicit approval-mode selector, default **"Ask Before Acting"** per action; a 2026 addition is a **risk-based auto-approve classifier** ([kevinwelter.com](https://kevinwelter.com/en/blog/claude-in-chrome), M; [aitoolanalysis.com](https://aitoolanalysis.com/claude-in-chrome-review/), M). This is the product that competes with us on supervision semantics specifically — our claim must therefore be about the *default and the absence of an auto-approve path*, not about being the only supervised agent.

## Platform built-ins (context, not installable competitors)

- **Gemini in Chrome / Auto-browse**: multi-step agentic tasks, form-fill from a PDF, purchases; pauses for explicit confirmation on sensitive actions and hands back control for logins/CAPTCHAs; requires Google AI Pro/Ultra, US-first, Android added Aug 2026 ([blog.google](https://blog.google/products-and-platforms/products/chrome/gemini-3-auto-browse/), 2026-01-28, H; [google.com/chrome/ai-innovations](https://www.google.com/chrome/ai-innovations/), H; [developer.chrome.com/blog/chrome-at-io26](https://developer.chrome.com/blog/chrome-at-io26), 2026-05-19, H).
- **Edge "Browse with Copilot"**: GA for M365 Premium, US only, usage limits; IT policies exist ("Configure browsing with Copilot", [learn.microsoft.com](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-management-browsing-with-copilot), 2026-06, H); users can take control at any time (support.microsoft, H).
- **Comet (Perplexity)**: free assistant browser (Mac/Win/iOS/Android) that acts on your sites; free tier caps, Pro $20/mo ([perplexity.ai/comet](https://perplexity.ai/comet), H). Cloud memory per account, no BYOK.

## Net positioning (evidence-based, cycle 2)

Orbit remains the only product in this set combining: any-provider BYOK **and** local Ollama models, **per-action** supervised page automation with no auto-approve path, a supervised local research agent (Agent Reach bridge), open source, zero telemetry/accounts, no credit metering, and **no desktop-app dependency**.

Two honest corrections to the cycle-1 framing:
1. "Per-action approval" is no longer an unclaimed niche — Claude for Chrome defaults to ask-before-acting. What still differentiates is that Orbit has **no auto-approve classifier and no way to disable the gate**, plus local/cloud model freedom.
2. "Multi-tab context" is no longer an open gap: v2.3 added the all-tabs digest (≤12 tabs, one combined preview) and agent `read-tab` switching, so the matrix cell moved from Missing to Present — while the competitor figure that inspired it (30 tabs) turned out to be unsubstantiated.

Capability closed-agents have that Orbit lacks, with evidence: cross-session/cloud execution (run with the browser closed), purchase and payment flows, native email/calendar integrations, knowledge-base RAG (Page Assist, Sider, Merlin), and MCP tooling (Page Assist).

## Key unknowns for the next cycle
- Whether Sider Hand or Merlin's browser agent offer per-action approval (both Unknown today).
- Exact current Sider/Merlin price tiers and credit allowances.
- Merlin on Safari.
- Whether OpenAI's extension stays dependent on the desktop app.
