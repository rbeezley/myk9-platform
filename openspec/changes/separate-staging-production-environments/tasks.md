## 1. Preflight Inventory and Decisions

- [ ] 1.1 Record the current Vercel plan, project ID, domains/aliases, latest production deployment, environment variables by scope, Git integration settings, and rollback deployment without exposing secret values.
- [ ] 1.2 Record current GitHub Actions deployment workflows, repository variables, secret names, GitHub environments/protection rules, and required-check behavior.
- [ ] 1.3 Inventory the current staging Supabase project across migrations, Auth, roles/permissions, Storage, Realtime/replication, Edge Functions, function secrets, database webhooks, cron jobs, and required reference/configuration tables in one evidence pass.
- [ ] 1.4 Inventory Stripe test/live products, prices, Connect configuration, webhook destinations, and environment ownership without changing shared state.
- [ ] 1.5 Resolve the production Supabase organization/region, required production reference data, production reviewer, mandatory staging smoke suite, and `www.myk9show.com` redirect decision; record decisions in `design.md`.
- [x] 1.6 Create implementation issue [MYK9-21](https://linear.app/myk9-platform/issue/MYK9-21/separate-staging-and-production-deployment-environments) and keep it Todo until implementation begins.

## 2. Repository Workflow Design and Tests

- [ ] 2.1 Add fixture-based tests that first fail unless the automatic app deployment targets Vercel `staging`, checks out the successful main CI `head_sha`, and cannot invoke production deployment.
- [ ] 2.2 Add fixture-based tests that first fail unless production release is `workflow_dispatch`, requires a full SHA plus staging evidence, verifies successful main CI and a READY staging deployment, checks main reachability, and uses the protected `production` environment.
- [ ] 2.3 Split the app deployment flow so successful main CI deploys the exact validated SHA with `vercel deploy --target=staging --yes --archive=tgz` and records staging evidence.
- [ ] 2.4 Add the explicit production release workflow that rebuilds the selected exact SHA with Production variables, records the prior deployment, verifies `myk9show.com`, and stops before deployment when any precondition fails.
- [ ] 2.4a [ADDED] Require the accepted staging deployment ID/SHA to match the deployment currently served by `staging.myk9show.com` immediately before production release.
- [ ] 2.5 Preserve the guides project's existing CI-gated `help.myk9show.com` production deployment behavior and add a regression assertion for that non-goal.
- [ ] 2.6 Update the Phase 1 platform/deploy verifier and focused tests for staging target, production dispatch, exact-SHA checks, environment guards, enable gates, and both Vercel config files.
- [ ] 2.7 Add an environment-isolation verifier that rejects staging/production domain overlap, missing `VITE_APP_ENVIRONMENT`, equal staging/production Supabase project references, or production credentials in preview/staging configuration.
- [ ] 2.8 [ADDED] Pin the Vercel CLI version used by staging and production workflows and test failure handling for CLI/network timeout, invalid workflow input, missing secret, and partial external configuration cases.
- [ ] 2.9 [ADDED] Preserve localhost development and per-branch Preview deployment behavior and prove neither can update staging/production aliases or satisfy staging acceptance.

## 3. Vercel and GitHub Environment Setup — Approval Gated

- [ ] 3.1 Immediately before mutation, obtain explicit approval to upgrade the Vercel team from Hobby to Pro and record the expected monthly baseline.
- [ ] 3.2 Upgrade Vercel to Pro, create the custom `staging` environment, and record its environment ID and settings.
- [ ] 3.3 Immediately before mutation, obtain explicit approval to attach `staging.myk9show.com` to the custom environment and change any required DNS/domain configuration.
- [ ] 3.4 Attach and verify `staging.myk9show.com`, confirming it resolves only to the custom `staging` environment while `myk9show.com` and `www.myk9show.com` remain Production aliases.
- [ ] 3.4a [ADDED] Configure Pro-compatible staging access protection and effective `noindex` behavior; verify unauthorized visitors cannot access staging test data.
- [ ] 3.5 Configure staging-scoped Vercel variables from the current staging configuration, including `VITE_APP_ENVIRONMENT=staging`, without copying production/live credentials into staging.
- [ ] 3.6 Configure or rename GitHub staging/production deployment environments and, immediately before mutation, obtain approval to add production protection/reviewer rules.
- [ ] 3.7 Configure repository secrets/variables required by the split workflows and verify only names/scopes, never secret values.

## 4. Production Supabase Provisioning — Approval Gated

- [ ] 4.1 Immediately before mutation, obtain explicit approval to create the production Supabase project in the selected organization and region.
- [ ] 4.2 Create and link the production Supabase project from the implementation worktree; record project reference and rollback/ownership information without committing credentials.
- [ ] 4.3 Run a migration dry run, resolve drift or unsupported assumptions, then obtain explicit approval immediately before applying the complete migration set to production.
- [ ] 4.4 Apply migrations and verify schema, RLS, roles, permissions, replication publications, offline-required tables, database functions/triggers, and migration parity with staging.
- [ ] 4.5 Create required Storage buckets/policies and verify production clients cannot access staging storage or vice versa.
- [ ] 4.6 Configure Auth site URL/redirect allowlist, Custom SMTP/Send Email Hook, rate limits, templates, and production-only secrets using the documented Management API procedure.
- [ ] 4.7 Deploy required Edge Functions with `--no-verify-jwt`, configure function secrets, webhooks, and schedules, and verify auth behavior and environment-specific endpoints.
- [ ] 4.8 Bootstrap only approved immutable/reference configuration rows; prove staging users, demo shows, entries, scores, payments, passcodes, and test fixtures were not copied.
- [ ] 4.8a [ADDED] Immediately before cutover, revalidate that no real user or operational data requires migration; if that assumption is false, stop and create a separately reviewed migration/reconciliation plan.
- [ ] 4.9 Verify production Realtime and offline replication with an isolated synthetic show, including offline mutation queue flush to production only, then remove or archive the synthetic data per the runbook.

## 5. Production Service Configuration — Approval Gated

- [ ] 5.1 Immediately before mutation, obtain approval to configure Vercel Production variables for the new production Supabase project and `VITE_APP_ENVIRONMENT=production`.
- [ ] 5.2 Replace Vercel Production Supabase/Auth/service values and prove no staging project URL, key, webhook, or sender configuration remains.
- [ ] 5.3 Immediately before mutation, obtain approval for Stripe live-mode product/price, Connect, and webhook changes; configure production endpoints and keep staging on test mode.
- [ ] 5.4 Verify production email, Stripe webhook signature, checkout/portal/refund URLs, scheduled jobs, observability, and kill-switch values without releasing a new public build.

## 6. Staging Validation

- [ ] 6.1 Merge or otherwise safely activate the repository staging workflow only after Vercel staging configuration is ready, preserving the current public Production deployment.
- [ ] 6.2 Observe a successful main CI run followed by exactly one READY staging deployment for the same SHA and no automatic production deployment.
- [ ] 6.3 Verify `staging.myk9show.com` serves the staged SHA and displays/records the staging environment unambiguously.
- [ ] 6.4 Run the agreed staging smoke suite across authentication, secretary setup, exhibitor entry, show-day roles, offline/reconnect replication, email, and Stripe test mode; record evidence.
- [ ] 6.4a [ADDED] Record staging acceptance against immutable deployment ID plus full SHA, not only the mutable staging domain.
- [ ] 6.5 Rehearse staging failure behavior and prove failed/cancelled CI cannot deploy staging or production.

## 7. First Production Release and Rollback Evidence — Approval Gated

- [ ] 7.1 Run production preflight for the selected staged SHA: successful main CI, READY staging deployment, migration parity, environment isolation, production service health, and recorded prior production deployment.
- [ ] 7.2 Immediately before mutation, obtain explicit approval to execute the first production release workflow for the selected exact SHA.
- [ ] 7.3 Execute the protected production workflow and prove it deploys the selected exact SHA with production variables while leaving staging unchanged.
- [ ] 7.4 Verify `myk9show.com` and `www.myk9show.com`, production Auth, critical role journeys, offline/reconnect behavior, email, Stripe live paths, logs, and environment-specific Supabase writes.
- [ ] 7.4a [ADDED] Scan post-release Vercel/Supabase/Edge Function logs and alerts for errors, confirm monitoring ownership, and define the observation window before declaring the release healthy.
- [ ] 7.5 Prove exactly one READY production deployment was created by the release workflow and no Git-triggered or staging-triggered duplicate deployment occurred.
- [ ] 7.6 Rehearse or dry-run rollback to the recorded prior Vercel production deployment and document database forward-fix ownership; do not perform destructive data rollback.

## 8. Documentation and Tracking

- [ ] 8.1 Update Vercel architecture and deployment runbooks with the final staging/production topology, domains, workflow triggers, variables, approvals, evidence, and rollback steps.
- [ ] 8.2 Update Supabase, Auth email, Stripe, staging reseed, preview quota, and go-live runbooks with explicit environment ownership and prohibited cross-environment operations.
- [ ] 8.3 Add a concise operator release checklist for “main → staging → accept → production” and link existing runbooks rather than duplicating their procedures.
- [ ] 8.4 Update `OPEN-TODOS.md`, the launch-readiness scorecard/runbook, OpenSpec tasks, and Linear status to match actual evidence; do not mark complete while any external gate remains.

## 9. Verification, Review, PR, and Merge

- [ ] 9.1 Run focused workflow/verifier tests, `pnpm qa:go-live:phase1:test`, `pnpm qa:go-live:phase1`, YAML/JSON validation, Prettier checks for touched files, and `git diff --check`.
- [ ] 9.2 Run security and deployment reviews focused on secret scope, exact-SHA trust, environment confusion, untrusted workflow inputs, privilege boundaries, and rollback safety; fix all blocking findings.
- [ ] 9.3 Validate OpenSpec with `pnpm openspec validate separate-staging-production-environments --type change --strict --no-interactive` and run implementation verification until no critical findings remain.
- [ ] 9.4 Open the implementation PR with Linear/OpenSpec links, checked acceptance criteria, approval-gated external actions, risk, rollback, test evidence, and intentional non-goals.
- [ ] 9.5 Monitor required CI through success, obtain explicit approval immediately before merge, merge the PR, and complete branch/worktree cleanup.
- [ ] 9.6 Record merged-commit staging and production evidence, mark the Linear issue Done only when every required gate is proven, then archive the OpenSpec change and sync specs.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes production release authorization, domains, secrets, Supabase/Stripe isolation, offline replication targets, and multiple shared systems.
