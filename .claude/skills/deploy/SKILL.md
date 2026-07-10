---
name: deploy
description: "Use when deploying anything to the live Supabase project or verifying a deploy — edge functions, database migrations (db push), Vault secrets — or when a merge landed and someone asks 'is it live?'. Also use when a deploy fails with password, linking, or wrong-project errors."
user-invocable: true
argument-hint: "[functions|migrations|verify] [names...]"
---

# Deploy (Supabase edge functions + migrations)

Merging a PR never deploys anything. Migrations and edge functions ship only via the explicit commands below, and this repo has a history of deploys landing on the **wrong project**. Follow this exactly.

## Non-negotiables

- **Project ref is always `sojmvhhwsjxmfistvzbe`.** Pass `--project-ref sojmvhhwsjxmfistvzbe` explicitly on every `supabase functions deploy`. `--workdir apps/myk9show` follows that dir's stale `.temp/project-ref` (myK9Show-Working, defunct). After deploying, confirm the output line "Deployed Functions on project ..." names the right ref — if it doesn't, the deploy went to the wrong project and must be redone.
- **Edge functions deploy with `--no-verify-jwt`** (functions handle auth internally).
- All of this is shared-system mutation: confirm with the user once before the first push/deploy of a session (Auto Mode rule in CLAUDE.md).

## Deploying edge functions

```bash
# Root-level functions live in supabase/functions/
supabase functions deploy <name> --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt

# Stripe functions live in apps/myk9show/supabase/functions/ — deploy with workdir
supabase functions deploy <name> --workdir apps/myk9show --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
```

Fail-closed secret couplings: several functions require Vault/edge secrets to match on both ends — `payout_cron_secret` (nightly-show-payouts), `cron_secret`/`CRON_SECRET` (waitlist-offer-expiration), webhook secrets for trigger-push. If a function 401s after deploy, check secret parity before touching code.

## Pushing migrations

Invoke the `db-push` skill — it owns the password/linking procedure (password in `supabase/.env`). Before writing a new migration, run `supabase migration list` to see remote state; run push from the worktree linked to Supabase, not the main repo. Every new `public` table needs explicit `GRANT`s (see CLAUDE.md template) — grants are orthogonal to RLS and both are required.

Consider dispatching the `migration-auditor` agent on any new migration file before pushing.

## Verify (after any deploy)

1. `supabase migration list` — remote matches local.
2. Functions: hit the function or check `supabase functions list --project-ref sojmvhhwsjxmfistvzbe` shows the new version; watch logs via the Supabase MCP `get_logs`.
3. Frontend: staging auto-deploys from `main` (myk9-platform-myk9show.vercel.app) — confirm the Vercel deployment for the merge commit succeeded.
4. Run `get_advisors` after schema changes to catch new RLS/security warnings.

## Common failure signatures

| Symptom | Cause |
| --- | --- |
| "Deployed Functions on project" names an unfamiliar ref | Stale `.temp/project-ref` — redeploy with explicit `--project-ref` |
| Client 404 on a brand-new table | Missing `GRANT`s (Supabase no longer auto-exposes public tables) |
| Function 401 from cron | Vault secret ≠ edge-function secret |
| "db push" password errors | Use `db-push` skill; password lives in `supabase/.env` |
