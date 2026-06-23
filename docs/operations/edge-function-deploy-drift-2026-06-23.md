# Edge Function Deploy Drift — 2026-06-23

> **Status:** Complete

> **Resolved 2026-06-23.** All 13 flagged functions reconciled — deployed bundle now byte-matches `main` for every one (verified by re-download + diff). The 10-function batch below was proven behavior-neutral (the pre-envelope handlers already returned the bare object, so the envelope's success contract is identical; only error statuses improved) and deployed. `send-confirmation-email` deploy also activated the merged Heritage email layouts. Remaining manual check: trigger one real signup/recovery email to smoke-test the `send-auth-email` GoTrue hook.

Audit of deployed edge functions vs `main` source, run 2026-06-23 after the cleanup skill's check #8 was strengthened to verify deploy state (PRs #938/#939). Every entry below was **proven** by downloading the deployed bundle (`supabase functions download <name> --use-api --workdir <tmp>`) and diffing against repo source — not by timestamp heuristic.

## Method (to re-verify or extend)

```bash
TMP=$(mktemp -d); mkdir -p "$TMP/supabase"; cp supabase/config.toml "$TMP/supabase/config.toml"
source supabase/.env
supabase functions download --project-ref sojmvhhwsjxmfistvzbe --use-api --workdir "$TMP"
# then diff each: deployed = $TMP/supabase/functions/<name>/index.ts  vs  repo source
```

Direction matters: a function whose deployed bundle byte-matches an *old* commit is **repo-ahead** (safe to deploy from repo). One whose deployed bundle matches *no* commit is **deployed-ahead** (an uncommitted hotfix — recover to source, do NOT redeploy).

## Resolved 2026-06-23

- **resend-webhook** — repo-ahead **security fix** (deployed was fail-open on missing `RESEND_WEBHOOK_SECRET`; repo fails closed with 503). **Deployed** and verified live (matches repo).
- **push-trigger-announcement** — deployed-ahead: live per-user dedup logic existed in zero commits. **Recovered to source** in PR #940 (+ regression test); no deploy needed (prod already runs it).
- **stripe-upgrade-subscription** — flagged by timestamp but deployed bundle is **identical** to repo. False positive, no action.

## Remaining batch — repo-ahead, undeployed (needs per-function caller verification)

These 10 are safe in the sense that the repo version is reviewed/merged and the deployed version is an older committed version. **But most are the #259/#261 "shared HTTP envelope" migration (merged 2026-05-20, never deployed), which changes each function's response shape** — so each needs its callers checked before deploy, not a blind batch. Several also carry newer feature work (e.g. `send-confirmation-email` gained the heritage field-guide/gazette/magazine/poster email builders).

| Function | Location | Undeployed change |
| --- | --- | --- |
| `ask-myk9q` | root | #259 envelope refactor |
| `send-auth-email` | root | #261 envelope (⚠️ GoTrue auth-email hook — test carefully) |
| `send-confirmation-email` | root | envelope + heritage email builders (large) |
| `send-registration-email` | root | #261 envelope |
| `send-waitlist-invite` | root | #261 envelope (large) |
| `push-trigger-scoring` | root | #261 envelope |
| `push-trigger-class-status` | root | #261 envelope |
| `admin-generate-reset-link` | root | #261 envelope |
| `generate-premium` | root | #261 envelope |
| `stripe-customer-portal` | apps/myk9show | staging CORS origin add (#225, minor) |

Deploy command (root vs apps/myk9show workdir):

```bash
# root function
supabase functions deploy <name> --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
# apps/myk9show function
supabase functions deploy <name> --workdir apps/myk9show --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
```

**Recommended approach:** verify each function's callers handle the shared-envelope response shape (the app deploys from `main`, so the client likely already expects it — confirm per function), then deploy in small batches with a smoke check. `stripe-customer-portal` (1-line CORS add) is low-risk and can go anytime. `send-auth-email` is the highest-care item (auth flow).
