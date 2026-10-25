# Modernization Changelog

## Cycle 1 — 2026-10-25 — profile: Standard — branch `modernization/2026-10-25`

Same working session also delivered the Agent Reach integration (listed first for the record; it precedes the formal cycle).

### User-visible
- Agent Reach research: "Research with Reach" supervised research through the local Agent Reach CLI (native bridge, per-call approval, 4-call budget, citation finalizer), Settings → Reach panel with installer command + declared capabilities + login metadata.
- Research reliability: model prose replies at planning stage get one corrective re-prompt instead of ending the run; research runs no longer receive contradictory chat instructions.
- All dialogs now announce accessible names (settings, page context, page tools, Reach review); enforced by automated static gates.
- Docs now match behavior: SECURITY.md limits corrected (8 MB/100 chats/10-min research cap), TEST-RESULTS.md reflects 73+12 real tests, MANUAL-QA.md gained Reach + a11y checklists.

### Internal
- New modules: reach-core.js, reach-client.js, research-protocol.js, research-loop.js, native-host/orbit_reach_host.py + install.py; scripts/build.mjs now builds dist from src (incl. manifest).
- Tests: 69 → 73 Node tests (Reach suites + a11y-static), 12 Python bridge tests; package.json test/check wiring.
- Knowledge base: docs/modernization/* created (competitor, gaps, audits, roadmap, validation).

### Breaking changes
- manifest.json gains the nativeMessaging permission (required for Reach; chat/agent features unchanged without the bridge).

### Rollback
- All work is uncommitted on branch modernization/2026-10-25; `git checkout main` + clean restores the pre-cycle tree. Bridge (user-level, outside repo) removal instructions in README.
