# ChromeBot Ai 4.0 — the super-agent crew release

A visible, focused browser agent for Chrome: it reads the page, plans with your model, acts,
and shows you every step. 4.0 turns the 3.0 single-planner agent into a **crew** —
Planner · Actor · Critic — with skills, multi-provider profiles (including NVIDIA NIM and
Cline/OpenAI-compatible), streaming reasoning, and a redesigned **Aurora Glass** UI.

## What's new in 4.0

### Agentic powers

| Power | What it does | How |
| --- | --- | --- |
| **Agent crew** | Planner/Actor/Critic roles. Local critic catches no-progress and loops between rounds and feeds hints back into the next plan. | `crew.js` + `cfg.crew` |
| **Skill packs** | Built-in skills (Summarize, Extract table, Compare, Research, Watch price, Audit links) auto-match the task and inject a focused skill body into the system prompt. | `CBCrew.SKILLS` |
| **Streaming reasoning** | When NVIDIA NIM or another provider streams `reasoning_content`, thoughts appear as soft italic lines in the transcript. | `deltaReason` + `feed.think` |
| **Checkpoints / receipts** | Job state is checkpointed each round; last-action receipts are available for audit. | `CBCrew.checkpointSave` / `lastReceipt` |
| **Multi-provider profiles** | Gemini · **NVIDIA NIM** · OpenAI · Groq · OpenRouter · **Cline / OpenAI-compatible** · custom base URL. | `PROVIDERS` in `core.js` |
| **NVIDIA-ready** | Correct `Bearer nvapi-…` auth, `/v1/chat/completions`, vision `image_url`, `reasoning_effort=low` on thinking models, tailored 401/403/404/429 errors. | docs.api.nvidia.com contract |
| **Cline-ready** | Same OpenAI-compatible surface Cline uses (base URL + key + model), so a Cline local endpoint (Ollama/LM Studio) or remote key works with zero extra config. | `provider: 'cline'` |

### The UI/UX redesign (“Aurora Glass”)

Research-anchored (Linear density, Geist restraint, agent-native transparency):

- Deep navy canvas with cyan→violet aurora glows; glass surfaces; 12px radius rhythm.
- Status orb with live ring: idle / thinking / acting / waiting / done / error.
- Live task card with plan timeline + step checklist + tabular timers.
- Transcript cards: user bubbles, think lines, answer cards with mascot + Copy/Save, screenshots, artifact tables, approval receipts.
- Provider pills with color-coded guard level; model pill shows provider · model.
- Settings sheet with provider cards, crew/thinking toggles, memory & sites panes.
- Light theme, reduced-motion support, focus rings, 4px spacing grid.

### Safety model (unchanged, fail-closed)

1. Sensitive fields and Enter are never touched.
2. Sensitive-site watch mode (mail/bank/payment).
3. Guard levels: off / fast / standard / strict / manual.
4. Jev advisory-or-blocking second opinion.
5. Planner never gets chrome power — typed `POWER` bridge only.
6. Spotlighting untrusted page data (fences + zero-width strip).
7. Per-site trust is user-granted only.

## Providers (how to connect)

