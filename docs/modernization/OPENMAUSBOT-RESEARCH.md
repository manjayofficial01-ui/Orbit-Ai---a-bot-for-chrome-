# OpenMausBot → Orbit 4.0

Research and port notes, 1 November 2026.

Source: [`milind-soni/OpenMausBot`](https://github.com/milind-soni/OpenMausBot) — Apache-2.0, ~10k stars,
7.5k commits at the time of reading. Inspected by sparse clone (`src/`, `server/`, `shared/`, `docs/`,
`skills/`): 1,684 files under `src/`, 820 component files, a 3,075-line stylesheet.

This is not a feature checklist copied from a README. Each claim below was checked against the source,
and each port decision says what was taken, what was left, and why.

---

## 1. What OpenMausBot actually is

A local-first desktop app (Electron) that presents AI agents as a **messaging app**. The harness server on
`127.0.0.1:8799` owns every agent process; the React app on `5199` holds no transports — it sends typed
commands over HTTP and folds one SSE stream into state. Agents are the `claude` / `codex` / `grok` CLIs
already installed on the machine, using the person's existing logins.

Three properties matter for a browser extension:

1. **The roster is the product.** "One assistant in one box is the wrong shape for agents" is the stated
   thesis, and every surface is built around it: bots are contacts, each with a face, a colour, a model,
   a computer and a set of connected apps.
2. **A question is a message.** Approvals, questions, secrets, sign-ins and connector requests are all
   *message kinds* rendered inline in the transcript, not modal dialogs.
3. **The design system is tokens, not paint.** A skin is a block of CSS custom properties; eleven of them
   ship (`midnight`, `atelier`, `foundry`, `lagoon`, `graphite`, `linen`, `dusk`, `daylight`, `meadow`,
   `pop`, `halloween`), each verified against WCAG AA by measuring rendered pairs
   (`scripts/check-skin-contrast.mjs`).

### The message-kind taxonomy (`shared/wire.ts`)

```ts
kind: "text" | "options" | "activity" | "screen" | "connector" | "secret"
    | "signin" | "routine.run" | "goal.run" | "digest" | "compaction"
    | "call" | "widget" | "app"
```

### The presence model (`shared/wire.ts`)

```ts
type BotActivity = "working" | "waiting-on-you" | "idle" | "no-signal" | "dead" | "parked.computer";
```

`waiting-on-you` is a first-class state, separate from `working`. That distinction is the single most
useful idea in the repo: an agent blocked on a person must not look busy, or a stalled run reads as
progress.

### The card shell (`components/AskCard.tsx`, `ApprovalCard.tsx`)

One shell serves every kind: an asker header (the bot's face and name, plus where the ask came from),
a title, an explanation, a body, and a footer of choices. A settled card keeps its outcome — `Allowed`,
`Denied`, `Undone`, `Timed out`, `Expired` — with an Undo where the change is reversible.

---

## 2. What transfers to a Manifest V3 extension, and what cannot

Orbit is a single extension with no backend, no process of its own, and a service worker that Chrome
kills when idle. That rules out a large part of OpenMausBot by construction. Being explicit about it is
the difference between a port and a costume.

| OpenMausBot capability | Transfers? | Decision |
|---|---|---|
| Roster of bots with names, colours, roles, per-bot model | **Yes** | Ported as **personas**. A persona is a name, role, accent, standing instruction and optional model override. |
| Presence (`working` / `waiting-on-you` / `idle`) | **Yes** | Ported, derived from the facts the panel already has (an open card, a task needing input, a running turn). |
| Inline approval cards with a settled record | **Yes** | Ported. The per-step gate is now a card in the transcript; a modal remains only as the bare-document fallback. |
| Question cards with choices | **Yes** | Ported (`kind: 'question' | 'options'`). |
| Activity rows for tool runs | **Yes** | Ported as collapsible activity chips with a type glyph and a step number. |
| A "needs you" surface | **Yes** | Ported as one list fed by open cards, tasks needing input and due routines, in the sidebar and above the composer. |
| Skins as token blocks | **Yes** | Ported, four skins (`midnight`, `daylight`, `atelier`, `foundry`), each clearing AA. |
| Read replies aloud | **Yes, differently** | OpenMausBot uses hosted voices (ElevenLabs, Fish, Grok) behind keys. Orbit uses `speechSynthesis`, which needs no key, no network and no billing. |
| Routines (schedules) | **Partly** | `chrome.alarms` exists, but a worker that is asleep cannot run a supervised turn. Ported as: the alarm marks a routine due and badges the action; the next Orbit surface that opens runs it visibly. Stated in the UI, not hidden. |
| `@bot` addressing | **Yes** | Ported. `@Name` routes the turn and is stripped from the request. |
| Channels / rooms | **Partly** | Not ported. A channel in OpenMausBot has its own transcript, working folder and roster. In a single-window extension that is a filter, not a room; the roster strip filters conversations instead. |
| Cloud computer / live screen preview | **No** | Needs a VM per bot. Orbit's equivalent is the tab it is already looking at. |
| Composio connected apps (OAuth marketplace) | **No** | Needs a server to hold OAuth tokens. Orbit has no backend and no place to keep them. |
| Local `claude` / `codex` / `grok` CLIs | **No** | An extension cannot spawn processes. Orbit's bring-your-own-endpoint is the same idea at a different layer: the brain is yours, the transport is HTTPS. |
| Electron shell, phone pairing, MCP server, headless CLI | **No** | Each needs a process that outlives a browser tab. |
| Team/dept sharing as one Markdown file | **No** | Orbit has no server to share through; export/import of a persona is the honest subset and is not built yet. |

---

## 3. Gap analysis against Orbit 3.5

What Orbit already had: BYOP with any OpenAI-compatible endpoint, supervised agent loop with per-step
approval, tasks, check-in, skills, learned memories, OCR, screenshots, four instruction styles, a
two-theme (light/dark) stylesheet, and a transcript of text rows.

What it did not have, in the order it hurt:

| Gap | Why it mattered | What 4.0 does |
|---|---|---|
| **One identity** | A reviewer, a researcher and a form filler want different standing instructions. Orbit forced one instruction block on all of them. | Roster of up to 8 personas, each with a role, accent, instructions and optional model. |
| **Approval was a modal** | It hid the page the question was about, could not be re-read, and if you looked away the run waited behind a box you had to find again. | Approval is a card in the transcript with Allow/Deny, a settled record, and a "needs you" bar that scrolls back to it. |
| **The agent's steps were prose** | Steps were appended to the answer body, so the transcript and the model's own log were the same string — and the model re-read its log next turn. | Steps are structured activity chips; the answer body is a one-line outcome; the replay filter skips assistant rows with no content. |
| **No presence** | A run blocked on a question looked identical to a run that was thinking. | Presence dot per persona and in the header pill, with `waiting` distinct from `working`. |
| **Two themes** | Light/dark only, and the light theme was a neutral grey-green. | Four skins as token blocks, including two warm ones, each AA-checked. |
| **Silent output** | Reading a long answer meant reading it. | Read aloud per answer, plus an opt-in auto-read, using the browser engine. |
| **Nothing ran on a schedule** | "Summarize my tabs every morning" had no home. | Routines with interval / daily / weekday schedules, alarms, and an honest statement about what a sleeping worker can do. |
| **No way to address a persona** | — | `@Name` completion in the composer. |

---

## 4. What was built

### New modules (pure logic, tested in node)

| File | Holds | Tests |
|---|---|---|
| `src/personas.js` | roster normalization, add/update/remove/select, presence, mention parsing, accents | `tests/personas.test.mjs` (15) |
| `src/cards.js` | card model, settle/outcome, keyboard choice, presenter injection, DOM builder | `tests/cards.test.mjs` (7) |
| `src/voice.js` | markdown → speakable prose, feature detection, speak/stop | `tests/voice.test.mjs` (5) |
| `src/routines.js` | schedule normalization, next-run math, due list, descriptions, alarm names | `tests/routines.test.mjs` (10) |

`tests/roster-surface.test.mjs` (14) gates the browser-only wiring the way
`openbot-surface.test.mjs` gates the OpenDuet-era surface: the roster is a surface, a persona never
carries a credential, an approval is a card with a dialog only as fallback, Stop releases every card,
skins are token blocks, and `[hidden]` actually hides.

### The one property the port had to keep

**A persona never carries a credential.** OpenMausBot's bots own their own provider logins because each
bot *is* a process. Orbit's keys are bound to an endpoint (`keyFor(base)`), so a persona contributes
exactly one thing to the request — an optional `model` override. Switching persona therefore cannot move
a key to a host you did not choose. `tests/roster-surface.test.mjs` asserts this.

### Design decisions worth naming

- **Skins are `[data-skin]`, not `:root[data-skin]`**, so any subtree can open a skin context — the
  picker could paint a live swatch without a mockup. `data-theme` still travels alongside, because
  `color-scheme` and the native scrollbars read it.
- **Accent plates blend toward the ink** (`color-mix(accent 62%, text)`), so one accent class works on a
  dark and a light skin without a second palette.
- **`[hidden]{display:none!important}`** is load-bearing. The 3.x stylesheet gives controls an author
  `display`, which outranks the user-agent rule for the `hidden` attribute — the Stop button and the
  read-aloud icon were visible when they were meant to be gone.
- **Grid rows are placed by name**, not by document order, because the "needs you" bar is hidden most of
  the time and a hidden grid item shifted every row below it — which put the `1fr` track on the status
  line and pushed the composer off screen.

---

## 5. Verification

- **Unit + static:** `npm run test:extension` — 261 tests, 0 failures (was 210 before this work).
- **Syntax:** `npm run check` — 16 modules.
- **Boot, in a real browser:** `dist/` served over loopback with a stubbed `chrome` API and `app.js`
  loaded as-is in headless Chrome. Confirmed: boots with no console error, applies the persisted skin
  (`data-skin="atelier"` → `--primary:#9c5520`), renders three roster chips, three history rows, the
  welcome state, an inline approval card, activity chips, a settled question card, the persona dialog and
  the Persona/Routine settings tabs (a seeded routine renders as "Weekdays at 08:30 · In 17 hours").
- **Not verified, stated plainly:** the extension runtime itself (side panel hosting, permission prompts,
  a live `chrome.alarms` fire, real speech output) needs the unpacked extension in Chrome. A card
  answered mid-run, the alarm → due → run path, and speech playback are covered by source-level gates
  only. `docs/MANUAL-QA.md` carries the manual pass.

## 6. What was deliberately not copied

OpenMausBot is ~1,684 source files and 820 components. Orbit is 16 modules and one stylesheet with no
dependencies. Copying the structure would have meant copying the build. What was copied is the *shape*:
a roster, presence, questions as messages, and a skin as a token block. Everything else — cloud
computers, connected apps, CLIs, phone pairing, teams — is left where it belongs, in an app with a
server behind it.
