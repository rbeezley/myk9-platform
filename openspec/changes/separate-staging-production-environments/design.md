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
- Serialize the complete staging release workflow without cancelling an in-progress release. At the front of the queue, prove the candidate is still the newest successful `main` CI SHA; superseded queued candidates exit without changing the ref.
- Advance a protected `staging-release` Git ref to that exact SHA; Vercel Custom Environment branch tracking deploys that ref to `staging` through the Git integration without exposing a Vercel access token to the automatic workflow.
- Keep the workflow lock until the Vercel GitHub deployment/check for that exact SHA reaches READY and `staging.myk9show.com` resolves to its deployment. Only then may another queued release advance the ref. Prohibit manual deployments to the custom staging environment outside the approval-gated recovery procedure.
- Record commit SHA, deployment ID/URL, `staging.myk9show.com`, and readiness evidence.

Add a separate `workflow_dispatch` production release workflow:

- Require an explicit full commit SHA and staging evidence reference.
- Run an initial unprivileged preflight job with no environment or deployment secrets; verify the SHA is full-length, reachable from `origin/main`, and has a successful main CI run.
- Only after unprivileged preflight succeeds may the protected production job receive deployment credentials and verify Vercel staging evidence.
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

### 4. Refresh staging from production selectively, not continuously

After real production data exists, support an operator-approved, on-demand production-to-staging refresh for realistic testing and troubleshooting. The refresh is strictly one-way and SHALL NOT make staging a replication target, production backup, or source of production writes.

The standard refresh preserves troubleshooting-relevant structure: stable source-record identifiers or a protected mapping, foreign-key relationships, club/show/trial/class/entry/result/payment-status workflow state, timestamps, configuration, permissions, and known edge-case values. It replaces or removes direct contact details, authentication credentials and sessions, payment tokens/provider-sensitive values, private message content, secrets, passcodes, and any data that could contact or impersonate a real person. Production Auth users are replaced with designated staging test accounts, and all staging email, SMS, push, Stripe live-mode, webhook, cron, and other external side effects remain disabled or redirected to test sinks during and after refresh.

The refresh runs from a documented, versioned allowlist/masking manifest and fails closed when a table or column is unclassified or schema drift is detected. It creates a sanitized export in an isolated scratch destination, scans that result for prohibited residual values, validates referential integrity and representative troubleshooting queries, and only then permits import into staging. A raw production dump is never restored directly into shared staging. Evidence records source snapshot time and sanitization version without logging sensitive values, and the procedure can be safely rerun.

[EXPANDED] The same manifest classifies Supabase Storage buckets and object paths. The default is to substitute staging-owned fixture assets. Copy a production object only when it is required to reproduce the case, passes content-type/size/malware and metadata checks, contains no prohibited embedded or visible personal data, and is written under a new versioned staging-only prefix. Upload and verify every required object before the database transaction points sanitized rows at that prefix. On failure, delete the incomplete prefix and leave the prior staging dataset and assets active.

[ADDED] Before export, capture one transactionally consistent source snapshot and calculate table rows, object count/bytes, scratch-space need, staging disk headroom, expected duration, and configured execution limits. Refuse to start when capacity or time budget is insufficient. Encrypt scratch snapshots and temporary Storage objects, restrict access to the approved refresh operator, and enforce a short documented retention limit. Transform large datasets in bounded batches with durable non-sensitive checkpoints and idempotent retries; never persist credentials or raw field values in checkpoints. The final staging database replacement is transactional where supported and becomes visible only after database, Storage, integrity, residual-data, and representative-query checks pass. Every successful, failed, or timed-out refresh verifiably deletes raw snapshots, sanitized exports, incomplete versioned prefixes, and other scratch artifacts while preserving the active sanitized staging dataset and, on failure, the last known-good staging dataset.

Build and test the refresh tooling before the first public release using controlled synthetic fixtures. Do not activate it against a real production snapshot until production contains real operational records and the operator separately approves that refresh. During the initial pre-launch period, staging continues to use controlled seed/demo data.

