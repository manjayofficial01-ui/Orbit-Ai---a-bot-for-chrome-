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
46. Screenshot → "Read text from image (OCR)". Confirm the dialog retitles to "Text read from the screenshot", the image is replaced by reviewable text, and "Analyze now" still works when you decline to OCR.
47. OCR quality on your real content: small font, low contrast, dark mode and dense tables. Expect garbled runs on small text — report which cases are unusable before anyone treats OCR output as reliable.
48. Unplug the network and repeat 45–46: OCR must still work, proving nothing is fetched.
49. Composer toolbar at 400 px in the actual side panel: confirm Send is visible without horizontal scrolling, and judge whether the wrapped rows look acceptable or need shorter labels.
