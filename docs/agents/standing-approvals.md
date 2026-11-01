# Standing approvals

While myK9 has no real club, the owner pre-approves two routine shared-system actions so agents stop asking for go-aheads they always get (MYK9-1485, owner decision 2026-10-29; design in [`docs/archive/plan-standing-approvals.md`](../archive/plan-standing-approvals.md)).

**Read this file fresh before every shared-system write.** Never rely on a copy you read earlier in the session; the switch below may have changed.

## The switch

`pnpm qa:prelaunch-tripwire` parses this block. Keep exactly one block, with exactly this shape.

```standing-approvals
status: ACTIVE
test-clubs:
  - f8f9c772-3b83-416b-8ff3-688124fc5602
  - dededede-0000-0000-0000-000000000001
  - dededede-0000-0000-0000-000000000002
  - 6bcee681-0956-4268-b990-5771ecc3291d
  - a14b6802-b79b-4f09-9762-391cea030b4b
  - 2f8bc946-0b7e-4a21-801a-70f82e3474c8
  - 969790c7-f3bc-4168-ac69-df9a0d832cf4
  - c0b246b7-6e01-4a14-adbe-d4866981aa71
  - 15bb0bae-fccd-465b-80db-c0018da97ead
  - 4d1813c0-0994-4c74-b567-cf210c720585
  - 9159e460-0edb-4d60-9fa2-2151d44bea30
  - 73406ba3-e675-4e16-9799-489e75a3bc43
  - 4b3f145d-b7d0-4983-9367-6dc29d92eb03
```

- `status:` is `ACTIVE` (pre-approvals apply) or `OFF` (ask for everything, as the shared rules say).
- `test-clubs:` lists every `public.clubs` id, soft-deleted ones included, that the owner has confirmed is a test club. These were captured on 2026-10-29: Darboshea Tervuren Club, Heartland Scent Work Club, Prairie Trail Dog Sports Club, WALK TEST club, Tulsa Agility Club (the Oct 10 test show), American Bloodhound Club, and five soft-deleted test or disposable clubs. Added 2026-11-01 at the owner's request: MYK9-639 TEST 20261101 and MYK9-1393 TEST 20261101, synthetic fixtures Codex created for the MYK9-639 and MYK9-1393 Stripe Connect test-mode rehearsals.
- A club that is not on the list stops every pre-approved action. If it is another test club, a person adds its id here in a PR. If it is a real club, launch (below).

## Pre-approved actions

Only while `status: ACTIVE`, and only after the tripwire exits 0 in the same session, right before the action: `source supabase/.env && PGPASSWORD="$SUPABASE_DB_PASSWORD" pnpm qa:prelaunch-tripwire` (a merge runs it as `pnpm qa:prelaunch-tripwire --merge`, below). The plain command also refuses while `origin/main` carries a migration the database lacks, because `db push` is never pre-approved and a frontend must not ship ahead of its schema (MYK9-1527); `--merge` skips that check since a merge may precede its push. Exits 1 and 2 both mean: do not run it. Park it instead (see "When something needs the owner").

| Action                                                                                  | Also required                                                                                                                                                                                                                          | Record it leaves                                                                                          |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Merge a PR now: `gh pr merge <n> --squash` (never `--auto`), run from the main checkout | The tripwire run as `pnpm qa:prelaunch-tripwire --merge`; every required check green on the head that merges, including the review gate (`watch-pr-checks.sh` exit 0, or exit 5 after reading the non-required failure)                | Closeout comment on the Linear issue naming the merged SHA                                                |
| Run Deploy myK9Show: `gh workflow run deploy-myk9show.yml`                              | The plain tripwire (it also stops on an unapplied migration on `main`); the workflow builds the newest `main` commit with green CI and itself refuses a commit whose migrations are unapplied (`scripts/qa/deploy-migration-guard.ts`) | A comment on each `MYK9-<n>` issue whose commits the deploy ships, naming the run and the deployed commit |

Pre-approval removes the question, not the checks: the review gate, required CI and "merge is not deploy" evidence all still apply.

## Never pre-approved

- Anything that moves real money or changes Stripe mode, including the live cutover (MYK9-11) and refunds.
- `supabase functions deploy`. It uploads local files over live code, so an unattended deploy could ship unmerged code or overwrite a live-only change (Codex review of PR #3393); the `deploy` skill and `cleanup` § 8 comparison stay with a person.
- `supabase db push`. Every push needs the owner's go-ahead: no scan of arbitrary SQL can promise a migration keeps data (Codex review of PR #3393).
- Permanently deleting data, accounts or users.
- `git push --force`, and any push to `main` other than the docs-only exception.
- Vercel or Supabase project settings and secrets; Linear team settings and label definitions.
- Product and UX decisions.
- Any action the tripwire stopped.

## When something needs the owner

File or update the Linear issue with `needs:decision` (a choice) or `needs:operator` (something only the owner can do), with the question, a recommendation and the evidence, so it shows in the "Owner actions" view. Then carry on with other work. In an interactive session, say in one line that you parked it and link the issue. If the parked item blocks your only task, apply the hold rule in [`issue-tracker.md`](issue-tracker.md) § Dispositions and holds and end the run.

## Launch: turning this off

When the first real club arrives:

1. In a PR, set `status: OFF`.
2. In the same PR, remove the standing-approval entries from `autoMode.allow` in `.claude/settings.json`.
3. Update the "Pre-launch no users" memory note.
