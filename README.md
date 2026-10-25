# Orbit AI

An independently branded, Grok-inspired, bring-your-own-provider Chrome AI assistant. Not affiliated with xAI, Grok, OpenAI or Google.

This is a fresh reconstruction from the requirements and partial diffs pasted into the conversation, not a recovered copy of the inaccessible previous project. Prior chat data and credentials are NOT included. No false claim is made that the old application's unseen implementation or browser tests were preserved.

## What this is for

Most browser AI assistants meter you with expiring credits, lock you to one vendor's models, or collect page content in the background. Orbit is the opposite shape, and these are the properties that matter when comparing it:

- **Bring your own key, any OpenAI-compatible endpoint over HTTPS** — OpenAI, xAI, OpenRouter, a custom gateway, or a local Ollama server. Plain HTTP is accepted only for `localhost` / `127.0.0.1`, so a LAN IP endpoint is not allowed. No credits, no quota that Orbit controls, no account.
- **Local models first-class** — point it at `http://localhost:11434/v1` and nothing leaves the machine.
- **Supervised automation** — Agent mode proposes at most 3 page actions per step and *every* step needs your explicit approval; `press` is limited to non-activating keys. Orbit never submits a form on its own initiative — a submit-capable button or link is only touched if you approve that exact step, and the approval dialog names the site it will happen on. Reach research gates each network call the same way.
- **Zero telemetry** — no analytics, no Orbit server, no content script running until you grant a site. The `dist/` tree is auditable and there are no third-party dependencies.
- **Open source (MIT)** — read every line before you load it.

Provider inference is still billed by your provider, and the same page content you attach is still sent to that provider. Those trade-offs are spelled out in [docs/SECURITY.md](docs/SECURITY.md).

## Install (no build required)
1. Extract this ZIP into a permanent folder.
2. Open chrome://extensions in Chrome 116 or newer.
3. Enable Developer mode.
4. Click Load unpacked and select orbit-ai/dist, the folder containing manifest.json.
5. Pin Orbit and click its toolbar icon on a normal webpage.
6. Open Settings → Connection, choose a provider, enter your API key, and select Connect & fetch models.
7. Choose a discovered model (or type an exact compatible model ID), select the API format, then Save connection. The endpoint-bound key is reused on later browser restarts.
8. Send your first message. The provider may charge for inference and hosted tools.

Do not delete the extracted folder while using the unpacked extension. This package is not a Chrome Web Store release.

## Included functionality
- Native side panel and full-tab workspace with deliberate ownership handoff.
- One active editing workspace, enforced with a Web Lock. Close the other workspace and select Try again to return.
- OpenAI, xAI, OpenRouter, Ollama and custom compatible provider profiles.
- Separate Chat Completions and Responses adapters. Stateless message replay; streaming SSE and JSON fallback.
- Automatic model discovery with GET /models, cached per endpoint, plus manual model-ID fallback. No model names are hardcoded.
- Stop, explicitly regenerate the latest answer, copy answers/code and export Markdown including references and source URLs.
- Search local conversation titles; delete any chat from its × control in the list or the footer; delete individual messages from their Delete button; navigate recently opened conversations with Back/Forward; responsive history drawer.
- Automatic active-tab context: every message you send attaches a fresh, privacy-filtered text snapshot of the page you're looking at (default on; off in Settings → Context, and skipped when you attach something else). No "add page" step, no keyword matching — if Chrome hasn't been granted the site yet, it asks once and the model tells you to grant and resend if you declined. Plus explicit tools when you want them: editable Page preview, direct URL fetch as plain text (paste any https URL — or use the selected tab's URL — and Orbit downloads and attaches the page text; scripts never run), an all-tabs digest (one permission prompt, every open tab's text combined into a single bounded reference), visible-tab screenshot attachment with a one-click Analyze now action (the reviewed screenshot is attached and sent with an analysis prompt in a single step), right-click selection draft, and plain-text file attachment.
- Agent mode (Agent: act on page button): a supervised browser-use-style operator loop on the live browser — observe (snapshot, screenshot, structured extract), navigate (goto any http(s) URL, back/forward history, switch tabs), act, and verify after every step. Snapshots include DOM text, up to 100 editable fields (with current values and dropdown options), 120 interactive elements (with link destinations), and controls inside shadow DOM. The model proposes max 3 actions per step as fenced orbit-actions JSON and you confirm each step; the executor clicks (with overlay-blocker detection and anti-stale target checks), fills, types, selects, scrolls (element or page), hovers, presses keys (Tab/Escape/arrows always; Enter is allowed and the approval dialog explicitly warns that it can submit the focused form), waits for late content, extracts a structured outline (headings, items, links, tables), takes a screenshot of the visible target page (the image is attached to its next observation for vision-capable models, behind the same per-step approval, and only when the target tab is actually the visible tab of its window), navigates with goto (destination URL shown in the approval dialog, its site access requested, navigation waits for the page to load before re-reading) and back/forward history, and re-snapshots after the page settles. Max 8 steps. Nothing auto-submits: every action step — navigation and Enter included — waits for your approval.
- Supervised Agent Reach research (Research with Reach button): bounded model-driven research through the separately installed Agent Reach CLI. Orbit reads the capabilities `agent-reach channels` declares, the model proposes at most four search/read calls, every proposed call is shown for review before any network request runs, results arrive wrapped as untrusted data, and the final answer may cite only observed sources. Reach channels can include platforms ordinary web search cannot read (bilibili, v2ex, GitHub issues, YouTube subtitles, and optional login-walled channels you set up yourself).
- Balanced, Analyst, Code and Creative instruction styles.
- Optional temperature, output-token cap, token parameter alias and reasoning effort.
- Provider-hosted web search through Responses on official OpenAI/xAI hosts; returned URL annotations become source links.
- Custom instructions and user-edited memory notes sent with each request. Memory is explicit, not automatically inferred from conversations.
- Endpoint-bound keys persisted locally so setup is not repeated, with trusted-context storage restriction, no telemetry, no Orbit backend, optional per-provider host grants, and deletion/revocation controls.
- Text-size controls, System/Light/Dark themes, WCAG-oriented focus states, and safe DOM rendering with basic heading/code-fence formatting. Raw HTML is displayed as text; remote images and scripts are not rendered.

