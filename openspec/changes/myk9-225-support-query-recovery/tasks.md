## 1. Assertion-first coverage

- [x] 1.1 Extend the Support Inbox hook mock with query `refetch`/fetch state needed to exercise recovery.
- [x] 1.2 Add failing assertions proving a populated query error shows unavailable counts, meaningful copy, and Retry without empty/no-selection/data claims.
- [x] 1.3 Add failing assertions proving blank, whitespace-only, and non-Error failures use meaningful fallback copy.
- [x] 1.4 Add failing assertions proving initial loading keeps counts unavailable and does not render error, empty, or data states.
- [x] 1.5 Add failing assertions proving keyboard Retry reissues the query, prevents stacked requests while fetching, and successful rerender recovers to current data or a genuine empty state.

Red evidence: the focused file ran 13 tests with the 5 existing tests passing and all 8 new behavior cases failing against the pre-change page (missing unknown counts, fallback handling, loading semantics, Retry, and recovery).

## 2. Support Inbox state integrity

- [x] 2.1 Derive a non-blank operator-facing query error message at the page presentation boundary.
- [x] 2.2 Render loading, error, successful-empty, and successful-data branches mutually exclusively, suppressing ticket-derived detail during error.
- [x] 2.3 Show filter counts as unavailable until a successful ticket result exists.
- [x] 2.4 Wire a native keyboard-accessible Retry button to the existing query `refetch`, preventing stacked requests while retrying.

Green evidence: the focused Support Inbox file passes all 13 tests, including all 8 new failure/loading/recovery cases.

## 3. Local verification

- [x] 3.1 Run the focused Support Inbox tests at least six shuffled times and record the passing result.
- [x] 3.2 Run myK9Show typecheck and lint plus `git diff --check`.
- [x] 3.3 Validate the OpenSpec change and verify implementation coverage, correctness, and design coherence with no critical local findings.
- [x] 3.4 Review the final diff for unrelated changes and commit the verified implementation locally.

Verification evidence: focused tests passed 13/13 for shuffle seeds 22501–22506 (78/78 aggregate); `pnpm --filter @myk9/show typecheck` and `pnpm --filter @myk9/show lint` exited 0; strict OpenSpec validation and `git diff --check` passed.

Implementation audit: the one modified requirement and all five scenarios map to `SupportInboxPage` and its focused test; the design uses the existing page/query patterns with no critical or warning findings. Tasks 4.1–4.4 remain open because PR, CI/merge, staging replay, Linear/plan updates, archive, and cleanup are post-commit shared-system gates.

## 4. Delivery and closure gates

- [ ] 4.1 After approval, push the feature branch, open a PR linked to MYK9-225 and this OpenSpec change, obtain review, pass CI, and merge.
- [ ] 4.2 After the merged commit deploys to staging, replay a controlled HTTP 500 followed by success at 1440×900 and 768×1024; record error copy, unknown counts, exclusivity, Retry request, recovery, evidence filenames, and checksums.
- [ ] 4.3 Post implementation and browser evidence to MYK9-225, move it to Done only when every acceptance criterion passes, and update `docs/plan-linear-backlog-batches.md`.
- [ ] 4.4 Sync the `support-tickets` delta, archive the OpenSpec change with merge evidence, push approved tracking changes to `main`, then perform branch/worktree cleanup.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This is an isolated myK9Show operator-state fix with no persistence, authorization, replication, or shared-system behavior changes, but it changes a launch-relevant recovery flow and therefore needs focused interaction coverage plus app typecheck/lint and post-merge browser proof.
