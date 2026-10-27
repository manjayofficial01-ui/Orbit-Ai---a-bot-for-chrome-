# OpenDuet → Orbit AI: Integration Plan

**Purpose.** Reverse-engineer the CopilotKit/OpenBot-derived "OpenDuet" resources in `OpenDuet-main/` and port the highest-leverage capabilities into the Orbit AI Chrome extension so it becomes a genuinely more powerful agentic assistant — without breaking its MV3 constraints, BYOP model support, or supervised-by-default posture.

**Constraint summary (the shape we are upgrading, not replacing).** Orbit is a single-page Manifest V3 extension: no long-lived service worker, no backend, no database, no Docker, no CopilotKit Intelligence project, no Python/Rust tooling, no Google OAuth server. It speaks OpenAI-compatible HTTP only, over HTTPS (or localhost loopback), with user-provided keys. **Everything ported must live in JS shipped into `src/` → `dist/`.**

---

## 1. What OpenDuet actually is

OpenDuet is the "name and Bots on top" layer over [CopilotKit OpenBot](https://github.com/CopilotKit/openbot) — a self-hosted, multi-agent platform built on AG-UI (the `@ag-ui` protocol), LangGraph/AG2/CrewAI-style framework backends, Postgres, Docker Bot computers, and CopilotKit Intelligence (threads + memory).

- `openbot/agent-bot`: the built-in Bot, a tiny Bun service speaking `/ag-ui` over `/v1/chat/completions`
- `openbot/agent-langgraph` / `agent-ag2`: framework variants of the same Bot
- `openbot/agent-computer`: the "Bot's own computer" — Playwright-driven browser with ARIA snapshots, secret masking, sign-in takeover, workspace files, shell
- `openbot/supervisor`: container lifecycle + port management
- `openbot/app`: the CopilotKit-powered web UI (web + React)
- `openbot/server`: Postgres-backed API, approvals, plugins, proactive engine, tasks, routines
- `openbot/examples/openduet`: the tenant package — `agents.yaml`, `skills.yaml`, `brand.yaml`, `model.yaml` (everything product-specific)
- `shared/`: cross-cutting modules used by every Bot

OpenDuet's design thesis is worth adopting wholesale: **proactive, human-in-the-loop, ask-before-it-acts.** From its README: *"It starts your day with a short brief, keeps working on a computer of its own while you step away, and comes back only when something needs you. Before it sends, pays, signs, or deletes anything, it shows you exactly what it is about to do and waits for your answer."*

---

## 2. Highest-value ingredients to port to Orbit

### PRIORITY 1 — Prompt/system-prompt upgrades (zero infra, immediate quality gain)

**a. The OpenDuet `COMPUTER_GUIDANCE` + `PROVENANCE_GUIDANCE` instructions** (`openbot/shared/bot-prompt.ts`).

OpenDuet's built-in Bot prompt is materially better than Orbit's at two things Orbit is weakest at:

1. **Snapshot-before-act discipline** — *"Element refs are opaque and valid only with the snapshotId that produced them... Never invent a ref or a snapshotId"* — this is the single most reliable anti-loop instruction for browser-use agents, and it maps 1:1 onto Orbit's `agent.js` refs.
2. **Honest provenance** — *"Say where an answer came from... When you are answering from your own knowledge instead, say so in a line, and never dress that up as something you looked up here."* — closes Orbit's "claimed a source it didn't read" failure mode.

**b. Concise chat voice** (`agents.yaml`, `system_prompt`) — 35-word ordinary answers, each paragraph a separate message bubble, one-line answers ("Jules is your accountant at Finch Accounting."), never pasting long work into Chat ("Anything longer goes into a page or to Tasks"). This is the "Grok-like interaction" Orbit advertises but currently under-delivers on.

**c. First-day frame + "Get to know me" routine** (`shared/first-day.ts`). Orbit has no onboarding hook; a one-time first-message that learns the user and offers 3 concrete ways it can help is a classic high-conversion move. Port the framing pattern and the 3-part response contract.

**d. The `NO_ANSWER_CAME` failure-massage** (`shared/bot-prompt.ts`). A tool call nobody answered must not end the conversation in silence — providers reject it. Orbit's agent loop already needs this exact guard when an approval is refused.

**e. Skills-based tool narrowing** (`skills.yaml`). OpenDuet assigns every tool a `skills` slug; per turn, the model is offered *only the tools of the skills that match the message*, because a model picks the right tool reliably out of ~10, unreliably out of 30. Orbit's 17 action tools + 3 provider-hosted tools risk this exact degradation. Implementing a lightweight skill/keyword router in `core.js` is cheap and high-value.

### PRIORITY 2 — Agent-loop hardening (keeps Orbit safe but much stronger)

**a. Secret masking / `computer_request_secret`** (`agent-computer/src/secret-masking.ts`). OpenDuet's gold standard: when the Bot needs ONE value (password, 2FA code), it clicks the field then calls `computer_request_secret(ref, label)` — the user types into a **masked** box that goes straight to the page; the Bot never sees it. This is a net-new security capability for Orbit (currently it has no secret-handling path at all) and maps onto the existing snapshot field extraction.

**b. `SnapshotRequiredError` + recovery** (`agent-computer/src/control.ts`). After handback to a human, refuse all bot actions with "Take a fresh browser snapshot after handback before acting." Directly pluggable into Orbit's approval gate and tab-switching.

**c. Stale-target & overlay handling** (`agent-computer/src/action-barrier.ts`, `live-page.ts`, `challenge.ts`). Action-barrier semantics ("A person has control" is not an error, never retry in a loop) and visible-challenge detection map onto Orbit's existing overlay-blocker and anti-stale target checks — strengthen with explicit ref-resurrection semantics.

**d. Provenance-cited agent observations.** OpenDuet requires citations for tool-derived answers. Extend Orbit's agent to cite which refs/actions produced each observation, and to mark unverified claims.

**e. Tool-result pairing / re-ordering** (`history.ts`). AG-UI history often returns a tool result before the call that produced it (read from durable store). Orbit's streaming loop assumes strict ordering; add a result-by-call re-pairing buffer so an out-of-order result never produces a malformed request to the provider.

### PRIORITY 3 — Proactive / background capability (as an extension, given MV3 limits)

OpenDuet's `proactive/engine.ts` is a background run loop that reads only new data since the last run, records up to `MAX_SUGGESTIONS_PER_RUN` suggestions via `suggest_next_step`, forms up to `MAX_MEMORIES_PER_RUN` durable facts via `form_memory`, then writes a **check-in** in the user's own thread.

Orbit cannot run a background service worker job (MV3 kills idle workers, and Orbit intentionally avoids it). Reimplement the **user-triggered** variant: a "**Check what's new**" button that:

- remembers the last check-in time in `chrome.storage.local`
- reads only the user's granted mail/calendar connectors (user-installed MCP or server-side) — bounded, with an explicit "look back X" cap
- records suggestions as task cards under the composer ("On it." + one-line why)
- never acts; only offers

`shared/check-in.ts` gives the framing/JSON contract; the engine's `researchInstruction` template is the system prompt for this run. This is the most compelling "agentic proactivity" Orbit lacks and it fits MV3 perfectly because it's opt-in and bounded.

### PRIORITY 4 — Tool contract expansion (browser-use, ported from `agent-computer`)

Orbit's action vocabulary (`agent.js` `AGENT_TOOLS`) is close to OpenDuet's but missing several well-engineered primitives:

| OpenDuet tool | Why Orbit wants it | Notes |
|---|---|---|
| `computer_snapshot` | Already has `snapshot`, but needs the `snapshotId` provenance contract + stale-ref refusal | Priority |
| `computer_request_help` / takeover | "The person takes control... and hands it back" | Needs approval-gate redesign |
| `computer_request_secret` | See secret masking | New security capability |
| `computer_write_file` / `read_file` / `list_files` | Bot's persistent workspace across conversations | `agent-computer/src/workspace.ts` |
| `computer_read` | After a form submit, find out what the page now says | Closes the "clicked but didn't verify" loop |
| `computer_navigate` | Explicit, verified navigation | `agent-computer/src/navigation.ts` |
| `computer_request_url` | Bounded URL reads | `agent-computer/src/request-validation.ts` |
| `demonstrate` | User teaches the Bot by doing, then Bot replays | `agent-computer/src/demonstration.ts` — ambitious |
| `demonstration` replay | — | ambitious |
| `computer_list_files` | Persistent workspace | easy |
| `computer_navigate` | — | |

OpenDuet's tool execution is split across `agent-computer/src/control.ts` (state machine, approvals, TTLs), `live-page.ts` (Page/DOM actuation), `aria-snapshot.ts` (the snapshot extractor), `virtual-display.ts`/`screencast.ts` (screenshots for vision), `identity.ts`/`profiles.ts`/`session-cookies.ts` (session persistence), and `egress.ts`/`page-network.ts` (network bounds). For an extension, only the *contract* and a subset of implementations are portable.

**`computer_read` is the highest single-value addition** — currently Orbit can click a form and submit, but has no "go read what the page says now" after a state-changing action. OpenDuet's guidance explicitly mandates it ("After you submit a form, call computer_read to find out what the page now says").

### PRIORITY 5 — UI / interaction patterns (from the CopilotKit app)

- **Task cards**: "Start on a suggestion, and it becomes a task — a conversation of its own with the Bot. Chat stays one thread with a card for each piece of work." → Orbit's chat already has threads; a task-card UI layer (Working → Ready for review / Needs input → Resolved) is a big UX win.
- **Reply chips** (`suggest_replies`, `server/src/openduet/replies.ts`): tap answers for choices.
- **Channels** (`channels.yaml` + `run-channel.ts`): named workspaces whose first turn is a `channel-hello` with the "Want me to suggest tasks I can do here?" contract (`shared/channel-hello.ts`).
- **Skills menu** (`skills.yaml`): user-invocable `/` commands — in Orbit's case, local skills that call its own tools (`/research`, `/compare`, `/draft`), each with a declared tool-set for the narrowing router.
- **Routine / scheduled work** (`routines/runner.ts`, `schedule.ts`): not portable (needs a worker) — skip.
- **Automatic Learning** (`shared/learning.ts`, `server/src/learning/`): user corrections → fine-tunes behavior. Ambitious; keep as a note for future.

---

## 3. Prompts worth copying verbatim or adapting

```yaml
# shared/bot-prompt.ts — COMPUTER_GUIDANCE (abridged):
"You are a Bot with your own computer, a real web browser the person can watch you use.
 When you are asked to look at, open, visit, check or read a web page, call computer_navigate.
 Never claim you cannot browse: opening a page is something you can actually do.
 Opening a page returns its title and its readable text. Answer from that text.
 Never tell the person to go and look at the page themselves: you have already read it.

 You can also ACT on a page: fill in forms, click buttons, tick boxes and follow links.
 The order matters. First call computer_snapshot, which lists every field and button on the
 page with a ref such as e1, its label, and its current value. Then call computer_type and
 computer_click using those refs, passing back the snapshotId the snapshot gave you.
 Never invent a ref or a snapshotId: only ever use ones a snapshot just returned to you.
 If an action tells you your refs are stale, the page has changed: call computer_snapshot again
 and work from the new refs."

# shared/bot-prompt.ts — PROVENANCE_GUIDANCE (abridged):
"Say where an answer came from. When you read it with one of your tools, cite what you read.
 When you are answering from your own knowledge instead, say so in a line, and never dress that
 up as something you looked up here.
 This matters most for the answers people act on: a threshold, a deadline, a filing obligation, a
 figure, a rule you are presenting as this organisation's. Never state one of those as established
 here without having read it somewhere you can name."

# agents.yaml — voice / concision (abridged):
"Reply chips... a reply is a few short sentences in the first person, each thought its own
 paragraph... Do not add a recap, extra dates, background, or an unsolicited follow-up."
```

---

## 4. The AG-UI protocol bridge (the thing we should NOT reimplement)

OpenDuet's agents speak AG-UI: `agent-bot`/`agent-langgraph` are merely HTTP servers whose `/ag-ui` POST endpoint streams SSE events (`RUN_STARTED` → `TEXT_MESSAGE_START`/`CONTENT`/`END` → `TOOL_CALL_START`/`ARGS`/`END` → `RUN_FINISHED`). The **tool loop runs on the client** (the surface executes tools and appends results, starting a new run).

**Portability verdict: do not port the runtime.** AG-UI is the server's job. But **study `shared/` message translation** (`history.ts`, `user-content.ts`, `component-markers.ts`) — the `toProviderMessages` / `toLangChainMessages` reordering + pairing logic is exactly the kind of "the API wants X but my transcript says Y" fix Orbit needs in `core.js`.

---

## 5. What we will NOT port (and why)

| OpenDuet piece | Reason |
|---|---|
| Docker + Bun + PostgreSQL + Compose | No backend allowed; Orbit is client-only |
| CopilotKit Intelligence / threads & memory | External dependency; memory must stay local (`chrome.storage.local`) |
| Google OAuth server flow (Gmail/Calendar plugins) | No server to hold tokens; connectors must be user-managed locally/MCP |
| Proactive background engine (sweep/queue) | MV3 has no background worker; only the opt-in triggered variant |
| Routines (scheduled work) | Same reason |
| Team bots, roles, SSO, org store | Out of scope for a personal BYOK extension |
| Full `agent-computer` Docker computer | We only port the tool contracts + a subset of DOM actuation |
| Automatic Learning fine-tuning pipeline | Ambitious future work; not this phase |

---

## 6. Phased migration plan

**Status: Phases 1–4 shipped (3.0.0 and 3.1.0). Phase 5 remains optional.** See
`docs/CHANGELOG-3.0.md` and `docs/CHANGELOG-3.1.md` for what landed and the tests that lock it.

### Phase 1 — Prompt & reasoning upgrades — DONE (3.0.0)
- [x] Merge `COMPUTER_GUIDANCE` snapshot-first + "never invent a ref" + "call computer_read after submit" into `agent.js` system prompt; add `PROVENANCE_GUIDANCE` to the chat system prompt.
- [x] Add "concise voice" guidance (one-line answers, separate paragraphs) — `VOICE_RULES`, applied to every turn.
- [x] Add `NO_ANSWER_CAME`-style guard in the agent loop for refused approvals.
- [x] Verify: `npm test` + `npm run check` green (195 tests).

### Phase 2 — Task cards, skills narrowing, reply chips — DONE (3.0.0 + 3.1.0)
- [x] Implement skill→tools narrowing router (`src/skills.js`), plus a Skills menu and `/slug` commands in the UI.
- [x] Task-card layer (3.1.0): the Task button opens a conversation of its own under the task frame; Chat keeps "On it." plus a card with a live computed-status glyph; Tasks sidebar section and task bar (Mark done / Reopen / Try again).
- [x] Reply chips for common choices.
- [x] UI updates (`dist/styles.css`).

### Phase 3 — Agent-tool expansion — DONE (3.0.0)
- [x] Add `computer_request_secret` path: masked secret box via a blocking dialog, value never entering model context.
- [x] Add `computer_read` as a first-class post-action verification step, verified against the live page.
- [x] Add `computer_list_files` / `read_file` / `write_file` backed by a bounded extension-storage workspace.
- [x] Enforce snapshot provenance: refs bound to a `snapshotId`, stale refs refused with recovery guidance.
- [x] Result-by-call pairing: the agent loop never emits a tool call without its result.
- [x] `computer_request_help` as a real hand-back pause that re-reads the page before continuing.

### Phase 4 — Proactive check-in — DONE (3.1.0)
- [x] "What's new" button: bounded last-read tracking (`state.checkin.lastRunAt`), one-day first window, ≤6 open granted pages, ≤5 suggestion cards (`src/checkin.js`, bounds enforced in code).
- [x] Memory: `memory_save` operator action through the approval gate, provenance + review state + content dedupe (`src/memory.js`), review UI in Settings → Context, bounded injection under the untrusted-data banner.

### Phase 5 — Advanced (long-term, optional)
- [ ] Demonstration/tutorial mode (record→replay) — requires page.js actuator rework.
- [ ] Channels (`channels.yaml`-style per-project workspaces).
- [ ] Automatic Learning from corrections (the memory layer in 3.1.0 is the substrate; auto-extraction stays off by design).

---

## 7. Verification before any change lands

Per the existing repo discipline:
1. `node tests/smoke.cjs` + `node tests/stream.cjs` must pass after every phase.
2. `npm run check` (syntax checks on runtime files) must pass.
3. `scripts/build.mjs` must sync `src/` → `dist/` cleanly.
4. Manual: load unpacked extension, run one agent task end-to-end, verify approval dialog shows site + action, verify no unexpected network calls.

---

## 8. Files we will touch

- `src/agent.js` — system prompt, tool list, provenance, stale-ref guards
- `src/agent-run.js` — `computer_read` step, result pairing, snapshot provenance
- `src/core.js` — request assembly (tool narrowing), `NO_ANSWER_CAME` guard, skills router
- `src/app.js` / `styles.css` — task cards, skills menu, reply chips, check-in button
- `src/manifest.json` — only if new permissions needed
- `tests/` — new unit tests for each phase

---

## Next step

Confirm **Phase 1** (prompt + reasoning upgrades) to start. It is low-risk, delivers immediate quality gains, and does not touch the approval flow or permissions. On approval I will begin edits and report each change.
