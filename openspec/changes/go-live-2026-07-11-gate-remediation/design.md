## Context

The July 11 review combines two live defects, seven security-audit findings, Supabase advisor debt, and operator-owned launch gates. The current daily health cron uses asynchronous `pg_net`, so a successful `pg_cron` run proves only enqueueing. The local migration tree contains two files with version `20260710160000`, while the later `20260710170000` migration appears to supersede the unapplied file. Security work spans database invariants, grants, Edge Function authentication, request throttling, and client-only development behavior.

The existing `/admin/health` page, `operator_alerts` table, go-live runbook, and launch-readiness scorecard remain the sole operational surfaces. Core show-day replicated data and offline mutation paths are unaffected; new limiter and monitoring records are online-only operational data. There are no UX-facing changes beyond existing admin alert content, so role-specific emotional intent and existing `// INTENT:` behavior remain unchanged.

## Goals / Non-Goals

**Goals:**

- Make successful health delivery and missed health delivery independently observable.
- Restore unique, non-regressive migration lineage.
- Resolve all seven July 11 security findings with tests or explicit accepted-risk evidence.
- Prevent FORCE-RLS and database privilege posture from drifting silently.
- Account for every advisor entry by exact object identity.
- Keep operator and shared-system gates honest and evidence-backed.
- Prevent short Resend throttles or outages from dropping launch-critical transactional email on the first attempt.
- Give simultaneous show openings headroom for up to 1,000 Supabase Auth emails/hour after the Resend paid-plan prerequisite is evidenced.

**Non-Goals:**

- No new launch dashboard, admin page, checklist, or duplicated operator workflow.
- No changes to Stripe architecture, offline replication, show-day scoring, or payments semantics.
- No blanket function revocation, permissive placeholder RLS policy, or extension-owned object mutation.
- No production database push, function deployment, secret rotation, dashboard edit, live-money action, data deletion, DNS change, or PR merge without the required confirmation.
- No durable email outbox, new queueing service, new email UI, bulk-marketing workflow, or silent retry of permanent Resend 4xx errors in this slice.

## Decisions

### Use one OpenSpec change with risk-separated delivery slices

The OpenSpec change remains active across health, migration-lineage, security, and evidence slices so every July 11 row has one durable paper trail. Health, migration lineage, database security, and Edge Function changes may be separate PRs because their rollback and review boundaries differ. This is preferred to one large PR or one OpenSpec change per checkbox.

### Verify health delivery outside the asynchronous dispatch path

First diagnose the actual `pg_net` response and Edge Function logs. Preserve daily snapshot generation, then add a database-side watchdog scheduled after the expected run. The watchdog reads the indexed latest snapshot time and writes one unresolved `operator_alerts` row per missed UTC run using the existing `(source, dedupe_key)` contract. It does not call the health function, use `pg_net`, or share the health function's secrets.

An external cron monitor provides human notification and recovery notification through a separate path. The health runner emits provider-supported in-progress/success/error check-ins without coupling snapshot persistence to the check-in result: a check-in outage must not roll back or suppress a snapshot, and the missing heartbeat must itself alert. Repository work prepares its exact schedule, slug, routing, verification, and rollback steps; external configuration stays approval-gated.

Alternative rejected: relying on `cron.job_run_details`, because it cannot prove an asynchronous HTTP response or snapshot insert.

### Treat the later soft-delete migration as authoritative unless remote evidence disproves it

The `20260710170000` migration re-emits `soft_delete_person` with self-service authorization and role deactivation. If local source tests and remote read-only evidence confirm it is applied and authoritative, delete the obsolete unapplied duplicate instead of renaming it. A dry run that attempts to reapply or revert unexpected versions stops all database work.

Alternative rejected: renaming and pushing the old file, which could replace the newer function with regressive behavior.

### Enforce security invariants mechanically

