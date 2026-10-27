# Orbit AI 3.5 — Reach removed, Autopilot added, full access grant fixed

Three changes, one goal: the agentic feature, working.

## Reach removed

The Reach research feature is gone — the "Research with Reach" menu item, the
Settings → Reach tab and its review dialogs, the research loop, the native-messaging
bridge (`nativeMessaging` permission, `native-host/`, its installer and tests), and all
of their tests. Reach shared nothing with the agent loop — but it sat in the Agent
menu as a heavily-gated mode (every search needed review), which read as "the agent"
and felt the opposite of agentic. The Agent caret menu now carries only Orbit's own
modes: **Act on this page** and **Start as task**. Old conversations keep their
research transcripts (rendered as plain "Run activity"); provider-hosted web search in
Settings → Advanced is the remaining research path. Removing a permission and code can
only shrink the surface.

## Autopilot (opt-in) — Settings → Context

The agent now runs **24 steps** (was 8), and a new **Autopilot** setting makes it genuinely
autonomous: every step — clicks, typing, navigation, writes — executes without the
per-step dialog. Two things still pause, by design:

- **A form-submitting Enter** always asks. Submitting a form is the one action this
  project never takes silently.
- **Secret and hand-back requests** pause anyway — the masked box and the hand-back
  dialog ARE the ask.

Every auto-approved step is announced in the transcript ("Autopilot: ran without
asking — click, scroll"). Autopilot implies Hands-free reading. Both are opt-in and
off by default; the default agent still asks per step. This is the escalation of the
autonomy ladder: approval per step → Hands-free reading (reads run free) → Autopilot
(everything but submit runs free).

## Full access: the grant that wouldn't show

Chrome can suppress its permission prompt while an extension surface is open, and an
`await` before `permissions.request()` can break the user-gesture chain — either makes
the in-panel "Full access" toggle look dead. The handler now fires the request as the
first act inside the gesture, and if Chrome still does not show the prompt the error
names the always-works manual path: **chrome://extensions → Orbit → Details → Site
access → On all sites** (also added to the setting's own description; the checkbox
syncs from Chrome on the next boot either way).

## Verification

`npm test` — 210 extension tests, 0 failures (the three Reach suites are gone).
`npm run check` passes. New coverage: autopilot runs a mutating step without the gate,
still asks before a submitting Enter, and the settings carry both autonomy fields;
static gates pin the autopilot transcript line and the removed Reach surface.
Live-panel checks: `docs/MANUAL-QA.md`, Cycle 16 (items 84–88).
