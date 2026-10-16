# Research and implementation rationale

Research date: October 15, 2026. Primary vendor documentation was used for the extension platform and provider protocol decisions. This report distinguishes documented platform features from implemented features and unverified operational compatibility. API documentation may change; model IDs are therefore user-selected, not frozen in a marketing comparison.

## 1. Product definition: interaction is not model intelligence
A Grok-like experience can mean a minimal conversational UI, streaming output, coding assistance, analytical styles and optional current information. Orbit implements that interaction pattern using an independent identity. Its answer quality comes from the configured provider and model, not from the extension's name or prompt style. It does not inherit a Grok subscription or access to Grok's full consumer product.

The xAI quickstart demonstrates OpenAI-client usage with the https://api.x.ai/v1 base. Its Responses reference describes text generation and tool use. These support a configurable provider adapter, not a claim that all Grok product capabilities can be copied into a local extension.
Sources: https://docs.x.ai/developers/quickstart and https://docs.x.ai/developers/rest-api-reference/inference/responses

## 2. Chrome architecture and lifecycle
Chrome's sidePanel API hosts packaged extension UI alongside a webpage. The native panel is available in Chrome 114+, while programmatic open() is Chrome 116+ and requires a user interaction. Orbit targets 116, opens via the action icon, and calls open synchronously from the selected-text context-menu handler before storage work.

Source: https://developer.chrome.com/docs/extensions/reference/api/sidePanel

The panel/full-tab page owns fetch and streaming, while the service worker handles setup and selection draft handoff. This avoids pretending an event-driven service worker is a persistent generation server. Closing the UI aborts work. Checkpoints retain most partial output, but they are not resumable jobs or exact recovery guarantees.

A Web Lock ensures only one active writer. Full-tab expansion saves, drops ownership, releases the lock and opens the new tab. The old UI is replaced with an ownership notice, and keyboard/selection handlers check ownership. This reconstructs the core handoff correction shown in the user's partial diff. It is safer than allowing two independently loaded state objects to overwrite one storage record. Browser-native lifecycle and cross-window behavior still require the manual QA in this package.

## 3. Permissions are capability grants, not UI decoration
Chrome recommends optional permissions when practical and supports optional HTTPS patterns for hosts discovered at runtime. Host permissions allow extension-page fetches. Orbit declares HTTPS as optional, then requests the selected provider host under a click/submit gesture. It does not install a persistent all-sites content script. Page extraction uses activeTab and scripting after user interaction.

Host grants are broader than a single API path; a /v1 UI field is not a network sandbox. Users must trust the selected host. Revoke removes that host grant and its endpoint-bound saved key. Deleting all local data attempts to remove all optional host grants too.

Sources: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions and https://developer.chrome.com/docs/extensions/reference/api/permissions

All runtime JavaScript is packaged. No eval, injected generated code, remote scripts or runtime CDN dependency is used. Chrome's extension updates page reiterates the Manifest V3 restriction on remotely hosted code.
Source: https://developer.chrome.com/docs/extensions/whats-new

## 4. Two protocols require two parsers
OpenAI documents Chat Completions as data-only SSE with choices[].delta and Responses as typed semantic events such as response.output_text.delta and response.completed. Orbit therefore has explicit adapters rather than assuming a shared schema.

Its SSE parser buffers split UTF-8 and lines, tolerates LF/CRLF/CR boundaries, comments and multiline data fields, flushes a final nonblank frame, and guards oversized unsplit frames. Deterministic fixtures exercise these cases. The generation adapter also handles JSON fallback, refusal deltas, completion markers, Responses failure/incomplete events and premature close. It never silently retries a paid request.

Source: https://developers.openai.com/api/docs/guides/streaming-responses

Stateless replay keeps the client portable across compatible providers: the extension does not depend on previous_response_id or server conversation state. This increases request size and cost as chats grow. A character budget prevents unbounded replay but cannot replace provider token/context limits.

## 5. Compatibility is deliberately narrower than universality
Provider presets are convenience values. Only a successful request under a real user's model/account verifies operation. GET /models discovers identifiers, not capabilities. The adapter leaves optional sampling/reasoning/output limits absent by default and exposes configuration when needed. Unsupported fields can still produce provider errors.

