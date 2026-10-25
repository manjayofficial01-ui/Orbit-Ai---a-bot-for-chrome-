# ChromeBot 4.3.0 — UI/UX Competitive Inspiration

> Date: 2026-10-01 · Scope: side-panel UI/UX redesign driven by the 4.3.0 bug fix
> (answer never rendered — only the thinking block showed)

## Why this note exists

The user reported that the extension streamed the model's reasoning but never showed
the final answer, and asked for a UI/UX overhaul informed by Grok (xAI) and the other
top AI assistants. This documents what we studied and which patterns we folded into
`panel.html` / `panel.css` / `ui.js`.

## Products studied

| Product | Signature UI pattern we borrowed |
|---|---|
| **Grok** (xAI) | Pill composer as the single focal band; real-time "thinking" indicator; answer-first, reasoning collapsed behind a caret; calm, high-contrast dark surface |
| **ChatGPT** | Thread-first transcript; sticky action controls; keyboard-first (Enter to send, Esc to stop); clear empty/first-run state |
| **Claude** | Two-layer reasoning disclosure (live while streaming, folded to a duration label after); restrained accent color used only for live state |
| **Gemini** | Sticky live status with elapsed time and a step/count readout; "working" never reads as "frozen" |
| **Perplexity** | Citations/source chips inline with the answer; docked interrupt (ask/permission) that cannot scroll out of view |
| **Copilot** | Docked approval card pinned above the composer so a permission prompt is never a deadlock in a narrow panel |

## Patterns applied in 4.3.0

1. **Thread-first layout** — header (orb + brand + version) → context strip (site, model, guard)
   → sticky live instrument card → transcript feed → docked interrupt area → composer.
2. **Sticky live instrument card** (`#liveCard`) — shows the task, a step counter
   ("3 of 7 steps"), elapsed time, and a Stop button; collapsible via `liveToggle`
   (`data-open`). Inspired by Gemini's live status + Grok's "working" indicator.
3. **Two-layer reasoning disclosure** — `feed.think()` opens a `<details>` while tokens
   arrive; `feed.sealReasoning()` freezes the label to "Reasoned for Ns" and auto-folds
   after 700ms unless the user opened it. Model text is tokenised into DOM nodes — never
   assigned to `innerHTML` (CSP-safe). From Claude + Grok.
4. **Docked approval / ask cards** (`#dock`, `feed.approval()` / `feed.ask()`) — pinned
   above the composer and hidden when empty; sets `body[data-asking]` to dim the composer
   so the panel can't deadlock by scrolling a prompt out of view. From Perplexity + Copilot.
5. **Pill composer** — one focal band: mic + autosizing textarea + send arrow that arms
   (`.send.armed`) when there is text; Enter sends, Shift+Enter newline, Esc stops a run.
   From Grok + ChatGPT.
6. **Empty / first-run state** (`feed.empty()`) — capability framing ("ChromeBot acts on
   this page") instead of a blank box or a stuck welcome modal. From ChatGPT.
7. **Single restrained accent** (`--accent` / `--accent-2`) used only for live state;
   neutral surfaces everywhere else; 4px spacing scale; `color-mix` for tints. From Claude.
8. **Safe markdown** — `inline()` + `mdInto()` render `**bold**`, `` `code` ``, and
   `[text](https://url)` as real DOM nodes; the bare answer falls back to "Done." if the
   model returns nothing (the safety net behind the original bug).

## Root-cause fixes that made the answer appear (see CHANGELOG 4.3.0)

- `deltaText()` stopped returning Gemini `thought` parts / `reasoning_content` as answer text.
- `QUALITY_SPEC` token budgets raised and a Gemini thinking-budget bound added so reasoning
  can't consume the whole budget and starve the answer.
- Late `done` steps are no longer dropped on idle; `finish()` always feeds the answer;
  `ensureAnswer()` posts an honest summary if nothing was shown.

## Validation

- `tests/smoke.cjs` (95 cases) and `tests/stream.cjs` (27 streaming cases) pass.
- DOM-ID cross-check: every `$()` / `getElementById` in `ui.js` + `panel.js` resolves to an
  `id` in `panel.html` (the only undeclared id, `onboard`, is intentionally null-safe).
