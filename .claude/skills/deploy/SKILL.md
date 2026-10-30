---
name: deploy
description: "Use when deploying anything to the live Supabase project or verifying a deploy — edge functions, database migrations (db push), Vault secrets — or when a merge landed and someone asks 'is it live?'. Also use when a deploy fails with password, linking, or wrong-project errors."
user-invocable: true
argument-hint: '[functions|migrations|verify] [names...]'
---

# Deploy (Supabase edge functions + migrations)

Merging a PR never deploys anything. Migrations and edge functions ship only via the explicit commands below, and this repo has a history of deploys landing on the **wrong project**. Follow this exactly.

## Non-negotiables

- **Project ref is always `sojmvhhwsjxmfistvzbe`.** Pass `--project-ref sojmvhhwsjxmfistvzbe` explicitly on every `supabase functions deploy`. `--workdir apps/myk9show` follows that dir's stale `.temp/project-ref` (myK9Show-Working, defunct). After deploying, confirm the output line "Deployed Functions on project ..." names the right ref — if it doesn't, the deploy went to the wrong project and must be redone.
- **Edge functions deploy with `--no-verify-jwt`** (functions handle auth internally).
- All of this is shared-system mutation. While [`docs/agents/standing-approvals.md`](../../../docs/agents/standing-approvals.md) says `status: ACTIVE` (read it fresh), the Deploy myK9Show run needs no confirmation, but only after the tripwire below exits 0 in this session. `supabase db push` and `supabase functions deploy` are not pre-approved: always confirm them. Otherwise, confirm with the user once before the first push/deploy of a session (Auto Mode rule in CLAUDE.md).

## Tripwire (before a pre-approved Deploy myK9Show run)

```bash
source supabase/.env
PGPASSWORD="$SUPABASE_DB_PASSWORD" pnpm qa:prelaunch-tripwire
```

The tripwire always queries the myK9 project (`sojmvhhwsjxmfistvzbe`) at an address fixed in the script; only the password comes from the environment, and other `PG*` variables are ignored.

Exit 0: proceed, then leave the record the standing-approvals table names on the Linear issue. Exit 1 or 2: do **not** run the action; file or update the issue with `needs:operator` and the printed reason, and move on.

## Deploying edge functions

```bash
# Root-level functions live in supabase/functions/
supabase functions deploy <name> --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt

# Stripe functions live in apps/myk9show/supabase/functions/ — deploy with workdir
supabase functions deploy <name> --workdir apps/myk9show --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
```

Fail-closed secret couplings: several functions require Vault/edge secrets to match on both ends — `payout_cron_secret` (nightly-show-payouts), `cron_secret`/`CRON_SECRET` (waitlist-offer-expiration), webhook secrets for trigger-push. If a function 401s after deploy, check secret parity before touching code.

## Pushing migrations

Invoke the `db-push` skill — it owns migration authoring (14-digit timestamp versions picked against `origin/main` AND the linked DB), the password/linking procedure (password in `supabase/.env`), and the post-push ACL verification. Run push from the worktree linked to Supabase, not the main repo, and never from an unmerged branch.

Consider dispatching the `migration-auditor` agent on any new migration file before pushing.

## Verify (after any deploy)

1. `supabase migration list` — remote matches local.
2. Functions: hit the function or check `supabase functions list --project-ref sojmvhhwsjxmfistvzbe` shows the new version; watch logs via the Supabase MCP `get_logs`.
3. Frontend: nothing deploys on merge. With the user's go-ahead or under standing approvals (tripwire exit 0), `gh workflow run deploy-myk9show.yml` deploys the newest `main` commit with a green CI run. Wait for it with `gh run watch <id> --exit-status` started with `run_in_background: true` (a foreground watch is refused, MYK9-1481), then read the summary for the deployed commit and the entry chunk myk9show.com serves, and comment on each `MYK9-<n>` issue whose commits it shipped.
4. Run `get_advisors` after schema changes to catch new RLS/security warnings.

## Post-deploy pass (after a Deploy myK9Show run)

A deploy is what In Review issues wait for, so work them right after it (MYK9-1495):

1. List In Review issues with a `verify:*` label whose merge commit is at or before the deployed
   commit (`git merge-base --is-ancestor <merge> <deployed>`). Later merges are not live yet.
2. Do the agent-doable evidence, per the label's removal rule in
   [`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md):
   - `verify:database`: the rolled-back psql walk;
   - `verify:browser`: on the live site, within the sign-in limits the issue and memory record;
   - `verify:performance`: where the measurement is scriptable;
   - `verify:scheduled-runs`: count the green scheduled runs since the merge.
3. Record each result on the issue and remove the label it satisfies. When the last owed label
   comes off, fresh-read the issue: Done if every criterion is evidenced, otherwise label what
   is left.
4. Leave `verify:load`, `verify:offline`, `verify:physical-print`, `verify:real-user`,
   `verify:checkout`, `verify:recovery` and every `needs:*` label alone: they need people,
   devices or the owner.
5. Report the In Review count before and after the pass, with the deployed commit and run ID.

## Common failure signatures

| Symptom                                                 | Cause                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| "Deployed Functions on project" names an unfamiliar ref | Stale `.temp/project-ref` — redeploy with explicit `--project-ref` |
| Client 404 on a brand-new table                         | Missing `GRANT`s (Supabase no longer auto-exposes public tables)   |
| Function 401 from cron                                  | Vault secret ≠ edge-function secret                                |
| "db push" password errors                               | Use `db-push` skill; password lives in `supabase/.env`             |
