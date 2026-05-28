# H1 — @supabase/supabase-js 2.93.3 → 2.106.2 audit

**Source:** Nightly commit review 2026-05-28, HIGH finding H1.
**Status:** Audit pass complete; staging verification + structural fix pending owner approval.
**Worktree:** `claude/adoring-dewdney-1642e1`

## Context

> **Correction 2026-05-28 (#2):** A second reviewer pass surfaced that PR [#403](https://github.com/rbeezley/myk9-platform/pull/403) does NOT actually move `@supabase/supabase-js` at all. The root `package.json` has a `pnpm.overrides` block (line 34) pinning `@supabase/supabase-js` to exactly `2.93.3`. PR #403 only moves caret specifiers in workspace `package.json` files; it does not touch the override. Result: PR #403's `pnpm-lock.yaml` diff contains **zero** changes to `@supabase/supabase-js` resolution — verified by `gh pr diff 403 -- pnpm-lock.yaml | grep -c "supabase-js"` returning 0.
>
> The override was added on 2026-05-23 in PR [#302](https://github.com/rbeezley/myk9-platform/pull/302) (squash-merged commit `361e6ded`). PR #302 was the *previous* Dependabot bundle attempting the same Supabase bump (to 2.106.1 that time). The override addition appears to have been made during that PR's review to neutralize the Supabase portion while keeping the other 61 package updates. No separate commit explains the rationale because the squash-merge collapsed all changes into one. PR #403 is therefore a **functional replay** of #302's Supabase portion — both bump carets that the override supersedes.
>
> The first correction (the "merged-to-main vs. open PR" framing) is still valid. The audit's behavioral findings (Flag A/B/C/D) are still correct as analyses of what the 2.93→2.106 range contains. What changed is **scope**: this document is no longer a pre-merge audit of PR #403's Supabase impact (there is none). It is a pre-cliff audit of the *eventual* Supabase upgrade that will happen whenever the override is removed.
>
> Lesson archived to `feedback_verify_overrides_not_just_carets`.

### What PR #403 actually does

PR [#403](https://github.com/rbeezley/myk9-platform/pull/403) ships effective bumps for **13** of the 14 packages listed in its commit message body: turbo, @tanstack/* (all five), lucide-react, @typescript-eslint/* (all three), eslint-plugin-react-hooks, dexie, dompurify, @vercel/node, typescript-eslint. It does NOT effectively bump `@supabase/supabase-js`, despite the caret moves in workspace files — the override silently pins it. Anyone reviewing #403 should treat it as a 13-package bump, not a 14-package bump.

### What this document covers

The audit catalogs the behaviorally relevant changes between 2.93.3 and 2.106.2 because that range will eventually land — whether via removing the override + merging a future Dependabot PR, or via an explicit "modernize Supabase" PR. The Flag A/B/C/D analyses below remain valid for that future work. Treat this document as the prep work for the eventual override-removal PR, not as cover for #403.

### Decision needed on the override

The override has been in place for 5 days. Three paths forward:

1. **Keep the override, document why** — if it was added for a known incompatibility (e.g., a downstream package not yet compatible with 2.106.x), add a comment on the override line explaining the reason and the unblock condition. Without a comment, the override is invisible context debt.
2. **Remove the override, run the audit's smoke tests** — frees future Dependabot Supabase bumps to actually take effect. Pair the removal with the Flag B/C/D verifications on staging. This is the "actually move forward" path.
3. **Add the override to a never-update list** — if Supabase is intentionally pinned (e.g., for compatibility with a specific Supabase Platform deployment), instead of relying on the override silently neutralizing bumps, configure Dependabot to skip `@supabase/*` entirely. Less brittle than an override + open Dependabot PRs that look like they do something but don't.

Path 2 is the most likely correct answer given the project is pre-launch ([[project_prelaunch_no_users]]) and current phase is consolidation rather than dependency conservatism. But that requires confirming the override is not load-bearing — owner decision.

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

1. **Land the structural fix in PR [#410](https://github.com/rbeezley/myk9-platform/pull/410)** (Dependabot grouping). Cost: trivial. Value: when the override is eventually removed, the next Dependabot Supabase bump lands as an isolated, reviewable PR rather than a 14-package bundle.
2. **Decide what to do with the override** at `package.json:34`. Three paths spelled out above. The lightest move that converts the audit work into shipped progress is **path 2 (remove the override + run smoke tests)**. Path 1 (document why it exists) is correct only if someone with context knows the override is load-bearing.
3. **Decide what to do with PR [#403](https://github.com/rbeezley/myk9-platform/pull/403):**
   - It is a 13-package bump dressed as 14 (Supabase no-op). Worth merging on its own merits if the other 13 patches are wanted.
   - If you choose path 2 on the override, *do not* try to make #403 also do the override removal. Keep the concerns separate: #403 ships the unrelated patch bumps, then a follow-up PR removes the override and verifies Supabase against the smoke tests.
4. **Smoke tests for the Supabase upgrade** (only relevant once the override is actually removed):
   - **Flag A (double-retry)** — already documented in this audit. No code change needed; vitest assertion pinned.
   - **Flag C (realtime + license-key)** — 5-minute browser test on myK9Q. Confirm announcements still arrive.
   - **Flag B (deferred disconnect)** — navigate between live-update surfaces in myK9Show; watch console for `CHANNEL_ERROR`.
   - **Flag D (URL length)** — grep bulk-action `.in()` callers; only act if any are unbounded. Pure code review.

## Rollback option (if a future override-removal causes a regression)

Two paths depending on when the regression surfaces:

**Before merging the override-removal PR:** Close the PR. The override stays in place; `main` stays on 2.93.3.

**After merging the override-removal PR:** Re-pin to a known-safe minor via the override (the same mechanism that's been in place all along):

```jsonc
// package.json
"pnpm": {
  "overrides": {
    "@supabase/supabase-js": "2.101.1"  // exact pin, not caret
  }
}
```

```bash
pnpm install
git commit -am "fix(deps): pin @supabase/supabase-js to 2.101.1 via override pending audit"
```

Then walk forward one minor at a time, exercising the suspected flag at each step. This is the same workflow that produced the 2.93.3 override in the first place — useful pattern, but only when paired with a comment explaining the reason.

## Out of scope for this audit

- Other packages in the same Dependabot bump (`turbo`, `@tanstack/*`, `lucide-react`, etc.) — only `@supabase/supabase-js` was flagged as HIGH in the nightly review and only it warrants the isolated PR going forward.
- A full integration test suite for realtime — exists as future work; this audit is a focused smoke test.
