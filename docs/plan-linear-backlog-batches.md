# Linear Backlog Batch Plan — Todo + Backlog Triage (2026-08-21)

> **Status:** Active — Batches 0–3 complete except MYK9-204 (operator-blocked on Richard). **Batch 3.5 Lane A and Batch 4 are complete:** MYK9-233, MYK9-236, and MYK9-211 are Done and deployed as of 2026-08-24. **Batch 3.5 Lane B step 1 (MYK9-245) merged and is Done as of 2026-08-25; MYK9-235 and MYK9-234 remain.** **Read "[HANDOFF 2026-08-24]" under Batch 3.5 before starting anything** — it records what was already claimed by another agent, three issues filed after the last registry refresh, and the verification traps this batch has already hit. Lanes C–D may run in parallel, then Batch 5.

**Goal:** Account for the tracked MYK9 backlog, close every issue whose current-cycle acceptance criteria and evidence gate can be completed, and leave every deferred/operator-gated issue in an explicit honest state with its trigger recorded. Minimize wall-clock time with capacity-bounded parallel lanes where files and contracts do not overlap and serialized lanes where they do. Linear is the live issue-count source; this plan records execution disposition rather than a point-in-time total.

**Success condition:** “accounted for” is not the same as “closed.” Current-cycle work reaches Done only after its acceptance criteria and evidence gate pass. Deferred, parked, cutover, device, and other operator-gated work remains open in the appropriate Linear state with an owner and trigger; the plan does not manufacture closure by narrowing an issue while leaving stated scope incomplete.

**Canonical primary-disposition registry:** every issue has exactly one primary execution disposition below. References elsewhere explain dependencies and do not count as additional assignments.

<!--
PRIMARY:MYK9-211=batch-4-verification
PRIMARY:MYK9-163=batch-1-lane-1c
PRIMARY:MYK9-57=batch-1-lane-1d
PRIMARY:MYK9-54=completed-batch-1-lane-1a
PRIMARY:MYK9-225=batch-1-lane-1b
PRIMARY:MYK9-226=batch-1-lane-1g
PRIMARY:MYK9-227=deferred-ring-sport-trigger
PRIMARY:MYK9-228=batch-0.5-active
PRIMARY:MYK9-229=completed-batch-3-lane-3a-step-2
PRIMARY:MYK9-230=batch-2-lane-2d-step-2
PRIMARY:MYK9-231=batch-2-lane-2d-step-3
PRIMARY:MYK9-232=batch-2-lane-2d-step-1
PRIMARY:MYK9-224=batch-0-deploy
PRIMARY:MYK9-161=batch-0-deploy
PRIMARY:MYK9-26=batch-0-current-scope-plus-deferred-remainder
PRIMARY:MYK9-199=batch-0-deploy
PRIMARY:MYK9-195=parked-per-decision-d7
PRIMARY:MYK9-126=batch-5-final-resilience-g9
PRIMARY:MYK9-110=batch-5-post-launch-pitr
PRIMARY:MYK9-222=completed-batch-3-lane-3c
PRIMARY:MYK9-218=completed-batch-3-lane-3c
PRIMARY:MYK9-221=completed-batch-3-lane-3b
PRIMARY:MYK9-220=completed-batch-3-lane-3d
PRIMARY:MYK9-219=completed-batch-3-lane-3c
PRIMARY:MYK9-212=batch-1-lane-1f
PRIMARY:MYK9-217=batch-2-lane-2a-step-3
PRIMARY:MYK9-216=batch-2-lane-2a-step-2
PRIMARY:MYK9-215=batch-2-lane-2a-step-1
PRIMARY:MYK9-209=batch-1-lane-1e
PRIMARY:MYK9-204=batch-2-lane-2c-plus-operator-track-2
PRIMARY:MYK9-11=operator-track-6
PRIMARY:MYK9-192=batch-2-lane-2b-step-2
PRIMARY:MYK9-197=completed-batch-3-lane-3a
PRIMARY:MYK9-191=batch-2-lane-2b-step-1
PRIMARY:MYK9-187=parked-sms-deferred-post-launch
PRIMARY:MYK9-190=parked-sms-deferred-post-launch
PRIMARY:MYK9-185=operator-track-4
PRIMARY:MYK9-193=batch-2-lane-2b-step-3
PRIMARY:MYK9-186=operator-track-4
PRIMARY:MYK9-189=completed-operator-track-1
PRIMARY:MYK9-44=deferred
PRIMARY:MYK9-188=parked-sms-deferred-post-launch
PRIMARY:MYK9-184=operator-track-3
PRIMARY:MYK9-183=operator-track-3
PRIMARY:MYK9-31=deferred
PRIMARY:MYK9-6=operator-track-5
PRIMARY:MYK9-30=operator-track-5
PRIMARY:MYK9-96=operator-track-5
PRIMARY:MYK9-32=parked
PRIMARY:MYK9-72=parked
PRIMARY:MYK9-94=parked
PRIMARY:MYK9-13=operator-track-5
PRIMARY:MYK9-27=deferred-after-batch-3
PRIMARY:MYK9-28=deferred-post-live-shows
PRIMARY:MYK9-233=completed-deployed-3.5-lane-a
PRIMARY:MYK9-243=in-progress-other-agent-do-not-claim
PRIMARY:MYK9-244=unbatched-filed-after-refresh
PRIMARY:MYK9-245=batch-3.5-lane-b-step-1
PRIMARY:MYK9-236=completed-deployed-3.5-lane-a
PRIMARY:MYK9-235=batch-3.5-lane-b-step-2
PRIMARY:MYK9-234=batch-3.5-lane-b-step-3
PRIMARY:MYK9-237=batch-3.5-lane-c
PRIMARY:MYK9-238=batch-3.5-lane-c
PRIMARY:MYK9-239=batch-3.5-lane-c
PRIMARY:MYK9-240=batch-3.5-lane-d
PRIMARY:MYK9-241=batch-3.5-lane-d
PRIMARY:MYK9-242=batch-3.5-lane-d
PRIMARY:MYK9-88=openspec-umbrella-exhibitor-ux-remediation
PRIMARY:MYK9-109=operator-gated-load-harness-dispatch
PRIMARY:MYK9-198=narrowed-two-items-open
-->

**Inventory check:** verify both the 70-ID source inventory and the primary registry mechanically after any edit:

```bash
plan=docs/plan-linear-backlog-batches.md
for id in 211 163 57 54 225 226 227 228 229 230 231 232 224 161 26 199 195 126 110 222 218 221 220 219 212 217 216 215 209 204 11 192 197 191 187 190 185 193 186 189 44 188 184 183 31 6 30 96 32 72 94 13 27 28 233 236 235 234 237 238 239 240 241 242 88 109 198 243 244 245; do
  count=$(grep -c "^PRIMARY:MYK9-${id}=" "$plan")
  test "$count" -eq 1 || echo "PRIMARY COUNT ${count}: MYK9-${id}"
done
test "$(grep -c '^PRIMARY:MYK9-[0-9].*=' "$plan")" -eq 70 || echo "PRIMARY REGISTRY IS NOT 70 ROWS"
```

**Sources reviewed:** full `get_issue` descriptions and reopen comments for every code-actionable issue (per the LESSONS rule that `list_issues` truncates acceptance criteria). Snapshot refreshed 2026-08-21 after MYK9-226–232 were added; the 2026-08-20 overnight audits reopened six previously-Done issues, which reshapes the priority order below. **Refreshed again 2026-08-23** — see "[ADDED 2026-08-23] The backlog moved while Batch 3 ran"; thirteen IDs joined the registry (MYK9-233–242 plus the three long-running In Progress issues MYK9-88 / 109 / 198, which were never inventoried and were silently outside every batch).

**Execution model:** each active lane = one sub-agent in its own git worktree, one PR per issue, Codex review on every PR (gate), merge from the main repo checkout. This Codex environment has four total concurrency slots, including the coordinator, so at most **three worker lanes** run at once; larger batches run in explicit waves. Within a multi-issue lane, finish and merge one issue, clean/reset the worktree, then create the next issue branch from fresh `origin/main`—do not stack unrelated issue commits or reuse a merged branch. A batch is complete when its PRs are merged **and** each issue's closure proof (many now explicitly require a browser replay, not just tests) is recorded on the issue and the issue is moved to Done. Deferred/operator-gated issues exit the batch only when their owner, blocker, and resume trigger are recorded—not by moving them to Done.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The plan spans payments, auth/RBAC, database migrations, offline/show-day reliability, global UI tokens, external providers, and shared-system deployments.

## OPSX / OpenSpec routing

- Every non-trivial launch-readiness lane uses `opsx-ship` and the existing OpenSpec change when one exists; the Linear issue remains the PR-sized execution contract and the OpenSpec/plan remains the detailed source of truth.
- Tiny docs-only edits, verification-only closeouts, deployment-drift correction, and narrow review fixes may use the lightweight workflow because they do not need a new proposal/spec. Record that rationale in the lane handoff when OPSX is skipped.
- Do not create a competing spec. MYK9-54 and MYK9-219 must read and reconcile their linked OpenSpec material before editing.

---

## The headline finding

**Five of the eleven Todo issues are not new code work.** The 2026-08-20 audits found _deployment drift_ — merged fixes that never reached the hosted Edge Functions — plus one verification-only reopen:

