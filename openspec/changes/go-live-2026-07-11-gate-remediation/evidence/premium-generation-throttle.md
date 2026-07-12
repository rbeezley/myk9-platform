# Premium Generation Throttle Evidence

**Checked:** 2026-07-12 UTC

**Shared-system mutation performed:** none

## RED

The migration and handler source contracts first failed seven assertions because no dedicated
attempt table, atomic limiter RPC, prune path, or `generate-premium` limiter integration existed.
The Deno-free handler seam then failed all seven behavior tests on an intentional
`Not implemented` placeholder.

## GREEN

Migration `20260712120000_premium_generation_throttle.sql` adds:

- `premium_generation_attempts`, separate from correction-history table `premium_generations`;
- a `(auth_user_id, show_id, attempted_at DESC)` enforcement index, an `attempted_at` retention
  index, and a `show_id` foreign-key/cascade index;
- ENABLE plus FORCE RLS, no policies, explicit client-role revocation, and service-role-only table
  and RPC grants;
- `check_and_record_premium_generation_attempt(uuid, uuid)`, which takes a transaction-scoped
  advisory lock keyed by user and show before the rolling 15-minute count and insert; and
- a service-only 24-hour prune function scheduled daily at 04:15 UTC.

The pure `runPremiumGenerationAttempt` seam accepts the authenticated user and authorized show,
fails closed with typed 429/503 `HttpError` responses, and never invokes its paid-model callback on
denied, errored, rejected, or malformed limiter results. `generate-premium` calls the seam after its
RLS-backed show authorization and rethrows limiter errors before the existing Claude-only fallback.

Verification:

- 15 direct migration, source-integration, and handler-seam tests passed;
- 33 focused tests passed including the existing premium style contract, repository FORCE-RLS
  invariant, and migration-version uniqueness guard;
- `pnpm typecheck`: 26/26 tasks passed;
- `pnpm lint`: 14/14 tasks passed;
- `pnpm build`: 14/14 tasks passed; and
- strict OpenSpec validation and `git diff --check` passed.

The full myK9Show suite was attempted once and stopped at the repository's 60-second runner
threshold. No test failure was reported before termination; the focused and CI-required suites
remain the completion evidence for this slice.

The migration version is unique. Remote/local lineage matches through `20260711190000`; the
read-only dry run proposes exactly two pending migrations:

1. `20260711200000_daily_health_snapshot_watchdog.sql` (already merged in PR #1284, still not
   deployed); and
2. `20260712120000_premium_generation_throttle.sql` (this slice).

No database push or Edge Function deploy was performed. Runtime closure of SA-025 requires review
and merge, explicit approval of the two-migration push, deployment of `generate-premium`, live
catalog/index/grant verification, a rolled-back concurrent limiter proof, and controlled 429/503
smokes. A valid Edge generation would incur Anthropic traffic and requires separate paid-traffic
approval. Rollback first redeploys the last-good Edge revision, then unschedules and drops the prune
function, limiter RPC, and attempt table using the exact SQL documented in the migration.
