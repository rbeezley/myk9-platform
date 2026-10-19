# Design

## Context

Read full issues and comments. #3085 already uses ClassPrintPanel and the Reports preview/descriptor, recording through the existing paperwork writer when the browser print dialog closes; cancellation intentionally records and row Undo reverses it. #3091 already routes stored-time formatting through integer centiseconds. Read docs/INTENT.md: secretary workflows should feel easy, preserve existing offline-first queries/mutations.

## Decisions

- Reuse existing application pages and showDayProof.helpers guarded loopback client/role contexts. No duplicate product surface is needed; a link cannot replace verifying actual preview and print side effects.
- Use fresh per-scenario classes/entries/assignments from canonical disposable seed references. Never reset or edit a shared show. Require served build stamp to match tested source, capture SQL/replica and rendered artifacts, and close every owned browser context even when sign-in fails.
- Reuse the existing short proof config/job for CI rather than copying its stack, network and artifact policy. Keep zero retries and require all selected cases on final head. Do not change the hour-long proof for this batch.
- Print proof must observe the real app calling the browser print API and its actual lifecycle. Synthetic afterprint/focus events or mocked print returns may supplement diagnostics but do not satisfy native dialog acceptance. Exercise print/cancel and Undo where the environment permits; record a precise gate if it cannot.
- At both widths assert Overview remains selected; batch creates one real merged PDF with expected sheets; each row keeps Printed/time/Undo, survives reload, and matches Reports. Undo must update the same record. Inspect page count/text of actual generated PDFs, not an inferred component prop.
- Run-sheet proof asserts literal 61.23 -> 1:01.23 using the actual row, SQL and judge UI, with exact scope to the same dog. Existing formatter/run-sheet consumer tests cover boundaries/carries and exhibitor rounding.
- On a reproduced product failure, read the relevant architecture, write a failing real-caller assertion first, then fix minimally. Preserve replication and existing print identity/fingerprint behavior. No speculative patch for a missing operator artifact.

## Risks and recovery

- Native print behavior differs by engine: distinguish Chromium/Firefox/WebKit from Safari; retain any unverified native gate rather than claim equivalence.
- A PDF preview may be stale or a record may outlive it: use the actual preview rows/content and existing shared writer; verify reload/Reports and Undo against stored data.
- Fixture or auth failure must fail closed: no fallback to linked Supabase and no retries that mask it. Generated runner accounts and synthetic artifacts only; artifact scan before publication.
- Local tooling has no Docker; use worktree-owned Supabase native 2.121.0 (official digest verified), with unique stack/ports, and destroy that stack in cleanup. CI continues using its disposable Docker lifecycle.
- Primary checkout has other tasks' audit edits. Preserve them. The initial old-primary checker was interrupted; the linked current checker reports primary-dirty preflight. Run the current checker read-only from primary and disposition any actual overlaps before implementation.

## Validation Profile

Inflight disposition: current-main scan from primary completed against 206 sources, exit 1 for this task's own scaffold and unchecked-out branch `richardbeezley1/myk9-1244-overview-print-panel`. That old branch has no PR and no active worktree; its last WIP predates the replacement implementation merged in #3085. This batch adds proof/config only and does not edit its cockpit source paths. Preserve that branch. The 52 older branches are inventory-only. Linear In Progress survey was empty before this task claimed its two issues; open PRs are dependency updates only. No concurrent implementation overlap was found on intended proof/config files.

- Risk: low initially; reclassify if product logic changes.
- Validation: focused local proof/related tests, proof TypeScript, format, ratchet, OpenSpec; full CI and final-head browser job required.
- Rationale: existing implementations are merged; this batch initially adds verification only. Native print limitations remain explicit.

## Migration and rollout

## Plan verification

Initial coverage 90/100 -> 100/100 after making artifact retention and cancellation failure explicit below. This scores the verification plan, not issue acceptance.

| Requirement                                           | Coverage and cited plan location                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Select review issues without duplicating fixes        | Covered: Context, tasks 1.1/1.2; existing #3085/#3091 inspected, physical-stock gate excluded                                                              |
| Avoid shared-data changes/auth leakage                | Covered: Decisions and Risks; guarded loopback target, generated accounts, fresh fixtures, artifact scanner, whole-stack destruction                       |
| Time rounding and real consumer                       | Covered: Decisions, tasks 2.1/2.2; exact dog/value, reload, SQL and judge parity; failures prevent closure                                                 |
| Preview/batch/persistence/Reports/Undo at both widths | Covered: Decisions, tasks 3.1/3.2; real merged PDF, real print API, database and reload checks                                                             |
| Native print cancellation unavailable                 | Expanded: leave MYK9-1244 In Progress with exact failed launch/engine gate; headless afterprint cannot establish native cancellation                       |
| Error/recovery and partial test failure               | Covered: Risks; fail closed on identity/auth/SQL/assertion failures, no retries or shared fallback, cleanup on failure                                     |
| Ship with final-source review/CI                      | Covered: Validation Profile and tasks 4.1/4.2; source-stamped zero-retry proof, independent review, authoritative watcher, merge confirmation              |
| Cleanup and durable evidence                          | Expanded: task 4.4; scan and preserve synthetic report/PDF/screenshots outside the worktree before removing only owned resources; never retain credentials |

No migration/compatibility or production-performance change is proposed. Small fixture/PDF checks run serially under the existing short CI timeout. A newly reproduced product defect requires a revised scope and red-to-green caller assertion before code changes.

No migration or production deploy is planned. Required existing fixes are already on main; verify production ancestry read-only only if a criterion needs it. Merge proof after review and required CI; read full issues again, record evidence/remaining gates and close passing ones only. Archive after required acceptance evidence is complete; preserve unfinished operator gates.
