# Edge Function Drift Audit — 2026-07-12

> **Status:** Blocked on deployed-source recovery and legacy-function disposition.

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
| Repo-ahead shared HTTP helper | 4 | `admin-delete-user`, `admin-generate-reset-link`, `send-push-notification`, `send-targeted-message` | Reviewed source is ahead; prepare a small, approval-gated deploy batch after the two blockers below are resolved. |
| Deployed-ahead source | 1 | `stripe-upgrade-subscription` | **Stop.** Do not overwrite until the live variant is recovered and its intended price-list semantics are decided. |
| Deployed-only legacy function | 1 | `send-notification` | **Stop.** Establish liveness, then explicitly retire or recover and harden it. |

The live inventory now has 31 repository-name matches and one deployed-only function. The prior
repo-only `push-trigger-support-message` is deployed and matches current source.

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

## Blocker 1 — `stripe-upgrade-subscription` is deployed ahead

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
existing live subscriber when `PREMIUM_PRICE_IDS` contains only sandbox IDs. Before any deploy,
recover this live variant in a reviewed source-history decision and explicitly choose whether the
current fallback-extension hardening supersedes it. Do not redeploy `stripe-upgrade-subscription`
until that decision is recorded.

## Blocker 2 — deployed-only `send-notification`

`send-notification` is active but has no repository directory or application invocation. The
downloaded source accepts any valid JWT, accepts an arbitrary `to` recipient, sends directly to
Resend without the shared retry/idempotency contract, and logs raw provider error text. It overlaps
the supported email functions and is not acceptable to retain without an explicit owner and access
decision.

Before deletion or recovery, the operator must inspect Supabase Dashboard → Edge Functions →
`send-notification` → Logs for recent use and identify any external caller. If unused, approve its
retirement. If used, recover it into a reviewed source change, restrict recipients/roles, route it
through the shared Resend helper, and deploy the replacement before retiring the live legacy
function.

## Closure criteria

Runbook 0.4 remains open until:

1. the deployed-ahead premium-price behavior is recovered and a source-of-truth decision is merged;
2. `send-notification` is retired or recovered and hardened with an identified owner; and
3. the four-function helper catch-up batch is approved, deployed, and smoke-verified.
