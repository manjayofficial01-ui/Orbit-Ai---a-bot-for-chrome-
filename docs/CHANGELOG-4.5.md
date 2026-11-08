# Orbit AI 4.5 — the embedded Arena

You asked three times, so here it is plainly: **the real arena.ai now renders inside
Orbit's workspace.** Not a mirror, not a screenshot — the site itself, framed in the
dock, drivable by you and by Orbit's pipeline.

## The honest part first

arena.ai's server forbids being framed by anyone: it sends `X-Frame-Options:
SAMEORIGIN` and an enforced `Content-Security-Policy` whose only directive is
`frame-ancestors`. No page can embed it — extension pages included. The only way in
is for the extension to override those two response headers locally. This version
does exactly that, and nothing more:

- `declarativeNetRequest` rule `arena-unframe` removes **only** `X-Frame-Options`
  and `Content-Security-Policy` from **only** arena.ai **sub-frames** (a static
  gate asserts all of this — the relay tab keeps its own security headers untouched).
- It applies in your browser, to your session, for your account. Nothing is sent to
  Arena that a normal visit wouldn't send. It is a deliberate local exception, yours
  to revoke (Settings → Arena → **Embed Arena in Orbit**).

## How it works

- The dock gains **"Open Arena here"**: the real site mounts inside the dock body
  (workspace and float window). You can type into it directly — every message is a
  normal Arena message on your account.
- **Frame mode in the relay** (`src/arena.js`): when an embedded frame exists in a
  workspace tab, `relayTarget()` aims every driver at that frame
  (`webNavigation.getAllFrames` → `executeScript({frameIds:[…]})`). `/research`, the
  agent's `research_arena`/`ask_persona`, the dock peek, and model listing all run
  **against the frame — no separate tab during runs, no focus stealing**. The
  dedicated relay tab remains the sign-in surface and the fallback when no workspace
  is open (the side panel's frame is view-only: it has no tab for Orbit to script).
- **Sign-in is unchanged and stays a real tab**: Google blocks OAuth inside frames.
  Connect Arena brings the tab forward, you sign in, the embedded view picks up the
  session on its next load.
- Known limit: if you block third-party cookies, the embedded frame may show a
  signed-out state even after signing in — the dock shows the honest state and
  **Open Arena tab** remains the full-fidelity path.

## What was verified

- Feasibility probes (this session, headless Chrome): with the two headers stripped
  the frame renders (`Target.getTargets` shows a live arena.ai iframe target), and
  `executeScript({frameIds})` reaches its composer.
- `npm test`: **314 tests, 0 failures** — new gates: the surgical scope of the header
  override (two headers, `sub_frame` only, `||arena.ai/` only), relay mode selection
  (frame wins in a workspace, relay tab otherwise), and the embed wiring.
- `node scripts/verify-arena.mjs`: **18 live checks, all passing** — including "the
  framing-header override ruleset is enabled" and "the embedded Arena frame renders
  and is drivable" (real frame, real composer, real `origin: https://arena.ai`).
- The signed-in happy path (type into the embedded Arena; watch `/research` drive it
  with no tab jumping) is MANUAL-QA Cycle 20 (107–109) because it needs your Google
  session.

## Upgrade notes

- New permissions: `declarativeNetRequest`, `webNavigation` (no host permissions added
  — arena.ai rides the optional grant it always had). Version reports `4.5.0`.
- `state.arenaEmbed` (default on) gates the feature; `ui.arenaEmbedOpen` remembers the
  pane. Turning embedding off removes the iframe and the relay returns to tab mode —
  everything else keeps working.
