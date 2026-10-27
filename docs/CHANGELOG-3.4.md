# Orbit AI 3.4 — Full access (all sites)

Site access used to be strictly per-site: the first time the agent visited a domain,
Chrome asked for that one origin, and every path (goto, tab switch, fetch, context,
check-in) had its own grant code. That is the safe default, but it made agentic runs
across several sites a prompt-per-site slog. 3.4 adds the missing tier.

## Full access — Settings → Context

- **Full access — all sites** requests Chrome's optional `<all_urls>` grant **once**.
  From then on the agent, page context, URL fetches, screenshots, the all-tabs digest
  and What's new work on **any** site with no per-site prompt.
- **Revocable in the same toggle**: turning it off removes exactly the blanket grant.
  Per-site approvals already made stay (they were individually approved); **Reset** in
  Settings → Advanced still clears everything.
- **Chrome is the source of truth**: the checkbox is synced from the actual permission
  on every boot, not from stored state — so revoking in chrome://extensions is
  reflected honestly.
- **Never required**: `<all_urls>` remains in `optional_host_permissions` only; a test
  pins that it can never appear in required `permissions`.

## One site gate, everywhere

`ensureSiteAccess(pattern)` (`src/page-access.js`) is now the single gate every page
path goes through: full access counts, an exact per-site grant counts, otherwise one
prompt for that pattern. It replaced the four inline grant blocks in the agent loop
(entry, tab switch, post-navigation, goto), plus the URL fetch, quick page context,
active-tab screenshot, and the all-tabs digest — which also skips its batch request
under full access. `hasFullAccess()` is exported for read-only paths that must never
prompt: the What's-new check-in uses it and names ungranted pages as skipped, exactly
as before.

Unit-tested against a scripted Chrome permissions API: full access short-circuits
without prompting, an exact grant answers without prompting, otherwise one request for
the pattern (which then sticks), and a refused or broken prompt is a plain `false` that
callers already turn into honest "not granted" messages.

## What full access does NOT change

- **The action approval gate is untouched.** Full access is about Chrome's site
  prompts, not Orbit's own approvals: clicks, typing, navigation and writes still show
  the per-step dialog (and Hands-free reading still covers only read-only steps).
- **chrome:// pages stay out** (`pageOrigin` refuses them), the Chrome Web Store stays
  unscriptable, and capture still needs its own one-time all-sites prompt when full
  access is absent.

## Verification

`npm test` — 233 extension tests, 0 failures; 12 native host tests, 0 failures.
`npm run check` passes. New coverage: `tests/access.test.mjs` (5) and the
full-access wiring gate in `tests/hardening-static.test.mjs` (1). The navigation
grant-gating tests were re-pointed at the shared gate; the agent-loop harness now
denies the blanket grant in denial scenarios so the old guarantees hold.

Live-panel checks are in `docs/MANUAL-QA.md`, Cycle 15 (items 79–83).
