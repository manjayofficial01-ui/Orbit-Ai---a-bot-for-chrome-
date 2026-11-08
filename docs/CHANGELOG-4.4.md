# Orbit AI 4.4 — the two-sided Arena

You saw it exactly right: Orbit typed into arena.ai like a person, and nothing came
back — one-sided. Deep research against two working 2026-era arena.ai automation tools
([dexforint/arena-utils](https://github.com/dexforint/arena-utils),
[ogglobi/lmarena.ai-chat-downloader](https://github.com/ogglobi/lmarena.ai-chat-downloader))
found three reasons the read side was dead, and everything needed to fix it for real.

## Why the answer never came back

1. **After a send, arena.ai navigates the chat to `/c/<chat-id>`.** The relay pinned
   every read to the *pre-send document*, so the moment the page navigated, reads hit a
   dead document. The reads now follow the live document (origin-guarded as always), so
   navigation is survived, not fatal.
2. **The transcript is `ol.flex-col-reverse`** — DOM order runs opposite to the visual
   order, so taking the last `.prose` node could return the oldest message, even your
   own prompt. The read now classifies message roots (right-aligned `justify-end` /
   `self-end` = the person; the rest = the model) and picks the **last assistant bubble
   in visual order**, computed from `flex-direction`, never document order.
3. **Completion was gated on a "stop generating" button that may not exist**, so the
   loop could settle on the prompt echo. Settling now requires: a *new* assistant
   answer (≠ the pre-send page, ≠ the prompt itself), stable across four polls, one
   confirmation re-read, send button enabled (`disabled` **and `aria-disabled`**).

Also aligned with the live site: composer `textarea[name="message"]` (with fallbacks),
React-safe insertion (value-tracker reset + real `InputEvent`), canonical path
`/text/direct?model_a=…`, and every timeout error now carries a **DOM census**
(`list=ol roots=2 msgs=2 rev=1`) so a future redesign is diagnosable from the error
text alone. A shadow-piercing fallback runs only when the shallow read finds nothing.

## The proactive half: Orbit now watches for answers it never sent

The dock's ten-second peek (`arenaDockPeek`) now reads the relay tab's latest assistant
answer and fingerprints it (`src/research.js`, whitespace-blind). When the tab holds an
answer Orbit has never ingested — **whether Orbit sent that request or you typed it
into Arena yourself** — the dock flips to:

> **New answer ready — pull it in**

**Pull into Orbit** (a dock button) puts the answer into the transcript, attributed
`Arena · pulled`, then asks once with a card: **Fan this answer out to the roster?**

- **Fan out** runs the existing verify / challenge / plan pipeline plus synthesis with
  the pulled brief — the Arena stage is skipped entirely, so it costs **zero Arena
  credits** (you already paid for the answer). The original question is recovered from
  the relay tab's latest user bubble.
- **Keep it** just keeps the message.

Every ingestion point (research brief, agent `research_arena`, an Arena chat answer, a
pull) records the fingerprint it consumed, so the dock never re-offers something Orbit
already has — and never misses something it doesn't.

## Upgrade notes

- No new permissions, no new storage keys. Version reports `4.4.0`.
- `arenaAuthPeek` became `arenaDockPeek` (auth + answer + prompt in one read-only peek).

## Tests

310 tests, 0 failures (was 302). New: the driver-v2 fixtures (a small DOM stub proving
visual-order picking, prompt-echo exclusion, `aria-disabled` handling, unpinned reads,
census-in-timeout), the fingerprint tests, and the two-sided wiring gates.
`verify-arena` checks the Pull button in real Chrome. The signed-in happy path —
Orbit → Arena → answer streams back; you type in Arena → dock flips → Pull → fan-out —
is MANUAL-QA Cycle 19 (103–106), because it needs your Google session.