## Provider presets
| Provider | Base URL | Starting format |
|---|---|---|
| OpenAI | https://api.openai.com/v1 | Chat Completions or Responses |
| xAI | https://api.x.ai/v1 | Responses for hosted search |
| OpenRouter | https://openrouter.ai/api/v1 | Chat Completions |
| Ollama | http://localhost:11434/v1 | Chat Completions |
| Custom | Your trusted HTTPS base URL | Whichever it implements |

Enter an API base, not the provider's chat website and not a URL ending in /chat/completions or /responses. Orbit appends the selected endpoint. Compatibility varies by service, model and account; a successful model list is not proof that generation or optional parameters work.

Only standard Bearer authentication and unauthenticated loopback inference are supported. No Azure deployment mapping, query-string auth, arbitrary custom auth headers, native Anthropic API, tools/function execution or automatic vendor-specific schema translation is included.

For Ollama, pull a text model and start the server. If origin checks reject the extension, configure the server to permit your specific chrome-extension://EXTENSION_ID origin, following the server's documentation. Avoid broadly allowing all origins. The ID is shown at chrome://extensions.

## Search and research
Two independent, optional mechanisms:

Provider-hosted web search: enable Responses format and Provider-hosted web search in Generation & behavior. This is an opt-in pass-through to provider tools, not a standalone research crawler. Tool/model support and costs depend on the provider. A visible search setting does not prove the provider searched; only actual streamed search events or returned sources provide evidence. Citations are provider-supplied, not independently verified by Orbit.

Supervised Agent Reach research: with Agent Reach 1.6+ installed separately and the one-time Orbit Reach bridge registered (see the next section), the Research with Reach button runs a bounded research loop through Agent Reach's channels — search engines and login-walled or regional platforms a normal provider search cannot reach. Only status, search and read operations exist in the bridge. The model proposes at most four calls per run; each proposal is displayed for approval and nothing is executed until you approve it. Capabilities shown in Settings → Reach are the declarations of `agent-reach channels`, not a live connectivity or login-health check. Provider-hosted web search is disabled during a Reach research run so the two mechanisms do not mix silently.

There is no unsupervised browser clicking by Orbit, persistent cloud computer, voice, image generation, native PDF parser, or guaranteed vision support. Reach research does execute the reviewed search/read subset of the locally installed Agent Reach CLI through a restricted native-messaging bridge; it never sends your provider key, cookies or passwords to Agent Reach, and Orbit cannot add channels, log in, or configure keys on Agent Reach's behalf.

## Agent Reach research setup (optional)
1. Install Agent Reach 1.6 or later yourself, from its official GitHub release (never the unrelated PyPI package named agent-reach):
   `uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip` then `agent-reach setup`.
2. Add the channels you want in your terminal (for example `agent-reach add bilibili`, `agent-reach configure groq-key`). Setup, login and key configuration are manual terminal tasks; Orbit never performs or prompts for them.
3. Open Orbit → Settings → Reach, copy the displayed per-user installer command, and run it from the unpacked extension folder with Chrome closed or after closing Orbit. It registers a native-messaging host allowed only for this exact extension ID and stores only the agent-reach executable path.
4. Fully restart Chrome, reopen Orbit → Settings → Reach and click Refresh declared capabilities. If channels are listed, Research with Reach is ready.

Uninstall the bridge by deleting the host folder it printed during installation (Windows: %LOCALAPPDATA%\Orbit\ReachBridge, plus the HKCU NativeMessagingHosts registry entry; macOS/Linux: the paths the installer printed).

## Context, memory and privacy
Page text is not collected at startup or during navigation. With Smart page context enabled, Orbit reads the active page only when a prompt clearly refers to the current page; otherwise click Page and review the preview. On a webpage with selected text, Page captures that selection. Right-click selection opens a draft, never sends automatically. You can edit or remove references before sending.

