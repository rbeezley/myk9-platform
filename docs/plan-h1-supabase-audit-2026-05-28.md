# H1 — @supabase/supabase-js 2.93.3 → 2.106.2 audit

**Source:** Nightly commit review 2026-05-28, HIGH finding H1.
**Status:** Audit pass complete; staging verification + structural fix pending owner approval.
**Worktree:** `claude/adoring-dewdney-1642e1`

## Context

Dependabot PR (commit `e018ed74`) bumped the `npm-minor-patch` group across 14 packages including `@supabase/supabase-js` 2.93.3 → 2.106.2. The bump merged on a CI signal that was red since 2026-05-26 (the wizard test failure ultimately fixed in PR #397). The original nightly report rated H1 HIGH on "13 minor jump + CI-red window" alone, without reading the changelog. This document narrows the risk to specific changes.

Note: the carets in our workspace `package.json` files are still `^2.93.3`. Dependabot only moved the resolved version in `pnpm-lock.yaml`. Rolling back the lockfile would re-resolve to a lower minor; pinning declarations would require changing the carets too.

## What actually changed in the bumped range

Read from the upstream CHANGELOG (`master/packages/core/supabase-js/CHANGELOG.md`). Most of the 13 versions are "Version bump only for alignment" meta-package no-ops. The behaviorally relevant entries:

| Version | Change | Our exposure |
|---|---|---|
| **2.102.0** (2026-04-07) | "Add automatic retries for transient errors" | **HIGH** — see Flag A |
| **2.105.0** (2026-04-27) | "Realtime deferred disconnect" (+ Passkey/WebAuthn) | **MEDIUM** — see Flag B |
| **2.104.1** (2026-04-23) | "Propagate custom fetch to realtime client" | **MEDIUM** — see Flag C |
| **2.94.0** (2026-02-03) | "URL length validation and timeout protection" | **LOW** — see Flag D |
| **2.105.2** (2026-05-04) | `(string & {})` widening of enum-like unions; forward `lockAcquireTimeout` | **NONE** — type-only; `pnpm typecheck` is green |
| 2.106.0–2.106.2 | OpenTelemetry trace context; RN/Hermes export conditions | **NONE** — we are web-only and don't configure OTEL |
| 2.95.x | Canonical CORS headers export for edge functions | **NONE** — not consumed |
| 2.102.0 (also) | Export `PostgrestFilterBuilder` and `StorageApiError` | **NONE** — additive |
| 2.105.0 (also) | Passkey / WebAuthn | **NONE** — not consumed |

## Flag A — Double-retry on transient errors (2.102.0)

**RESOLVED 2026-05-28** — Read of [supabase-js#2072](https://github.com/supabase/supabase-js/pull/2072) sharply downgrades this finding. The library's retry posture is narrower than the changelog one-liner implied.

### What postgrest-js 2.102.0 actually retries

| Condition | HTTP / error | Methods | Default attempts | Backoff |
|---|---|---|---|---|
| Cloudflare timeout | 520 | All | 3 | exp 1s/2s/4s, cap 30s, respects `Retry-After` |
| PostgREST schema cache reload | 503 with `PGRST002` | All | 3 | same |
| Network errors | fetch failure | **Idempotent only** (GET/HEAD/OPTIONS) | 3 | same |
| AbortError | — | — | Never retried | — |

Opt-outs available: `new PostgrestClient(url, { retry: false })` globally, or `.retry(false)` per request.

### Actual overlap with our retry layer

Our retry surface:

- [packages/replication/src/mutation-utils.ts:194](packages/replication/src/mutation-utils.ts:194) — `isRetryableError()` classifies any error whose `.code` starts with `'5'` as retryable, plus `code === '429'`.
- [packages/replication/src/MutationManager.ts:94](packages/replication/src/MutationManager.ts:94) — default `maxRetries: 3` with exponential backoff, gated by `isRetryableError`. Only runs for queued mutations (POST/PATCH/DELETE).
- [apps/myk9q/src/stores/offlineQueueStore.ts:98](apps/myk9q/src/stores/offlineQueueStore.ts:98) — separate offline queue with `maxRetries: 3`.

`MutationManager` is mutation-only. Mutations are NOT idempotent, so the library's network-error retry does NOT apply to them. The only real overlap is **520 and 503 (PGRST002)** on mutations. For those, the call sequence becomes:

1. Library makes the call, gets 520/503 → library retries 3× with 1s/2s/4s → still failing → returns error to us.
2. `MutationManager` sees the error → `isRetryableError` returns true (matches `^5`) → schedules retry with its own backoff (3 more attempts).

**Total worst case: 1 + 3 + 3 = 7 attempts spread across ~30+ seconds.** Sequential, not nested — no multiplicative runaway. Acceptable for a queued offline mutation against a stuck Cloudflare edge or a schema-cache reload.

For reads (the library's idempotent-only network retry plus 520/503), the new library behavior is a **net positive**: a transient PGRST002 schema-cache reload now resolves transparently instead of bubbling to the UI as a "Failed to load" toast.

### Action

Downgrade from "needs investigation" to "documented overlap." Concrete steps:

1. **Add an assertion in [packages/replication/src/mutation-utils.test.ts](packages/replication/src/mutation-utils.test.ts)** that pins current behavior for 520 and 503-PGRST002 codes and references this audit. If anyone later narrows `isRetryableError` to skip library-covered codes, that test fails and forces re-reading this section. *(Done in this audit pass.)*
2. **Optional polish (not blocking):** narrow `isRetryableError` to skip 520 and 503-with-PGRST002 since the library already retried them. Saves ~10s of dead attempts in the rare case both layers fail. Worth doing only as part of a broader retry-policy cleanup, not in this audit.
3. **No change to `createClient` config.** Leaving `retry: true` (library default) is the right posture — reads benefit, mutations are still gated by our queue layer.

## Flag B — Realtime deferred disconnect (2.105.0)

**Risk:** `removeChannel()` may no longer tear the connection down synchronously. Code that calls `removeChannel(ch)` then immediately subscribes to a new channel with the same name can race against the deferred disconnect.

**Our exposure:** 31 `removeChannel` call sites across [packages/replication](packages/replication), [apps/myk9q/src](apps/myk9q/src), and [apps/myk9show/src](apps/myk9show/src). Highest-risk consumers:

- [apps/myk9show/src/services/realtime/RealtimeConnectionManager.ts:159](apps/myk9show/src/services/realtime/RealtimeConnectionManager.ts:159) — manages multiple named channels with explicit reconnect logic, already handles `CHANNEL_ERROR` and `TIMED_OUT` (line 162, 314).
- [apps/myk9show/src/services/realtime/RealtimeScoringService.ts:147](apps/myk9show/src/services/realtime/RealtimeScoringService.ts:147) — scoring channel with status callback (line 480).
- [apps/myk9show/src/services/realtime/realtimeClient.ts:202](apps/myk9show/src/services/realtime/realtimeClient.ts:202) — switch statement on status.
- [apps/myk9q/src/services/replication/ConnectionManager.ts:260](apps/myk9q/src/services/replication/ConnectionManager.ts:260) — channels named `replication:${tableName}:${licenseKey}`.

**Verification needed:**

1. Manually exercise: open a myK9Show show with collaborative editing → navigate away → navigate back → confirm the new channel subscribes cleanly without `CHANNEL_ERROR`. If you see one, that's the deferred-disconnect collision.
2. For myK9Q replication: license-key switch (logout → re-login as a different licensee) should tear all `replication:*:${oldKey}` channels and re-subscribe as `replication:*:${newKey}`. Same-name resubscribe should not happen here (different licenseKey), so this code path is probably safe — but worth confirming the licenseKey changes did not become race-prone.

## Flag C — Custom fetch propagated to realtime (2.104.1)

**Behavior change (not a regression):** myK9Q's client at [apps/myk9q/src/lib/supabase.ts:42](apps/myk9q/src/lib/supabase.ts:42) configures `global.fetch: customFetch`, which injects the `x-license-key` header for RLS-driven tenant isolation. Prior to 2.104.1 this fetch was only used for REST; the realtime websocket bypassed it. After 2.104.1, the WS upgrade request also goes through `customFetch`, so the `x-license-key` header now reaches realtime for the first time.

**Implications:**

1. If Supabase RLS policies on the affected tables (`announcements`, `entries`, etc.) read `x-license-key` for tenant filtering, realtime subscriptions are now correctly tenant-filtered. **Likely a positive** — previously a subscriber may have received events from other tenants on the same DB.
2. If anyone wrote a `.on('postgres_changes', ...)` filter assuming the WS skipped license-key filtering (e.g., a debug or cross-tenant tooling channel), that channel will stop receiving events. Audit `entryDebug.ts` and similar tooling.
3. The CORS preflight added by the new header may add ~50ms to the initial subscribe. Watch the `SUBSCRIBED` status latency.

**Verification needed:**

1. Open myK9Q with valid license key → confirm `announcement-${licenseKey}` channel receives inserts as before.
2. Confirm tooling channels (entryDebug, cross-tenant debug) still produce expected events; if not, the new RLS path is filtering them.

myK9Show's client at [apps/myk9show/src/services/database/supabaseClient.ts:29](apps/myk9show/src/services/database/supabaseClient.ts:29) sets `global.headers` but not `global.fetch`, so myK9Show is not affected by this change.

## Flag D — URL length validation (2.94.0)

**Risk:** Large `.in('id', [...])` filters may now fail validation where they previously succeeded.

**Our exposure:** 105 `.in()` filter call sites across both apps. The vast majority pass small arrays (IDs from the current page, filter selections, etc.) and are well under any reasonable URL limit. The risk is in any code path that passes an unbounded list — bulk selection, large CSV import, or report generation.

**Verification needed:** Spot-check the bulk-action and report-generation surfaces:

- [apps/myk9show/src/services/database/show-registrations](apps/myk9show/src/services/database/show-registrations) — bulk approval queries.
- [apps/myk9show/src/services/sync](apps/myk9show/src/services/sync) — bulk sync queries.
- Any report PDF/HTML generator that fetches all entries for a show.

If any of these pass arrays > ~50 IDs to `.in()`, refactor to batch or use a server-side join.

## Structural fix — isolate @supabase/supabase-js from the group

The grouping in [.github/dependabot.yml:34-40](.github/dependabot.yml:34) bundles every minor/patch under one `*` pattern, which is why a 13-minor library jump rode alongside a single lucide-react icon patch with no separable signal.

Proposed change — split `@supabase/supabase-js` (and the related auth/realtime/postgrest sub-packages, in case they're added later) into a dedicated group so they always file as their own PR:

```yaml
groups:
  supabase:
    patterns:
      - "@supabase/supabase-js"
      - "@supabase/auth-js"
      - "@supabase/realtime-js"
      - "@supabase/postgrest-js"
      - "@supabase/storage-js"
      - "@supabase/functions-js"
    update-types:
      - "minor"
      - "patch"
  npm-minor-patch:
    patterns:
      - "*"
    exclude-patterns:
      - "@supabase/*"
    update-types:
      - "minor"
      - "patch"
```

Rationale: Supabase is the spine of both apps. Any minor — let alone a 13-minor compounded jump — deserves a dedicated review even when CI is green. The `exclude-patterns` keeps the catch-all group sane. The sub-package names are included pre-emptively so this doesn't need to be re-edited if pnpm hoists any of them as direct deps later.

## Recommended execution order

1. **Land the structural fix first** (Dependabot config). Cost: trivial. Value: every future Supabase bump is isolated, so this audit becomes one-time work rather than recurring.
2. **Investigate Flag A (double-retry).** Read the 2.102.0 upstream commit; decide on disable/lower/tighten. Add a test asserting the attempt count.
3. **Spot-check Flag C (realtime + license-key).** Five-minute browser test on myK9Q staging. Confirm announcements still arrive.
4. **Smoke-test Flag B (deferred disconnect).** Navigate between live-update surfaces in myK9Show staging. Watch console for `CHANNEL_ERROR`.
5. **Spot-check Flag D (URL length).** Grep bulk-action `.in()` callers; only act if any are unbounded.

## Rollback option (if a regression is confirmed)

`pnpm-lock.yaml` re-resolution to a specific minor is straightforward:

```bash
# Pin the package to a specific safe version in all workspace package.jsons
pnpm -w add -E @supabase/supabase-js@2.101.1  # exact pin, not caret
pnpm install
git commit -am "fix(deps): pin @supabase/supabase-js to 2.101.1 pending audit"
```

Then file a follow-up PR to walk the library forward one minor at a time, exercising the suspected flag at each step.

## Out of scope for this audit

- Other packages in the same Dependabot bump (`turbo`, `@tanstack/*`, `lucide-react`, etc.) — only `@supabase/supabase-js` was flagged as HIGH in the nightly review and only it warrants the isolated PR going forward.
- A full integration test suite for realtime — exists as future work; this audit is a focused smoke test.
