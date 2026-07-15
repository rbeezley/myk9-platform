## 1. Preflight Inventory and Decisions

- [ ] 1.1 Record the current Vercel plan, project ID, domains/aliases, latest production deployment, environment variables by scope, Git integration settings, and rollback deployment without exposing secret values.
- [ ] 1.2 Record current GitHub Actions deployment workflows, repository variables, secret names, GitHub environments/protection rules, and required-check behavior.
- [ ] 1.3 Inventory the current staging Supabase project across migrations, Auth, roles/permissions, Storage, Realtime/replication, Edge Functions, function secrets, database webhooks, cron jobs, and required reference/configuration tables in one evidence pass.
- [ ] 1.4 Inventory Stripe test/live products, prices, Connect configuration, webhook destinations, and environment ownership without changing shared state.
- [ ] 1.5 Resolve the production Supabase organization/region, required production reference data, production reviewer, mandatory staging smoke suite, backup owner/cost, and `www.myk9show.com` redirect decision; confirm the documented RPO/RTO/retention targets and record decisions in `design.md`.
- [x] 1.6 Create implementation issue [MYK9-21](https://linear.app/myk9-platform/issue/MYK9-21/separate-staging-and-production-deployment-environments) and keep it Todo until implementation begins.

## 2. Repository Workflow Design and Tests

- [ ] 2.1 Add fixture-based tests that first fail unless the automatic app workflow checks the successful main CI `head_sha`, advances only the protected `staging-release` ref, relies on Vercel Custom Environment branch tracking, has no Vercel token, and cannot invoke production deployment.
- [ ] 2.2 Add fixture-based tests that first fail unless production release is `workflow_dispatch`, requires a full SHA plus staging evidence, validates SHA format/main reachability/successful CI in a separate job with no environment or deployment secrets, and permits the protected production job to receive secrets only after that preflight succeeds.
- [ ] 2.3 Split the app deployment flow so successful main CI queues the complete staging release without cancelling in-progress work, rejects superseded candidates before ref update, advances protected `staging-release` to the exact newest successful SHA, and retains the lock until the matching Vercel GitHub deployment/check is READY and the staging domain mapping is verified; automatic staging remains tokenless.
- [ ] 2.4 Add the explicit production release workflow with an unprivileged preflight job followed by a protected deployment job that rebuilds the selected exact SHA with Production variables, records the prior deployment, verifies `myk9show.com`, and stops before deployment when any precondition fails.
- [ ] 2.4a [ADDED] Require the accepted staging deployment ID/SHA to match the deployment currently served by `staging.myk9show.com` immediately before production release.
- [ ] 2.5 Preserve the guides project's CI-gated `help.myk9show.com` deployment by advancing a protected `guides-release` ref to the exact successful main CI SHA and using Vercel Git production-branch tracking; add regression assertions that the automatic guides job has no team-scoped Vercel token.
- [ ] 2.6 Update the Phase 1 platform/deploy verifier and focused tests for staging target, production dispatch, exact-SHA checks, environment guards, enable gates, and both Vercel config files.
- [ ] 2.7 Add an environment-isolation verifier that rejects staging/production domain overlap, missing `VITE_APP_ENVIRONMENT`, equal staging/production Supabase project references, or production credentials in preview/staging configuration.
- [ ] 2.8 [ADDED] Pin the Vercel CLI version used by the explicit production workflow and test failure handling for Git ref update races, CLI/network timeout, invalid workflow input, missing secret, and partial external configuration cases.
- [ ] 2.9 [ADDED] Preserve localhost development and per-branch Preview deployment behavior and prove neither can update staging/production aliases or satisfy staging acceptance.

## 3. Vercel and GitHub Environment Setup — Approval Gated

- [ ] 3.1 Immediately before mutation, obtain explicit approval to upgrade the Vercel team from Hobby to Pro and record the expected monthly baseline.
- [ ] 3.2 Immediately before mutation, obtain explicit approval to create the custom `staging` environment after the Pro upgrade; configure branch tracking for `staging-release` and record its environment ID and settings.
- [ ] 3.3 Immediately before mutation, obtain explicit approval to attach `staging.myk9show.com` to the custom environment and change any required DNS/domain configuration.
- [ ] 3.4 Attach and verify `staging.myk9show.com`, confirming it resolves only to the custom `staging` environment while `myk9show.com` and `www.myk9show.com` remain Production aliases.
- [ ] 3.4a [ADDED] Immediately before mutation, obtain approval to configure Pro-compatible staging access protection and effective `noindex` behavior; verify unauthorized visitors cannot access staging test data.
- [ ] 3.5 Immediately before mutation, obtain approval to configure staging-scoped Vercel variables from the current staging configuration, including `VITE_APP_ENVIRONMENT=staging`, without copying production/live credentials into staging.
- [ ] 3.6 Immediately before mutation, obtain approval to configure the protected `staging-release` and `guides-release` refs and GitHub staging/production deployment environments, including production reviewer rules and least-privilege ref-update permissions.
- [ ] 3.7 Immediately before mutation, obtain approval to copy the team-scoped `VERCEL_TOKEN` into the protected `production` environment and configure remaining non-secret IDs/variables. Retain the repository secret temporarily for the currently deployed workflows; verify names/scopes rather than secret values and schedule repository-secret removal immediately after the replacement workflow merges.

## 4. Production Supabase Provisioning — Approval Gated

- [ ] 4.1 Immediately before mutation, obtain explicit approval to create the production Supabase project in the selected organization and region.
- [ ] 4.2 Create and link the production Supabase project from the implementation worktree; record project reference and rollback/ownership information without committing credentials.
- [ ] 4.3 Run a migration dry run, resolve drift or unsupported assumptions, then obtain explicit approval immediately before applying the complete migration set to production.
- [ ] 4.4 Apply migrations and verify schema, RLS, roles, permissions, replication publications, offline-required tables, database functions/triggers, and migration parity with staging.
- [ ] 4.5 Immediately before mutation, obtain approval to create required Storage buckets/policies; then verify production clients cannot access staging storage or vice versa.
- [ ] 4.6 Immediately before mutation, obtain approval to configure Auth site URL/redirect allowlist, Custom SMTP/Send Email Hook, rate limits, templates, and production-only secrets using the documented Management API procedure.
- [ ] 4.7 Immediately before mutation, obtain approval to deploy required Edge Functions with `--no-verify-jwt` and configure function secrets, webhooks, and schedules; then verify auth behavior and environment-specific endpoints.
- [ ] 4.8 Immediately before mutation, obtain approval to bootstrap only approved immutable/reference configuration rows; prove staging users, demo shows, entries, scores, payments, passcodes, and test fixtures were not copied.
- [ ] 4.8a [ADDED] Immediately before cutover, revalidate that no real user or operational data requires migration; if that assumption is false, stop and create a separately reviewed migration/reconciliation plan.
- [ ] 4.9 Immediately before mutation, obtain approval to create an isolated synthetic production show; verify Realtime and offline queue flush to production only, then remove or archive the synthetic data per the approved runbook.
- [ ] 4.10 Design a versioned, fail-closed production-to-staging masking manifest that preserves troubleshooting-relevant IDs/mappings, relationships, timestamps, permissions, and workflow state; sanitizes contact, Auth, payment-sensitive, private-message, secret, and passcode data; and rejects every unclassified table/column or schema drift.
- [ ] 4.11 Add tests for deterministic masking, schema-drift rejection, residual-sensitive-data scanning, referential integrity, designated staging Auth-account replacement, prohibited-field removal, idempotent reruns, scratch-destination cleanup, and zero staging-to-production connectivity.
- [ ] 4.12 Implement the on-demand refresh procedure so it sanitizes and validates in an isolated scratch destination, blocks staging import until every check passes, records snapshot time and sanitization version without sensitive values, and keeps external side effects disabled or redirected. Obtain separate immediate approval before the first real production snapshot refresh.
- [ ] 4.13 Before public launch, rehearse representative club and exhibitor troubleshooting using synthetic fixtures; after real production data exists, validate the first approved sanitized refresh as an operational follow-up rather than a blocker for initial environment separation.
- [ ] 4.14 Document and rehearse the exceptional support-case path using synthetic fixtures: minimum required records, separate approval, access restriction/logging, read-only production diagnostics preference, outbound suppression, automatic expiration, verified deletion, and evidence that expired data is inaccessible.
- [ ] 4.15 Immediately before paid or shared-system mutation, obtain approval for the selected backup configuration and cost; configure physical backups or PITR to meet RPO ≤24 hours, RTO ≤8 hours, and retention ≥7 days; assign the recovery owner; restore into an isolated non-production project; record pre-launch evidence and a quarterly drill schedule; and do not count staging as recovery evidence.

## 5. Production Service Configuration — Approval Gated

- [ ] 5.1 Immediately before mutation, obtain approval to configure Vercel Production variables for the new production Supabase project and `VITE_APP_ENVIRONMENT=production`.
- [ ] 5.2 Replace Vercel Production Supabase/Auth/service values and prove no staging project URL, key, webhook, or sender configuration remains.
- [ ] 5.3 Immediately before mutation, obtain approval for Stripe live-mode product/price, Connect, and webhook changes; configure production endpoints and keep staging on test mode.
- [ ] 5.4 Verify production email, Stripe webhook signature, checkout/portal/refund URLs, scheduled jobs, observability, and kill-switch values without releasing a new public build.

## 6. Repository Verification, PR, Merge, and Staging Activation

- [ ] 6.1 Run focused workflow/verifier tests, `pnpm qa:go-live:phase1:test`, `pnpm qa:go-live:phase1`, YAML/JSON validation, Prettier checks for touched files, and `git diff --check`.
- [ ] 6.2 Run security and deployment reviews focused on secret scope, exact-SHA trust, environment confusion, untrusted workflow inputs, privilege boundaries, and rollback safety; fix all blocking findings.
- [ ] 6.3 Validate OpenSpec with `pnpm openspec validate separate-staging-production-environments --type change --strict --no-interactive` and run implementation verification until no critical findings remain.
- [ ] 6.4 Open the implementation PR with Linear/OpenSpec links, checked acceptance criteria, approval-gated external actions, risk, rollback, test evidence, and intentional non-goals.
- [ ] 6.5 Monitor required CI through success, obtain explicit approval immediately before merge, merge the implementation PR, and complete its branch/worktree cleanup.
- [ ] 6.6 Immediately after merge activates the tokenless staging/guides workflows, obtain approval to delete the repository-level `VERCEL_TOKEN`; prove automatic jobs cannot read a production-capable token while the protected production environment retains it.
- [ ] 6.7 Observe the merge-triggered successful main CI run followed by exactly one READY staging deployment for the same SHA and no automatic production deployment.
- [ ] 6.8 Verify `staging.myk9show.com` serves the staged SHA, records the staging environment unambiguously, and matches immutable deployment ID plus full SHA acceptance evidence.
- [ ] 6.9 Run the agreed staging smoke suite across authentication, secretary setup, exhibitor entry, show-day roles, offline/reconnect replication, email, and Stripe test mode; record evidence.
- [ ] 6.10 Rehearse staging queue/supersession and failure behavior; prove failed, cancelled, superseded, or manually attempted unapproved releases cannot reorder staging or deploy production.

## 7. First Production Release and Rollback Evidence — Approval Gated

- [ ] 7.1 Run production preflight for the selected staged SHA: successful main CI, READY staging deployment, migration parity, environment isolation, production service health, and recorded prior production deployment.
- [ ] 7.2 Immediately before mutation, obtain explicit approval to execute the first production release workflow for the selected exact SHA.
- [ ] 7.3 Execute the protected production workflow and prove it deploys the selected exact SHA with production variables while leaving staging unchanged.
- [ ] 7.4 Verify `myk9show.com` and `www.myk9show.com`, production Auth, critical role journeys, offline/reconnect behavior, email, Stripe live paths, logs, and environment-specific Supabase writes.
- [ ] 7.4a [ADDED] Scan post-release Vercel/Supabase/Edge Function logs and alerts for errors, confirm monitoring ownership, and define the observation window before declaring the release healthy.
- [ ] 7.5 Prove exactly one READY production deployment was created by the release workflow and no Git-triggered or staging-triggered duplicate deployment occurred.
- [ ] 7.6 Immediately before mutation, obtain explicit approval for a controlled production rollback rehearsal; restore the recorded prior Vercel deployment, verify the public alias, re-release the accepted SHA, and record timing/evidence. Document database forward-fix ownership and do not perform destructive data rollback.

## 8. Documentation and Tracking

- [ ] 8.1 Update Vercel architecture and deployment runbooks with the final staging/production topology, domains, workflow triggers, variables, approvals, evidence, and rollback steps.
- [ ] 8.2 Update Supabase, Auth email, Stripe, staging reseed/refresh, preview quota, backup/restore, support-case handling, and go-live runbooks with explicit environment ownership and prohibited cross-environment operations.
- [ ] 8.3 Add a concise operator release checklist for “main → staging → accept → production” and link existing runbooks rather than duplicating their procedures.
- [ ] 8.4 Update `OPEN-TODOS.md`, the launch-readiness scorecard/runbook, OpenSpec tasks, and Linear status to match actual evidence; do not mark complete while any external gate remains.

## 9. Closure

- [ ] 9.1 Record merged-commit staging and production evidence, mark the Linear issue Done only when every required gate is proven, then archive the OpenSpec change and sync specs.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes production release authorization, domains, secrets, Supabase/Stripe isolation, offline replication targets, and multiple shared systems.
