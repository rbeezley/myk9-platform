# Go-Live Gate Remediation Design

**Date:** 2026-07-11

**Status:** Approved direction; written-spec review pending

**Source:** [`docs/launch/go-live-2026-07-11.md`](../../launch/go-live-2026-07-11.md)

## Objective

Close or explicitly disposition every non-done row in the July 11 go-live gate review without creating another launch dashboard or duplicating the existing runbook. Use one OPSX remediation change to preserve the paper trail, but split implementation into review-safe pull requests by risk domain.

Launch remains blocked until the existing go-live runbook and scorecard contain evidence for every required gate. Repository evidence cannot close dashboard, live-money, legal, real-device, or real-user gates.

## Findings That Change the Report's Proposed Fix

### Migration collision

Do not rename and push `20260710160000_self_service_soft_delete_person.sql` without first proving it is still required. The later migration `20260710170000_soft_delete_person_deactivates_roles.sql` re-emits the same RPC, includes self-service authorization, and adds role deactivation. If `20260710170000` is already remote, the colliding file is obsolete; applying it under a new version would replace the newer RPC with an older implementation and reintroduce the role-retention defect.

The default remediation is therefore:

1. verify remote application of `20260710170000` and inspect the live function definition;
2. delete the obsolete, unapplied duplicate migration;
3. run migration parity and dry-run checks;
4. push only if those checks reveal a different pending migration.

### Health-monitoring failure

`pg_net` is asynchronous. The cron's `succeeded` status proves that PostgreSQL queued `net.http_post`; it does not prove that `cron-health-check` returned 2xx or inserted a snapshot. The remediation must diagnose the queued request and Edge Function response before changing code.

Repairing the immediate request is not enough. A monitor that depends only on its own successful delivery can fail silently again. Add an independent database-side watchdog, using the existing `operator_alerts` surface, that records a deduplicated alert when the expected snapshot does not arrive. Do not create another admin page.

### Supabase advisor sweep

Do not run an indiscriminate `REVOKE EXECUTE FROM anon` sweep. PostgreSQL functions may also inherit execute rights from `PUBLIC`, and a small set of functions intentionally supports anonymous flows. Inventory callers and desired roles first; revoke from `PUBLIC` and `anon`, then restore only the narrow required grants.

Treat the two results-view errors as exceptions that require proof, not automatic acceptance. The public view deliberately reads owner-only result columns and applies a fail-closed release filter. The authenticated view implements cross-role visibility. Before accepting the advisor errors, test whether invoker views backed by narrowly granted `SECURITY DEFINER` functions can preserve behavior with a smaller privilege boundary. Prefer documented exceptions and regression tests over a risky pre-launch rewrite if the narrower design cannot be proven safely.

## Delivery Structure

Create one OpenSpec change, `go-live-2026-07-11-gate-remediation`, with tasks mapped to every non-done report row. The change may span several pull requests and stays active until all agent-owned work is merged and all operator gates are either evidenced or explicitly recorded as blocked.

### Batch A — Immediate defects

1. **Health diagnosis and repair:** collect `cron.job_run_details`, `pg_net` response, Edge Function logs, Vault-secret presence, function version, and snapshot evidence. Fix the proven cause. Add the independent missing-snapshot watchdog and focused contract tests. Verify with a manual dispatch, an observed snapshot, and a simulated missing-snapshot alert.
2. **Migration-lineage repair:** prove the later migration and live RPC are authoritative, remove the obsolete duplicate, run `supabase migration list`, and run `supabase db push --dry-run`. This PR must not perform a real database push without approval.

These are separate PRs because a monitoring migration and migration-history cleanup have different rollback and review risks.

### Batch B — Security disposition and hardening

1. **July 11 audit mechanical fixes:** FORCE RLS on the five named tables; route `resend-webhook` through the shared timing-safe verifier; use constant-time push-secret comparison; add the production guard to `getCurrentUserId()`.
2. **July 11 design findings:** decide and document fail-closed behavior for `validate-passcode`, a bounded generation throttle/cache policy, and removal of the service-role-key webhook fallback. Implement only approved, testable decisions; otherwise record an owner, deadline, and launch-risk disposition.
3. **Advisor privilege inventory:** export the 231 flagged functions, classify each as anonymous, authenticated, service-only, trigger-only, or extension-owned, and produce explicit grant changes. Never modify extension-owned functions.
4. **Advisor exception review:** prove the two results views' row and column contracts, test the narrower invoker-view/function alternative, and either migrate safely or record a time-bounded exception with regression evidence.
5. **Remaining warnings:** pin the 16 mutable search paths with fully qualified references. Remove public storage-listing policies only after repository and live-call evidence proves object listing is unused; keep public object retrieval intact.