If sanitization prevents reproduction of a specific club or exhibitor issue, use a separately approved support-case escalation: copy only the minimum required records into a time-limited, access-restricted troubleshooting dataset; preserve exact state needed to reproduce the defect; suppress all outbound side effects; log access; and delete the exceptional dataset when the investigation closes. Prefer read-only production diagnostics when a copy is unnecessary.

Production recovery remains independent: use Supabase backups/PITR and restore testing. A mutable, sanitized staging database is not accepted as backup evidence.

The initial recovery target is RPO of 24 hours or less, RTO of 8 hours or less, and at least 7 days of recoverable history. Select physical backups or PITR based on the least-cost configuration that meets those targets, record the accountable owner, restore into an isolated non-production project, and complete a successful restore drill before launch and at least quarterly thereafter. Any paid backup/PITR configuration requires explicit cost approval before activation.

### 5. Make environment ownership explicit

Use environment-scoped names and documentation:

- Vercel custom `staging`: current staging Supabase URL/key, Stripe test-mode values, staging auth/site URLs, `VITE_APP_ENVIRONMENT=staging`.
- Vercel Production: new production Supabase URL/key, Stripe live-mode values, production auth/site URLs, `VITE_APP_ENVIRONMENT=production`.
- The automatic staging workflow has no Vercel access token. It may update only the protected `staging-release` ref after successful main CI; Vercel branch tracking performs the staging deployment.
- Remove the team-scoped `VERCEL_TOKEN` from repository-level secrets. Store it only in the approval-protected GitHub `production` environment for explicit app production releases.
- Preserve CI-gated guides deployment without a team token by advancing a dedicated `guides-release` ref to the exact successful main CI SHA and configuring the guides Vercel project to track that ref as its production branch.
- Environment-specific deployment IDs/evidence belong to the relevant GitHub environment or workflow outputs.
- `staging.myk9show.com` is never aliased to a Production deployment, and `myk9show.com` is never aliased to a staging deployment.
- [ADDED] Local development remains `localhost`; PR branches remain isolated Vercel Preview deployments. Neither is considered shared staging evidence.
- [ADDED] Protect `staging.myk9show.com` with the strongest Pro-compatible deployment protection available to intended testers and send `noindex` headers/meta so staging is not treated as a public site.

### 6. Preserve guides deployment behavior

The guides project remains independently CI-gated to `help.myk9show.com`. After successful main CI, the trusted workflow advances `guides-release` to the exact validated SHA; the guides Vercel project tracks that ref and deploys through its Git integration. This preserves the existing CI gate while removing production-capable team credentials from an automatic job.

### 7. Verification is layered and approval-gated

Repository verification covers workflow source, exact-SHA guards, environment target names, promotion preconditions, config files, and tests. External verification covers Vercel aliases, environment variables, Supabase parity, Auth, Storage, Realtime, replication, Edge Functions, Stripe, smoke tests, and rollback rehearsal.

Each Vercel plan/domain/environment mutation, GitHub environment protection change, Supabase project/config/function write, DNS mutation, Stripe mutation, and production release requires explicit approval immediately before execution.

### 8. [ADDED] Make external cutover checkpointed and fail-safe

Maintain a redacted mutation ledger containing each external action, owner, approval, precondition, verification, previous-setting recovery reference, and completion state without secret values. Configure new Supabase, Vercel, Auth, email, Stripe, webhook, cron, and GitHub resources disabled or non-public whenever the service permits. Verify one checkpoint before starting the next dependent mutation.

If any mutation, network call, or verification fails, stop the sequence, keep the existing public deployment and production data path active, disable newly created side effects, and either restore the previous setting from the inventory or leave the isolated new resource inactive for a later idempotent resume. Never retry a non-idempotent payment, email, webhook, DNS, or data-bootstrap action without first reconciling whether the earlier attempt took effect. Domain/alias cutover and production workflow enablement are the final activation steps.

