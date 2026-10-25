# Manual Chrome acceptance checklist (not executed here)

1. Load dist unpacked; confirm manifest acceptance, icons, no worker errors and toolbar opens native panel.
2. Approve a provider host and deny it in a second trial. Verify clear errors and no generation without grants.
3. List models and manually enter a model; test real Chat Completions and Responses with a low-quota account.
4. Stop mid-stream, close/reload mid-stream, verify checkpointed output is interrupted and not replayed as complete.
5. Regenerate a latest answer; verify a new paid request, preceding assistant answer omitted from replay, no duplicate user message.
6. Open full workspace during idle; verify the old panel loses ownership and the new tab acquires it. Try two tabs; close owner and Try again.
7. Capture page/selection after toolbar action; inspect preview and remove references. Check restricted Chrome pages fail gracefully.
8. Right-click selected text with panel closed/open; verify draft is never automatically sent.
9. Attach supported text files; reject oversized/binary files; enforce reference count; edit preview.
10. Render hostile HTML, javascript: URLs and image Markdown; verify no execution or remote image fetch. Verify legitimate citations open safely.
11. Toggle history off, close/reopen; verify chats are not restored, but explicitly saved memory notes still exist. Delete all data and confirm removal of profiles, notes, keys and provider grants.
12. Restart browser/reload extension; verify saved keys persist and local history follows settings.
13. Test theme contrast, narrow 320px panel, tab navigation, dialog Escape, screen reader labels and OS keyboard shortcuts.
14. Exercise 401/403/404/429, malformed SSE, custom HTTPS, unavailable local server, HTTP redirect and server-origin rejection.
15. Enable supported hosted search and confirm actual provider search events/citations. Do not equate the toggle alone with verified search.
16. Inspect all outgoing requests with DevTools; confirm only selected provider traffic and clicked citation navigation.

Record Chrome version, OS, endpoint, model, API format, date and observed result for each provider test. Never record raw credentials.

17. Agent mode: open a normal test page (e.g. local form), click Agent: act on page, approve site grant, confirm 1 fill + snapshot verify. Check sensitive fields are skipped, cancel stops the run, and no submit is clicked.

## 2.1 UX, persistence, and smart context
- Save a provider key, restart Chrome, reopen Orbit, and confirm the key status says saved without entering it again.
- Change the API base to an endpoint with a previously saved key; confirm model discovery can run without retyping the key.
- Use Connect & fetch models; verify discovered IDs populate the dropdown and choosing one updates the manual ID field.
- Ask “summarize this page” on a normal webpage; grant access and verify a fresh page-context chip appears before generation.
- Ask a question unrelated to the page; verify Orbit does not capture page text.
- Select Screenshot; confirm visible-tab capture is previewed and removable before sending. Test a text-only model and confirm failure is explicit rather than claiming no image was attached.
- Open three chats and verify Back/Forward revisits recent conversations without changing browser-page history.
- Verify A−/A+ and Settings → Appearance persist after restart. Check Small through Extra large at 375 px and desktop widths.
- At 375 px, confirm the history drawer opens, traps no content behind fixed layers, and all controls remain at least 44 px high where practical.

## Agent Reach research (added 2026-10-25; not executed in this environment)

11. With Agent Reach 1.6+ installed and the bridge registered, open Settings → Reach: installer command shows this extension's ID; Refresh declared capabilities lists channels (web, github, youtube, bilibili, v2ex by default) with actions/backends and declared login metadata.
12. Run Research with Reach on a URL question; verify the review dialog shows the exact request, Approve performs it (activity log reports channel/backend and item count), Decline makes no network request but consumes a proposed-call slot, and Stop aborts cleanly.
13. Verify at most 4 proposed calls per run; unsupported/declined proposals never reach the bridge; final answer cites only observed [n] sources; provider-hosted web search stays off during the run.
14. Without the bridge installed, verify the Reach panel and a research run fail with the distinct bridge-not-installed hint, and chat/agent features still work.
15. Accessibility pass: all dialogs announce names (settings, Reach review, page context, page tools); keyboard-only operation of Reach review (Tab/Enter/Escape) and sidebar resize (arrow keys).