Security work may use more than one PR. RLS, grants, and view-semantics changes require migration-focused review, source contract tests, dry runs, and a second opinion before any database push.

### Batch C — Operator gates and final evidence

Use the existing [`docs/operations/go-live-runbook.md`](../../operations/go-live-runbook.md) as the sole operator sequence. Update it and the scorecard; do not create a parallel checklist.

Execute gates in this order:

1. start attorney review and Custom SMTP/DNS setup because they have the longest lead time;
2. decide production-data strategy: scrub in place, fresh production project, or another explicitly documented option;
3. complete Stripe live keys, webhooks, Connect onboarding, Manual payout schedule, low-value payment, and refund verification;
4. configure and prove Sentry alert routing;
5. complete production domain/DNS and Vercel cutover evidence;
6. run the cold-anonymous browser walk, real-mailbox confirmation/AKC-recipient check, offline ringside device round trip, admin-surface walk, and real-user testing;
7. review data-driven Heritage and premium assignments after the production-data decision;
8. close the launch scorecard only when all required evidence exists.

Each shared-system mutation requires confirmation at execution time. Preparation, read-only evidence, scripts, dry runs, and rollback notes may proceed without that confirmation.

## Report Coverage

| Report area | Disposition |
| --- | --- |
| Four payment rows | Batch C Stripe cutover and live-money evidence |
| Custom SMTP | Batch C longest-lead operator gate |
| Confirmation email and AKC recipient | Batch C real-mailbox evidence |
| Test identities and demo shows | Batch C production-data decision and execution |
| Security audit | Batch B, covering SA-021 and SA-023–030 |
| Advisor errors, info, and warnings | Batch B inventory, fixes, and documented exceptions |
| Cold anonymous session | Batch C manual browser evidence |
| Migration parity | Batch A lineage repair |
| Cron/Vault health and `/admin/health` | Batch A diagnosis, repair, and watchdog |
| Feature-flag review | Batch C data-driven entitlement review; remove the stale flag check from the runbook |
| Offline ringside smoke test | Batch C manual device evidence |
| Sentry routing | Batch C operator evidence |
| Domain, DNS, and Vercel | Batch C operator evidence |
| TOS and privacy review | Batch C external legal gate |
| Rows already marked done | Preserve as regression evidence; do not reopen without contradictory evidence |

## Testing and Evidence

Every implementation PR follows assertion-first testing where values, grants, roles, statuses, or migration versions are involved.

- **Health:** focused unit tests for alert-deduplication logic; source contract tests for cron scheduling and required grants; live read-only diagnosis; approved manual dispatch; snapshot and missing-snapshot alert evidence.
- **Migration lineage:** duplicate-version scan, focused RPC source contract test, migration list parity, and `db push --dry-run`.
- **RLS and grants:** source contract tests that assert exact `REVOKE` and `GRANT` targets; migration auditor; dry run; post-push catalog queries after approval.
- **Results views:** anon, account, passcode, owner/co-owner, show-official, release-state, stale-passcode, and scored-column visibility matrices.
- **Edge/client fixes:** focused Vitest/Deno tests plus relevant app typecheck and lint.
- **Operator gates:** screenshots, dashboard exports, command output, transaction identifiers with secrets removed, mailbox evidence, and named sign-off recorded in the runbook or scorecard.

The OpenSpec verification phase must show one task or explicit exception for every non-done report row. A row is complete only when its stated evidence exists.

## Failure Handling and Rollback

- A failed health repair keeps `/admin/health` red and raises an operator alert; do not suppress staleness.
- A migration dry run that proposes reapplying or reverting unexpected versions stops the batch before any push.
- Grant changes ship with an explicit restoration migration or exact rollback SQL in the PR test plan.
- View changes retain the current view definitions as rollback material and must pass the complete access matrix before deployment.
- Stripe, SMTP, DNS, Vercel, and secret rotations follow their existing rollback procedures and remain operator-controlled.
- Demo-data work requires a backup/export and an approved target-state manifest before deletion or project replacement.

## Completion Criteria

The remediation is complete when:

1. every non-done July 11 report row is `done` with evidence or carries an explicit accepted-risk record with owner and deadline;
2. a failed health delivery creates an independent visible alert and a successful run writes a fresh snapshot;
3. local and remote migration histories have unique versions and a clean dry run;
4. advisor findings are fixed or documented with narrow privilege evidence;
5. all approved security fixes pass focused and full validation appropriate to their risk;
6. the existing go-live runbook and launch-readiness scorecard agree; and
7. no shared-system gate is marked complete from source-only evidence.
