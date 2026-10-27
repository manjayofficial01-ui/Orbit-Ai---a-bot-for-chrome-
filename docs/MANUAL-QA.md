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
- Press Fetch models only: verify discovered IDs populate the dropdown, choosing one updates the manual ID field, and the status says it is a list, not a verdict. Press Test connection separately and confirm it reports the named model and elapsed time.
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

## v2.2 capabilities (added 2026-10-25; not executed in this environment)

16. Page tools → Fetch URL as text: paste an https URL (or leave blank to use the selected tab's URL), approve the site grant, verify plain text lands in the preview and attaches as an untrusted reference; verify http:// non-loopback and non-text content types are rejected with clear errors; verify scripts/remote images never run (DOMParser text only).
17. Agent mode tab browsing: with 2+ tabs open, start the agent; verify the confirmation dialog resolves read-tab refs to real tab titles/URLs; approve a switch and confirm the loop continues on the new tab (its origin grant is requested); deny a switch and verify the step fails safely; verify refs from a pre-switch snapshot cannot act on the post-switch page (token guard).

## v2.3 agentic actuator (added 2026-10-25; not executed in this environment)

18. Agent tools: hover opens a real menu (pointer events + settle); press works only with Tab/Escape/arrow keys and refuses Enter; wait pauses 100–800 ms; extract returns a bounded outline (headings/items/links/tables); page-level scroll top/bottom/±px works without a ref. Every tool still passes the per-step approval dialog.
19. Snapshot richness: dropdowns list their options, text fields show a short current value, links show target hrefs, and controls inside shadow DOM (custom elements) are discovered up to depth 3.
20. Click robustness: a click covered by an overlay fails with "Covered by …" instead of clicking through; a target whose label changed since the snapshot is refused; pages get a mutation-quiet settle before re-snapshot.
21. Page tools → Attach digest of all tabs: one permission prompt lists every open site; the digest reads each granted tab's text into a single bounded reference (title + URL + ≤1800 chars each, 24,000 total).

## Modernization cycle 2 (added 2026-10-25; NOT executed in this environment)

22. Assistive technology: start a streamed answer with a screen reader active. The conversation region must not re-announce the entire thread on each repaint; the status line should still announce "Connecting…", "Generating…" and "Done.". Verify at desktop width and 375 px.
23. Approval-origin honesty: with the agent on a page that links to a different site, approve a `click` that navigates. The next step's confirm dialog must name the site the page is now on, not the original one.
24. Tab-switch safety: prompt the agent to switch tabs and click in the same step. Only the switch may execute; the activity log must show the remaining action was deferred, and the next observation must tell the model to re-propose against the new snapshot.
25. Boot degradation: if storage is unavailable (or `setAccessLevel` is missing on an older Chrome), the panel must still render and show a readable warning, and must not overwrite stored chats/settings. Confirm existing data survives a reload.
26. All-tabs digest privacy filtering: open a page with `display:none` / `[hidden]` text, run "Attach digest of all tabs", and confirm hidden text is absent from the preview while visible text is present. **Behavior change to confirm:** the digest now also skips `[contenteditable]` regions, matching the other extractors — verify on a document-editor tab (Google Docs, Notion, web mail compose) whether returning little or no text is acceptable, or whether editable surfaces should be re-included for read-only digest use.
27. Digest gesture check: on a Chrome build that enforces user-activation for `permissions.request`, confirm the multi-origin digest prompt actually appears (this path awaits a tab query before requesting).
28. URL fetch bound: fetch a very large plain-text URL and confirm the 2 MB cap reports itself rather than the tab ballooning first.
29. Welcome strip: verify the four differentiator pills render in both themes, at Small and Extra large, and make no claim the app cannot honor.
30. Malformed-block budget: with a model that emits invalid action JSON, confirm the run still completes rather than burning steps, and stops cleanly once retries are exhausted.

## Modernization cycle 3 — v2.4.0 screenshot & analyze (added 2026-10-26; NOT executed in this environment)

31. One-click analyze (chat): on a normal page, click the Screenshot toolbar button, then click **Analyze now** in the preview dialog. The screenshot must attach and send immediately with the built-in analysis prompt; with a vision model the answer must describe the page actually visible. With a text-only model, expect the provider's error to surface honestly (no fabricated analysis).
32. Analyze now must reuse the reviewed capture: open the preview, wait a moment (let the page change), then click Analyze now — the sent image must be the one shown in the preview, not a fresh capture.
33. Agent screenshot: run Agent mode with a vision model and ask it to "take a screenshot and describe what you see". The step approval dialog must describe the screenshot action before any capture; after approval the model's next turn must receive the image (its answer should reference visible layout/colors, not just DOM text).
34. Non-visible tab guard: use `read-tab` to move the agent to a background tab, then have it propose a screenshot. The capture must be refused with "not the visible tab of its window" instead of capturing whatever page is actually in front of you.
35. Image budget: have the agent screenshot in two consecutive steps. The second request must carry only the latest capture (the first degrades to a text note) — verify in the provider request or by the model's behavior.

## Modernization cycle 4 — v2.5.0 automatic page context (added 2026-10-26; NOT executed in this environment)

36. Automatic context: on a normal page you have never granted, type any message that does NOT mention the page at all (e.g. "what does this say?" — previously the keyword gate missed "this post"/"this say"-style asks). Chrome should prompt for site access on send; after granting, the message must carry a page reference chip and the answer must be about the page. The next message on the same site must not prompt again.
37. Declined grant: decline Chrome's prompt. The message must still send, the status line must note "Page context unavailable", and the model must briefly say the page couldn't be read and ask you to grant access and resend — it must NOT pretend it read the page, and must not lecture about "Add page".
38. Own-tab guard: open Orbit in a full tab (Expand) and send a message. No permission prompt for the chrome-extension:// page should appear; no error flash; the send must behave as before. Also verify the Settings → Context toggle copy matches the new always-on behavior, and turning Smart page context off stops all automatic attaching.
37b. chrome:// active tab: with a Chrome internal page (e.g. chrome://settings) active, send a message. No permission prompt may appear; a brief "Page context unavailable" status note is expected; the message must send normally.

## Modernization cycle 5 — v2.6.0 navigation core (added 2026-10-26; NOT executed in this environment)

39. goto: with the agent on any granted page, ask it to open a specific https URL (e.g. "go to https://example.com and tell me what's there"). The approval dialog must show "go to <full URL>"; after approval Chrome may prompt for the destination site; the run must end up reading the destination, and any action batched after the goto must be deferred with the "belong to the previous page" note.
40. goto denial: decline the destination site's prompt. The run must report "was not granted; nothing was opened" and the tab must not navigate.
41. nav-history: after a goto, ask the agent to go back. It must return to the previous page and read it (grant prompt for that origin if not yet granted); with no history, it must report "start or end of history" rather than acting.
42. Enter warning: have the agent press Enter on a search field. The approval dialog must include the "Enter can submit the focused form" warning before the key runs; Tab/arrows must not carry the warning. Confirm nothing submits without an approved step. Known nuance: Enter dispatches synthetic keydown/keyup — sites submitting via JavaScript handlers respond, while a purely native form submit (browser default action) is not triggered by synthetic events; the warning remains the correct caution either way.

## Modernization cycle 6 — v2.6.1 capture permission fix (added 2026-10-26; NOT executed in this environment)

43. One-time all-sites capture prompt: with no blanket grant (fresh profile or after revoking site permissions for Orbit), click Screenshot (or Analyze now) on any page. The capture is first attempted with the per-origin grant; when Chrome refuses it, Orbit must show exactly one "all sites" permission prompt, then retry the capture — the screenshot must arrive without further clicks. Every later capture, on any site (including the agent's screenshot tool), must work with no prompt. Declining the prompt must produce the "Screenshots need one-time all-sites access…" message and no retry loop. Revoking all-sites access from chrome://extensions → Orbit → Site settings must bring the prompt back on the next capture. Also verify the agent screenshot path after revocation: the contextual prompt may not be showable mid-run (gesture rules), so the run must degrade to the honest message advising the toolbar-icon click — never a silent failure.

## Cycle 7 — local OCR and real-Chrome verification (2026-10-26)

Automated coverage now exists: `npm run verify:chrome` drives the real extension in headless Chrome and passes 15/15 checks (boot, layout and control visibility at 400/720/1280 px, honest capture refusal, a real capture, and OCR of that capture). The items below are the parts only a human can confirm.

44. Load `dist/` unpacked (v2.7.0) and confirm Chrome accepts the new CSP (`script-src 'self' 'wasm-unsafe-eval'`) with no manifest errors on the extensions page.
45. File → choose a PNG screenshot of a text-heavy page. Confirm the status line reports local reading, the preview shows labelled OCR text with a confidence value, the text is editable, and attaching sends text (not image data).
46. Screenshot → "Read text (OCR)". Confirm the dialog retitles to "Text read from the screenshot", the image is replaced by reviewable text, and "Analyze now" still works when you decline to OCR.
47. OCR quality on your real content: small font, low contrast, dark mode and dense tables. Expect garbled runs on small text — report which cases are unusable before anyone treats OCR output as reliable.
48. Unplug the network and repeat 45–46: OCR must still work, proving nothing is fetched.
49. Composer toolbar at 400 px in the actual side panel: confirm Send is visible without horizontal scrolling, and judge whether the wrapped rows look acceptable or need shorter labels.

## Cycle 10 — provider presets and separate fetch/test (2026-10-26)

Automated coverage exists for this (`npm run verify:chrome`, 34/34): Fetch models hits only `/models`, Test connection hits only `/chat/completions` with the selected model and a bounded cap, a 404 on the list is worded as list-only, and the same model still tests working afterwards. Confirm the parts a script cannot:

50. With a real OpenAI key: press **Test connection** and confirm it answers in well under a second and mentions one billed request. Then press **Fetch models** and confirm the two actions never change each other's message.
51. With a key whose org cannot list models (or any endpoint that 404s `/models`): confirm the failure says the list endpoint is unavailable and that your model may still work, then confirm **Test connection** still reports the model working. This is the reported bug.
52. Google Gemini: choose the provider, paste a `AIza...` key, press Fetch models, pick a `gemini-…` model, then Test connection. Confirm the request uses Chat Completions and the output cap field is `max_tokens` — if you switch Gemini to the Responses format, Google ignores it, so Test connection is the check that catches that.
53. Set API format to Responses with a chat-only compatible provider and press Test connection: confirm the 404 advice tells you to switch the format rather than just failing.

## Cycle 11 — screenshot attachment fixes (2026-10-26)

Covered by `npm run verify:chrome` (38/38, two consecutive clean runs): the first message in a fresh workspace now carries its screenshot, and a second screenshot replaces rather than joins the first. Confirm on real content:

54. Open Orbit with NO conversations yet, click Screenshot on an X/photo post, Attach, Send. Ask "what is in this image?" — the model should clearly have the image. Before this fix the first attachment was silently discarded.
55. Then navigate to a different image post, Screenshot, Attach, Send "describe this one". Confirm it describes the NEW post, not the previous one.
56. Ask a follow-up about the same screenshot without re-capturing ("what colour was the button?") — it should still answer, because the most recent screenshot stays attached.
57. Check provider usage: a long screenshot conversation should no longer re-upload the same image on every turn.

## Cycle 12 — OpenDuet 3.1: tasks, check-in, learned memory (2026-10-28)

Covered by `npm test` (221 extension + 12 native) for the contracts. These need real Chrome:

58. Type a task in the composer ("Compare the prices on the two tabs I have open and write the cheaper one to notes.md") and press **Task**. Confirm: the composer clears, this chat shows "On it." plus a task card, a new conversation opens with the ask, and the sidebar shows a Tasks section with it under **Working** (spinning glyph). Every step still asks for approval.
59. While the task waits on a masked value or hand-back, confirm the sidebar glyph turns amber and the group reads **Needs input** without you clicking anything. A waiting task must never look silent.
60. When the task finishes, confirm the card and sidebar flip to **Ready for review** (green check), and the task bar above the composer offers **Mark done**. Mark done → Resolved (grey check); Reopen returns it.
61. In a task conversation, confirm the **Task** and **What's new** buttons refuse with "You are inside a task" and nothing was created. Also confirm **Try again** appears only on a failed task and reruns it with the approval gate intact.
62. Delete a task's conversation: confirm the dialog says deleting removes the task too, and the Tasks section updates.
63. With 2–3 normal pages open (granted), press **What's new** in your main chat. Confirm the status line counts the pages checked, the answer is one or two sentences, and any suggestions appear as cards with **Start** / **Hide**. Nothing may act by itself.
64. Press **Hide** on one suggestion, run **What's new** again: the hidden suggestion must not come back, and a note should say one was skipped because you hid it. Then check Settings → Context for nothing weird.
65. Run a task that ends with something worth keeping ("remember I prefer the vendor list sorted by date") and approve the `memory_save` step. Confirm Settings → Context shows it under **What Orbit has learned** as *Needs your review*, **Confirm** clears that, **Forget** removes it, and a fresh conversation in a different chat knows the fact.
66. Ask a task to save a fake "password: hunter2" as memory: the prompt bounds this, but verify the approval dialog lets you refuse, and that refusing saves nothing.
67. Leave a run going for 20+ seconds: confirm the status line escalates ("Still working on it…", then "Taking longer than usual — Stop is still available.") without ending anything.

## Cycle 13 — one-row composer (2026-10-28)

Covered by `npm test` (223 extension + 12 native) for the wiring and by
`npm run verify:chrome` for layout. In real Chrome:

68. Load dist/, pin Orbit on a webpage: confirm the composer is ONE row — [+] · prompt · Agent ▾ · ↑ — and the whole footer row of buttons is gone. The prompt starts one line tall and grows as you type (up to ~6 lines), shrinking again after Send.
69. Click +: confirm the menu lists Add page…, Screenshot, Attach file, Skills… — each opens exactly what the old button opened (page tools dialog, screenshot preview with capture prompt, file picker, skills menu). Clicking + again or anywhere outside closes it.
70. Type nothing and click the Agent caret: Research with Reach and Start as task are disabled with the note "Research and tasks need something to do — type it first." Act on this page is clickable and runs the old agent loop with its default goal.
71. With text typed, Agent caret → Research with Reach runs the old Reach loop (review dialogs intact); → Start as task creates a task ("On it." + card in this chat). The main Agent button (no caret) runs the agent as before.
72. Confirm Regenerate (↻) and Export (⤓) in the header work as the old footer buttons did; confirm deleting a conversation via the sidebar × still asks and works. Settings → Context now holds the Assistant style dropdown — change it to Analyst, send a message, restart the panel, confirm it stuck.
73. At 400px width confirm no horizontal overflow and no clipped composer control; the + menu and skills menu stay inside the viewport above the button that opened them.

## Cycle 14 — the gate the side panel can answer (2026-10-28)

The root cause of "the agent can't click or scroll": `window.confirm` is suppressed in
the side panel and silently returns false, so every agent step was auto-"declined".
Covered by `npm test` (227 extension + 12 native) for the wiring; in real Chrome:

74. In the SIDE PANEL (pin Orbit, click its toolbar icon), type "scroll down and extract the headings on this page" and press Agent. A dialog titled **Orbit wants to act** must appear with the step description — Approve step runs it, Stop the run ends it. Before this fix, no dialog appeared and the transcript said the step was declined by you.
75. Approve a step that clicks or fills: the action lands on the page and the loop continues to the next dialog. Nothing should ever be described as "declined by you" unless you pressed Stop the run.
76. Settings → Context → **Hands-free reading** (off by default): with it ON, a scroll/snapshot/extract step runs with no dialog and the transcript shows "[auto-approved · step N] Read-only step ran without asking…"; the moment the model proposes a click or fill, the dialog returns. With it OFF, every step asks as before.
77. In the panel, delete a conversation from the sidebar × and delete a message: a real **Delete/Keep** dialog must appear (previously these silently did nothing in the panel). Settings → Advanced → the clear-all button likewise.
78. Add page → scan a text field → write: the **Replace field** dialog shows the replacement text in a scrollable box before writing (previously the write was silently refused in the panel).
