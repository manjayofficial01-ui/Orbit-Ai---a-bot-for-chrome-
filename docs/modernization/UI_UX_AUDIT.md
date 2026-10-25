# UI/UX Audit — cycle 2 — 2026-10-25

## Design system state

Single hand-authored stylesheet (`dist/styles.css`, ~21.9 KB) with custom properties for color/radius/ease/shadows, light/dark/system via `data-theme`, four-step font scale via `--font-scale`/`data-font`. Component vocabulary is stable: `.icon` 44 px targets, `.primary`/`.danger`, `.segmented`, `.settings-tabs`, dialog patterns, `.check` rows, source/attachment pills, `.welcome`/`.suggestions`.

Cycle 2 added one component: **`.welcome-points`** — a pill row under the welcome heading carrying the four differentiators established by competitive research (any-provider BYOK with no credits, local Ollama models, per-action approval, no account/telemetry, open source). It is a real `<ul>` with an `aria-label`, reuses the existing pill recipe (border + `--surface` + `999px` radius + `--muted` text) rather than introducing new colors, and adds no responsive rules because `flex-wrap` already handles narrow widths. Claims are anchored to code by a static test that also forbids "unlimited"-style wording.

## What was changed, and how it was checked

| Item | Before | After | How verified |
|---|---|---|---|
| Conversation live region | `#messages` had `aria-live="polite"` while being rebuilt wholesale every ~75 ms | `aria-live` removed; `#status` (`role="status"`) stays the announcement channel | Computed DOM in a real browser (`aria-live: null`, status role present) + static gate |
| Labelled containers | `<div id="attachments">` and `<div id="reachCapabilities">` carried `aria-label` with no role → name ignored | `role="group"` on both | Real-browser attribute read + static gate |
| Brand mark | `<svg aria-label="Orbit AI">` with no role | `role="img"` added | Real-browser read + static gate |
| Shortcut hint | Hard-coded `⌘K` on every platform | `Ctrl+K` default in markup, rewritten to `⌘K` on macOS at boot; panel title follows the same `modLabel` | Real-browser render showed `Ctrl+K` on Windows |
| Empty-state copy | Heading + one sentence + 3 suggestion buttons | Adds the 4-pill differentiator strip | Rendered and screenshotted structurally in a real browser |

## Verified in a real browser (new this cycle)

Cycle 1 recorded live UI verification as entirely UNVERIFIED. This cycle found a workable middle path: `dist/` was served over loopback HTTP and `app.js` was loaded **as-is** against a stubbed `chrome` API, which exercises the app's own DOM code (not the extension runtime). Confirmed by driving that instance:

- `app.js` imports and boots with no runtime error after the five edits made to it this cycle.
- Theme toggle flips `data-theme` dark→light; font scale advances `data-font` medium→large.
- Settings dialog opens, its accessible name resolves (`aria-labelledby="settingsTitle"` → "Connect your provider"), focus lands on `#base`, and it closes cleanly.
- The welcome strip renders all four pills with the expected computed style (`display:flex`, `border-radius:999px`, `::before` check mark applied) — so the new CSS is actually in the cascade and not silently dropped.
- Boot-degradation paths: with `chrome.storage.local.get` rejecting, the panel still renders (composer + settings present, 4 pills) and **no write is attempted**; with `setAccessLevel` absent entirely, the app boots fully and persistence still works.

## Still UNVERIFIED / BLOCKED — stated plainly

- **Pixel screenshots: BLOCKED.** The available in-app browser reported a 0×0 hidden surface, so `take_screenshot` could not produce an image. Layout was verified through computed styles and DOM structure, **not** by looking at rendered pixels.
- **Responsive widths: BLOCKED.** No viewport/device-emulation control was available, so the 375 px / 720 px / 900 px media-query behavior was not re-observed. It remains read-verified only (`.welcome-points` uses `flex-wrap`, so it inherits the existing wrapping pattern). MANUAL-QA items 22 and 29 cover the manual pass.
- **Screen-reader behavior: UNVERIFIED.** No AT in this environment. The live-region change is reasoned from the ARIA spec plus the render path.
- **Extension-runtime UI: UNVERIFIED** — permission prompts, side-panel hosting, real page automation and the Reach review dialog all require loading the unpacked extension in Chrome. MANUAL-QA items 11–30.

## UX observations carried to the roadmap

- Research `activity` renders as a `<details>` log, but the structured `answer.researchTrace` is still persisted and never surfaced — a one-expandable-panel win for trust in research answers.
- The agent's `deferred` result is currently visible to the model but rendered in the activity stream like any other action; a distinct "not run" visual state would make the safety behavior legible to users.
- Export still omits research activity.
- `renderText` keeps its odd-fence edge case (an unterminated ``` treats the remainder as code) — cosmetic, accepted, unchanged.
- `runAgent` writes its step log into `answer.content`, so the transcript and the final summary share one text block; separating status from answer would make long runs easier to read.
