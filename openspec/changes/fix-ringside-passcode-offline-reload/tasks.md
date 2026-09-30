# Tasks

## 1. Offline ringside navigation

- [x] 1.1 Register a ringside-only navigation fallback to the precached shell and verify the generated build serves ringside deep links without intercepting unrelated requests.
- [x] 1.2 Run service-worker-controlled browser reloads at show and scoresheet deep links online and offline. Both online navigations made service-worker-owned network requests; both offline reloads returned HTTP 200 from the service worker and kept the deep-link URL in the local preview. A focused handler test covers stalled requests and bodies, HTTP 5xx, and captive portal HTML. A production-build Chrome run also returned the cached shell for intercepted 503 and portal-style 200 responses (one route hit each) and for offline reload while keeping the deep-link URL. The separate browser stall attempt lost its task-owned session before the script ran; the timed-fetch and stalled-body cases passed in unit tests. Prepared-show content still needs checking after deployment.

## 2. Passcode-only draft show structure

- [x] 2.1 Add a narrow, current-generation staff claim predicate to the latest show/trial/class read policies; register behavioral SQL covering same-show staff and exhibitor claims, other-show, stale claim, no claim, deleted show, signed-out anon, and published parity.
- [x] 2.2 Update the existing ringside show boundary to verify a cold local miss under a stamped anonymous passcode session; verify focused tests cover successful replication and truthful refresh failure.
- [x] 2.3 Verify the passcode session and show boundary work together in a focused integration test, including a draft show's initial cold load.

## 3. Integration and delivery

- [ ] 3.1 Run focused tests, database contract tests, app typecheck, lint, code quality ratchet, OpenSpec validation, and risk-required review; record outcomes and any local SQL/browser limits. Focused tests, local browser reloads, build, typecheck, lint, ratchet, and CI SQL behavior passed. Independent review remains: the Claude reviewer reached its weekly usage limit. The full local shuffled Vitest run produced no test output for 30 seconds and was stopped per repository instructions.
- [ ] 3.2 Commit, push, open a PR after repository authorization, pass CI and the review gate, and obtain separate merge approval; link the result to MYK9-819 and MYK9-829.
- [ ] 3.3 After separately authorized migration and frontend deployment, repeat the deployed anonymous passcode join and two-score offline reload/reconnect walk; update the October 10 evidence report and checklist with screenshots and exact pass/fail outcomes.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes offline boot and Supabase RLS for the show-day scoring path.