| Issue                                                            | What's actually needed                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [MYK9-224](https://linear.app/myk9-platform/issue/MYK9-224) (P0) | Deploy `cron-waitlist-expiration` — hosted v52 (2026-07-13) predates fail-closed fix `4283c1ea4`                                                       |
| [MYK9-199](https://linear.app/myk9-platform/issue/MYK9-199)      | Deploy `ask-myk9show` — hosted v46 predates fix `783328ac8` (PR #1670)                                                                                 |
| [MYK9-26](https://linear.app/myk9-platform/issue/MYK9-26)        | Deploy `ask-operator-support` — hosted v6 predates scope-guard fix `fe7b2d363` (PR #1448)                                                              |
| [MYK9-161](https://linear.app/myk9-platform/issue/MYK9-161)      | Deploy `cron-health-check` — hosted v25 predates `bb63c8fed`; causes persistent false-red `applied_acl_grants` (missing `show_eve_nudge_log` contract) |
| [MYK9-211](https://linear.app/myk9-platform/issue/MYK9-211)      | Code merged (#1716); reopen is **verification-only** — mutation-backed staging proof of grant/revoke audit events                                      |

This is exactly the "merge is not deploy" trap in memory. Batch 0 corrected all four deployment drifts on 2026-08-21. MYK9-224, MYK9-199, and MYK9-161 are Done; MYK9-26 returned to Backlog because its post-launch MCP/BYOK scope remains. MYK9-211 is independently classified as verification-only and runs in Batch 4 once its mutation approval and disposable fixture are available.

**The 2026-08-21 refresh adds seven issues and changes the immediate order.** MYK9-228 is already In Progress and closes the remaining "no app opened that day" gap in the emergency packet workflow, so it is the active launch-readiness lane before the queued Batch 1 work. MYK9-226 is a payment-integrity reproduction before implementation. MYK9-230/231/232 are one financial-semantics cluster that must follow MYK9-54. MYK9-229 is a fee-disclosure product decision that follows the fee-model decision in MYK9-197. MYK9-227 is explicitly parked until a ring-using sport ships.

---

## Batch 0 — Deploy-drift closeout (complete 2026-08-21)

**Closed:** MYK9-224 (P0), MYK9-199, and MYK9-161. **Deployment complete without full issue closure:** MYK9-26. **Not sub-agent work** — deploys were shared-system writes run after one up-front user confirmation from a clean Supabase-linked checkout.

### Execution record — 2026-08-21

All four functions were deployed from clean `origin/main` SHA `895ecce0105c4420704ed3903f120b8ab144b555`; 115 focused tests passed, and each downloaded live bundle matched repository source exactly.

| Issue    | Deployment and proof                                                                                                                                                                                                                                                                                       | Linear disposition                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| MYK9-199 | `ask-myk9show` v47; both restored tools exercised against a seeded show                                                                                                                                                                                                                                    | Done                                                                                                                    |
| MYK9-161 | `cron-health-check` v26; two subsequent `applied_acl_grants=ok` snapshots; secure applied replay passed and controlled insecure replay failed                                                                                                                                                              | Done                                                                                                                    |
| MYK9-26  | `ask-operator-support` v7; grounded health failure semantics and zero-tool scope marker verified                                                                                                                                                                                                           | Backlog — deploy scope complete; standalone MCP/BYOK remains post-launch                                                |
| MYK9-224 | `cron-waitlist-expiration` v53; live lookup/config/expire/recheck fail-closed paths, successful expiration, and paid-race abort passed with real Stripe test sessions; seven cron log messages contained zero sensitive payment markers; temporary verifier and disposable database fixtures fully removed | Done — all acceptance criteria and evidence gates passed; one immutable $1 paid artifact remains in Stripe sandbox only |

**[ADDED] Preconditions — do these once, before the first deploy:**

- **Deploy from a clean checkout of `origin/main` at a recorded SHA — never from a feature worktree.** This plan was authored on branch `claude/linear-issues-prioritization-889120`; deploying from here would ship branch code. `git fetch origin main`, check out the SHA, record it, and cite it in every closure comment. The whole batch exists because deployed source diverged from intended source — deploying from the wrong tree recreates the bug while claiming to fix it.
- **Know the rollback before pushing.** Each function currently has a hosted version (`cron-waitlist-expiration` v52, `ask-myk9show` v46, `ask-operator-support` v6, `cron-health-check` v25). Record the current version number per function first; reverting means redeploying the prior bundle from the SHA that produced it. `cron-waitlist-expiration` is on the money path and runs on a schedule, so a bad deploy is live within one cron interval — deploy it when someone is watching, not last thing at night.
- **Confirm the four are the whole list.** The 2026-08-20 audit named four drifted functions, but MYK9-54's root cause is recorded as _inconclusive_ and its symptom (a financial read failing for an authorized site admin) is the same shape as a stale bundle or a missing grant. Before Batch 1 starts, diff deployed-vs-repo for the financial RPC/function path too. If it is a fifth drift instance, lane 1A becomes a deploy rather than a code fix — a materially cheaper outcome worth five minutes of checking.

The functions live in two source trees, so there is no safe one-size-fits-all deploy command. Always pass the explicit project ref; never rely on either worktree's cached `.temp/project-ref`.

| Function                   | Canonical source                                            | Deploy command                                                                                                                  |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `cron-waitlist-expiration` | `apps/myk9show/supabase/functions/cron-waitlist-expiration` | `supabase functions deploy cron-waitlist-expiration --workdir apps/myk9show --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt` |
| `ask-myk9show`             | `supabase/functions/ask-myk9show`                           | `supabase functions deploy ask-myk9show --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`                                     |
| `ask-operator-support`     | `supabase/functions/ask-operator-support`                   | `supabase functions deploy ask-operator-support --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`                             |
| `cron-health-check`        | `apps/myk9show/supabase/functions/cron-health-check`        | `supabase functions deploy cron-health-check --workdir apps/myk9show --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`        |

Per function, the sequence is: run the focused unit tests for the failure boundaries → run the mapped deploy command (confirm the “Deployed Functions on project sojmvhhwsjxmfistvzbe” line) → re-download the live bundle and grep for the fix (never trust the deploy timestamp) → record evidence on the issue. Use `get_edge_function` when available; otherwise use an isolated download directory: `verify_dir=$(mktemp -d)` then `supabase functions download <fn> --project-ref sojmvhhwsjxmfistvzbe --use-api --workdir "$verify_dir"`. Preserve that directory until the closure evidence is recorded, then remove only the explicit `verify_dir` path.

1. **`cron-waitlist-expiration`** (MYK9-224, P0). Verify the repo's `waitlistExpiration` tests cover: payment-link query failure, missing Stripe key, session inspect/expire/recheck failure, paid race, decline, successful expiry. Deploy, verify bundle, confirm the next scheduled run reports healthy. **[ADDED]** Unit tests are not the whole bar here — the issue's verification plan also requires _controlled Stripe test-mode evidence for each failure boundary and the successful terminal path_, and its AC 7 requires the next scheduled execution to report healthy **without exposing sensitive payment data** (check the log output, not just the exit status). Budget for the test-mode exercise; do not close on green unit tests alone.
2. **`ask-myk9show`** (MYK9-199). Deploy, verify bundle contains the base-table `get_class_summary` / `get_trial_overview`, exercise both tools against a seeded show.
3. **`ask-operator-support`** (MYK9-26 reopen scope). Deploy, prove a stored failed health snapshot reports as failed and an ungrounded response carries the bounded-scope marker.
4. **`cron-health-check`** (MYK9-161). Deploy, then **ask Richard to click "Run now"** on `/admin/health` — `applied_acl_grants` is outside `CONTINUOUS_HEALTH_CHECK_KEYS`, the 5-minute cron copies verdicts forward verbatim, and `run_system_health_check_now()` is `is_site_admin()`-gated (the MCP role gets 42501). Closure needs two subsequent `applied_acl_grants=ok` snapshots.

Recorded in Linear on 2026-08-21: MYK9-224, MYK9-199, and MYK9-161 moved to Done; MYK9-26 moved to Backlog with its post-launch standalone-MCP/BYOK trigger. Batch 0 is complete.

---

## Batch 0.5 — Active show-day reliability lane

### [MYK9-228](https://linear.app/myk9-platform/issue/MYK9-228) — Generate and deliver the emergency trial packet without an app open

This High-priority issue is **In Progress** and takes the active slot before new Batch 1 starts. It is the remaining acceptance gap from MYK9-198: the manual packet works, but no packet exists if the secretary never opens the app. Use `opsx-ship`; this is non-trivial launch-readiness work spanning shared rendering, an Edge Function, cron/idempotency, Storage, email, and a human print-confirmation reminder.

Execution contract:

1. Extract one shared packet model/renderer used by both the browser and Edge runtime; preserve a thin jsPDF import adapter rather than copying the renderer.
2. Generate **one packet per trial day** at entry close and show-eve, upload immutably, and hand off to the existing `deliver-trial-packet` path. Keep the manual regeneration escape hatch.
3. Key idempotency by `(show, trial_date)` so retries produce neither a second packet nor a second email. Resolve `generated_by` explicitly for system generation; do not invent a user identity.
4. Make failures visible through `delivery_status` / `error_message`. The reminder reads `paperwork_prints`, fires only when that day lacks print confirmation, and stops after confirmation; packet existence alone is not readiness.
5. Verify the restricted Supabase Edge runtime with an approved scratch deploy/invocation, then verify the production bundle by source markers after deployment. Closure requires a hosted show-day proof where nobody opened the app, plus idempotent rerun, failure visibility, reminder suppression, and manual regeneration evidence.

Any scratch or production deploy is a shared-system write and needs explicit approval. MYK9-228 occupies one of the three worker slots until it merges and its hosted proof is recorded; do not schedule three additional Batch 1 lanes beside it.

---

## Batch 1 — Independent code fixes, two capacity-bounded waves

The six implementation lanes touch disjoint files; MYK9-226 is a reproduction-first investigation that may close without code. Every reopened issue's audit comment demands **browser replay at named viewports** as closure proof — the implementing agent records it after Vercel auto-deploys the merge (staging = myk9-platform-myk9show.vercel.app).

| Lane | Issue                                                                                                                                                                                 | Scope                                                                                                                                                                                                                                                                                                                                                                     | Key files                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1A   | [MYK9-54](https://linear.app/myk9-platform/issue/MYK9-54) (P1, **Done 2026-08-21**)                                                                                                   | Fixed by PR #1727: the financial RPC wrapper now invokes `supabase.rpc` on its receiver. Authenticated staging replays passed at 1440×900 and 768×1024, including controlled summary+payout HTTP 500s, honest unavailable-not-zero copy, fresh Retry requests, and recovery to current figures                                                                            | `features/financial/components/usePlatformFinancialOverview.ts`, `PlatformIncomeCard.tsx`, `financialReconciliation.ts` |
| 1B   | [MYK9-225](https://linear.app/myk9-platform/issue/MYK9-225) (P2, **Done 2026-08-21**, PR [#1736](https://github.com/rbeezley/myk9-platform/pull/1736) merged as `028c7d4d4`)          | Hosted desktop/tablet replay passed: unknown counts, meaningful fallback copy, no false empty state, a keyboard-focusable 44px Retry, a fresh request, and recovery to current data. The initial failed replay assumed three automatic retries, but the app configures one; its trace showed Retry did reissue the query, and the corrected two-failure replay passed 2/2 | `pages/admin/SupportInboxPage.tsx`, its test, `features/support/useSupportTickets.ts`                                   |
| 1C   | [MYK9-163](https://linear.app/myk9-platform/issue/MYK9-163) (P2, **Done 2026-08-21**, PR [#1733](https://github.com/rbeezley/myk9-platform/pull/1733) merged as `080b56f62`)          | The canonical assignments ledger names the exact joined club in visible+accessible text; authenticated hosted evidence confirmed the revoke dialog repeats user, role, and exact club scope                                                                                                                                                                               | `RoleAssignmentsPanel` (extracted in #1562)                                                                             |
| 1D   | [MYK9-57](https://linear.app/myk9-platform/issue/MYK9-57) (P2, **Done 2026-08-21**)                                                                                                   | PR #1730 repaired content-width behavior on `/admin/permissions` and `/admin/sync`; the final post-MYK9-163 authenticated light/dark matrix passed at 768×1024 and 1024×768, plus the 720×450 mobile control, with no horizontal overflow                                                                                                                                 | admin shell/layout + the two pages                                                                                      |
| 1E   | [MYK9-209](https://linear.app/myk9-platform/issue/MYK9-209) (P3, **Done 2026-08-21**, PR [#1735](https://github.com/rbeezley/myk9-platform/pull/1735) merged as `bd7798594`)          | `deriveEntryNextAction` now uses canonical accounting rules: settled absent/excused/scratched/withdrawn/pulled classes offer no Check In, while mixed live orders retain it                                                                                                                                                                                               | `pages/MyEntriesPage/modules/entryNextAction.ts` + test                                                                 |
| 1F   | [MYK9-212](https://linear.app/myk9-platform/issue/MYK9-212) (P3, **Done 2026-08-21**, PR [#1737](https://github.com/rbeezley/myk9-platform/pull/1737) merged as `78d2e0ec6`)          | Payment history uses stable 100-row paging, matching local-year UTC ranges, and chunked entry/refund follow-ups without silently truncating All time. MYK9-215 may now build its independent keyed receipt fetch on this final query shape                                                                                                                                | `features/payments/useMyPayments.ts`                                                                                    |
| 1G | [MYK9-226](https://linear.app/myk9-platform/issue/MYK9-226) (Medium, **Done 2026-08-22**, evidence PR [#1734](https://github.com/rbeezley/myk9-platform/pull/1734) merged as `7052c7ad3`; fix PR [#1745](https://github.com/rbeezley/myk9-platform/pull/1745) merged as `0cd8d69a0`) | The reproduction became implementation work rather than closing as no-defect: hosted judge-day capacity is now derived under RLS, so the cart can no longer charge for lines the server then denies. The hosted evidence gate is closed and the issue is Done | cart/checkout capacity derivation |

**[EXPANDED] Collision map — the lanes are not as disjoint as they look:**

- **1C and 1D** both replay on `/admin/permissions`. Either merge order works, but both must land before either records its closure replay, or the second merge invalidates the first's evidence.
- **1F (MYK9-212) and 2A step 1 (MYK9-215) collide on the payments data layer.** 1F bounds the `stripe_orders` query; 215's recommended fix _derives the receipt from `stripe_orders` directly_. If 1F lands a year-scoped or `.range()`-bounded query, 215's receipt lookup must not silently inherit that bound — a receipt for a 2025 order opened from a 2026-scoped page would find nothing. **Land 1F first, and give the 2A agent 1F's final query shape as an input.** 215's order lookup should be a keyed fetch by order id, independent of the list query's bounds.
- **1E before 2A**, as noted in Lane 2A — 1E owns `entryNextAction.ts`, which sits in the same module tree 2A restructures.
- **1G before Batch 3's financial-policy work.** If MYK9-226 reproduces, its checkout-capacity fix lands before MYK9-197/MYK9-229 touch fee presentation and checkout copy. Keep the reproduction isolated from the historical seeded carts; do not create another paid/refunded Stripe session unless the non-charging path cannot answer the question and explicit approval is obtained.

**Batch 1 is complete (closed 2026-08-22).** All seven issues — MYK9-54, MYK9-57, MYK9-163, MYK9-209, MYK9-212, MYK9-225, MYK9-226 — are Done with their required verification recorded in Linear. Two closures landed after the 08-21 status note: MYK9-212 returned to Done once its test-only repair ([PR #1741](https://github.com/rbeezley/myk9-platform/pull/1741)) merged, and MYK9-226 closed on 08-22 when its reproduction turned into the RLS-derived capacity fix in [PR #1745](https://github.com/rbeezley/myk9-platform/pull/1745). MYK9-225's corrected hosted replay passed 2/2 after its trace established that the first harness had forced both the initial request cycle and the user-triggered Retry cycle to fail. Nothing in Batch 1 blocks Batch 2 any longer: 1E and 1F cleared Lane 2A, 1A cleared Lane 2D, and 1G cleared the financial-policy ordering constraint for Batch 3.

Everything else in Batch 1 is file-disjoint, but the three-worker ceiling still applies:

- **Wave 1:** 1A (money-path P1), 1D (shared tablet shell), 1E (show-day accounting/next action).
- **Wave 2:** 1B (support failure state), 1C (RBAC scope clarity), 1F (payments query bound).
- **Investigation slot:** 1G starts as soon as a worker is free; it does not displace MYK9-228 and does not become implementation work until reproduction establishes the defect.

Batch 2A is unblocked: 1E and 1F are merged, and its work is active in a separate conversation. Preserve the collision rule by keeping MYK9-215's keyed receipt lookup independent from MYK9-212's list bounds.

---

## Resume here — Batch 2 closed (2026-08-22, late)

Every Batch 2 issue is Done except MYK9-204. Verified against `origin/main`, `gh pr list` and Linear.

| Lane | Issue | State | Where it landed |
| -- | -- | -- | -- |
| 2A step 1 | MYK9-215 | **Done** | [#1753](https://github.com/rbeezley/myk9-platform/pull/1753) → `237b8b7aa`. The stalled branch was reworked, not just finished — see below |
| 2A step 2 | MYK9-216 | **Done** | [#1756](https://github.com/rbeezley/myk9-platform/pull/1756) → `ba60cd701` |
| 2A step 3 | MYK9-217 | **Done** | [#1758](https://github.com/rbeezley/myk9-platform/pull/1758) → `b9b7e73f4`. `index.tsx` 575 → 459 lines; both `INTENT:` constraints hold |
| 2B step 1 | MYK9-191 | Done | [#1739](https://github.com/rbeezley/myk9-platform/pull/1739) |
| 2B step 2 | MYK9-192 | **Done** | [#1754](https://github.com/rbeezley/myk9-platform/pull/1754) → `919c3599b`. Migration `20260822200000` applied and verified against the live DB |
| 2B step 3 | MYK9-193 | **Done** | [#1760](https://github.com/rbeezley/myk9-platform/pull/1760) → `f970d930f`. Migration `20260822210000` applied and verified against the live DB. Deploy criterion moved to MYK9-190 |
| 2C | MYK9-204 | In Progress | **Operator-blocked.** Only the fresh desktop checkout proof remains |
| 2D step 1 | MYK9-232 | **Done** | [#1755](https://github.com/rbeezley/myk9-platform/pull/1755) → `34934c62e` |
| 2D steps 2–3 | MYK9-230, MYK9-231 | **Done** | [#1759](https://github.com/rbeezley/myk9-platform/pull/1759) → `304d4ed42`. Both closed by one PR — one card, one editorial decision |

### Open operator actions carried out of Batch 2

1. **Do NOT deploy `push-trigger-run-proximity`.** The SMS send path is merged and `sms_proximity_sends` is live, but the function is dormant — provider construction degrades to push-only when unconfigured, and no Twilio secret is set. Gated on MYK9-190 (A2P 10DLC brand/campaign).
2. **MYK9-193's deploy criterion now lives on MYK9-190** (moved 2026-08-22). MYK9-193 is legitimately Done: everything left is operator work gated on the A2P registration. MYK9-190 gained four criteria — Twilio secrets, both function deploys, and the end-to-end handset test — and its stale "code work, to be tracked separately" section was corrected, since all three code issues have now merged.
3. **[MYK9-236](https://linear.app/myk9-platform/issue/MYK9-236)** was filed from the post-push ACL verification — the grant contract's `service_role` column is unenforced against live on 129 of 130 tables. Not exploitable (`service_role` is trusted and bypasses RLS); it means the file an auditor reads instead of querying production is wrong in its third column.

Resolved since: the four borrowed untracked `2026082219*.sql` files are gone — their own PRs merged, so `main` now carries the real versions and the primary checkout is clean.

### Two things Batch 2 proved about how to work here

**A test that cannot fail will certify a no-op as a fix, and it takes a mutation to notice.** This happened four separate times across the batch, in code written by three different authors including two of my own passes. The URL-seam assertion passed with its production line hardcoded to `null`; an "ordering" assertion compared a one-element array against itself; a decoy storage key was never seeded so the behaviour named in the test title went unverified; and a Sentry wiring test asserted by source-grep stayed green with `queryCache` deleted from the `QueryClient`, i.e. with the whole feature disconnected. **Run the mutation. Every time.**

**Adversarial subagent review found something real in every single round.** Codex was unavailable for the whole batch, and the substitute earned its cost: it caught a duplicate-billing defect in MYK9-193 that would have fired for every recipient at once during a Twilio slow period, and it caught MYK9-230's first rewrite replacing one overclaim with a *false statement* — a flat "No Stripe record on file" on shows that had fifty of them. Twice the finding was in a fix written to address the previous round's finding. Do not skip this gate in Batch 3.

### Batch 3 starts with decisions, not code

D1–D8 below are Richard's to make. They unblock independently — only D1 → D8 are ordered (the fee formula settles before its disclosure). D7 gates no code at all.

### What MYK9-215 turned out to be

The stalled branch scoped the receipt rows correctly but **targeted the wrong quantity for the total**, on every online order. `amount_cents` is the gross and the platform fee is a separate Stripe line charged on top, so class rows summing to the subtotal sat under a total that exceeded them by the fee.

A second, deeper case survived the first fix: the documented tie-out in `_shared/orderSnapshot.ts` is `amount_cents == entry_subtotal_cents + platform_fee_cents + make_whole_refunded_cents`, and the snapshot columns cover only the **accepted** lines. A capacity split therefore left the wait-listed lines' charge unexplained — in exactly the scenario the issue exists for. Verified against the live database: 5/5 non-legacy orders satisfy the three-term identity, 1/5 the two-term one that was assumed.

Also fixed there: refunds now read the refund **columns** rather than `status` (a partially refunded order keeps `status = 'succeeded'`); cash, check and payment-link registrations no longer dead-end on an unreachable Retry; and the receipt is printable offline again.

**Two tests written during this work were vacuous and only caught by re-running the mutation.** The URL-seam assertion passed with the production line hardcoded to `null`, because a single mocked order makes the discovery path produce an identical screen. Assert the query argument, not the rendered result, when the two paths converge.

### Standing gate for the rest of the batch

Every PR here went through adversarial subagent review because Codex was unavailable, and every round found something real — including one blocker in a fix written to address the previous round. Do not skip it for 217, 193, 230 or 231.

### Bookkeeping debt (unchanged, still open)

- Two OpenSpec changes complete but unarchived: `myk9-225-support-query-recovery`, `myk9-226-cart-capacity-reproduction`.
- [MYK9-233](https://linear.app/myk9-platform/issue/MYK9-233), [MYK9-234](https://linear.app/myk9-platform/issue/MYK9-234), [MYK9-235](https://linear.app/myk9-platform/issue/MYK9-235) are not in the primary registry, which still expects 54 rows. MYK9-235 belongs with Lane 2D; MYK9-233 is a security finding to triage on its own.
- **A local-only cleanup is outstanding**: pushing 192's migration needed four `2026082219xxxx` files borrowed from the open packet PRs, and `rm`/`git clean` are denied by permission rules here. They remain untracked in the primary checkout and will fail the migration-parsing tests locally until removed.

---

## Batch 2 — Clustered lanes (serialize inside, parallel across)

> **Prior execution record — 2026-08-21.** Kept for provenance; the table above is the current state.
>
> - **Prerequisites:** MYK9-209 merged in [PR #1735](https://github.com/rbeezley/myk9-platform/pull/1735) with green required CI. MYK9-212's production change merged in [PR #1737](https://github.com/rbeezley/myk9-platform/pull/1737), but its full-suite CI exposed a missing `useMyPaymentYears` mobile-test mock; MYK9-212 was honestly reopened and the test-only repair merged as [PR #1741](https://github.com/rbeezley/myk9-platform/pull/1741), returning it to Done.
> - **Lane 2A:** MYK9-215 was implemented on `codex/myk9-215-order-receipts` and independent review found three money-accuracy blockers. Work stopped before the PR was opened.
> - **Lane 2B:** MYK9-191's security review drove owner-derived preference RPCs, RLS/ACL hardening, tokenized exactly-one writes, compare-and-clear compensation, rate limiting, provider timeout, and channel-state separation. A first CI run found a SQL argument cast plus two edge-test inventory omissions, fixed in `bd1e4387f`. It merged on 2026-08-22.
> - **Lane 2C:** Keep `payment_method_types: ['card']`; add neither `payment_method_configuration` nor a redundant API-version pin. The proven control is the pruned per-environment Stripe Dashboard configuration.
> - **Shared-system gates:** PR creation and Linear updates were approved for this batch. PR merges, Supabase migration/function deployment, Twilio secret writes, Stripe Dashboard changes, and external/provider actions still require their own explicit approval — **a new session must re-confirm these; the 08-21 approval does not carry over.**

### Lane 2A — MyEntriesPage cluster (one agent, strict order — same module tree, parallel worktrees would collide)

1. [MYK9-215](https://linear.app/myk9-platform/issue/MYK9-215) (High, money-accuracy): make the exhibitor receipt **order-scoped**. Prefer option 2 from the issue — derive from `stripe_orders` (amount charged) so the printed total matches Stripe by construction; one receipt per order when a registration spans orders; remove the `KNOWN LIMITATION` comment. Fixture: one registration, two orders.
2. [MYK9-216](https://linear.app/myk9-platform/issue/MYK9-216): single `TAB_PREDICATES` map in `entryTabDefs.ts`; both `filteredEntries` and `tabCounts` derive from it; hoist `now` to one resolution per render. Refactor, zero behavior change.
3. [MYK9-217](https://linear.app/myk9-platform/issue/MYK9-217): get `index.tsx` under 500 lines — extract `useResultRevealDeepLink`, the seen-result-keys effect, and the dialog-state cluster into `modules/`. **Preserve both `INTENT:` constraints** (dialogs stay siblings, no early return above them; no `catch` on `handleCheckInStatusUpdate`).

Bug fixes land before refactors so fixes never rebase over moved code. (1E touches `entryNextAction.ts` only; land 1E before starting 2A to be safe.)

### Lane 2B — SMS L6 build (one serialized lane; deploy gated on operator track)

1. **First:** [MYK9-191](https://linear.app/myk9-platform/issue/MYK9-191) (opt-in UI + consent write + confirmation builder + Twilio client — canonical copy verbatim, one GSM-7 segment asserted via `estimateSegments()`, consent cleared on number change, ring-alerts-as-one-feature settings shape). Merge it before 192 so the provider interface and `NotificationSettings.tsx` shape are real, reviewed inputs rather than an agreement between diverging worktrees.
2. **Then:** [MYK9-192](https://linear.app/myk9-platform/issue/MYK9-192) (STOP/HELP webhook: `X-Twilio-Signature` HMAC-SHA1 verification fail-closed, six stop keywords, START no-op without consent row, settings shows STOP state + sending number instead of a toggle; decision already recorded: STOP mutes both channels, B + C messaging). Branch from fresh `origin/main` after 191 merges; consume 191's Twilio client and extend the same settings surface.
3. **Then:** [MYK9-193](https://linear.app/myk9-platform/issue/MYK9-193) (send path in `push-trigger-run-proximity`): per-recipient channel decision (kill the early `continue`), absent row = SMS off, `sms_opt_out_at is null` filter, sibling send in `Promise.allSettled`, **one SMS per entry** via the _recorded_ idempotency approach (sent-marker migration — pick the timestamp against `origin/main` per LESSONS; explicit GRANTs/REVOKEs per migration rules).
4. Code+tests complete now; **deploys and the end-to-end handset proof wait for MYK9-190 campaign approval** (operator track). Register any new edge-function tests in `apps/myk9show/vitest.config.ts` `test.include` (allowlist trap).
5. **[ADDED] Secrets are an operator step, not an agent step.** The Twilio client needs an account SID, auth token, and Messaging Service SID. Following the `payout_cron_secret` / webhook-secret precedent these belong in Vault, set by Richard — writing them is a shared-system mutation and the agent must never handle the raw values. Both the send path and the webhook must **fail closed** when a secret is absent (the pattern MYK9-224 exists to enforce): missing config returns an error, never a silent skip that looks like "no one opted in." Add the secret names to the deploy checklist so the function is not deployed before its configuration exists.

### Lane 2C — [MYK9-204](https://linear.app/myk9-platform/issue/MYK9-204) code investigation (one agent, report-first)

After Richard prunes the sandbox payment-methods dashboard (operator track item 2 — that confirms the mechanism), investigate whether `payment_method_configuration` or an API-version pin restores strict card-only rendering; **report findings on the issue before changing `stripe-checkout`**. Also PR the MYK9-11 runbook addition (live payment-methods pruning step) — docs change, safe now.

### Lane 2D — Financial semantics (one serialized lane; MYK9-54 dependency satisfied 2026-08-21)

These issues share the reconciliation fetch/presentation layer and `resolveOrderChargeVerification`; do not run them in parallel. Batch 1 lane 1A established the final MYK9-54 shape in PR #1727, so this lane is now unblocked.

1. **[MYK9-232](https://linear.app/myk9-platform/issue/MYK9-232) — investigate before fixing.** Trace every write to `entry_subtotal_cents` / `platform_fee_cents`, prove whether an uncaptured value can reach readers as `0`, and answer whether a legitimate zero-dollar order reaches show-level verification. If reachable, fix the representation at the write boundary; if not, document the invariant beside the NULL-is-pending contract.
2. **[MYK9-230](https://linear.app/myk9-platform/issue/MYK9-230) — align the label with the evidence.** Rename the current `Verified` state to the claim the resolver actually proves (recommended: `Charge recorded`), update club and site-admin audiences together, preserve the module header's rejection of amount-comparison `Mismatch`, and assert the accessible text a screen reader receives.
3. **[MYK9-231](https://linear.app/myk9-platform/issue/MYK9-231) — cause-neutral failure copy.** Preserve the payout reassurance while removing the unsupported claim that Stripe caused the fetch failure; review equivalent site-admin states. Record the Sentry decision, splitting observability into a new issue if it is more than a narrow addition.

Land 232 before 230 so the label work is based on the proven snapshot invariant. Land 231 last because it touches the same presentation surface and its wording should describe the final fetch/verification contract.

---

## Batch 3 — Decision-gated work (needs Richard's call, then up to 3 parallel lanes)

Decisions to make (recommendations from the issue analyses):

| #   | Decision                                                                                                                          | Recommendation                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | [MYK9-197](https://linear.app/myk9-platform/issue/MYK9-197) adopt flat 30¢ fee component? floor? disclosure line? grandfathering? | Flat + $1.00 floor, folded into the existing "Platform Fee" line, no grandfathering (pre-launch). Consider instrumenting cart size first                                                                      |
| D2  | [MYK9-221](https://linear.app/myk9-platform/issue/MYK9-221) filters in the URL?                                                   | Yes — shared `useUrlFilters`, debounced `{replace:true}` writes, applied to all four browse pages                                                                                                             |
| D3  | [MYK9-222](https://linear.app/myk9-platform/issue/MYK9-222) /dogs tablet table                                                    | Option 1 + 2: sticky Name column **and** drop Breed/Sex below `md` (both exist on cards)                                                                                                                      |
| D4  | [MYK9-218](https://linear.app/myk9-platform/issue/MYK9-218) card-view ceiling                                                     | Paginate cards at 25 like the table — one contract per dataset; same rule answers MYK9-212's class of issue                                                                                                   |
| D5  | [MYK9-219](https://linear.app/myk9-platform/issue/MYK9-219) exhibitor dog-card content                                            | Role-aware card: exhibitor sees breed/age/armband, secretary keeps owner. Reconcile breed display with OpenSpec `exhibitor-ux-remediation` tasks 2.1/2.2                                                      |
| D6  | [MYK9-220](https://linear.app/myk9-platform/issue/MYK9-220) type scale                                                            | 1.25 scale (14/16/20/25/31), 16px body floor per INTENT.md, single token change                                                                                                                               |
| D7  | [MYK9-195](https://linear.app/myk9-platform/issue/MYK9-195) in-app `reverse_transfer` + payout hold window                        | Defer both — the runbook (#1678) covers expected volume; revisit when manual clawbacks stop being rare. Keep the issue open in Parked/Backlog with that trigger noted                                         |
| D8  | [MYK9-229](https://linear.app/myk9-platform/issue/MYK9-229) publish the approximate Stripe/myK9Show fee split?                    | Yes, after D1 settles the fee formula: computed per cart, explicitly approximate, public/shareable, and clear that clubs receive 100% of entry fees. Never split the Stripe receipt into estimated line items |

**[ADDED] The decisions unblock independently — do not treat Batch 3 as one gate.** Lanes 3B/3C/3D depend only on their named decisions. D7 gates no code at all — it records MYK9-195's parked trigger while leaving the unmet work open. Lane 3A is the exception: D1 settles the fee formula first, then D8 decides how to disclose that settled formula. If a decision doesn't come back, only its dependent work waits; nothing here is a whole-batch blocker.

### [RESOLVED 2026-08-22] All eight decisions answered — Batch 3 is executing

Richard answered D1–D8 in one pass. **Every decision came back as the plan's recommendation, unchanged.** The gate is closed; no lane is waiting on a decision any more.

| #   | Answer                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Flat 30¢ + $1.00 floor**, folded into the existing single "Platform Fee" line, no grandfathering. New `platform_settings` columns default to **0** |
| D2  | **Yes** — shared `useUrlFilters`, debounced `{replace:true}`, all four browse pages, `?add=true` preserved                                     |
| D3  | **Option 1 + 2** — sticky Name column *and* drop Breed/Sex below `md`                                                                          |
| D4  | **Paginate cards at 25**, matching the table — one contract per dataset                                                                        |
| D5  | **Role-aware card** — exhibitor sees breed/age/armband, secretary keeps owner                                                                  |
| D6  | **Global 1.25 scale** (14/16/20/25/31), 16px body floor, single token change, before/after screenshots at 375/768/1280 before merge            |
| D7  | **Defer both** MYK9-195 steps; parked in Backlog with the trigger recorded on the issue                                                        |
| D8  | **Yes, after D1** — computed per cart, explicitly approximate, public and shareable, clubs receive 100% of entry fees                          |

**Shared-system approvals granted for this session** (these do not carry to the next one): Linear status + comments; GitHub PR creation; PR merge after green CI and clean adversarial review; `supabase db push` for the 3A `platform_settings` migration only. **Not** approved and not to be assumed: any edge-function deploy — `push-trigger-run-proximity` stays dormant per the Batch 2 carry-out, still gated on MYK9-190.

**D7 is closed as bookkeeping.** MYK9-195 moved Todo → Backlog with a comment recording both revisit triggers (manual clawbacks stop being rare; real payout-timing data exists) and restating that steps 3–4 are unmet work, not completed work. The issue is parked, not Done.

**Execution order in flight:** 3A (MYK9-197) and 3B (MYK9-221) dispatched in parallel — disjoint file sets. 3C rebases onto 3B because both touch `BrowseDogsPage.tsx`. 3D (MYK9-220) runs alone last so the global reflow does not invalidate the other lanes' visual verification. MYK9-229 follows MYK9-197's merge inside Lane 3A, since it discloses whatever fee formula actually ships.

**The Batch 2 standing gate carries forward:** adversarial subagent review on every PR, and run the mutation on every test. Both earned their cost four times over in Batch 2 — a test that cannot fail will certify a no-op as a fix.

### [CLOSED 2026-08-23] Batch 3 is complete

Every lane landed, deployed and was verified against staging. **Eight issues reached Done**; two are parked with explicit triggers; three follow-ups were filed rather than absorbed.

| Issue | Disposition | Evidence |
| --- | --- | --- |
| [MYK9-221](https://linear.app/myk9-platform/issue/MYK9-221) URL filters | Done | [#1761](https://github.com/rbeezley/myk9-platform/pull/1761) `732a4d6a0` |
| [MYK9-197](https://linear.app/myk9-platform/issue/MYK9-197) platform fee flat + floor | Done — **migration pushed** | [#1762](https://github.com/rbeezley/myk9-platform/pull/1762) `3730dfeb6`; `20260823140000_platform_fee_flat_and_floor.sql` applied |
| [MYK9-222](https://linear.app/myk9-platform/issue/MYK9-222) tablet table | Done | [#1763](https://github.com/rbeezley/myk9-platform/pull/1763) `be86abb1f` |
| [MYK9-218](https://linear.app/myk9-platform/issue/MYK9-218) card pagination | Done | same PR |
| [MYK9-219](https://linear.app/myk9-platform/issue/MYK9-219) role-aware dog card | Done | same PR |
| [MYK9-220](https://linear.app/myk9-platform/issue/MYK9-220) type scale | Done | [#1769](https://github.com/rbeezley/myk9-platform/pull/1769) `4368b8218` |
| [MYK9-229](https://linear.app/myk9-platform/issue/MYK9-229) fee transparency | Done — **migration pushed, `/fees` verified signed-out** | [#1768](https://github.com/rbeezley/myk9-platform/pull/1768) `98dc60305`; `20260823160000_platform_settings_anon_fee_read.sql` applied |
| [MYK9-189](https://linear.app/myk9-platform/issue/MYK9-189) domain + legal pages | Done | operator-verified; `/sms` and `/privacy` reachable |
| SMS deferral | shipped | [#1766](https://github.com/rbeezley/myk9-platform/pull/1766) `8b33c2179` |

**Parked, not closed.** [MYK9-195](https://linear.app/myk9-platform/issue/MYK9-195) steps 3–4 (D7) — revisit when manual clawbacks stop being rare or real payout-timing data exists. [MYK9-190](https://linear.app/myk9-platform/issue/MYK9-190) Twilio brand + campaign — revisit on real exhibitor demand, per the SMS deferral below.

**[DECISION 2026-08-22] SMS is deferred until after launch.** Richard's call: judge demand first, focus launch on core features. Nothing was reverted — MYK9-193's delivery path is intact and inert behind `features.smsRingAlerts = false` (`apps/myk9show/src/config/features.ts`), matching the existing kill-switch pattern. The opt-in toggle is hidden entirely and the public `/sms` page says the feature is not yet available. `push-trigger-run-proximity` remains **undeployed**. This retires the Batch 2 carry-out that had MYK9-193's deploy gated on MYK9-190: the gate is now product demand, not carrier approval. Operator track item 1 (10DLC chain) is consequently **not launch-blocking** — MYK9-187/188/190 can wait; MYK9-189 was completed anyway because the domain and legal pages matter independently of SMS.

**What is live in the database after this batch** (merge is not deploy — both of these were pushed explicitly):

- `platform_settings.platform_fee_flat_cents` and `platform_fee_min_cents`, `integer not null default 0`. **The mechanism ships switched off.** Turning on the decided 30¢ + $1.00 floor is a settings write, not a deploy.
- An anon column-scoped read on the three fee columns for the public `/fees` page. Verified live: the three fee columns return `has_column_privilege('anon', …) = true`; `id`, `updated_at`, `updated_by` return `false`.

**Follow-ups filed rather than absorbed:**

- [MYK9-237](https://linear.app/myk9-platform/issue/MYK9-237) — four disagreeing "is this an exhibitor" predicates; a `[judge, club_admin]` user gets a truncated dog roster rendered as complete, with bulk delete enabled.
- [MYK9-238](https://linear.app/myk9-platform/issue/MYK9-238) — Tailwind opacity modifiers on bare `var(--…)` colors compile to nothing, silently. **The deliverable is a guard, not an audit** — an inventory decays the moment someone writes the next one.
- [MYK9-239](https://linear.app/myk9-platform/issue/MYK9-239) — delete unreachable `RegistrationConfirmationNotifications.tsx` (~590 lines).

### [CARRY-OUT] What Batch 3 proved about the review gate

**Codex never ran on a single PR this batch** — usage limit through 2026-08-24. Adversarial subagent review substituted, and **found something real in all eleven rounds across five PRs**. Twice the defect was inside the fix written for the previous round's defect. Do not treat that as a batch-3 anomaly; it is now the third consecutive batch with the same result.

The recurring shape was never a missing test — it was **a test that could not fail**:

- a kill switch whose shipped `false` default nothing asserted (flipping it to `true` passed all 53 tests);
- a display-size cap protected only by coincidence (`5xl`→70px passed green while clipping 29px);
- a refund clamp tested at the one input where right and wrong agree — two mutants that discarded the fee rates entirely passed all 1192 tests;
- a signed-out check that could not distinguish success from failure, because the hardcoded fallback equalled the live value. The fix was to assert the **absence of the failure copy**, not the presence of a rate.

Two defects were unreachable from the test runner at all: the scoresheet timer clipping needed a real browser measuring a real card box (the failure is at **375px**, not the 768px the first review claimed), and the inert Tailwind opacity classes needed a production build and a look at the generated CSS. Budget for both in any lane that touches layout or design tokens.



Then dispatch:

- **Lane 3A — financial policy, strict order.** First MYK9-197: one atomic PR across all five fee sites (`platformFee.ts`, `cartStore.helpers.ts`, `stripe-payment-link`, `stripe-webhook` ×2, `platform_settings` migration defaulting to 0) + the shared client/server agreement test (integer math, half-cent boundaries) + `formatPlatformFeeLabel` copy + admin editability. Migration follows GRANT/REVOKE + timestamp-vs-origin/main rules. Then MYK9-229 after D8: derive the approximate split from the same final `calculatePlatformFeeCents`, update cart and Stripe line-item copy, add the public fees page, and link it from cart + Club Payments. **Duplication check:** no existing public fee-explanation route was found; the new page is the one canonical shareable explanation, while Cart Summary and Club Payments only link to it rather than reimplementing the long-form content. Do not claim SMS, itemize infrastructure, or represent an estimate as an exact Stripe receipt amount.
- **Lane 3B** — MYK9-221: `useUrlFilters` + wire into `/dogs`, `/shows`, `/clubs`, `/people`; preserve `?add=true` behavior.
- **Lane 3C** — /dogs surface (serialize D3→D4→D5 in one lane: `DogsTableView.tsx`, `DogsGridView.tsx`, `BrowseDogsPage.tsx` overlap).
- **Lane 3D (runs alone, after 3A–3C merge)** — MYK9-220 typography token change + breakpoint before/after review. Global reflow; landing it last avoids invalidating every other lane's visual verification. **[EXPANDED] This is the one change here with no natural blast-radius limit**, so it needs its own safety story rather than inheriting the batch's. Land the scale as a **single token change** (per the issue's own suggested shape) precisely so revert is one commit, not a sweep through components. Before merging, capture before/after screenshots at 375 / 768 / 1280 on the surfaces most likely to break — the dense secretary tables (`/dogs` table view, entry management), the `/at-show` ringside layouts, and any fixed-height card grid — because a 14→16px body raises row heights everywhere and tables are where that first turns into clipping or a new horizontal scroll. Note the interaction with MYK9-222's sticky-column work and the `text-xs` override at `tailwind.config.js:171`. If the reflow damage is broader than expected, revert the token and re-scope to a role-limited rollout (exhibitor and judge surfaces first, per the issue's step 2) rather than patching per-component under a shipped global change.

Lanes 3B and 3C both touch `BrowseDogsPage.tsx` — land 3B first, rebase 3C.

---

## [ADDED 2026-08-23] The backlog moved while Batch 3 ran — Batch 3.5

Ten issues were filed after this plan's 2026-08-21 snapshot, and three long-running issues were never inventoried at all. None of them were in any batch. That is the update.

### A backlog source this plan did not account for

The `/impeccable-page` sweep is now a **standing generator of filed work**, and it defers by design: a sweep fixes blockers and majors in one PR, then files the structural half rather than growing the PR. Two sweeps have run so far.

| Sweep | Date | Shipped | Deferred into the backlog |
| --- | --- | --- | --- |
| `/admin/payouts` | 2026-08-21 | the page fixes | [MYK9-233](https://linear.app/myk9-platform/issue/MYK9-233), [MYK9-234](https://linear.app/myk9-platform/issue/MYK9-234), [MYK9-235](https://linear.app/myk9-platform/issue/MYK9-235), [MYK9-236](https://linear.app/myk9-platform/issue/MYK9-236) |
| Reports | 2026-08-23 | [#1771](https://github.com/rbeezley/myk9-platform/pull/1771) — blockers + majors | [MYK9-240](https://linear.app/myk9-platform/issue/MYK9-240), [MYK9-241](https://linear.app/myk9-platform/issue/MYK9-241), [MYK9-242](https://linear.app/myk9-platform/issue/MYK9-242) |

Expect roughly three or four filed issues per sweep. **Plan capacity for that** — a batch that consumes the backlog without accounting for what the sweeps add will not converge. The deferrals are correct behaviour, not debt from sloppiness: they are the "one concern, one PR" rule working.

### [HANDOFF 2026-08-24] Start here

Written for an agent picking this up cold. Four things that are not obvious from the lane list below.

**1. Something else is already working MYK9-243. Do not claim it.**
[MYK9-243](https://linear.app/myk9-platform/issue/MYK9-243) — *NCR-2026-08-24-01, emergency packet can print wrong armbands* — moved to In Progress at 14:55 UTC on 2026-08-24, mid-session, by another agent. It is High and it is a show-day paper-trust defect (`emergency_packet_input()` lets a stale `entries.armband` beat the canonical `armbands.armband_number`, and coerces suffixed values like `12A` to `#0`). Its own contract test asserts the faulty precedence, so that test is a false-negative guard and must be inverted as part of the fix. **Check its state before touching it** — two agents on one migration is the worst case here.

**2. Three issues were filed after the last registry refresh.** MYK9-243 was claimed as recorded above; [MYK9-244](https://linear.app/myk9-platform/issue/MYK9-244) (WebKit intermittently aborts the clubs replication fetch on `/admin/dashboard`, Medium) remains outside the lanes below; [MYK9-245](https://linear.app/myk9-platform/issue/MYK9-245) (a dropped show hides the exhibitor's entry but keeps their Stripe charge, High) is now Lane 3.5B step 1. Registry is now 70 rows, not 67.

MYK9-245 carries a **do-not-do** instruction that will look wrong to a fresh reader: it argues *against* gating `entries_select`'s handler/owner arms. Those arms are the only route by which an exhibitor could ever be shown their own dropped-show entry. Read it before "hardening" anything there.

**3. Lane 3.5A is complete.** MYK9-233 and [MYK9-236](https://linear.app/myk9-platform/issue/MYK9-236) shipped and were deployed on 2026-08-24. Lanes 3.5B, 3.5C and 3.5D are untouched.

**4. Verification traps this batch has already hit.** All three cost a red CI run or a wrong claim:

- **Behavioural SQL tests have never executed locally** — there is no container runtime on this machine, so CI is always their first real run. The allowlist-registration check proves a test is *on the list*, not that it passes. MYK9-233's test failed twice on its first actual execution after being reported as verified.
- **A missing row-level filter in a `SECURITY DEFINER` function may be deliberate.** `manageable_show_ids()` omits `deleted_at` because MYK9-126 wants it that way, pinned by a `can_manage_show()` parity assertion. Restating the predicate silently reverted that decision and nothing local caught it — typecheck, lint, 17k tests, three mutation checks and a full Codex review all passed. Now recorded in CLAUDE.md LESSONS (#1777).
- **Merging applies nothing.** MYK9-233 needed an explicit `supabase db push` after merge, then a live policy read-back to confirm it took.

**Two open PRs are not from this batch** and no judgment has been made on either: [#1776](https://github.com/rbeezley/myk9-platform/pull/1776) (support inbox retry test) and [#1772](https://github.com/rbeezley/myk9-platform/pull/1772) (dependency bump, 16 updates).

### Batch 3.5 lanes

Ordered by severity, not by filing date. Lanes A–D touch disjoint file sets and can run in parallel within the three-worker cap.

- **Lane 3.5A — data exposure and ACL contract (do this first).** [MYK9-233](https://linear.app/myk9-platform/issue/MYK9-233) is the highest-severity open item on the board: `manageable_show_ids()` is `SECURITY DEFINER` and never restates the `deleted_at IS NULL` filter that `shows_select` applies **outside** its whole OR group. A site admin therefore sees the entries of a soft-deleted show while the show row itself is invisible, and `buildLedgerRows` maps over `shows` rather than entries — so every dropped show's collected, refunded and net cents vanish from the admin ledger **and** from both summary totals, with nothing on screen. **Verified against staging: 0 soft-deleted shows, so it is reachable but not currently firing.** That is exactly why it should land now rather than after launch. Step 1 is a product decision, not code — *should* a site admin see soft-deleted shows? The two answers have different blast radii. Then [MYK9-236](https://linear.app/myk9-platform/issue/MYK9-236) (the grant contract's `service_role` column is unenforced against live; 129 of 130 tables hold more than it declares). Both are ACL-contract work and share the verify-against-the-applied-database discipline.

  **[DONE 2026-08-24] MYK9-233 — merged `a62df8703`, migration applied and verified live.** Branch `claude/myk9-233-soft-delete-admin-visibility`, commit `8ff7189c4`, cut from `origin/main` in worktree `prs-needing-merge-b22aa6`.

  The product decision the lane was gated on: **a site admin sees soft-deleted shows and their entries; nobody else does.** Both rules now state that same sentence — `shows_select`'s admin arm moves outside the `deleted_at` gate, and `manageable_show_ids()` restates the filter its `SECURITY DEFINER` status had silently discarded.

  **[RETRACTED] There is no tightening.** An earlier revision of this entry reported that club admins, trial secretaries and show-scoped secretaries would stop receiving entries for soft-deleted shows, and called that the half that closed the asymmetry. That was wrong and the code is gone. Non-admin visibility is unchanged.

  The cause is worth carrying forward. `manageable_show_ids()` was also rewritten to gate its non-admin arms on `deleted_at`, on the rule that a `SECURITY DEFINER` function must restate the predicate its calling policy applies. `entries_manager_policy_hashable_test.sql` failed in CI with "manageable_show_ids diverges from can_manage_show": MYK9-126 **deliberately** keeps entries of draft and soft-deleted shows visible to club-scoped managers even though `shows_select` hides those show rows, and pins it with a `can_manage_show()` parity assertion. The missing filter was a decision, not drift — the same trap this repo documents for "missing" columns, not carried across to a missing predicate. The corrected fix is one policy line; the function is untouched.

  Two things found while building that were not in the issue, both of which would have made the fix look done while leaving a hole:

  - `showDraftVisibilityRlsContract` was reading `20260606204100_include_show_scoped_secretary_drafts.sql`, a migration this one supersedes. It would have stayed green forever against a policy the database no longer runs — the source-grep trap from LESSONS, in its file-pointer form. Repointed, plus two shape assertions that the admin arm sits *before* the gate in both the policy and the function.
  - `ReplicatedShowsTable` had no `deleted_at` filter at all. It was excluding soft-deleted shows only because the policy hid them from everyone; opening the policy for admins would have started syncing deleted shows into IndexedDB, where every offline surface reading the replica would render them. Now filtered explicitly, with the invariant written down rather than inherited.

  Verified: behavioural SQL contract registered in **both** allowlists (`run-behavioral-sql-tests.sh` and its `.test.ts`); three mutation checks each go red against the corresponding line reverted; full myK9Show suite 17,687 passed with the exit code read from the runner, not through a pipe; DB contract suite 718 passed; typecheck and lint clean; 6 shuffled runs of every touched file, zero failures.

  **What caught what — the useful part of this one.** Codex pass 1 found a false contract in the migration/test headers plus a fixture that concealed it (the person named "Unrelated Exhibitor" was the owner *and* handler of both entries and was the identity the over-opening guard impersonated), but not the premise error. CI found the premise error — and found that the behavioural SQL test had **never once executed**, because there is no container runtime on this machine, so CI is always its first real run. Local mutation checks confirmed the wrong line was load-bearing; they cannot say a line should not exist. Codex pass 2 on the corrected diff: no findings.

  **Follow-up filed:** [MYK9-245](https://linear.app/myk9-platform/issue/MYK9-245) — a dropped show hides the exhibitor's entry but keeps their Stripe charge. It argues *against* gating `entries_select`'s handler/owner arms, because those are the only route by which an exhibitor could be shown that entry.

  **Still required after merge:** `supabase db push`. Merging applies nothing.

  **[DONE + DEPLOYED 2026-08-24] MYK9-236 — [#1779](https://github.com/rbeezley/myk9-platform/pull/1779), merge `3bcc031bc`.** Decision: retain the hosted platform-wide `service_role` defaults (`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN`) as the intended trusted-role contract, preserve the deliberate `entry_status_history` no-`INSERT` exception, make the SQL declaration honest, and enforce the declaration against the deployed database through the expensive `system_health_probe(true)` path. The cheap continuous probe remains unchanged. The evaluator covers all public ordinary tables, including `sms_proximity_sends`, and fails on missing, extra, duplicate, malformed, or privilege-drifted rows. Local evidence: assertion-first red; six shuffled focused runs (102 assertions); 66 related health/registry tests; 8 behavioural-SQL registration tests; 1,846 full-suite files / 17,734 tests; typecheck; lint; strict OpenSpec validation; `git diff --check`; and a linked Supabase migration dry-run. Parallel Codex standards/security/migration and MYK9-236/OpenSpec reviews returned no findings. Every required CI check passed, including the first real behavioural SQL execution. Migration `20260824210000` was applied; `cron-health-check` advanced from hosted v30 to v31. Live read-back returned 130 rows, zero drift, the expected `sms_proximity_sends` full grant and `entry_status_history` no-`INSERT` exception, with boolean probe execution restricted to `service_role`. Linear is Done with the full completion evidence.
- **Lane 3.5B — payment and payout reconciliation surfaces.** **[DONE 2026-08-25] MYK9-245 — PR #1783, merge `7c85c7670`.** The selected product decision keeps an exhibitor's own paid entry visible after a show soft-delete, marks it cancelled, preserves the existing entry/Payments surfaces, makes charge/refund state legible (including partial refunds), and suppresses payment/check-in next actions. The migration and behavioral SQL contract preserve owner-only tombstone visibility; all CI, build, A11y, E2E, and Vercel gates passed. Still next: [MYK9-235](https://linear.app/myk9-platform/issue/MYK9-235) (a refund against money never collected is invisible on every reconciliation surface), then [MYK9-234](https://linear.app/myk9-platform/issue/MYK9-234) (the ledger renders every row twice — the responsive two-copy antipattern; one node that reflows, not two CSS-hidden copies). 3.5B is the **symptom** side of 3.5A's ledger defect and does not substitute for it: making dropped rows visible on one page leaves the policy asymmetry intact for every other surface built on `manageable_show_ids()`.
- **Lane 3.5C — Batch 3 follow-ups.** [MYK9-237](https://linear.app/myk9-platform/issue/MYK9-237), [MYK9-238](https://linear.app/myk9-platform/issue/MYK9-238), [MYK9-239](https://linear.app/myk9-platform/issue/MYK9-239). MYK9-238's deliverable is a **guard, not an audit** — an inventory of inert utilities decays the moment someone writes the next one.
- **Lane 3.5D — Reports information architecture.** [MYK9-240](https://linear.app/myk9-platform/issue/MYK9-240), [MYK9-241](https://linear.app/myk9-platform/issue/MYK9-241), [MYK9-242](https://linear.app/myk9-platform/issue/MYK9-242). **Read MYK9-241 against MYK9-198 before starting**: three surfaces write print state to `replicatedPaperworkPrintsTable` with three vocabularies, and Reports is the one that shows nothing — so a secretary re-confirms a print she already recorded from the Show Desk an hour earlier, and the twice-daily print reminder reads that record. This is the consolidate-don't-duplicate rule with a live example; the fix deletes the inline writer in `ReportsPage/index.tsx` rather than adding a fourth UI.

### Three In Progress issues that no batch covered

All three were outside the 54-ID inventory, so nothing in this plan tracked them. They are not stalled for the same reason and should not be treated as one pile:

- **[MYK9-198](https://linear.app/myk9-platform/issue/MYK9-198) — [NARROWED 2026-08-23].** Its own audit comment listed four open items. Item 1 (ring) was resolved and parked as MYK9-227. **Item 3 — "nothing guarantees a packet exists; no cron, no nag" — was the largest remaining gap and is now closed by MYK9-228, which reached Done on 2026-08-23.** Two items remain: scent-work class parameters (`num_hides`, `has_blank`) never reach the paper, and the human mock-trial-day drill, which only Richard can run. Update the issue to say so — it currently reads as though the cron gap is still open, which overstates the remaining work on an Urgent issue.
- **[MYK9-109](https://linear.app/myk9-platform/issue/MYK9-109)** — the load harness is repaired and green; it is waiting on Richard's `workflow_dispatch` in an approved load window. Same gate as [MYK9-126](https://linear.app/myk9-platform/issue/MYK9-126) in Batch 5; they should fire together, and neither is agent-startable.
- **[MYK9-88](https://linear.app/myk9-platform/issue/MYK9-88)** — umbrella for the OpenSpec change `exhibitor-ux-remediation`. In Progress is honest for an umbrella; it closes when its OpenSpec tasks do. MYK9-219 already reconciled against tasks 2.1/2.2 in Batch 3.

### Recommended order from here

1. **Richard, 5 minutes:** [MYK9-204](https://linear.app/myk9-platform/issue/MYK9-204) — prune the dev sandbox payment methods to Cards + Apple Pay + Google Pay and reload checkout on Android. It has been In Progress since 08-22, it blocks Lane 2C, and it blocks [MYK9-11](https://linear.app/myk9-platform/issue/MYK9-11) at cutover.
2. **Lane 3.5A is done and deployed** — MYK9-233 and MYK9-236 both closed on 2026-08-24.
3. **Batch 4 is done** — MYK9-211 closed on 2026-08-24 with the approved applied proof, production replay, and archived OpenSpec evidence.
4. **Lane 3.5B starts with MYK9-245**, then MYK9-235 and MYK9-234. Lanes 3.5C–D may run in parallel as capacity allows.

**Codex returns 2026-08-24 at 10:38 AM.** Batch 3 shipped with zero Codex reviews and MYK9-233 is a sixth unreviewed change waiting on it; from Batch 3.5 the normal gate applies again, with adversarial subagent review kept **in addition** rather than as a substitute — it found something real in all eleven rounds of Batch 3.

---

## Batch 4 — Closure proofs

- [MYK9-211](https://linear.app/myk9-platform/issue/MYK9-211): staging mutation proof with a disposable fixture — grant a scoped role, verify the audit event (actor/target/role/exact scope/timestamp) and the `/admin/permissions` rail, revoke, verify again, prove failed/no-op writes nothing, clean up, record evidence → Done. Can run any time after Batch 0 (independent of Batch 1 code). **[EXPANDED] This one needs explicit approval before it runs**: the issue's own reopen comment calls it an "explicitly approved safe test mutation," and it writes role grants plus permanent `permission_audit_log` rows to the shared staging database. Those audit rows are **not cleanable** — the table is an append-only access trail and deleting from it to tidy up would corrupt the very evidence surface under test. So the fixture must be a disposable _person_, the grant must be scoped to a disposable club or show, and the residue is accepted and named in the closure comment rather than removed. Confirm the fixture identity with Richard before writing anything.

  **[DONE 2026-08-24 — merged, deployed, and verified.]** Richard approved actor `testadmin@myk9t.com`, seeded profile-only target Test Club (`club@myk9t.com`), temporary `secretary`, exact Heartland club scope, and permanent audit residue after correcting all fixture credentials/secrets and removing `test.myk9.com` auth identities. Read-only baseline `2026-08-24T19:58:23.586689Z` found zero matching target assignments and zero prior target audit rows. The authenticated local Vite `RoleManager` source at then-deployed SHA `7f83dc19bfe4d54e4494e7e0b4a08827a935db42`, connected to staging auth/data, created assignment `00024170-bb22-47a8-bf3c-f9852d5bab84`; invalid person `00000000-0000-0000-0000-000000000211` failed before insert; scoped revoke returned `true`; repeated revoke returned `false`. Staging holds exactly `role_assigned` event `ea61ab25-36bb-483e-a18c-c83cda658684` and `role_revoked` event `7016a266-22b5-4419-ac34-a64741f780df` with the exact actor, target, role, Heartland `club_id`, and null `show_id`; final read-back confirms the assignment is inactive, active matching authority is zero, and invalid-target audit count is zero. The first deployed full-audit replay exposed a blank revoke Details cell because the page/export read only `new_value`; PR [#1781](https://github.com/rbeezley/myk9-platform/pull/1781) added the `old_value` fallback with assertion-first coverage, passed all CI/Vercel and Codex gates, and squash-merged as `f928a5983f4ab6e02b2566aebcfd28888c7d5102`. Production deployment `6071223011` / successful status `17269755739` binds that merge SHA to `myk9-platform-myk9show-85780ufk1-richard-beezleys-projects.vercel.app`. Final production-alias replay at 1440×900 on 2026-08-24T20:54:37Z displayed exact secretary/Heartland details for both grant and revoke with zero console errors; private screenshot SHA-256 `9b3d7d4b8c1fd099e5a5165f0a04aebd6a7f118ad4162cf2d304eea7574fd8e5`. Four focused files / 35 tests passed under six shuffled seeds; app-local typecheck/lint, `git diff --check`, and strict OpenSpec validation passed. MYK9-211 is Done.
- Browser replays for 54/163/57/225 closure if not already recorded in-lane (each reopen comment forbids closing from code/tests alone).

---

## [ADDED] How the browser replays actually run

Ten issues now require a recorded browser replay for closure, and several name viewports and a signed-in role. This is the plan's most under-specified dependency, so it is settled here once rather than re-derived per lane.

- **Which build.** Replay against staging (`myk9-platform-myk9show.vercel.app`, auto-deploys from `main`) _after the lane's PR merges_ — a replay against a local dev server proves the branch worked, not that the fix shipped. Confirm the deploy landed before capturing.
- **Which account.** As of the 2026-08-24 fixture remediation, the canonical staging fixtures use controllable `@myk9t.com` mailboxes (`testadmin@myk9t.com`, `secretary@myk9t.com`, `judge@myk9t.com`, and `exhibitor@myk9t.com` in the local E2E configuration); staging has zero `test.myk9.com` auth users. Passwords live in env, never in the plan, issue, command output, or a commit. Use the existing sign-in helpers (`signInAsExhibitor` and siblings) which read credentials from env themselves. A sign-in failure on staging usually means password drift, not a broken fix; check that before debugging the feature.
- **Which harness.** The `playwright-cli` skill for scripted role walks that need a real session; the Browser pane tools for a quick look. Either is fine — what matters is that the recorded evidence names the route, the viewport, the role, and the commit.
- **Which viewports.** Take them from each issue, not from a house default: 1440×900 + 768×1024 (MYK9-225, MYK9-54, MYK9-163), 768×1024 + 1024×768 (MYK9-57), 768px (MYK9-222), 375/768/1280 (MYK9-220).
- **Forced-failure replays.** MYK9-225 and MYK9-54 both require reproducing a **controlled HTTP 500** and then a recovery. That is request interception in the harness, not a real outage — never induce a failure by breaking staging for everyone.
- **Where evidence goes.** Screenshots stay in the local/private evidence ledger unless Richard separately authorizes an upload. A local path alone is not durable closure evidence: the Linear comment must record route, role, viewport, deployed commit, timestamp, assertions observed, controlled-failure/recovery method where applicable, and the artifact filename plus checksum. Do not attach or upload evidence without authorization.

## Operator track (Richard — runs parallel to Batches 0.5–4)

Wall-clock-bound and human-only items; agents cannot do these. PITR and the G9 rehearsal have moved to the final resilience batch by product-owner decision; this track now starts with the uncompressible external-registration work:

1. **10DLC chain — [SUPERSEDED 2026-08-22, no longer launch-blocking].** SMS is deferred until after launch, so MYK9-187 (EIN + legal identity), MYK9-188 (support@ forwarding) and MYK9-190 (file the Twilio brand + campaign) are parked on demand rather than started early. [MYK9-189](https://linear.app/myk9-platform/issue/MYK9-189) (point myk9show.com at the app, `/sms` and `/privacy` reachable) **was completed anyway** — the domain and legal pages matter independently of SMS. This no longer gates any deploy: `push-trigger-run-proximity` is dormant behind a code kill switch, not behind carrier approval.
2. **[MYK9-204](https://linear.app/myk9-platform/issue/MYK9-204) step 1** (5 min): prune the **myK9Show dev sandbox** payment-methods config to Cards + Apple Pay + Google Pay; reload checkout on Android to confirm. Unblocks Lane 2C.
3. **Integration configs:** [MYK9-184](https://linear.app/myk9-platform/issue/MYK9-184) two Google Maps keys + redeploy `send-confirmation-email`; [MYK9-183](https://linear.app/myk9-platform/issue/MYK9-183) Sign in with Apple.
4. **Device verifications:** [MYK9-185](https://linear.app/myk9-platform/issue/MYK9-185) run-proximity push on a real device; [MYK9-186](https://linear.app/myk9-platform/issue/MYK9-186) calendar feed on iOS/Google/Outlook.
5. **Show-day QA gates (near launch):** [MYK9-6](https://linear.app/myk9-platform/issue/MYK9-6) offline judge tablet round trip; [MYK9-30](https://linear.app/myk9-platform/issue/MYK9-30) venue print testing; [MYK9-96](https://linear.app/myk9-platform/issue/MYK9-96) low-tech walkthrough; [MYK9-13](https://linear.app/myk9-platform/issue/MYK9-13) real-user validation (last, once the product is stable).
6. **At cutover:** [MYK9-11](https://linear.app/myk9-platform/issue/MYK9-11) Stripe live-mode cutover incl. the payment-methods pruning step from MYK9-204.

## Batch 5 — Final resilience and recovery

This is deliberately the last batch. It does not block Batches 0.5–4. Keep both issues open until their original evidence gates are actually satisfied.

1. **[MYK9-126](https://linear.app/myk9-platform/issue/MYK9-126) — G9 rehearsal, final pre-launch gate.** Richard fires the `workflow_dispatch` only in an approved load window with the teardown-safety gates. The agent lane then analyzes the evidence, profiles the backend long tail (entries replication query, ringside update wrapper, authenticated entry results, account-today fanout), and reproduces page-readiness timeouts. Any Supabase restart requires separate explicit approval. Run this after product and show-day workflow changes have landed so the rehearsal measures the release candidate rather than an intermediate build.
2. **[MYK9-110](https://linear.app/myk9-platform/issue/MYK9-110) — PITR, allowed after launch.** Interim posture is Supabase nightly backups rather than making PITR a launch gate. Before relying on that posture, confirm in the dashboard that nightly backups are enabled and retained for the intended project, record who owns recovery, and document the minimum restore path and expected data-loss window. Full PITR retention verification, RPO/RTO work, single-show recovery procedure, and tested branch-project restore may resume after launch. Escalate MYK9-110 back into pre-launch scope only if nightly backups are unavailable, the restore path cannot be established, or launch data exposure materially increases.

## Deferred / parked (no action this cycle)

- [MYK9-27](https://linear.app/myk9-platform/issue/MYK9-27) user-guide Phase 6 — agent-able via the screenshot-docs skill; schedule after Batch 3 lands so screenshots don't go stale (MYK9-220 reflows everything).
- [MYK9-44](https://linear.app/myk9-platform/issue/MYK9-44) staging/prod separation, [MYK9-31](https://linear.app/myk9-platform/issue/MYK9-31) judge-directory data — Wait for Launch, operator-led.
- [MYK9-28](https://linear.app/myk9-platform/issue/MYK9-28) kill-switch removal — explicitly **post first live shows**.
- [MYK9-26](https://linear.app/myk9-platform/issue/MYK9-26) remaining evaluation scope (standalone read-only MCP / BYOK) — post-launch by its own framing; only the Batch 0 redeploy is current.
- [MYK9-195](https://linear.app/myk9-platform/issue/MYK9-195) steps 3–4 — **deferred per D7 (2026-08-22)**, parked in Backlog with both revisit triggers recorded on the issue.
- **SMS (MYK9-190, and MYK9-187/188 upstream of it)** — deferred until after launch by product-owner decision 2026-08-22; the delivery code ships inert behind `features.smsRingAlerts`. Revisit on real exhibitor demand.
- [MYK9-227](https://linear.app/myk9-platform/issue/MYK9-227) ring assignment — deliberately parked until a ring-using sport is actually added. Then use nullable free-text `ring_label` per class plus a sport-template `uses_rings` capability; scent work must never be asked for or display a ring.
- [MYK9-32](https://linear.app/myk9-platform/issue/MYK9-32), [MYK9-72](https://linear.app/myk9-platform/issue/MYK9-72), [MYK9-94](https://linear.app/myk9-platform/issue/MYK9-94) — Parked by design.

## Testing phase (applies to every batch)

- Each PR: focused unit tests written/extended per the issue's ACs, run 6+ times with `--sequence.shuffle`; `pnpm typecheck`; `pnpm lint`; new test files registered in the relevant allowlist; Codex review before merge; CI authoritative over local runs.
- Migrations (2B step 3, 3A): migration-auditor pass, timestamp picked against `origin/main`, grants verified against the **applied** DB (`pg_class.relacl` + column ACLs) after push.
- **[EXPANDED] The full app suite hangs — do not let a lane grind on it.** This is a known, documented condition: if a runner appears stuck for more than 60 seconds without useful output, stop and report rather than retrying in a loop (a prior MYK9-211 attempt lost exactly this way). Focused suites plus typecheck plus CI are the real gate; the broad local run is optional.
- **[ADDED] Migration timestamps are a cross-lane hazard, not a per-lane one.** Two lanes add migrations (2B step 3's SMS sent-marker, 3A's `platform_settings` columns). `migrationVersionUniqueness` only sees the lane's own tree, so both pass locally and the second to merge dies in CI. They sit in different batches so the ordering is naturally safe — but re-check `git ls-tree origin/main supabase/migrations/ | tail` immediately before naming each file, and again after any rebase, since either lane may sit open across other merges.
- **[ADDED] A red check may be a verdict on a stale base.** Before treating a CI failure as a lane's own defect, compare the PR's `baseRefOid` against `origin/main` and the run timestamp against intervening merges — with this many PRs landing in sequence, a lane opened early in a batch will accumulate stale bases. Merge `main`, push, and judge the re-run; a `gh run rerun` alone keeps the stale merge ref.

## [ADDED] Rollback posture

Most lanes are ordinary revertible PRs on a pre-launch platform, so the default is: revert the commit. Three exceptions need their answer decided before they start, not after they break:

| Change          | Why revert isn't automatic                                                                                                                   | Answer                                                                                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch 0 deploys | A function deploy is not in git history and `cron-waitlist-expiration` runs on a schedule against the money path                             | Record the outgoing version number first; revert = redeploy the prior bundle from its SHA. Deploy while watching                                                                                                                |
| 3A fee change   | Touches five sites plus a `platform_settings` migration, and a client/server divergence silently mismatches the cart preview against the Stripe charge (NOT a checkout loop — the drift healer never compares the platform fee) | New columns default to **0**, so the deployed behavior is unchanged until the value is deliberately set — the setting is the kill switch, and the shared client/server agreement test is what makes the change safe to leave in |
| 3D typography   | Global reflow with no natural blast radius                                                                                                   | Single token change so revert is one commit; re-scope to a role-limited rollout rather than patching components under a shipped global change                                                                                   |

- Batch exit: all lane PRs merged, closure proof recorded on each issue (browser replay where the reopen demands it), issue → Done with the standard completion comment.

## Sub-agent dispatch rules (from project memory)

- One worktree per lane; never edit the primary checkout; worktree workers must not sub-delegate.
- Move each issue to In Progress at lane start; comment with what-changed/tests/PR/risks/AC status at finish; Done only after merge + closure proof.
- Shared-system writes follow the Auto Mode confirmation rules; accepting or editing this plan is **not** approval to mutate an external system. Before execution, request explicit up-front confirmation for each operation class needed in the session: Supabase deploys/DB pushes, GitHub PR creation/comments, and Linear status/comments. One confirmation may cover a defined sequence on the same system in that session; re-confirm when switching systems or operation type.
