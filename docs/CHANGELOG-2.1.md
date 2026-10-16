# Orbit AI 2.1.0

## Fixed
- Removed the misleading “no image or attachment” fallback by teaching the system prompt to distinguish missing page access from missing screenshots.
- API keys now persist per normalized endpoint in trusted-context `chrome.storage.local`, with explicit revoke and delete-all controls.
- Added recent-conversation Back/Forward navigation.
- Increased local conversation cap to 100 and save budget to 8 MB.

## Added
- One-click connection test and automatic `/models` discovery with endpoint cache and manual fallback.
- Smart page context that activates only for page-referential prompts and always captures a fresh snapshot.
- Explicit visible-tab screenshot capture and preview.
- Persistent Small/Medium/Large/Extra-large text sizing and System/Light/Dark appearance.
- Accessible responsive drawer, clearer provider state, defensive empty/error states, and improved keyboard/focus behavior.

## Safety boundaries
- Agent execution remains supervised and bounded to 3 actions per step and 8 steps.
- Page text and screenshots are treated as untrusted model input.
- No auto-submit, hidden background collection, arbitrary shell execution, or broad install-time host permission was added.
- Screenshot vision depends on the selected API-compatible provider and model.