The base URL normalizer rejects embedded credentials, queries and fragments, requires HTTPS outside loopback, and fetch disallows redirects, ambient cookies and referrers. Bearer credentials are sent only to the normalized endpoint selected by the user. Editing the endpoint shows the saved key for that endpoint if one exists. This is not a general-purpose vendor authentication engine.

OpenAI's API reference documents Bearer authentication and explicitly warns against exposing application keys in distributed browser code. Orbit is a personal bring-your-own-key utility, not permission to ship a shared developer key. A managed public service should move application credentials behind an authenticated server with quotas and abuse controls.
Source: https://developers.openai.com/api/reference/overview/

## 6. Hosted search is not autonomous deep research
OpenAI documents web_search in Responses and explains that the model can choose whether to search. Output may include web_search_call items and URL citation annotations. xAI documents web_search support with the OpenAI Responses API as well. Orbit exposes that common request only on official OpenAI/xAI origins and displays returned citation links. It does not invent citations from ordinary model text.

Sources: https://developers.openai.com/api/docs/guides/tools-web-search and https://docs.x.ai/developers/tools/web-search

The search toggle is not evidence a search occurred, citations are not an independent fact check, and provider-hosted queries can disclose information influenced by confidential attachments. Orbit has no independent search crawler, iterative source evaluation controller, X search integration or persistent cloud research computer. These should not be marketed as implemented features.

## 7. Storage, history and explicit memory
Chrome states that storage.session is memory-resident, not persisted to disk, and cleared on extension reload/disable/update and browser restart. Orbit uses session only for transient selection handoff. storage.local holds chat history, provider profiles and saved API keys; both storage areas are restricted to trusted extension contexts.

Chrome's default local storage quota is 10 MB. Orbit sets a lower 5 MB application save budget, limits chat count and provides export/delete controls. Serialization cost and storage failure are still possible. Neither session nor local storage is a credential vault; local history is not encrypted by the app.

Source: https://developer.chrome.com/docs/extensions/reference/api/storage

Memory notes are user-editable profile fields appended to instructions. Orbit does not silently extract personal facts, migrate inaccessible old chat history, perform embedding retrieval, or claim access to Perplexity memory. Memory is sent to the selected provider with each request, so it should contain only information the user chooses to share.

## 8. Output and context safety: reduce capabilities, not promise immunity
Page text, files and generated output are untrusted. Orbit uses textContent and DOM creation instead of HTML interpretation; code fences get plain-text code blocks and copy buttons. Only provider citation URLs with HTTP(S) schemes become links. Links use noopener noreferrer, and generated images/media are not fetched. This conservative approach trades rich Markdown support for a small rendering attack surface.

Capture is explicit and previewed. Common form, editable, navigation and hidden elements are skipped. These filters are imperfect: visible page text and URLs can still contain secrets. Reference delimiters are instructions to the model, not a security boundary. The stronger boundary is absent execution authority: model output cannot run JavaScript, read more pages or modify browser settings.

## 9. Verification hierarchy and next stages
Verified here: Node syntax checks, 26 deterministic core tests, internal package paths and ZIP integrity. Not verified here: real Chrome permission prompts, panel lifecycle, UI accessibility, user-account inference, server-origin restrictions and actual search quality. See the test report rather than assuming vendor documentation proves runtime compatibility.

Before broader release: complete manual Chrome QA on target platforms; test low-quota credentials per provider/model; add real sanitized protocol fixtures; review manifest/store policy and privacy disclosure; conduct independent security and accessibility assessment. Resumable autonomous research, document parsing and vision require additional architecture and explicit threat modeling, not only more prompt text.

## 2026-10-16 product refresh
Orbit 2.1 adds locally persisted endpoint-bound keys, cached automatic model discovery, fresh smart page context on page-referential prompts, explicit visible-tab screenshot attachment, conversation Back/Forward, persisted text sizing, system theme support, and a rebuilt responsive settings/chat interface. The agent remains supervised: page content is untrusted, action batches are bounded, URL/token guards remain, and each action step requires confirmation. Screenshot understanding is provider/model dependent; no compatibility claim is made solely because capture succeeds.
