## Context

The existing Vercel project treats `myk9show.com` and `myk9-platform-myk9show.vercel.app` as aliases of one Production deployment. Successful `main` CI currently invokes `vercel deploy --prod`, so the public domain changes automatically after CI. The same project is documented with `VITE_APP_ENVIRONMENT=staging`, and the current Supabase project (`sojmvhhwsjxmfistvzbe`) is the shared staging data plane. `staging.myk9show.com` already resolves to Vercel but returns `DEPLOYMENT_NOT_FOUND` because it is not assigned to a deployment environment.

Vercel Hobby does not support custom environments. The approved future direction is to upgrade to Pro, create one custom `staging` environment in the existing app project, and create a separate Supabase production project. This plan changes infrastructure and release operations only; it introduces no application UI.

The current offline-first replication architecture remains unchanged. Staging and production MUST run the same schema, RLS, replication, and Edge Function versions, but against separate Supabase projects so test writes, offline queues, and realtime traffic cannot cross environments.

## Goals / Non-Goals

**Goals:**

- Give staging and production unambiguous domains, variables, data planes, and release semantics.
- Deploy every successful `main` commit to `staging.myk9show.com` after full CI.
- Require an explicit operator action and protected GitHub production environment before deploying a tested exact commit to `myk9show.com`.
- Keep the previous production deployment live while a newer commit is being tested on staging.
- Make rollback, evidence collection, environment identification, and secret ownership repeatable.
- Prevent staging tests, E2E fixtures, email hooks, Stripe test traffic, scheduled jobs, and offline synchronization from writing to production systems.
- [ADDED] Keep local development and PR previews distinct from shared staging, and protect the staging domain from public indexing and unauthorized access.

**Non-Goals:**

- No user-facing environment switcher or duplicate product surface.
- No automatic production promotion.
- No change to application domain logic, offline-first query paths, or replication behavior.
- No staging environment for the guides project in this change; `help.myk9show.com` retains its existing CI-gated deployment path.
- No copy of staging demo users, entries, scores, payments, or test fixtures into production.

## Decisions

### 1. Use one Vercel project with a Pro custom `staging` environment

The existing `myk9-platform-myk9show` project remains the owner of `myk9show.com`. After upgrading the team to Pro, add a custom environment named `staging`, assign `staging.myk9show.com`, and configure staging-specific variables there.

This is preferred over a second Hobby project because it keeps one project/domain history, avoids doubling project-level configuration and deployment quota usage, and gives staging first-class environment variables. The two-project fallback is rejected unless the Pro upgrade is later declined.

### 2. Split staging deployment from production release

Replace the app portion of the current automatic production workflow with a CI-gated staging workflow:

- Trigger only after a successful `CI` push run on `main`.
- Check out `workflow_run.head_sha`.
- Deploy with `vercel deploy --target=staging --yes --archive=tgz`.
- Record commit SHA, deployment ID/URL, `staging.myk9show.com`, and readiness evidence.

Add a separate `workflow_dispatch` production release workflow:

- Require an explicit full commit SHA and staging evidence reference.
- Verify the SHA is reachable from `origin/main` and has a successful main CI run.
- Verify a READY staging deployment exists for the same SHA.
- [ADDED] Verify the current `staging.myk9show.com` alias still resolves to the accepted deployment ID/SHA so a stale acceptance cannot release after staging advances.
- Use the protected GitHub `production` environment for the operator approval gate.
- Check out that exact SHA and run a production build/deploy against Production environment variables.
- Verify `myk9show.com`, record the resulting deployment, and retain the previous deployment for rollback.

A production release rebuilds the same source SHA with production variables instead of promoting the staging artifact. Vite embeds environment variables at build time, so promoting a staging artifact would incorrectly preserve staging Supabase and service credentials.

### 3. Separate the Supabase data planes before declaring production ready

Keep `sojmvhhwsjxmfistvzbe` as staging. Provision a new production Supabase project and apply the complete migration history. Configure production independently:

- Auth URLs, redirect allowlists, SMTP/Send Email Hook, and rate limits.
- Required Edge Functions with `--no-verify-jwt`, function secrets, and scheduled jobs.
- Storage buckets/policies, Realtime publications, replication prerequisites, RLS, and database webhooks.
- Stripe live-mode keys, webhook endpoints, products/prices, and Connect configuration.
- Reference/configuration rows required for a blank production system, without staging users or demo operational data.

Before any data bootstrap, inventory the required reference tables and distinguish immutable configuration from staging fixtures. No bulk staging database clone is allowed.

### 4. Make environment ownership explicit

Use environment-scoped names and documentation:

- Vercel custom `staging`: current staging Supabase URL/key, Stripe test-mode values, staging auth/site URLs, `VITE_APP_ENVIRONMENT=staging`.
- Vercel Production: new production Supabase URL/key, Stripe live-mode values, production auth/site URLs, `VITE_APP_ENVIRONMENT=production`.
- GitHub repository secrets retain shared Vercel credentials; environment-specific deployment IDs/evidence belong to the relevant GitHub environment or workflow inputs.
- `staging.myk9show.com` is never aliased to a Production deployment, and `myk9show.com` is never aliased to a staging deployment.
- [ADDED] Local development remains `localhost`; PR branches remain isolated Vercel Preview deployments. Neither is considered shared staging evidence.
- [ADDED] Protect `staging.myk9show.com` with the strongest Pro-compatible deployment protection available to intended testers and send `noindex` headers/meta so staging is not treated as a public site.

