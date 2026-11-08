# Orbit AI 4.3 — the Arena dock

You asked for Arena to live inside Orbit's workspace instead of a stray tab. One
blocker had to be respected first: **arena.ai itself forbids being embedded** — it
sends `X-Frame-Options: SAMEORIGIN` and a `frame-ancestors` allowlist, so no client
can frame it, an extension page included. The dock is the honest answer to the same
wish: not an embed of the site, but a **view of the relay inside Orbit**, in both the
side panel and the full-tab workspace (they are the same page, so one component
serves both).

## What the dock shows

A slim bar at the top of the transcript, above the "Needs you" strip:

- **Live status** — `Not connected · Signed in · Signed out · Waiting for you to sign
  in · Generating… · Answer ready · Failed`, plus the model when one is working.
- **The latest Arena answer inline** — the last ~600 characters of the most recent
  brief or answer, scrollable.
- **Two buttons** — **Connect Arena…** (the same sign-in hand-back as Settings) and
  **Open Arena tab**. Plus **×** to hide.

Behind the bar, while nothing is in flight, the dock peeks at the relay tab every ten
seconds (`arenaAuthPeek` — read-only, never focuses, never creates a tab) so the
status stays true between runs. While generating or waiting, it trusts the run
instead of guessing. Anything it cannot know leaves the phase untouched.

## Controls

- **Settings → Connection → Arena → "Show the Arena dock"** (checkbox, on by default,
  visible only for the Arena preset). The dock's own **×** does the same thing.
- The collapse chevron on the bar persists (`orbitUI`), so the dock can be a one-line
  presence.

## Layout note, written down because it bit once already

`main` is a grid whose rows are placed explicitly (`grid-row: N` per child), so a
hidden child empties its row instead of shifting the ones below it. The dock took
row 2 and every child moved down one — the transcript keeps its `1fr` track with the
dock present *and* absent. A static gate pins the template, the placements, and the
absence of any `<iframe>` in the panel document.

## Upgrade notes

- No new permissions; `state.arenaDock` (default on) and `ui.arenaDockCollapsed`
  join the persisted state; everything else is unchanged.
- Version reports `4.3.0`.

## Tests

302 tests, 0 failures (was 301). New: the dock wiring gate in `roster-surface` (1),
extended to the peek in `arena` (1); `verify-arena` gains two live checks (dock
renders in its own row with no iframe; the dock mirrors the sign-in wait).
