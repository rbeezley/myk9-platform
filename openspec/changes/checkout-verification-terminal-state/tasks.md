## 1. Verification Contract

- [x] 1.1 Add typed checkout verification outcomes for processing, failed, and unavailable states
- [x] 1.2 Keep successful order/refund payload behavior compatible with existing callers
- [x] 1.3 Fail closed when Stripe cannot inspect or expire a cart's prior Checkout Session

## 2. Checkout Return Experience

- [x] 2.1 Replace overlapping interval polling with bounded sequential same-session verification
- [x] 2.2 Render distinct failed, unavailable, and still-processing states with honest exhibitor copy
- [x] 2.3 Provide same-session status checking and a link to the existing My Entries surface
- [x] 2.4 Bound individual verification requests, lifecycle-gate delayed results, and keep optional entry hydration from blocking confirmed success

## 3. Focused Testing

- [x] 3.1 Write failing unit tests for verification outcome classification before implementation
- [x] 3.2 Write failing component tests for the bounded still-processing state, terminal failure, unavailable state, and same-session recheck
- [x] 3.3 Run the focused checkout Vitest suites and app TypeScript check
- [x] 3.4 [ADDED] Grep every `verifyCheckoutSession` caller, run the myK9Show build, and record any unrelated broad-check failures
- [x] 3.5 [ADDED] Cover stalled/rejected checks, delayed entry hydration, cart identity, unmount safety, refunded status, and prior-session fail-closed behavior

## 4. Verification and Delivery

- [x] 4.1 Validate the OpenSpec change and verify implementation against every requirement and task
- [x] 4.2 Run payment-flow second-opinion review and resolve blocking findings
- [ ] 4.3 Commit the scoped change, open a PR with MYK9-98 acceptance evidence, and verify CI
- [ ] 4.4 Move MYK9-98 to In Review and post the implementation summary, checks, PR, risks, and acceptance result
- [ ] 4.5 Merge only after approval and green gates, then mark MYK9-98 Done, archive the OpenSpec change, and clean up the branch/worktree

## Validation Profile

- Risk: high
- Validation: full
- Rationale: [ADDED] The change controls the user-visible terminal state and server-side duplicate-payment guard of an online payment flow.

## Verification Evidence

- OpenSpec strict validation passed for both modified capabilities and all scenarios.
- Focused checkout and prior-session safety coverage passed: 4 files, 36 tests.
- myK9Show app/test TypeScript checks, changed-file lint, production build, and `git diff --check` passed.
- The broad myK9Show unit suite was stopped at the repository's 60-second hang limit after 55 seconds; no failures had been reported before interruption.
- Three adversarial payment reviewers approved the patched behavior after request-timeout, lifecycle, cart-identity, fail-closed, and copy findings were resolved.
