# Orbit AI

An independently branded, Grok-inspired, bring-your-own-provider Chrome AI assistant. Not affiliated with xAI, Grok, OpenAI or Google.

This is a fresh reconstruction from the requirements and partial diffs pasted into the conversation, not a recovered copy of the inaccessible previous project. Prior chat data and credentials are NOT included. No false claim is made that the old application's unseen implementation or browser tests were preserved.

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
- Search local conversation titles; delete chats; navigate recently opened conversations with Back/Forward; responsive history drawer.
- Smart current-page context for page-aware prompts, explicit editable Page preview, visible-tab screenshot attachment, right-click selection draft, and plain-text file attachment.
- Agent mode (Agent: act on page button): supervised observe-propose-confirm-act-verify loop on the active webpage. Snapshot DOM text + up to 100 editable fields + 120 interactive refs, model proposes max 3 actions per step as fenced orbit-actions JSON, you confirm each step, executor clicks/fills/types/selects/scrolls with token+URL guards and re-snapshots. Max 8 steps. No auto-submit.
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

## Search and research boundary
Enable Responses and Provider-hosted web search in Generation & behavior. This is an opt-in pass-through to provider tools, not a standalone research crawler. Tool/model support and costs depend on the provider. A visible search setting does not prove the provider searched; only actual streamed search events or returned sources provide evidence. Citations are provider-supplied, not independently verified by Orbit.

There is no X-specific search, unsupervised browser clicking, local shell/Python execution, persistent cloud computer, voice, image generation, native PDF parser, or guaranteed vision support. Screenshot attachments depend on the chosen compatible provider/model accepting image data URLs. The research prompt chip helps structure a request; it does not create an autonomous deep-research agent.

## Context, memory and privacy
Page text is not collected at startup or during navigation. With Smart page context enabled, Orbit reads the active page only when a prompt clearly refers to the current page; otherwise click Page and review the preview. On a webpage with selected text, Page captures that selection. Right-click selection opens a draft, never sends automatically. You can edit or remove references before sending.

Provider requests include your message, retained eligible conversation turns, attached references, custom instructions and memory notes. Page URLs can contain secrets; review them. Extraction skips common form/editable/navigation/hidden elements but cannot guarantee redaction. Untrusted references can contain prompt injection.

Keys live in chrome.storage.local and persist across browser restarts. They are not encrypted vault entries; someone controlling the browser profile or computer can access them. Settings and conversation history are also in chrome.storage.local; the app does not encrypt them. API keys are not intentionally included in exports. Secrets typed into normal messages are ordinary message data.

History saving is controlled by the active provider profile's Save conversations setting. Turning it off removes saved chat data on the next save but keeps this workspace's chats in memory until closed. Memory notes/custom instructions remain saved separately in provider profiles until cleared. Delete all local data clears those as well and revokes optional provider grants; it cannot delete provider-side records.

## Limits and lifecycle
- 100 conversations; application save budget 8 MB (export/delete when reached).
- 60,000-character serialized generation body budget, not an exact token count.
- At most 3 references; text references are capped at 24,000 characters, screenshots at roughly 3.5 MB data URL, and text files under 100 KB.
- 250,000-character generated output cap and five-minute request timeout.
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
Node 20.11+ recommended; no npm dependencies and no build toolchain needed.

    npm test
    npm run check

The shipped dist files are directly editable runtime source. src contains copies of the JavaScript for reference. If editing src, copy modified files to dist before reloading the extension. Do not assume an automatic build sync.

See docs/RESEARCH.md, SECURITY.md, TEST-RESULTS.md and MANUAL-QA.md. No browser screenshots, live paid API test or security certification is claimed.