## Risks / Trade-offs

- **[Production and staging schema drift]** → Apply the same migration commit to staging first, verify it, then apply that exact migration set to production; add drift checks before promotion.
- **[Staging artifact differs from production build]** → Require the same exact source SHA and lockfile; verify environment-sensitive differences explicitly. Rebuilding is necessary because Vite variables are embedded at build time.
- **[Accidental production release]** → Use `workflow_dispatch`, full-SHA validation, successful-CI lookup, READY-staging lookup, and GitHub `production` environment approval.
- **[Automatic staging or guides job holds a production-capable Vercel token]** → Use protected release refs plus Vercel Git branch tracking for automatic deployments; keep the team-scoped token only in the approval-protected app production environment.
- **[Test traffic reaches production]** → Use separate Supabase, Stripe, auth, email, webhook, cron, and storage configuration; prohibit production credentials in preview/staging scopes.
- **[Production project is incomplete]** → Use an environment parity checklist and block first public release until every required service has evidence.
- **[Vercel Pro cost and usage]** → Record the plan upgrade and expected monthly baseline before approval; retain the two-project fallback only as a documented contingency.
- **[Hobby-era preview quota assumptions become stale]** → Update quota and deployment runbooks for Pro limits and keep skip-unaffected behavior.
- **[Offline queues target the wrong environment]** → Build environment-specific service worker/cache identifiers where necessary and verify that staging and production clients sync only with their configured Supabase project.
- **[Current public domain changes during migration]** → Keep the existing Production deployment and aliases untouched until the staging environment is verified and the new manual production workflow is ready.
- **[Staging leaks test data or is indexed publicly]** → Enable deployment protection, restrict tester access, add `noindex`, use synthetic accounts, and prohibit production secrets/data in staging.
- **[A newer staging deploy invalidates earlier acceptance]** → Bind acceptance to deployment ID plus SHA and require the staging alias to match both immediately before production release.
- **[An older CI run finishes after a newer run]** → Queue the complete ref-update/readiness cycle under one non-cancelling lock, reject superseded candidates before ref update, and do not release the lock until the exact deployment is READY and its staging alias is verified.
- **[Pre-launch no-user assumption becomes false]** → Re-audit production/staging users and operational data immediately before cutover; if real user data exists, stop and create a separately reviewed migration/reconciliation plan.
- **[Sanitization removes the condition needed to reproduce a defect]** → Preserve IDs/relationships and operational state by default; use the minimum-record, time-limited support-case escalation only when ordinary sanitized staging cannot reproduce the issue.
- **[Production data leaks through a staging refresh]** → Use an explicit masking allowlist, replace Auth identities, suppress external side effects, verify the sanitized result, restrict operator access, and prohibit continuous synchronization.
- **[Staging is mistaken for a backup]** → Keep production backups/PITR and restore drills as the recovery system; label staging refreshes as disposable testing datasets.
- **[ADDED: Storage assets leak personal data or break troubleshooting]** → Default to fixture assets; allowlist and scan only case-required objects, place them under a versioned staging prefix, and switch sanitized references only after every object verifies.
- **[ADDED: Large refresh exhausts time or storage]** → Preflight counts/capacity, use a consistent snapshot plus bounded resumable batches, and retain the prior staging dataset unless all checks pass.
- **[ADDED: Release refs recursively trigger CI/deploy workflows]** → Exclude `staging-release` and `guides-release` from CI/workflow-run sources, hard-code those two refs in workflow validation, enforce all other protected refs with repository rulesets, and test one deployment per successful main SHA.
- **[ADDED: External cutover fails halfway]** → Use a redacted mutation ledger, inactive configuration, verify-before-next checkpoints, reconciliation before retry, and final-only public activation.

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
11. Before first public release, implement and rehearse the sanitized refresh and exceptional support-case cleanup procedure using synthetic fixtures; activate a real production snapshot refresh only later under a separate immediate approval.

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
