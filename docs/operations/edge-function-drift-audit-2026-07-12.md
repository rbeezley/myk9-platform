# Edge Function Drift Audit — 2026-07-12

> **Status:** Source-recovery decision merged in [#1313](https://github.com/rbeezley/myk9-platform/pull/1313);
> `stripe-upgrade-subscription` deployed and source-verified 2026-07-13. The four-function
> HTTP-helper catch-up batch remains approval-gated.

## Scope and method

This re-audit compared the live Supabase project `sojmvhhwsjxmfistvzbe` with current `main`
(`806fdfe6`). It first ran the two-root inventory, then downloaded every live function into an
isolated temporary workdir with `supabase functions download <name> --use-api` and compared every
downloaded source file with the matching repository deployment root.

No function, secret, database, or configuration was changed.

## Result

| Classification | Count | Functions | Disposition |
| --- | ---: | --- | --- |
| Exact bundle match | 26 | All remaining repository-backed functions | No action. |
| Repo-ahead shared HTTP helper | 4 | `admin-delete-user`, `admin-generate-reset-link`, `send-push-notification`, `send-targeted-message` | Reviewed source is ahead; prepare a small, approval-gated deploy batch after the remaining blocker is resolved. |
| Deployed-ahead source | 1 | `stripe-upgrade-subscription` | **Resolved 2026-07-13:** deployed after approval; downloaded `premiumPrices.ts` and `index.ts` exactly match repository source. |
| Retired deployed-only legacy function | 1 | `send-notification` | **Retired 2026-07-12.** Dashboard Logs showed no events in the prior 30 days; removed from Supabase after approval and confirmed absent from the inventory. |

The live inventory now has 31 repository-name matches, zero deployed-only functions, and zero
repo-only functions; `push-trigger-support-message` is deployed and matches current source.

## Repo-ahead batch, not yet deployed

The four candidate functions are behind current shared HTTP helpers only:

- `admin-delete-user` and `admin-generate-reset-link` use the pre-`beforeBody` handler from
  commit `38084ce3`.
- `send-push-notification` and `send-targeted-message` use the older handler/response pair from
  commit `8f969930`.

Their current callers are present in the app and use the existing envelope response shape. The
current helper adds pre-body authentication support and an optional machine-readable `HttpError`
code; it does not change their success envelope. If the blockers are resolved and a deploy is
approved, use one root deployment batch:

```bash
supabase functions deploy admin-delete-user admin-generate-reset-link \
  send-push-notification send-targeted-message \
  --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt --use-api
```

Then run only fail-closed/no-write smokes: unauthenticated calls must return 401; an authenticated
non-owner push request must return 403; no user deletion, reset-link generation, or message send is
part of this batch's smoke.

## Resolved blocker 1 — `stripe-upgrade-subscription` was deployed ahead

The live `apps/myk9show/supabase/functions/_shared/premiumPrices.ts` has SHA-256
`34a1496ee5ade91c44766595e401b0c513eca03725549463f6c71f77d9c2b88e` and matches no repository
commit. Its recovered live behavior is:

```ts
export function parsePremiumPriceIds(envValue: string | undefined, fallback: string[]): string[] {
  const parsed = (envValue ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}
```

Current source deliberately extends the fallback with configured IDs instead. That protects an
existing live subscriber when `PREMIUM_PRICE_IDS` contains only sandbox IDs.

### Source-of-truth decision — merged

The repository fallback-extension helper is the selected source of truth; it supersedes the
deployed replacement helper. The live variant has no recoverable Git provenance, while repository
source is imported by `stripe-upgrade-subscription`, `stripe-checkout`, and `stripe-webhook` and
is protected by `apps/myk9show/supabase/functions/_shared/premiumPrices.test.ts`. The focused
contract passed locally on 2026-07-12: `pnpm exec vitest run
apps/myk9show/supabase/functions/_shared/premiumPrices.test.ts` (5 tests).

Tracked in OpenSpec change: `recover-stripe-price-source-drift` (PR #1313, merged 2026-07-13).

With separate approval, `stripe-upgrade-subscription` was deployed on 2026-07-13 using
`--workdir apps/myk9show --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt --use-api`.
The post-deploy review downloaded the function into an isolated directory and confirmed exact
matches to repository source: `premiumPrices.ts` SHA-256
`68c1f3e5fbc31d3cf653cd2f7e2591301308ab4325360fa5ce3e519b7106c6bf` and `index.ts` SHA-256
`b2a1fe3639508af999c46a80a46e707d16808b118c6dc597e040514cd026a585`. The function is ACTIVE.
If a future comparison fails, stop and use the recorded repository revision for an approval-gated
rollback; never restore the unknown live-only helper.

## Retired legacy function — `send-notification`

Before retirement, `send-notification` had no repository directory or application invocation. Its
downloaded source accepted any valid JWT, accepted an arbitrary `to` recipient, sent directly to
Resend without the shared retry/idempotency contract, and logged raw provider error text. It
overlapped the supported email functions and was not acceptable to retain without an explicit owner
and access decision.

The operator checked Supabase Dashboard → Edge Functions → `send-notification` → Logs for the
prior 30 days and found no events. With approval, the active v33 function was deleted from project
`sojmvhhwsjxmfistvzbe`. Post-retirement inventory reported 31 matched functions, zero
deployed-only functions, and zero repo-only functions.

## Closure criteria

Runbook 0.4 remains open until:

1. [x] `stripe-upgrade-subscription` was separately approved and deployed, and its downloaded
   `premiumPrices.ts` matches repository fallback-extension source (2026-07-13);
2. the four-function helper catch-up batch is approved, deployed, and smoke-verified.