### 5. Preserve guides deployment behavior

The guides project remains independently CI-gated to `help.myk9show.com`. Its job may be moved to a clearly named workflow while app staging/production workflows are split, but its release semantics do not change in this scope.

### 6. Verification is layered and approval-gated

Repository verification covers workflow source, exact-SHA guards, environment target names, promotion preconditions, config files, and tests. External verification covers Vercel aliases, environment variables, Supabase parity, Auth, Storage, Realtime, replication, Edge Functions, Stripe, smoke tests, and rollback rehearsal.

Each Vercel plan/domain/environment mutation, GitHub environment protection change, Supabase project/config/function write, DNS mutation, Stripe mutation, and production release requires explicit approval immediately before execution.

## Risks / Trade-offs

- **[Production and staging schema drift]** → Apply the same migration commit to staging first, verify it, then apply that exact migration set to production; add drift checks before promotion.
- **[Staging artifact differs from production build]** → Require the same exact source SHA and lockfile; verify environment-sensitive differences explicitly. Rebuilding is necessary because Vite variables are embedded at build time.
- **[Accidental production release]** → Use `workflow_dispatch`, full-SHA validation, successful-CI lookup, READY-staging lookup, and GitHub `production` environment approval.
- **[Test traffic reaches production]** → Use separate Supabase, Stripe, auth, email, webhook, cron, and storage configuration; prohibit production credentials in preview/staging scopes.
- **[Production project is incomplete]** → Use an environment parity checklist and block first public release until every required service has evidence.
- **[Vercel Pro cost and usage]** → Record the plan upgrade and expected monthly baseline before approval; retain the two-project fallback only as a documented contingency.
- **[Hobby-era preview quota assumptions become stale]** → Update quota and deployment runbooks for Pro limits and keep skip-unaffected behavior.
- **[Offline queues target the wrong environment]** → Build environment-specific service worker/cache identifiers where necessary and verify that staging and production clients sync only with their configured Supabase project.
- **[Current public domain changes during migration]** → Keep the existing Production deployment and aliases untouched until the staging environment is verified and the new manual production workflow is ready.
- **[Staging leaks test data or is indexed publicly]** → Enable deployment protection, restrict tester access, add `noindex`, use synthetic accounts, and prohibit production secrets/data in staging.
- **[A newer staging deploy invalidates earlier acceptance]** → Bind acceptance to deployment ID plus SHA and require the staging alias to match both immediately before production release.
- **[Pre-launch no-user assumption becomes false]** → Re-audit production/staging users and operational data immediately before cutover; if real user data exists, stop and create a separately reviewed migration/reconciliation plan.

## Migration Plan

1. Record current Vercel domains, environment variables, deployment IDs, GitHub environments, Supabase configuration, Edge Functions, Storage, Realtime, Stripe, and rollback points.
2. Obtain approval and upgrade Vercel to Pro.
3. Create the Vercel `staging` custom environment, attach and protect `staging.myk9show.com`, add `noindex`, and copy only staging-scoped values from the current configuration.
4. Implement and merge the CI-gated staging workflow plus manual production release workflow while keeping the existing production deployment live.
5. Validate an exact `main` SHA on staging, including role smoke tests, offline/reconnect behavior, auth email, payment test mode, and deployment evidence.
6. Provision the production Supabase project after approval; apply migrations and configure Auth, functions, secrets, Storage, Realtime, replication, cron, Stripe live mode, and required reference data.
7. Replace Vercel Production variables with production-only values and verify no staging credentials remain.
8. Run production preflight without changing the public deployment, then explicitly approve and execute the first production release for an already-validated SHA.
9. Verify `myk9show.com`, logs, auth, critical roles, payment paths, and data isolation; record evidence.
10. Rehearse rollback to the prior Vercel deployment and document database rollback/forward-fix ownership.

Rollback before first production release: disable the staging workflow/custom environment and leave the existing Production deployment untouched.

Rollback after production release: use Vercel rollback to the recorded prior production deployment, disable further releases, and use forward-only Supabase migrations unless a separately reviewed reversible migration exists.

## Open Questions

- Which Supabase region and organization should own the production project?
- Which reference/configuration tables require production bootstrap rows, and which staging rows are fixtures that must never be copied?
- Which Stripe live products/prices and webhook endpoints are already authoritative for the future production project?
- Who is the required reviewer for the GitHub `production` environment when additional collaborators are added?
- Which smoke suite is the minimum mandatory staging acceptance gate before production release?
- Should `www.myk9show.com` remain a production alias or redirect permanently to the apex domain?
- Which Pro-compatible staging protection mode will allow the intended testers without exposing staging publicly?
