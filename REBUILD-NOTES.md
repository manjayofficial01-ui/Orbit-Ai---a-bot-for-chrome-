# Orbit AI 2.1 Rebuild Notes

## What changed
- Persistent, endpoint-bound BYOP keys in trusted extension storage; one-time migration of legacy session keys.
- Connect-and-fetch onboarding, automatic `/models` discovery, cached model lists, searchable/manual model fallback.
- Smart active-page context for prompts that clearly refer to the current page, with Focused/Balanced/Deep capture limits.
- Explicit visible-tab screenshot capture, preview/removal, and multimodal Chat Completions/Responses message schemas.
- Recent-conversation Back/Forward controls.
- Persisted Small/Medium/Large/Extra-large text sizing and System/Light/Dark appearance.
- Rebuilt responsive chat, drawer, settings, empty, error, focus, and mobile states.
- Existing supervised DOM agent retained: bounded actions, confirmation gate, URL/token guards, and no auto-submit.

## Why this shape
Current agent systems increasingly combine model reasoning with tools and multimodal observations, but official safety guidance emphasizes sandboxing, least privilege, prompt-injection resistance, and human confirmation for consequential browser actions. Orbit therefore improves context and screenshots without turning page control into unrestricted autonomy.

Chrome's extension platform supports a persistent side-panel companion, runtime script injection with host access, visible-tab capture, and local/session extension storage. Orbit requests page/provider access at runtime instead of adding broad install-time host access.

## Verification
- 43 automated tests pass.
- JavaScript syntax checks pass for all shipped runtime files.
- `src` and `dist` runtime files are synchronized.
- No paid-provider live call or automated Chrome rendering session was available in this environment; use `docs/MANUAL-QA.md` before store submission.
