# Verified test results

- Node syntax checks: dist/app.js, dist/core.js and dist/background.js passed.
- Node built-in test suite: 26 passed, 0 failed.
- No external npm dependencies, so no dependency installation/audit was needed. Absence of dependencies is not a security certification.
- Tests cover endpoint validation, protocol request mapping, optional parameters, budgets, SSE split UTF-8/CRLF/multiline/comment/EOF cases, JSON fallback, completion/failure detection, error-body privacy, safe fetch flags, exports and manifest constraints.
- Generation transport tests use mock fetch responses, NOT paid inference.
- No Chrome/Chromium executable was available in this environment. Native UI, extension loading, permission prompts, accessibility and side-panel handoff were NOT browser-tested.
- No provider credentials supplied. Live inference, actual model compatibility and hosted search were NOT verified.
- A fresh reconstruction was created; no prior repository or previous test outputs were available.

## Raw automated test output

```text
TAP version 13
# Subtest: normalizes trailing slash
ok 1 - normalizes trailing slash
  ---
  duration_ms: 1.242639
  ...
# Subtest: rejects nonloopback HTTP
ok 2 - rejects nonloopback HTTP
  ---
  duration_ms: 0.276699
  ...
# Subtest: allows localhost HTTP
ok 3 - allows localhost HTTP
  ---
  duration_ms: 0.225321
  ...
# Subtest: rejects credentials, queries, fragments and executable schemes
ok 4 - rejects credentials, queries, fragments and executable schemes
  ---
  duration_ms: 0.237259
  ...
# Subtest: requests hostname scope without API path or port
ok 5 - requests hostname scope without API path or port
  ---
  duration_ms: 0.241208
  ...
# Subtest: chat body omits optional defaults
ok 6 - chat body omits optional defaults
  ---
  duration_ms: 0.76508
  ...
# Subtest: Responses body is stateless and opts out of object storage
ok 7 - Responses body is stateless and opts out of object storage
  ---
  duration_ms: 0.189688
  ...
# Subtest: token aliases
ok 8 - token aliases
  ---
  duration_ms: 0.179357
  ...
# Subtest: reasoning mappings
ok 9 - reasoning mappings
  ---
  duration_ms: 0.24472
  ...
# Subtest: invalid number validation
ok 10 - invalid number validation
  ---
  duration_ms: 0.285433
  ...
# Subtest: model required
ok 11 - model required
  ---
  duration_ms: 0.212502
  ...
# Subtest: request budget enforced
ok 12 - request budget enforced
  ---
  duration_ms: 1.211808
  ...
# Subtest: search restricted by API and origin
ok 13 - search restricted by API and origin
  ---
  duration_ms: 0.302931
  ...
# Subtest: extract JSON text and refusals
ok 14 - extract JSON text and refusals
  ---
  duration_ms: 0.246224
  ...
# Subtest: extract citations
ok 15 - extract citations
  ---
  duration_ms: 0.166343
  ...
# Subtest: markdown includes interruption state
ok 16 - markdown includes interruption state
  ---
  duration_ms: 0.304979
  ...
# Subtest: SSE split UTF8 CRLF multiline comments
ok 17 - SSE split UTF8 CRLF multiline comments
  ---
  duration_ms: 5.750209
  ...
# Subtest: SSE last event without final blank
ok 18 - SSE last event without final blank
  ---
  duration_ms: 0.48771
  ...
# Subtest: SSE oversized frame rejected
ok 19 - SSE oversized frame rejected
  ---
  duration_ms: 8.593991
  ...
# Subtest: chat transport + safe fetch options
ok 20 - chat transport + safe fetch options
  ---
  duration_ms: 22.8023
  ...
# Subtest: Responses semantic stream
ok 21 - Responses semantic stream
  ---
  duration_ms: 1.217731
  ...
# Subtest: JSON fallback
ok 22 - JSON fallback
  ---
  duration_ms: 1.31498
  ...
# Subtest: premature stream close is failure
ok 23 - premature stream close is failure
  ---
  duration_ms: 1.11771
  ...
# Subtest: provider error body is not leaked
ok 24 - provider error body is not leaked
  ---
  duration_ms: 0.447529
  ...
# Subtest: incomplete Responses JSON is failure
ok 25 - incomplete Responses JSON is failure
  ---
  duration_ms: 1.416577
  ...
# Subtest: manifest least privilege and packaged code
ok 26 - manifest least privilege and packaged code
  ---
  duration_ms: 0.820992
  ...
1..26
# tests 26
# suites 0
# pass 26
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 134.859268

```
