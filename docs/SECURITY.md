# Security and privacy

## Data flow
Explicit message + retained conversation + attached text + custom instructions/memory → extension page → selected provider over HTTPS (or loopback HTTP) → streamed/JSON reply → plain DOM rendering → optional local history.

No analytics, Orbit server, shared API key, hidden content-script collection or externally connectable endpoint is included. A supervised model-driven page-action loop is included (Agent mode): it proposes snapshot/click/fill/type/select/scroll/focus actions as fenced JSON, and the extension executes at most 3 actions per step, max 8 steps, only after your per-step confirm() gate. A supervised research loop is also included (Reach research): through a restricted native-messaging bridge it runs only status/search/read operations of the separately installed Agent Reach CLI, at most four proposed calls per run, each requiring approval before any network request, with results wrapped as untrusted data before being shown to the model.

## Native bridge (Reach research)
The nativeMessaging permission powers one fixed host name, ai.orbit.agent_reach, whose manifest the user installs manually and which allows only this exact extension ID. The bridge accepts exactly three operations (status, search, read), validates every field, and forwards a fixed argv shape to the agent-reach executable — never a shell, never caller-chosen arguments. Output is size-capped and stripped to a bounded schema; raw upstream payloads and credentials never cross the bridge. The bridge stores only the agent-reach executable path. Orbit never sends provider keys, cookies or passwords to Agent Reach, and cannot install, update, log in to, or configure Agent Reach.

## Permissions
- sidePanel: native workspace.
- storage: profiles, local history, locally persisted keys and transient selection drafts.
- activeTab + scripting: user-invoked page/selection text extraction plus supervised Agent-mode snapshot and action execution (click/fill/type/select/scroll/focus), each step gated by confirm().
- contextMenus: selected-text draft handoff, not automatic submission.
- nativeMessaging: restricted Agent Reach bridge — status/search/read only, per-call approval, fixed argv, bounded output, extension-ID-pinned host.
- optional HTTPS/loopback hosts: user-approved provider fetch access.

A provider host permission is not limited to the entered API path. Review the domain before approving. Localhost origin checks and server authentication remain the local server's responsibility.

## Key handling
Keys are bound to normalized full base URLs and persisted in chrome.storage.local. They are not written to chat history or exports. Editing the endpoint shows the saved key for that endpoint if one exists. Fetch omits cookies/referrers and rejects redirects. HTTP errors display only status/generic advice rather than an arbitrary provider body that might echo secrets. Requests are not automatically retried.

chrome.storage.local persists across browser restarts. See https://developer.chrome.com/docs/extensions/reference/api/storage . It is not an encrypted vault and cannot protect against a compromised browser, extension context or operating system. Transient selection drafts still use chrome.storage.session.

OpenAI warns against exposing developer application keys in client-side code: https://developers.openai.com/api/reference/overview/ . This package is a personal BYOK utility. Do not distribute your own API key; use an authenticated backend for a managed multi-user service.

## Rendering and prompt injection
Text/HTML from models and pages is inserted via textContent, not innerHTML. No remote Markdown parser, eval, generated scripts, media/forms or tracking images are used. Provider citation links are restricted to HTTP(S), opened with noopener noreferrer. This does not prevent phishing at an HTTPS destination.

Page/file reference previews support manual review and bounded size. Page extraction skips common forms, editable elements, navigation and hidden text but is not a sensitive-data detector. Malicious reference instructions can influence answers. Delimiters (<untrusted_page>/<untrusted_reference>) are not enforcement. Agent mode adds client action tools (snapshot/click/fill/type/select/scroll/focus) with token-bound refs, URL-change guards, sensitive-field blocks, no auto-submit, and a per-step confirm() gate; provider-hosted search can still send queries influenced by attached text.

## Retention and deletion
Chat text, attachments, profile instructions and memory notes are not encrypted by Orbit. The active profile controls whether chat history is persisted. Memory notes remain in settings until deleted. Local deletion cannot delete provider records. Responses uses store:false, but that is not a universal zero-retention guarantee.

## Concurrency and resource boundaries
Single UI writer via Web Locks; explicit tab handoff. Five-minute generation timeout (ten-minute research cap); bounded request/reference/output sizes; save checkpoints; failed/interrupted output labeled and excluded from assistant replay. No resumable job backend. App save budget 8 MB and 100 chats. Model listing has a post-read size check, not a hostile-server streaming memory bound. SSE size guard applies to an individual unbroken buffered line, not a total network download quota. A malicious provider is not isolated by these limits.

## Release requirements
Not security-certified or store-reviewed. Complete native browser QA, real-provider tests, independent security/accessibility review and privacy-policy/store requirements before public distribution. Distribute source you trust, never add shared keys or remote executable code.


## Screenshots and smart context
Smart context is triggered only by a page-referential prompt or an explicit Page action. Screenshot capture is explicit, limited to the active visible tab, and previewed before attachment. Both features request site access at runtime. Page text, URLs, and screenshots can contain sensitive or malicious content and are wrapped/treated as untrusted provider input. Provider/model vision compatibility is not guaranteed.
