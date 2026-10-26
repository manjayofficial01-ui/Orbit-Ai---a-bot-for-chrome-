# Review of the `orbit-agent/` reference folder — 2026-10-26

Scope: the folder the owner dropped into the project root and asked be researched and used to "upgrade our extension with these resources, extension engines". Read-only analysis of all 11 files (54 KB), then a decision on what to adopt. `orbit-agent/` is now gitignored, matching how `Agent-Reach-main/` and `ChromeBot-Ai/` are treated.

## What it actually is

**Not a library of engines.** It is a second, self-contained MV3 side-panel extension implementing the same idea as Orbit — a smaller, xAI-only sibling. Its own README is explicit about provenance, and the claim should be read rather than assumed:

> "The supplied repository branch and raw/API endpoints could not be fetched. This ZIP is an independently implemented replacement scaffold, **NOT** an audited patch, fork, or preservation of the original repository." — `orbit-agent/README.md`

> "Failed retrievals: supplied GitHub branch URL; raw manifest URL; GitHub recursive-tree API. No repository files were obtained." — `orbit-agent/RESEARCH.md`

So it is not Orbit's earlier code returned with new features. There is nothing to "merge back".

## Verification I ran (not taken on faith)

| Check | Command | Result |
|---|---|---|
| JS syntax | `node --check panel.js dom.js background.js` | **`panel.js` fails to parse** — unterminated string literal at line 8 (`…toUpperCase()+'` then a newline). `dom.js`, `background.js` clean. |
| Its own test suite | `python tests/check_package.py` | 4/4 pass — but it only asserts packaging invariants, never syntax or behavior |
| Self-declared status | `VALIDATION.txt` | "JavaScript syntax: not verified. Live Chrome and provider API end-to-end tests: NOT RUN." |
| License | grep across the folder | **No LICENSE file and no copyright/permission grant anywhere** |

**Consequence: that extension cannot run.** `panel.js` is the entire side-panel UI and the agent loop; a parse error at line 8 means nothing loads. Combined with the missing license, it is a study reference, not a dependency.

## Capability comparison (both read from source)

| Dimension | `orbit-agent` | Orbit | 
|---|---|---|
| Providers | **xAI only**, `host_permissions: https://api.x.ai/*` | Any OpenAI-compatible endpoint + local Ollama + custom |
| Agent tools | 6 (`read_page`, `screenshot`, `click`, `type_text`, `navigate`, `scroll`) | **16** (`snapshot`, `screenshot`, `click`, `fill`, `type`, `select`, `scroll`, `focus`, `hover`, `press`, `wait`, `extract`, `read-tab`, `goto`, `nav-history`, `done`) |
| Step budget | 12 rounds | 8 steps + 2 free protocol retries |
| Element discovery | 200 visible controls, main frame only; README: "No shadow-root traversal" | 100 fields + 120 interactives **plus shadow-DOM traversal to depth 3** |
| Stale-target defence | `signature` string compared at write time | token-bound ref map + `documentIds` pinning + URL guard + label/tag recheck + navigation ends the step |
| Navigation | `tabs.update`, then "start a new request on the destination page" | commit-wait until the tab leaves the old URL, origin-verified snapshot, grant settled before navigating |
| Approval | per mutating action, JSON args shown | per **step** (up to 3 actions), origin + resolved tab refs + Enter-submission warning shown |
| Screenshot | `captureVisibleTab` quality 75 | quality 82, plus review dialog that shows the image, plus **local OCR** |
| Page reading | `document.body.innerText` | visibility-filtered TreeWalker, all-tabs digest, URL-fetch-as-text, automatic active-tab context |
| Error handling | surfaces provider body: `data.error?.message` | deliberately generic (an error body can echo secrets) |
| CSP | `script-src 'self'; object-src 'none'; connect-src https://api.x.ai` — **no `base-uri`** | adds `base-uri 'none'`, scoped `img-src`, loopback-limited `connect-src` |
| Storage | key in DOM memory only, never persisted | endpoint-bound in `storage.local` with revoke + delete-all |
| Tests | 4 packaging checks | 140 Node + 12 Python + 20 real-Chrome assertions |

**On every axis except one, Orbit is ahead.** Adopting this folder wholesale would be a downgrade.

## The one genuinely additive thing — and it was adopted

`orbit-agent` wires **xAI hosted server tools** that Orbit did not offer: `x_search` (with `enable_image_understanding`) and `code_interpreter`, alongside the `web_search` Orbit already had. Verified against vendor docs before building, not copied on trust:

- `docs.x.ai/developers/tools/overview` → `{"type":"web_search"}`, `{"type":"x_search"}`, `{"type":"code_interpreter"}`
- `docs.x.ai/developers/tools/x-search` → `"tools":[{"type":"x_search","enable_image_understanding":true}]`; the same parameter is **not** documented for `web_search`, so Orbit does not send it there.

Implemented in cycle 8 as three independent opt-in checkboxes in Settings → Advanced, with the guardrails Orbit's model requires: Responses format only; `x_search`/`code_interpreter` refused on any host but `https://api.x.ai`; and **all three stripped from the request during Agent mode and Reach research**, so a supervised run cannot begin billing the owner behind an approval dialog. 8 new behavioral tests in `tests/core.test.mjs` (140 Node total), plus a real-Chrome assertion that the three controls actually render.

## Deliberately not adopted

- **Its DOM executor.** `elements()[args.id]` indexes a live query at write time, so a page that adds or removes a node between read and click silently shifts every later id onto a different element. Orbit's token-bound map pinned to a `documentId` exists precisely to avoid that, and its own README concedes "A page can change between review and click".
- **`innerText` page reading.** Includes whatever the layout engine exposes with no visibility/aria-hidden filtering; Orbit's walker filters deliberately.
- **Provider error-body passthrough.** Displaying `data.error?.message` verbatim is friendlier but can echo credentials held in a request URL or body.
- **12-round budget.** Not an engine, a tuning number; raising Orbit's 8 without evidence of truncated tasks just widens the blast radius of a confused model.
- **xAI-only single-provider client, and its `host_permissions` model** (a hard-coded `https://api.x.ai/*` grant at install rather than Orbit's optional, per-origin request).
- **Its `commands` key** `open-orbit` colliding with Orbit's `_execute_action` on Alt+Shift+O — relevant only if both were ever loaded, which they must not be.

## The one architectural idea worth a real decision

`orbit-agent` uses the provider's **native function-calling** (`tools` + `function_call` + `function_call_output` replay). Orbit uses a fenced-JSON protocol it parses from prose, because that works on every endpoint including small local models that have no tool-calling support at all.

Native calling is more reliable where the provider supports it — fewer malformed blocks, no fence parsing, schema-validated arguments. Adding it as an *optional* mode (detected per profile, falling back to the fenced protocol) is the single most valuable thing this folder surfaced, and it is a genuine design change rather than a copy: it touches the agent loop, the observation format and the approval path. It needs its own cycle, not a bolt-on.

## What to do with the folder

Keep it as a reference, or delete it — it is gitignored either way and nothing in Orbit depends on it. If the owner wants it functional, the blocking fix is one line: the string at `panel.js:8` must not span a raw newline (e.g. build the label with `` `${role.toUpperCase()}\n${text}` ``). I did not patch it: it is the owner's unlicensed reference copy, outside the product, and fixing it would imply a provenance the folder itself disclaims.