Source replay and a live `pg_class` query correct the audit's five-table list: `unified_ringside_overrides` was dropped by applied migration `20260623120000_remove_unified_ringside_flag` and does not exist remotely. A migration forces RLS on the four extant tables. A repository-wide checker derives final RLS/FORCE-RLS state from migrations and fails when a public table is RLS-enabled without being forced, without a static list of table names. A companion live-catalog query verifies deployed state after approval.

Advisor exports are machine-readable and keyed by advisor code plus schema and object signature. Function privilege changes account for `PUBLIC`, `anon`, overloads, intentional anonymous paths, and extension ownership. Results-view exceptions require access-matrix tests and a documented comparison with a narrower invoker-view/definer-function boundary before acceptance.

Alternative rejected: a blanket revoke sweep, which would break intentional anonymous RPCs and miss privileges inherited from `PUBLIC`.

### Fail closed at paid or brute-force security boundaries

`validate-passcode` returns 503 and persists a deduplicated alert when the limiter RPC errors, before the validation RPC runs. `generate-premium` uses an atomic server-side user-plus-show limiter allowing five attempts in a rolling 15-minute window, returns 429 when exhausted, returns 503 on limiter failure, and prunes attempts older than 24 hours. The limiter has a dedicated table because `premium_generations` represents correction history, not request accounting.

### Use one dedicated push-webhook secret and constant-time comparison

Shared push authentication rejects missing, malformed, wrong-length, and wrong-value credentials with a constant-time comparison. All shared and inline `SUPABASE_SERVICE_ROLE_KEY` fallbacks are removed only after read-only evidence proves the Vault and function secret match and an approved rotate/deploy sequence is ready. A request signed only with the service-role key must fail.

### Use bounded in-request Resend retries with content-safe idempotency

All ten production call sites that post directly to `https://api.resend.com/emails` use a shared `sendResendEmailWithRetry` contract. The helper makes at most three total attempts. It retries only network exceptions, HTTP 408, HTTP 429, and HTTP 5xx responses; all other 4xx responses return immediately to the existing caller-specific failure path. It honors `Retry-After` delta-seconds or HTTP-date values, capped at 2,000 ms per wait so the Auth Send Email Hook and synchronous Edge callers do not exceed their practical request windows. Without a valid header it uses exponential fallback waits of 250 ms and 500 ms plus bounded jitter. Fetch, sleep, clock, and randomness are injectable so lifecycle-email's existing seam remains intact and unit tests never use real time or network traffic.

Every attempt for one logical send reuses the same `Idempotency-Key`. Existing business keys remain authoritative. When a caller has no key, the helper derives `myk9-<sha256>` from the exact request body, so the key contains no raw recipient, token, subject, or message data and an uncertain network response cannot produce a duplicate on retry. Intermediate response bodies are discarded without logging secrets. After exhaustion the final `Response` or final network error is returned/thrown exactly once so each caller preserves its existing status, database log, durable alert, or best-effort behavior.

The repository has two independently deployed Supabase roots. The root implementation lives at `supabase/functions/_shared/resendEmail.ts`; the myK9Show deployment root carries an identical mirror at `apps/myk9show/supabase/functions/_shared/resendEmail.ts`. A byte-parity/source-contract test prevents drift and forbids raw Resend email fetches outside those two helpers. This controlled mirror is preferred to an import that escapes `--workdir apps/myk9show`, which would make production bundling depend on files outside that deployment root.

Alternative deferred: a durable database outbox and worker would survive invocation termination and long provider outages, but it changes synchronous delivery semantics and requires migrations, scheduling, reconciliation, and operator UI. Alternative rejected: ten local retry loops, which would duplicate security-sensitive timing and idempotency behavior.

### Set Auth email capacity from launch demand, after provider capacity

The target production `rate_limit_email_sent` is 1,000/hour, shared across Supabase Auth email endpoints. The operator first upgrades Resend Transactional from Free and records the paid monthly quota, no-daily-limit status, and team request rate. Only then may an approved Management API PATCH change the Auth limit from 100 to 1,000, followed by a read-back that proves SMTP, Send Email Hook, production `site_url`, and sender configuration are unchanged. Entry confirmations and other direct Edge emails do not consume the Supabase Auth 1,000/hour pool, but they do share the same Resend team quota and request-rate pool.

