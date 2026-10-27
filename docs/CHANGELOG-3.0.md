# Orbit AI 3.0 — OpenDuet integration

3.0 ports the parts of [OpenDuet](../OpenDuet-main) that survive the move from a self-hosted
Docker platform to a single Manifest V3 extension: its prompt discipline, its skill router, its
human-handover contract, and its tap-answer chat surface. Nothing here adds a backend, a database,
a service worker job, or a network call Orbit did not already make.

Source of every idea below: `OpenDuet-main/openbot/` (`shared/bot-prompt.ts`,
`examples/openduet/agents.yaml`, `examples/openduet/skills.yaml`, `shared/first-day.ts`,
`shared/check-in.ts`, `agent-computer/src/secret-masking.ts`, `agent-computer/src/control.ts`).

## Operator prompt and action contract

`src/agent.js`

- **Snapshot provenance.** Every ref and `snapshotId` is bound to the snapshot that produced it,
  and the prompt forbids inventing either. The observation now carries `snapshotId:` so the model
  can cite it. A stale ref is refused by the page actuator, as before, but the model is now told
  what that refusal means and what to do next (re-snapshot), instead of retrying.
- **`computer_read`.** New action. After a state-changing step the model must read the page and
  report what it says. The page actuator checks the claim against the live text and rejects an
  observation the page does not support — the failure OpenDuet's provenance rule exists to stop.
  It ends the step, because the page it read is the page the next action must target.
- **`computer_request_secret`.** New action, with a real masked box (see below).
- **`computer_request_help`.** New action, with a real hand-back pause (see below).
- **`computer_list_files` / `computer_read_file` / `computer_write_file`.** New actions, backed by
  a bounded workspace (see below).
- **Provenance and voice in chat.** `PROVENANCE_RULES` and `VOICE_RULES` in `src/app.js` are
  adapted from OpenDuet's `PROVENANCE_GUIDANCE` and its chat-voice contract. An answer read from a
  reference is cited; an answer from the model's own knowledge says so and is marked unverified.
  Ordinary answers are one to three short sentences, one thought per paragraph.

## Skills and tool narrowing

`src/skills.js` (new)

OpenDuet's reason for `skills.yaml` is that a model picks the right tool reliably out of about ten
and unreliably out of thirty. The operator now offers 22 actions, so each run routes first:

| Skill | Routes on | Narrows to |
|---|---|---|
| `fill-a-form` | fill, form, enter, apply, checkout, submit | fill/type/select/click/press/read |
| `extract-data` | extract, scrape, list all, table, prices | extract/scroll/click/read |
| `compare-pages` | compare, versus, difference between | read-tab/snapshot/extract/read |
| `verify-a-claim` | verify, fact check, is it true | snapshot/extract/scroll/read |
| `sign-in` | sign in, log in, 2FA, captcha | click/fill/request_secret/request_help |
| `navigate-and-read` | open, go to, visit, summarize this page | goto/nav-history/read-tab/read |

The rules that make this safe rather than merely tidy:

- **An unmatched message keeps every tool.** Narrowing is an optimisation for recognised work,
  never a restriction on unrecognised work.
- **A skill adds no capability.** It can only ask for tools the operator already has, and every
  action still passes the approval gate.
- **A skill that declares no tools is prose**, and does not narrow at all.
- The matched skills' instructions are appended to the prompt, so a form-filling run is told how to
  fill a form rather than left to infer it from a tool list.

Users reach the same catalogue through **Skills** in the composer, or by typing `/slug` — the
command is written into the composer, so it is visible and editable before it is sent, and the
prefix is stripped before the model sees the request.

## Human handover

`src/agent-run.js`, `src/page-access.js`

- **`askSecret`** — a blocking dialog with a masked input. The value goes from the input to
  `secretFill` and nowhere else: not to the transcript, the conversation history, extension
  storage, or the model's context. The page returns only `filled N characters`.
  `secretFill` is the one path allowed to write a field the sensitive-field check refuses; it
  still requires the same document, a connected and visible element, and fires the page's own
  input/change events so framework-controlled fields update.
- **`askHandover`** — a blocking dialog for a sign-in, a phone code, or a CAPTCHA. Orbit does not
  act while the person has control. On hand-back the loop **re-reads the page before acting**,
  because every ref the model holds is stale by then. Stopping ends the run rather than continuing
  without the step.

Before 3.0 the prompt told the model to call these tools and the tools did nothing. That is worse
than not having them: the model reported a box that never appeared.

## Workspace

`src/agent-run.js`

OpenDuet gives each Bot a `/workspace` on its own computer. An extension has no filesystem, so
this is the nearest honest equivalent: named text files in extension storage, written only through
the approval gate. Bounded at 24 files, 20,000 characters per file, 120,000 total — an unbounded
"workspace" inside a 10 MB quota is a way to fill the user's storage with model output. Filenames
cannot contain path separators, so nothing can address outside the store.

## Chat surface

`src/app.js`, `dist/index.html`, `dist/styles.css`

- **Skills menu** in the composer, built with DOM nodes (CSP-safe, no `innerHTML`), each entry a
  `menuitem`.
- **Reply chips** under the newest finished answer only. Derived from the shape of the question
  rather than asked for as a model tool, so chips appear for a closed choice and never under an
  open question. Chips are dismissed while a run is in progress.

## Deliberately not ported

Docker, Bun, PostgreSQL, CopilotKit Intelligence threads, the Google OAuth server flow, the
proactive background engine, routines, team/SSO, and Automatic Learning. Each needs a server or a
long-lived worker that MV3 does not provide. The opt-in proactive check-in remains a future phase;
its design is in `OpenDuet-Integration-Plan.md`.

## Verification

`npm test` — 197 tests, 0 failures. New coverage:

- `tests/skills.test.mjs` — routing, narrowing, slash commands, chips (13)
- `tests/workspace.test.mjs` — storage bounds, path refusal, read-back (7)
- `tests/openbot-surface.test.mjs` — the surfaces a browser test cannot reach: secret never enters
  context, hand-back re-reads the page, workspace handled in the panel, chips only on the last
  message, and every advertised action has a handler (15)
- `tests/agent.test.mjs` — extended tool contracts and the prompt discipline (7 new)

`npm run check` passes: every shipped module parses, `src/` and `dist/` are in sync, and the native
host compiles.

Not verified here: real Chrome permission prompts, the dialogs' focus behaviour under a screen
reader, and whether a given provider's model routes the narrowed tool set better in practice. Those
are in `docs/MANUAL-QA.md`.
