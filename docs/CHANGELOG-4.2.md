# Orbit AI 4.2 — the Arena research pipeline

Arena (arena.ai) is already a first-class, keyless provider in Orbit: a dedicated relay
tab drives the site the way a person would, and the answer streams back. 4.2 builds the
workflow on top of that relay: **one question goes to Arena, the roster reviews the
brief, a synthesis follows.** No API key, no new permission, no new dependency.

## Gmail sign-in, done honestly

A login wall used to be a dead end that told you to go and sign in somewhere. Now:

- **Connect Arena…** sits in Settings → Connection under the Arena preset. It brings the
  relay tab to the foreground; you click "Continue with Google" and finish every Google
  screen yourself; Orbit watches the tab and flips to **"Arena is signed in."** the moment
  the wall clears — usually before you have switched back.
- Mid-run, the same flow is a **sign-in card** in the transcript (`↪ A sign-in is needed`).
  The pipeline pauses, the card waits, and the run resumes on its own after you sign in —
  with exactly one automatic retry. A card that survives a repaint cannot be answered twice.
- The watcher never clicks. Not the Google button, not Agree. A Terms dialog during
  sign-in stops the run with the review-it-yourself message, exactly as a request does.
  The relay tab is never navigated mid-OAuth, and the relay no longer abandons a tab that
  is sitting on a Google sign-in host (which used to strand the session and spawn a second
  tab).

## The pipeline

`/research <question>` or **Agent menu → Research with Arena**:

1. **Arena** — the question goes through the relay to the Arena model chosen in Settings
   (one message of your daily credits). The brief streams live into its own message,
   signed `Arena · <model>`.
2. **Fan-out** — every other persona in the roster (up to 3) reads the brief under a role
   of its own: **verify the claims**, **challenge the gaps**, **plan the implementation**.
   Each review is its own message in the transcript, attributed to the persona. A persona
   failure is a chip, not a stopped run. Personas contribute `{model}` only, exactly as
   everywhere else — keys stay bound to their endpoint.
3. **Synthesis** — the persona you are talking to writes the final, decision-ready answer:
   ordered steps, disagreements taken positions on, and the brief's "Not verified here"
   items carried forward.

Every stage is an activity chip; Stop works at any point; one stage failing never sinks
the stages after it. The prompt builders and the fan-out selection live in
`src/research.js`, pure and node-tested; the prompts treat the brief and the reviews as
untrusted model output, the same way page text is treated.

With only one persona in the roster the pipeline says so and runs research → synthesis.

## The Agent can call it too

Two new supervised tools in the operator vocabulary:

- `research_arena` — one question to the relay, the brief comes back as an observation
  (truncated at 14,000 characters, with a visible marker). Costs one Arena message.
- `ask_persona` — hands a question to one named persona from the roster and returns its
  answer, attributed.

Both are deliberately **not** hands-free or autopilot-silent: spending your credits is a
decision you make, so each call shows in the approval gate, exactly like `memory_save`.
A refusal (no Arena model configured, no grant, unknown persona) is an observation the
model can adapt to, never a crashed run. The handlers live in the panel — agent-run sees
two async functions that resolve or refuse.

## Fixed while building

- `id="attach"` was on two elements (the composer `+` and the context dialog's Attach
  reference), so opening a page preview silently rewired the composer's menu opener to
  attach instead. The dialog button is `attachRef` now, and a static test makes any
  duplicate id in `dist/index.html` a test failure.
- The full-suite count gates (which callers must go through `ensureChat`, for instance)
  learned the two new legitimate callers.

## Upgrade notes

- No storage keys change; no new permissions (`alarms`, `tabs`, `scripting`,
  `optional_host_permissions` as before — arena.ai rides the per-site grant it already
  used). Manifest and package report `4.2.0`.
- A new skill exists (`/research`, triggers only on "deep research") so the slash command
  resolves; it cannot narrow any toolset (`tools: []`) and its brief only shapes chat
  around an already-run pipeline.

## Honest limits

- Arena remains text-only and relay-driven: each request foregrounds the relay tab for a
  few seconds, and every Arena call costs one message of your daily credits — the chips
  say so before it happens.
- Arena's Terms prohibit automated access without permission; a signed-in session is not
  permission. Orbit drives your own signed-in tab the way the provider preset always has,
  and still never accepts legal terms or solves sign-in challenges for you. Use an
  authorized API provider for anything that needs reliable autonomous volume.
- Reviews run on your answer provider, one call each; if that provider is Arena, each
  review is another daily-credit message, and the chips tell you.

## Tests

301 tests, 0 failures (was 276). New: `research` (12), the Arena sign-in watcher and
auth-state driver (7), the agent research tools (5), the pipeline wiring gates in
`roster-surface` (1), and the duplicate-id guard in `hardening-static` (1).