| Provider | Base | Key | Default model |
| --- | --- | --- | --- |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | `AIza…` | `gemini-2.5-flash` |
| **NVIDIA NIM** | `https://integrate.api.nvidia.com/v1` | `nvapi-…` (build.nvidia.com) | `moonshotai/kimi-k3` |
| **Cline (Google/GitHub/Email login)** | `https://api.cline.bot/api/v1` | Cline API key after OAuth | `minimax/minimax-m2.5` (FREE) |
| **ClinePass** | `https://api.cline.bot/api/v1` | Cline API key | `cline-pass/kimi-k3` |
| OpenAI | `https://api.openai.com/v1` | `sk-…` | `gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `gsk_…` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `sk-or-…` | `openai/gpt-4o-mini` |
| Custom OpenAI-compatible | your `/v1` URL | optional for local | **Fetch models** |

**Model quality** (auto · low · medium · high · xhigh · max) controls `reasoning_effort` + `max_tokens` on NVIDIA NIM, Cline/ClinePass, and reasoning models.

**Custom headers** (optional) are sent with every request — useful for gateways, `OpenAI-Organization`, `X-Api-Key`, etc.

NVIDIA notes: regenerate keys at [build.nvidia.com](https://build.nvidia.com); a 403 usually means the key lacks the **Public API Endpoints** entitlement. Vision works via `image_url` data URLs. Thinking models accept `reasoning_effort: low|high|max`.

Cline notes: ChromeBot speaks the same OpenAI-compatible chat completions Cline configures under “OpenAI Compatible”. Paste the same base URL + key + model. For local Cline (Ollama / LM Studio) leave the key blank.

## Install

1. `chrome://extensions` → remove any older ChromeBot Ai → **Load unpacked** this folder.
2. Reload open tabs once (close and reopen the side panel).
3. Open ⚙ **Settings** → pick a provider:
   - **Cline**: *Continue with Google / GitHub / Email* → authorize at app.cline.bot → **Settings → API Keys** → paste key → Test
   - **Gemini / NVIDIA / OpenAI / Groq / OpenRouter**: paste the key
   - **Custom OpenAI-compatible**: base URL + key + **Fetch models**
4. Choose **model quality** (auto · low · medium · high · xhigh · max) and optional **custom headers**.
5. Open an http(s) page → type a task → Run.

There is **no welcome modal** — the panel starts on the live chat.

## Everyday recipes

- "Summarize this page" · "What can I do here?"
- "Open google.com, search best noise-cancelling headphones 2026, open the top three results in new tabs, and compare prices"
- "Extract the pricing table" → Download CSV
- "Screenshot this page for me"
- Scheduled: "check the price of X on Y" daily at 09:00
- Memory: "Remember I prefer aisle seats"

## Architecture (what changed where)

| File | Role in 4.0 |
| --- | --- |
| `core.js` | Providers (Gemini/NVIDIA/OpenAI/Groq/OpenRouter/Cline/compatible), streaming plan parser, approvals, memory, export, spotlighting |
| `crew.js` | **New** — Planner/Actor/Critic/Researcher roles, skill packs, local critic, checkpoints, receipts, subtasks |
| `page.js` | Per-frame actuator: observation, click/fill/scroll/press/wait/hover, extract |
| `ui.js` | CBUI view layer: orb, live checklist, transcript cards, think lines, sheets, toasts |
| `panel.js` | Controller: agent loop, crew critic hook, provider deltas + reasoning, multi-tab, POWER, dictation |
| `background.js` | Service worker POWER bridge, context menus, alarms → queue |
| `widget.js` | Floating avatar with status ring |
| `manifest.json` | 4.0.0 |

## Verification

`node tests/smoke.cjs` — **64 assertions**: plan parsing, approval matrix, URL validation, fast path, memory, schedules, CSV/JSON export, spotlighting, **provider endpoints & errors (NVIDIA/Cline)**, **crew roles/skills/critic/checkpoints**. All JS passes `node --check`.

## Privacy

Keys live in Chrome session storage. Memory, history, schedules and site grants live in `chrome.storage.local`. Page text and control labels go only to the provider you configure; screenshots go only when taken, to vision-capable providers. Nothing is sent anywhere else — there is no ChromeBot server.

## Sources (research base)

- NVIDIA NIM LLM API + OpenAPI (kimi-k3 infer) — docs.api.nvidia.com
- Cline (multi-agent teams, skills, OpenAI-compatible providers, SDK) — github.com/cline/cline, docs.cline.bot
- Agent capability landscape: OpenAI Atlas, Perplexity Comet, Browser Use, Skyvern, Claude for Chrome
- Agent UX patterns: Smashing agentic AI, Hatchworks, Setproduct, Devin/Comet/Atlas teardowns
- Safety: Operator watch mode, spotlighting (Hines et al.), CaMeL, OWASP LLM01:2025
- Design: Linear redesign, Vercel Geist, 2026 dark-accent trends, WCAG non-text contrast
