# Orbit AI 3.2 — the one-row composer

The composer had grown into two rows of nine buttons plus a style dropdown, an Expand
toggle, and a footer action row — most of it sharing purposes. 3.2 redesigns it to what
an agent chat actually needs: **one row**, with everything else one click away in two
menus. No behavior changed; every removed control kept its exact handler.

## The composer now

```
[+]  [prompt — grows as you type]  [Agent ▾]  [↑]
```

- **[+] Attach menu** — everything that adds context, consolidated: **Add page…**
  (the old Add page dialog: read, fetch by URL, all-tabs digest, field write),
  **Screenshot**, **Attach file**, and **Skills…** (the old Skills menu, unchanged).
- **Agent ▾** — the main click runs the supervised agent on this page, exactly as
  "Act on page" did. The caret opens the mode menu: **Act on this page**,
  **Research with Reach**, and **Start as task** — the three ways a typed ask becomes
  work. Research and task stay disabled until there is text to run, with a line saying
  why.
- **↑ Send** — icon-sized; **Stop** takes its place while a run is in progress.
- The prompt **auto-grows** with the draft (up to ~180px) instead of reserving four
  empty rows; the Expand toggle is gone because it is no longer needed.

## Where the other controls went

| Old control | Now |
|---|---|
| Act on page / Task / Research with Reach (3 buttons) | One Agent button; the caret menu picks the mode |
| Add page / Screenshot / File (3 buttons) | One + menu |
| Skills | + menu → Skills… |
| What's new | Sidebar, under New conversation — it is a workspace-level sweep, not a message action |
| Assistant style dropdown | Settings → Context (now saved with your settings) |
| Expand | Removed — the prompt auto-grows |
| Regenerate / Export | Header icon buttons (↻ / ⤓) |
| Delete (footer) | Removed — the sidebar's per-conversation × already deletes, with the same confirmation |

The footer row ("Page context is opt-in…") moved into Settings → Context as a note.

## Implementation notes

- The menus are fixed-position bubbles anchored above the button that opened them, so
  they work in the side panel, the floatable window, and narrow widths.
- `scripts/verify-in-chrome.mjs` was updated for the new shape: the layout-overflow
  check targets `.composer-row`, and the capture check opens the + menu and picks
  Screenshot from it — proving the consolidated path really reaches the old handler.
- Tests: the surface gates now lock the one-row shape (exactly one `.composer-row`, no
  `.toolbar`), the menu items carrying the old handlers, and the sidebar check-in.
  223 extension + 12 native tests, 0 failures.

## Manual checks

In `docs/MANUAL-QA.md`, Cycle 13 (items 68–73): the one-row composer at panel width,
both menus, auto-grow, and the mode menu's disabled state.
