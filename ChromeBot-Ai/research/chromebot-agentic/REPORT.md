# ChromeBot Ai — Deep Research: Missing Agentic Features, Providers, UI/UX

> Generated 2026-09-28 · depth: deep · workspace: research/chromebot-agentic/

## Executive summary

- Browser agents in 2025–26 differentiate on **multi-agent orchestration**, **skills/memory**, **checkpointing**, and **approval UX** — ChromeBot 3.0 is strong on safety and multi-tab but thin on orchestration, skills, and resume [1][2][5].
- **NVIDIA NIM** (`https://integrate.api.nvidia.com/v1`) is OpenAI-compatible chat completions with `Authorization: Bearer nvapi-…`, streaming SSE, vision via `image_url`, `tools`, and `reasoning_effort` on reasoning models; live catalog includes `moonshotai/kimi-k3`, `deepseek-ai/deepseek-v4-*`, `nvidia/nemotron-*`, `openai/gpt-oss-*`, `z-ai/glm-5.*` [3][4].
- **Cline** is a full agent platform (IDE/CLI/Desktop/SDK) with Plan/Act modes, rules/skills, MCP, multi-agent teams, schedules, and any OpenAI-compatible provider — ChromeBot should share that provider surface and skill/rule concepts, not embed Cline [5][6].
- Best-in-class agent UIs (Linear/Vercel density + agent-specific patterns) combine: live plan timeline, approval cards with receipts, streaming reasoning, status orb, and a task canvas — not chat-only [7][8].
- Recommended upgrades: multi-agent crew (Planner/Actor/Critic/Researcher), skill library, checkpoints/undo, thinking stream, provider profiles (Gemini/NVIDIA/OpenAI-compatible/Cline-style), richer NVIDIA defaults, and a redesigned side panel.

## Background & scope

ChromeBot 3.0 is an MV3 Chrome super-agent (read/act in-browser, permission cards, memory, schedules). This report maps remaining gaps vs 2025–26 browser/computer-use agents and locks provider + UI contracts for implementation. Out of scope: CAPTCHA/2FA, raw CDP, OS automation.

## 1. Feature gap map (what is still missing)

| Capability | State of the art (2025–26) | ChromeBot 3.0 today | Priority |
|---|---|---|---|
| Multi-agent crew / specialist sub-agents | Coordinator + specialists with shared tools (Cline teams, Operator-style) | Single planner loop | **P0** |
| Skills / playbooks / rules | Project rules + on-demand skills (Cline `.clinerules`, skill packs) | None | **P0** |
| Checkpoints / undo / resume | Diffs, checkpoints, re-run from history | History re-run only | **P0** |
| Streaming thinking / reasoning | `reasoning_content`, plan chips | Plan lines only | **P1** |
| Tool-use protocol | OpenAI `tools` / function calling | Custom JSON actions | **P1** |
| Parallel research | Multi-tab research workers | `newtab` only | **P1** |
| Provider profiles | Named presets (Cline, OpenRouter, NIM) | 3 raw providers | **P0** |
| Vision grounding | Screenshot + DOM hybrid | Screenshot attach | **P1** |
| Session handoff / export | Transcripts, receipts, audit | Answer .md only | **P1** |
| Long-horizon schedules | Background agents, webhooks | Alarms + queue | **P2** |
| Injection hardening | Spotlighting + dual-LLM | Spotlighting + Jev optional | keep |

## 2. Provider contracts (must work perfectly)

### NVIDIA NIM
- Base: `https://integrate.api.nvidia.com/v1`
- Auth: `Authorization: Bearer nvapi-…` (regenerate at build.nvidia.com; 403 often = missing “Public API Endpoints” entitlement)
- Endpoints: `GET /models`, `POST /chat/completions` (OpenAI-compatible; `stream: true` → SSE)
- Vision: `content: [{type:"text"},{type:"image_url",image_url:{url|data:…}}]`
- Tools: OpenAI `tools` / `tool_calls` supported on many models
- Reasoning models accept `reasoning_effort: "low"|"high"|"max"` (e.g. kimi-k3 default `max`)
- Errors: 401 key, 403 entitlement, 404/410 model, 422 validation, 202 pending (poll `NVCF-REQID`)
- Default model in ChromeBot already `moonshotai/kimi-k3` — keep; prefer Load-models from `/models`

### OpenAI-compatible (Groq, OpenRouter, Ollama, LM Studio, etc.)
- Base URL + `/chat/completions`, Bearer key (optional for local)
- `response_format: {type:"json_object"}` fallback already used
- Must accept custom base, optional key, model list from `/models`

### Cline
- Not an inference API — an agent host. Integrate by:
  1. Provider preset that matches Cline’s OpenAI-compatible fields (base URL, model, key)
  2. Shared concepts: Plan/Act toggle, rules/skills files, MCP-ready tool list (future)
  3. Document “use the same key/base as Cline’s OpenAI-compatible provider”

## 3. UI/UX redesign direction

**Anchor:** Linear + Vercel Geist density × agent-native transparency (Devin/Comet/Atlas teardowns).

- Palette: `#0B0F17` canvas, `#121826` surface, ink `#E8EEF7`, muted `#8B9BB4`, accent cyan `#3DE0FF` → violet `#8B7CFF`, success `#3DDC97`, warn `#FFB020`, danger `#FF5C7A`
- Type: Inter / system UI, 3-weight ramp (650/500/400), tabular nums for telemetry
- Layout: header (orb + status) → live task card → transcript → composer; settings as full sheet with provider cards
- Signature moments: status orb ring, plan timeline with live ticks, approval receipt cards, agent crew strip when multi-agent runs

## Open questions

- Whether to keep Jev/TypeSafe as optional second opinion (yes — advisory).
- Whether ChromeBot should speak MCP as client (roadmap; not this release).

## Sources

[1] Cline README — multi-agent teams, skills, schedules, OpenAI-compatible providers — https://github.com/cline/cline (accessed 2026-09-28)
[2] ChromeBot Ai readme 3.0 (local) — existing powers and safety model
[3] NVIDIA NIM LLM APIs — https://docs.api.nvidia.com/nim/reference/llm-apis (accessed 2026-09-28)
[4] NVIDIA NIM kimi-k3 infer OpenAPI — https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3-infer (accessed 2026-09-28)
[5] Cline docs — https://docs.cline.bot (accessed 2026-09-28)
[6] Cline SDK — https://docs.cline.bot/cline-sdk/overview (accessed 2026-09-28)
[7] Smashing Magazine Designing for Agentic AI (via 3.0 research base)
[8] Operator / Atlas / Comet UX teardowns (via 3.0 research base)
