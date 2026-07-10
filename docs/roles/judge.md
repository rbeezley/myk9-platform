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

## Post-fall

Still future work (never built): schedule-change notifications, cross-club
judging history, self-service assignment management, and any dedicated
steward experience. Scope to be defined after fall launch.
