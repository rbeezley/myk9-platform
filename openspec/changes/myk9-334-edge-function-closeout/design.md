## Context

See proposal.md. The waitlist cron already separates operational `errors` from retryable `notificationErrors`; the shared check-in wrapper marks failure only when work throws. The webhook's no-subscription branch already retires stale rows and upserts a stable sentinel id. Email authorization already rejects all but two types.

## Goals / Non-Goals

Keep the existing RPC/state transitions, derived recipients, and retry queues unchanged. No browser/offline replication impact: all changes are server-only. No new UI or alternate mutation path. MYK9-334 specifically covers the primary expired-offer query and recorded `results.errors`; propagating currently unrecorded secondary capacity/promotion query failures is pre-existing work outside this follow-up, not covered by the new monitoring guarantee.

## Decisions

- Wrap cron outcome reporting in a small injected helper using the existing best-effort check-in helper. Operational errors throw internally so monitoring records error, then become HTTP 500 with existing results preserved. Notification errors alone remain HTTP 200. Authentication/method rejection stays outside monitoring.
- Reuse Sentry initialization from the health cron instead of maintaining a second initialization policy. Alert with a stable source and 15-minute time-bucket dedupe key, escaped HTML or fixed text, and structured error context. Alert failure must not obscure the original outcome.
- Extract only the existing no-subscription persistence branch for behavioral tests; retain the unique subscription-id conflict target and stop on stale-update/upsert failures before profile downgrade.
- Delete rejected email types, switch arms, generators, the unreachable body-recipient fallback, and newly orphaned helpers. Reject unsupported runtime types explicitly before querying recipient data. Preserve rate limiting, authorization, and live email output.
- Tests exercise runtime helpers with mocked boundaries, not source-string assertions. Register new edge tests in both configs and run existing recipient/security coverage.

## Risks / Trade-offs

- Optional monitoring outage → original job still runs and returns its true outcome.
- Alert spam → dedupe stored alerts and opt in to skipping duplicate emails per scheduler window; next window can report ongoing failure. Preserve default email behavior for existing alert callers. If the first email fails, the stored operator alert remains available; the next window retries with a new key.
- Stale subscription row → test retiring rows before sentinel upsert; persistence failures stop downgrade.
- Concurrent work → no modifications to other sweeps, no unrelated primary-checkout commits included.

## Migration Plan

No schema or secret changes. After approval, deploy from each function's actual root with explicit `--project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt` and remote API bundling; never start local Supabase. Inspect downloaded live source for code parity, not timestamps alone. Roll back by redeploying previous reviewed source, with approval. Do not exercise real cron/payment/email side effects for smoke tests. Keep MYK9-334 open until code, tests, merge, and deployment evidence all pass.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: Server authorization and subscription persistence require focused behavioral tests, edge typecheck, broad CI, and independent review before shared deployment/merge.