Provider requests include your message, retained eligible conversation turns, attached references, custom instructions and memory notes. Page URLs can contain secrets; review them. Extraction skips common form/editable/navigation/hidden elements but cannot guarantee redaction. Untrusted references can contain prompt injection.

Orbit declares the `tabs` permission so the all-tabs digest and Agent-mode tab switching can list each open tab's title and URL. That is metadata, not page text: a tab's content is read only after you grant that origin. Tab titles can themselves be sensitive (search terms, document names, mail subjects), and the digest arrives as one combined preview — review it before attaching, because it can gather material from sites you did not mean to include.

Keys live in chrome.storage.local and persist across browser restarts. They are not encrypted vault entries; someone controlling the browser profile or computer can access them. Settings and conversation history are also in chrome.storage.local; the app does not encrypt them. API keys are not intentionally included in exports. Secrets typed into normal messages are ordinary message data.

History saving is controlled by the active provider profile's Save conversations setting. Turning it off removes saved chat data on the next save but keeps this workspace's chats in memory until closed. Memory notes/custom instructions remain saved separately in provider profiles until cleared. Delete all local data clears those as well and revokes optional provider grants; it cannot delete provider-side records.

## Limits and lifecycle
- 100 conversations; application save budget 8 MB (export/delete when reached).
- 60,000-character serialized generation body budget, not an exact token count.
- At most 3 references; text references are capped at 24,000 characters, screenshots at roughly 3.5 MB data URL, and text files under 100 KB.
- 250,000-character generated output cap and five-minute request timeout.
- Research with Reach: at most four proposed search/read calls per run (declined and unsupported proposals count toward the budget), a 20-second bridge timeout for capability reads and 90 seconds per search/read call, at most 10 items and 12,000 characters of text per item from the bridge, one corrective re-prompt if the model's first planning reply is prose instead of a directive, and a ten-minute overall research cap.
- Agent mode: at most 8 steps and 3 actions per step, with an approval dialog before each step. A malformed action block gets two free corrective retries before it starts consuming steps. Any navigation — a `read-tab` switch, `goto`, or `nav-history` — ends that step, so refs from the previous page are never reinterpreted against the newly loaded one; `goto` validates plain http(s) URLs without credentials, requests the destination site's access before navigating, and waits up to ~8 s for the page to become readable. Enter appears in the approval dialog with an explicit submit warning. An agent screenshot step attaches at most two captures (~3 MB total) and prunes earlier steps' images, so a run cannot stack captures past the request budget; a capture is refused when the target tab is not the visible tab of its window. The all-tabs digest reads at most 12 tabs into a single 24,000-character reference; a direct URL fetch is capped at 2 MB while downloading.
- Partial answers checkpoint approximately every 1.5 seconds; closed/reloaded requests are interrupted, not resumable. Recent unsaved text can be lost.
- Failed/interrupted assistant turns are not sent on subsequent requests. Related user turns remain.
- Closing the active workspace ends generation. The background service worker does not run generation jobs.
- No automatic retries: Regenerate is a new potentially billable request.
- Concurrent workspaces are blocked, not merged.

## Shortcuts
- Alt+Shift+O: extension action, subject to Chrome shortcut assignment.
- Ctrl+K / Cmd+K: new chat while the workspace is focused.
- Enter: send from the composer; Shift+Enter: newline.
- Escape: native dialog dismissal.

## Troubleshooting
401: re-enter a valid saved key. 403: check account/model permissions and server origin policy. 404: check base URL, model and API format. 429: check quota/billing/rate limits; Orbit does not auto-retry.

Optional parameter errors: clear temperature/reasoning/cap, or switch the Chat token parameter. Not every model supports every field.

Page capture denied: open a normal webpage and click the Orbit toolbar icon before capture. Internal Chrome pages and other restricted pages cannot be read. A full workspace tab cannot capture a different tab merely because it is open; use the side panel alongside that webpage.

Another workspace open: close the other Orbit tab/panel and click Try again. Expand hands off ownership rather than allowing two writers.

Custom network failure: verify HTTPS, host grant, endpoint path and server availability. Redirects are intentionally rejected. Local endpoints support localhost and 127.0.0.1 HTTP. Custom origin/CORS policy remains the server's responsibility.

## Developer checks
Node 20.11+ and Python 3 (for the native bridge tests) recommended; no npm dependencies and no build toolchain needed beyond node file copies.

    npm test
    npm run check

`npm test` first runs scripts/build.mjs, which copies src/*.js, src/manifest.json and the native-host installer into dist/. index.html and styles.css exist only in dist and are edited there directly. If you edit src, run the build (or npm test) before reloading the extension. On Linux, substitute `python3` if your distribution has no `python` alias.

See docs/RESEARCH.md, SECURITY.md, TEST-RESULTS.md and MANUAL-QA.md. No browser screenshots, live paid API test or security certification is claimed.
