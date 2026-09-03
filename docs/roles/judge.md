# Role: Judge

## Scope decision

Judge is **not a primary role** for the fall 2026 launch. Judges mostly
operate inside the ringside `/at-show` scoring experience within myK9Show
(the former standalone myK9Q app has been folded in here) rather than the
main show-management surfaces.

**Un-defer decision (owner, 2026-07-10):** the judge responsibility
verification sweep found that a judge self-service dashboard
(`/judge/dashboard`, `/judge/stats`, `/judge/check-in`) was already
implemented, routed, nav-registered, role-gated, and tested — contradicting
the earlier blanket deferral. The owner chose to **own the shipped surface**
rather than delete it. The already-built dashboard is therefore in scope and
must be verified/maintained like any other role surface (tracked as row J6.4
in [`judge-responsibility-coverage.md`](judge-responsibility-coverage.md)).
Nothing beyond what is already built is being added for fall.

## What exists for fall

- Judge **records** so a secretary can assign a judge to classes.
- Judge **reports** in the reports output: AKC Judge's Report, Judge's
  Schedule, Judge's Certification, Judge Entry Counts, Judge Entry Counts
  with Estimated Time.
- The ringside `/at-show` scoring experience (passcode access, no account).
- The shipped judge dashboard: `/judge/dashboard` (Today/Upcoming/Completed
  assignments), `/judge/stats`, `/judge/check-in` — for judges with accounts
  and the `judge` role.

## Qualification management authorization

**Owner decision, 2026-09-03 (MYK9-354):** secretaries may manage a person's
full qualification list through the controlled save RPC,
`public.replace_judge_qualifications(uuid, jsonb)`. This includes adding,
changing, removing individual qualifications, and clearing the entire list
with `[]`. Direct table DELETE remains site-admin-only.

| Operation                                   | Ordinary account / judge role alone | Active secretary | Site admin |
| ------------------------------------------- | ----------------------------------- | ---------------- | ---------- |
| RPC replace, remove, clear, or restore list | Denied, including own credentials   | Allowed          | Allowed    |
| Direct table INSERT / UPDATE                | Denied                              | Allowed          | Allowed    |
| Direct table DELETE                         | Denied                              | Denied           | Allowed    |

The distinction is intentional: the SECURITY DEFINER RPC authorizes one
atomic full-list save. It validates every payload `person_id` against the
target before replacing rows; a failed insert rolls the replacement back.
Secretary removal must use that operation, not a separate direct-delete
request or a wider DELETE policy. Direct INSERT/UPDATE rights are unchanged.

The permission is **platform-wide**, not limited to a secretary's own club:
the RPC uses `has_role('secretary')` without a club argument. A valid active,
unexpired secretary grant can manage another person's qualifications, even
without a judge assignment or shared club. This is the approved boundary for
the shared judge directory, not self-service credential editing.

Sources: [table write policies](../../supabase/migrations/068_fix_judge_qualifications_rls.sql),
[deployed RPC authorization](../../supabase/migrations/20260903150000_fix_judge_qualification_rpc_authorization.sql),
and the [behavioral SQL contract](../../supabase/tests/judge_qualification_rpc_authorization_test.sql).
The test explicitly covers secretary replace/clear/restore, ordinary
self-service denial, secretary direct DELETE denial, and site-admin
RPC/direct DELETE access. No new UI or broader table grant is required.

## Post-fall

Still future work (never built): schedule-change notifications, cross-club
judging history, self-service assignment management, and any dedicated
steward experience. Scope to be defined after fall launch.
