# Orbit AI 4.0 — the roster, the cards, the skins

Orbit 4.0 is a port of the parts of [OpenMausBot](https://github.com/milind-soni/OpenMausBot) that
survive the move from a self-hosted Electron app to a single Chrome extension. No backend, no process of
its own, no new dependency. The research behind it, including what was deliberately left behind, is in
[modernization/OPENMAUSBOT-RESEARCH.md](modernization/OPENMAUSBOT-RESEARCH.md).

Three ideas, in the order they change the app:

1. **One assistant with one voice was the wrong shape.** Orbit now has a roster.
2. **A question is a message, not a modal.**
3. **A skin is a block of tokens.**

## The roster — up to 8 personas

A **persona** is a name, a role, an accent colour, a standing instruction and an optional model
override. The strip at the top of the sidebar shows them with a presence dot; the header pill shows who
is answering and which model; the pill opens a panel that switches *and* edits, because "who is
answering" and "how they answer" are the same question.

- **A persona never carries a credential.** Keys stay bound to the endpoint they were saved for, so
  switching persona cannot move a key to a host you did not choose. A persona contributes exactly one
  thing to the request: `{model}`.
- **`@Name`** in the composer routes the turn to that persona and is stripped before the model reads it.
  Typing `@` offers completions; Enter picks one before it sends.
- **The roster strip filters** the conversation list. "All" clears it. Selecting a conversation selects
  its persona, so the two never disagree.
- Instructions are added to the system message under the persona's own name, after the skill brief and
  before your custom instructions.

## Approval is a card in the transcript

The per-step gate used to be a `<dialog>`. It hid the page the question was about, it could not be
re-read afterwards, and if you looked away the run waited behind a box you had to find again.

Every ask is now a message in the conversation:

| kind | what it asks |
|---|---|
| `approval` | run this step? Allow / Stop the run, with the action in a monospace block |
| `question` / `options` | a closed question with up to four choices |
| `secret` / `signin` | still masked dialogs — a password field needs focus, and a hand-back needs the run to stop |

A settled card keeps its record (`Approved`, `Denied`, `Answered: …`). `Stop` releases every card the run
is blocked on; a card whose run died with the last panel is marked `Expired` at boot rather than left
with buttons that answer nothing. The modal remains only as the fallback for a document with no panel, so
the operator loop stays testable in node.

**Needs you** is one list, fed by open cards, tasks waiting for input and routines that came due — in the
sidebar, and as a bar above the composer that scrolls back to the card.

## Agent steps are chips, not prose

Run steps used to be appended to the answer body, which meant the transcript and the model's own log were
the same string, and the model re-read its log on the next turn. Steps are now structured activity rows —
glyph, text, step number — in a collapsible block, and the answer body is a one-line outcome. The replay
filter skips assistant rows with no content, so a card or an activity log is no longer sent back as an
empty turn.

## Presence

`working`, `waiting` and `idle`, derived from the facts the panel already has. A run blocked on a card is
`waiting`, not `working` — an agent that stalls must not look busy.

## Four skins, as token blocks

`midnight` (dark, cool), `daylight` (light, cool), `atelier` (daylight on paper), `foundry` (a dark room
with warm light). A skin is a block of custom properties under `[data-skin]`, so switching one is an
attribute write and a new skin needs no component edits. Every text/surface pair clears WCAG AA at body
size. The header's `◐` cycles them; Settings → Appearance picks one.

## Read aloud

A **Read aloud** action on any finished answer, plus an opt-in auto-read and a voice picker in
Settings → Appearance. This uses the speech engine Chrome already ships: no key, no network, no billing.
Markdown is rewritten first — code becomes "[code block]", links keep their destination — because reading
"asterisk asterisk" aloud is worse than not reading it.

## Routines

A prompt that comes back on its own: every N minutes, daily, or on weekdays at a time. Bounded to 12
routines, a 15-minute floor and a 4,000-character prompt.

**What a routine can honestly do in an extension:** `chrome.alarms` wakes the service worker, and the
worker marks the routine due and badges the toolbar icon. If no Orbit surface is open, the run happens
the next time you open one. Nothing is pretended to have run in the background — the settings tab says
so, and so does this file. A routine run goes through the ordinary send path, so it streams, saves and
exports like a typed message; page context is skipped, because a scheduled prompt has no tab you chose to
share.

## The shell

- Header: back/forward, the persona pill, then Regenerate, Read aloud and `⋯`. The overflow holds text
  size, export, skin, float and full workspace, so the pill has room at 400 px.
- Sidebar: roster strip, New conversation, What's new?, search, Needs you, Tasks, history with a persona
  dot per row.
- Transcript: avatar, name, time, prose, cards, activity, sources, then actions on hover.
- Composer: one row — `+`, textarea, Agent split, Send — with the mention list above it.

## Fixed while porting

- `[hidden]` did not hide. Every author `display` rule outranks the user-agent rule for the attribute, so
  the Stop button and the read-aloud icon stayed on screen when they were meant to be gone.
- `main` gained a fifth row, and a hidden grid item shifted every row below it — which put the `1fr`
  track on the status line and pushed the composer off the viewport. Rows are now placed by name.
- The composer row had no flex rule at all, so its controls stacked.
- The assistant body was boxed as a quotation with a left rule; it is prose now.
- The shortcut hint inside a filled button was `--inverse` at 72%, which is unreadable on a light skin.

## Upgrade notes

- Storage keys are unchanged (`orbit`, `orbitKeys`, `orbitModels`, `orbitUI`, `orbitMemories`). Chats
  gain an optional `persona`; a chat without one falls back to the first persona.
- `state` gains `roster`, `routines`, `skin`, `autoSpeak`, `voiceURI`. A stored record without them is
  normalized at boot, so an upgrade keeps every setting.
- `manifest.json` gains `alarms` (the scheduler's own permission) and reports `4.0.0`.
- `theme` is still stored for compatibility but is derived from the skin now.

## Tests

261 tests, 0 failures (was 210). New: `personas` (15), `cards` (7), `routines` (10), `voice` (5) and
`roster-surface` (14) — the last one gates the browser-only wiring the way `openbot-surface` gates the
OpenDuet-era surface. `npm run check` covers all 16 modules.