## Risks / Trade-offs

- **Health root cause differs from the source hypothesis** → preserve diagnosis evidence and patch only the proven layer; keep the watchdog because silent delivery failure remains possible.
- **Watchdog creates repeated noise** → use the existing unresolved-alert uniqueness contract and a stable UTC-run dedupe key; verify recurrence only after resolution.
- **Limiter blocks legitimate traffic during infrastructure failure** → fail closed by design, return a distinct 503, alert durably, and document narrow rollback SQL/configuration.
- **Grant sweep breaks anonymous flows** → generate changes from exact-signature inventory, preserve explicit allowlisted grants, and run call-site and access-matrix tests before push.
- **Results-view rewrite changes visibility or query plans** → retain current definitions as rollback material and prefer a time-bounded documented exception if a narrower design is not proven safe.
- **Uncommitted July 11 reports are not present on the feature branch** → do not overwrite them; stage tracking updates only after their source commits are integrated or record the exact pending patch.
- **External gates remain incomplete** → keep them owner-action/blocked with owner, evidence needed, and deadline; source-only work never closes them.
- **Retries duplicate a message after an ambiguous network failure** → reuse an explicit or content-derived hashed Resend idempotency key on every attempt.
- **Retry sleeps exceed the Auth-hook window** → cap each `Retry-After` wait at 2 seconds and stop after three total attempts.
- **Permanent provider errors waste capacity** → never retry 400, 401, 403, 409, 422, or other non-408 4xx responses.
- **The two deploy roots drift** → keep the portable helper byte-identical and enforce parity plus a repository-wide no-raw-fetch contract.
- **Auth capacity exceeds provider capacity** → keep the 1,000/hour PATCH blocked until the paid Resend plan and live quota/rate evidence exist.

## Migration Plan

1. Land repository-only health diagnosis tooling, watchdog migration, focused tests, and external-monitor runbook preparation.
2. Land migration-lineage cleanup separately and run duplicate-version, migration-list, RPC-source, and database-push dry-run checks. Perform no real push without approval.
3. Land mechanical security fixes, FORCE-RLS invariant, throttling, and push-auth changes in reviewable slices with focused tests and rollback notes.
4. Export and classify advisors, then land only evidence-backed grants/search-path/storage/view changes. Preserve a restoration migration or exact rollback SQL.
5. Run full local validation, second-opinion security review, OpenSpec verification, PR checks, and CI.
6. Land the bounded Resend retry helper and migrate all ten call sites with focused tests and bundle/source-contract verification; deploy no function without approval.
7. After explicit approval, apply database/function/secret/dashboard changes in dependency order, run live catalog and smoke checks, and record redacted evidence.
8. After the operator upgrades Resend, PATCH the Auth ceiling to 1,000/hour with backup/read-back evidence and no unrelated Auth-config changes.
9. Update the July 11 reports, backlog, runbook, scorecard, and docs index; archive only after every implementation PR merges and all remaining gates are explicitly recorded.

Rollback uses forward migrations or the exact SQL recorded per slice; prior view definitions and grant matrices are retained. A failed health repair leaves the board red and the independent alert active. Database push stops on unexpected migration history.

## Open Questions

- Which external cron-monitor provider and named human route will the operator approve? The repository will prepare Sentry as the default because it is already integrated.
- Will the two results views remain documented exceptions or be narrowed? The access matrix and query-plan comparison decide this before any migration.
- Which production-data strategy will the operator choose: scrub in place, fresh project, or another documented target state?
- Which paid Resend Transactional tier will the operator select before the 1,000/hour Auth ceiling is applied? The minimum acceptable evidence is no daily quota, sufficient monthly volume for simultaneous show openings, and the current team request rate.
