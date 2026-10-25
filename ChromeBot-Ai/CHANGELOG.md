# ChromeBot Ai — Changelog

Every user-visible update bumps `manifest.json` **and** `CBCore.VERSION` together, and the side-panel badge / About show that number.

## 4.3.0 — 2026-10-01

- **Answer now always renders** — the panel used to stream only the thinking/reasoning block and never show the final reply. Root cause: the streaming parser returned Gemini `thought` parts / `reasoning_content` as answer text, and on Gemini 2.5+ reasoning could consume the whole token budget, leaving nothing but an empty plan.
  - `deltaText()` no longer leaks reasoning into the answer (reasoning → its own block only).
  - `QUALITY_SPEC` token budgets raised across the board and `geminiThinkingConfig()` bounds `thinkingBudget` to ~35% of the cap, so thinking can't starve the answer.
  - `finish()` always feeds the answer (falls back to "Done."); `ensureAnswer()` posts an honest summary if a run ends with nothing shown; late `done` steps are no longer dropped on idle.
- **UI/UX redesign** (inspired by Grok, ChatGPT, Claude, Gemini, Perplexity, Copilot):
  - Thread-first layout with a sticky **live instrument card** — task, step counter ("N of M steps"), elapsed time, Stop, collapsible via `liveToggle`.
  - **Two-layer reasoning disclosure**: a live "Thinking…" block that seals to "Reasoned for Ns" and auto-folds once finished.
  - **Docked approval / ask cards** above the composer so a permission prompt can never scroll out of view in a narrow panel.
  - **Pill composer**: mic + autosizing textarea + send arrow that arms when there's text (Enter sends, Esc stops).
  - Composer auto-clears once a run starts; suggestion chips return when it's idle and empty.
  - **Empty / first-run state** ("ChromeBot acts on this page") instead of a blank box.
  - Model text is tokenised into DOM nodes (CSP-safe) — never assigned to `innerHTML`.
- Regression coverage: `tests/stream.cjs` (27 streaming cases) added; `tests/smoke.cjs` at 95.

## 4.2.0 — 2026-09-28

- **Floating window owns the screen**: the avatar hides while the window is open and returns when you close it
- Window is resizable — drag the bottom-right corner, or press ⤢ to toggle a large size (both persist)
- **Focus mode** (▭ in the window bar, ⤢ in the panel header) hides the title bar and the suggestion chips for more working room; ⤡ brings them back
- Panel header, chips and window size/focus state survive reloads

## 4.1.3 — 2026-09-28

- **Thinking is visible**: Cline streams reasoning as `delta.reasoning` / `reasoning_details`, which the parser dropped — now shown as one live "Thinking" block (click the caret to expand)
- Feed keeps its place: scrolling up to re-read an answer is no longer yanked back by each streamed chunk
- Visible scrollbar (11px, contrast thumb + track) in both themes
- Animated working indicator beside the status hint
- Fetch models returns the key's full live list (was capped at 300; Cline no longer seeds invented ids)
- A run that ends without an answer now says so instead of going silent

## 4.1.2 — 2026-09-28

- **Cline HTTP 500 / 403 diagnosis**: real error body is shown (ENTITLEMENT_ERROR, empty response, rate limit)
- ClinePass models without a ClinePass plan now explain the fix instead of a generic 500
- Non-stream Cline payloads unwrapped (`{data:{choices}}`)
- Safer Cline default model (`deepseek/deepseek-v4.1-flash`); min `max_tokens` 64
- One auto-retry on transient Cline 500 (empty/rate-limit)

## 4.1.1 — 2026-09-28

- **Fixed sheets that could not close** (`[hidden]` was overridden by `display:flex` — Tasks/Settings stacked into a stuck "dashboard")
- Tasks drawer: clear **← Back to chat**, Escape / click-outside to close
- History/Scheduled tabs no longer overlap; visible empty states
- Toast actually shows (class name match)

## 4.1.0 — 2026-09-28

- **Removed first-run welcome modal** (it froze the panel as an empty dialog)
- **Cline login**: Continue with Google / GitHub / Email → app.cline.bot OAuth → paste API key
- **OpenAI-compatible settings**: base URL, API key, **Fetch models**, **model quality** (auto/low/medium/high/xhigh/max), **custom headers**
- Cline + ClinePass as first-class providers (`api.cline.bot`)
- Version shown in header badge and About

## 4.0.0 — 2026-09-28

- Agent crew (Planner · Actor · Critic), skill packs, streaming reasoning
- Providers: Gemini, NVIDIA NIM, OpenAI, Groq, OpenRouter, OpenAI-compatible
- Aurora Glass UI redesign
- Fixed `Authorization: Bearer` header bug
- 64 → 76 smoke tests

## 3.0.0

- Super-agent: multi-tab, permission cards, memory, schedules, screenshots, extract/CSV
- Calm-cyberpunk UI, guard levels, spotlighting

## 2.1.0

- Streaming planner, instant path, multi-frame actuator

## 2.0.0 / 1.0.0

- Initial browser agent: observe → plan → act loop
