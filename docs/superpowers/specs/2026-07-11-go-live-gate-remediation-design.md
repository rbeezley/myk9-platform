# Go-Live Gate Remediation Design

**Date:** 2026-07-11

**Status:** Verified; written-spec approval pending

**Source:** [`docs/launch/go-live-2026-07-11.md`](../../launch/go-live-2026-07-11.md)

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The remediation changes RLS, database privileges, migrations, authentication throttling, webhook secrets, monitoring, and launch-critical shared systems.

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

#### [EXPANDED] Independent failure paths

The watchdog must not call the health Edge Function, use `pg_net`, or depend on the health function's secrets. Run it after the expected snapshot window, query the indexed snapshot timestamp, and insert one unresolved alert per missed UTC run using the existing `(source, dedupe_key)` uniqueness contract. A healthy subsequent run resolves the stale incident or leaves an explicit operator resolution step; it must not create duplicate alerts.

The database watchdog makes the failure durable but does not itself notify a human who is not looking at `/admin/health`. Configure a Sentry Cron Monitor or equivalent external missed-heartbeat rule for `daily-health-check`, route it to a named human, and prove both the missed-check-in notification and recovery notification. The database watchdog and external heartbeat may not share the same delivery path.

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

#### [ADDED] Security-audit acceptance criteria

| Finding | Required disposition and evidence |
| --- | --- |
| SA-021 | Add FORCE RLS for all five named tables and add a repository-wide invariant check that fails when any public table enables RLS without eventually forcing it. Pair this with a live-catalog query for `relrowsecurity = true AND relforcerowsecurity = false`; any intentional exception must be named and justified. |
| SA-023 | Replace the resend-specific comparison with the shared timing-safe signature verifier. Preserve timestamp-skew, multi-signature, missing-secret, malformed-header, valid-signature, and invalid-signature tests. |
| SA-024 | Fail closed when `check_login_rate_limit` errors: return 503 before passcode validation, record a durable operator alert without logging the passcode, and prove the validation RPC is not called. Preserve the existing 429 contract for a healthy limiter. |
| SA-025 | Add an atomic server-side limiter before the Claude request, keyed by authenticated user and show. Allow at most five attempts in a rolling 15-minute window, return 429 without calling Claude when exhausted, fail closed on limiter errors, and prune attempt rows after 24 hours. Do not reuse `premium_generations`, whose meaning is correction history rather than request accounting. |
| SA-028 | Use a constant-time comparison in `pushWebhookAuth.ts`; test missing, malformed, wrong-length, wrong-value, and valid secrets. |
| SA-029 | First prove `push_webhook_secret` in Vault matches `PUSH_WEBHOOK_SECRET` for every push-trigger deployment. Rotate and deploy under approval, then remove every `SUPABASE_SERVICE_ROLE_KEY` fallback, including inline copies in announcement, chat-message, and support-message triggers. Prove a request signed only with the service-role key is rejected. |
| SA-030 | Guard `dev-current-mock-user` behind `import.meta.env.DEV`; test that production mode ignores an attacker-controlled localStorage value while development mode preserves test tooling. |

The four mechanical findings may ship together only if their focused tests stay independent. SA-024, SA-025, and SA-029 require their own reviewable tasks because they change availability, database state, or secret deployment.

#### [ADDED] Complete advisor accounting

Save a machine-readable advisor baseline before remediation and a post-remediation export afterward. Every ERROR, INFO, and WARN entry must map to a fix, an upstream/extension-owned exclusion, or a documented exception; aggregate counts alone are insufficient.

Explicitly disposition the three `rls_enabled_no_policy` INFO entries for `login_attempts`, `show_money_locks`, and `show_passcodes`. Verify that each table has no `anon` or `authenticated` table privileges, is reachable only through its intended service-role or hardened function path, and has no client query call site. Record that evidence rather than adding permissive placeholder policies.

Function-grant inventory must operate on schema plus identity-argument signature so overloaded functions cannot be conflated. It must account for inherited `PUBLIC` privileges and exclude extension-owned schemas from repository migrations.

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

#### [ADDED] Tracking closure

After each batch, update the source go-live report, the July 11 security-audit report, `OPEN-TODOS.md`, the go-live runbook, and the launch-readiness scorecard where applicable. Preserve original findings and append remediation evidence; do not rewrite the audit history. Keep `docs/README.md` links and document statuses accurate.

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
- **FORCE-RLS drift:** run the repository-wide migration invariant in CI and the live `pg_class` catalog verifier after an approved push. A newly added RLS table without FORCE must fail the check without editing a static table allowlist.
- **Results views:** anon, account, passcode, owner/co-owner, show-official, release-state, stale-passcode, and scored-column visibility matrices.
- **Edge/client fixes:** focused Vitest/Deno tests for every SA-023–030 acceptance criterion plus relevant app typecheck and lint.
- **Advisor accounting:** compare pre/post exports by advisor code and object signature; fail verification if any repository-owned finding is unclassified.
- **Operator gates:** screenshots, dashboard exports, command output, transaction identifiers with secrets removed, mailbox evidence, and named sign-off recorded in the runbook or scorecard.

#### [ADDED] Performance and retention checks

- Use the existing descending snapshot timestamp index for the watchdog and verify its query plan does not scan snapshot history.
- Index the premium limiter by user, show, and attempt time; bound the lookup to the 15-minute window and prove the 24-hour prune path.
- Generate privilege changes from the advisor inventory offline; do not issue per-function catalog queries from application request paths.
- Confirm the results-view access matrix on representative data volumes and reject a narrower view/function design if it materially regresses the current query plan.

The OpenSpec verification phase must show one task or explicit exception for every non-done report row. A row is complete only when its stated evidence exists.

## Failure Handling and Rollback

- A failed health repair keeps `/admin/health` red and raises an operator alert; do not suppress staleness.
- A failed database watchdog remains visible as a failed `pg_cron` run, while the independent external heartbeat raises the human notification. Verification must simulate each path separately.
- A migration dry run that proposes reapplying or reverting unexpected versions stops the batch before any push.
- Grant changes ship with an explicit restoration migration or exact rollback SQL in the PR test plan.
- View changes retain the current view definitions as rollback material and must pass the complete access matrix before deployment.
- A limiter rollout that blocks legitimate premium generation can be disabled with a narrowly scoped follow-up migration or configuration change without reopening anonymous or unauthenticated access.
- Stripe, SMTP, DNS, Vercel, and secret rotations follow their existing rollback procedures and remain operator-controlled.
- Demo-data work requires a backup/export and an approved target-state manifest before deletion or project replacement.

## Completion Criteria

The remediation is complete when:

1. every non-done July 11 report row is `done` with evidence or carries an explicit accepted-risk record with owner and deadline;
2. a failed health delivery creates an independent visible alert and a successful run writes a fresh snapshot;
3. local and remote migration histories have unique versions and a clean dry run;
4. advisor findings are fixed or documented with narrow privilege evidence;
5. all approved security fixes pass focused and full validation appropriate to their risk;
6. all seven July 11 audit findings have a tested fix or explicit accepted-risk record, and the FORCE-RLS invariant is enforced continuously;
7. every advisor entry is fixed, excluded as extension-owned, or documented with object-level evidence;
8. the existing go-live report, security audit, `OPEN-TODOS.md`, runbook, documentation index, and launch-readiness scorecard agree; and
9. no shared-system gate is marked complete from source-only evidence.
