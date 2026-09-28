# Go Live Phase 4 Evidence Checklist

Use this checklist after Phases 1-3 are complete and the app is near-final. Paste links to screenshots, logs, SQL output, or notes back into `go-live-opsx-batches.md` and the scorecard before checking runbook items complete.

## 4.0 Pre-Evidence Code Freeze

- Evidence slot: merged PRs/deploy records, or written P2 acceptances.
- Cover: the active launch remediation named in runbook 0.7, including exhibitor state and touch-target fixes, elderly-exhibitor remaining work, contrast-token coverage, and pending code/CI close-out work.
- Pass condition: no unresolved launch-affecting implementation remains before human testing begins.

## 4.1 Show-Day Re-Walk

- Evidence slot: staging URL, tester, date/time, browser/device.
- Cover: public `/results` deep link cold, judge dashboard assignments, judge passcode `jh3k9`, steward passcode `s7m2p`, withdrawn counts, consistent trial badges.
- Pass condition: no P0/P1, no unresolved confusion-level show-day issue.

## 4.2 Offline Reconnect Rehearsal

- Evidence slot: two-browser notes, offline window timing, queued mutation/sync proof.
- Cover: secretary check-in while online, judge cold passcode session, offline scoring, reconnect, no silent data loss.
- Pass condition: scores/check-ins reconcile and both users see the expected final state.

## Oct 10 UKC Nosework Event Gate (MYK9-829 / MYK9-819)

- [ ] Before judges use a passcode, identify the **real** Oct 10 club and show by name and ID. Verify in the deployed app that the club is **Authorized** (`clubs.authorized_at` set) and the show is **Published**. Record the observer, time, show ID, and screenshots. A demo club or draft rehearsal show does not satisfy this check.

  September 28 update: Darboshea Tervuren Club is the confirmed host and its deployed `authorized_at` and `club_authorized` audit entry were verified at 21:56:43 UTC after site-admin authorization. The October 10 `ZZ TEST MYK9-819` show is a private rehearsal draft; the other Darboshea draft is dated October 31. No published real October 10 show was identified. See the [follow-up evidence](../qa/myk9-819-oct10-test-show-follow-up-2026-09-28.md). Keep this item open until the actual show ID, Published state, observer, time, and screenshots are recorded.

- [ ] On a deployed build containing the passcode and offline-reload fixes, walk the real two-trial UKC show by passcode: score every Trial 1 Vehicle level, reload mid-class, score two entries offline and reload while offline, reconnect and prove the queued scores reached the server, then mistype a code and confirm a visible error. Record pass/fail and a screenshot for each step. Repeat at the Oct 6 final rehearsal.
- [ ] Link unresolved failures to MYK9 issues and keep this gate open until the show-specific evidence passes. The [initial deployed-app walk](../qa/myk9-819-deployed-follow-up-2026-09-28.md) and [October 10 test-show follow-up](../qa/myk9-819-oct10-test-show-follow-up-2026-09-28.md) record the results and blockers.

## 4.2b Cross-App Data Reconciliation

- Evidence slot: fixture identifiers, SQL output or screenshots, tester/date.
- Cover: entries, dogs, payments/refunds, scores, placements, results, and closeout totals across secretary, exhibitor, ringside, and report surfaces.
- Pass condition: every surface agrees, or any discrepancy is resolved/accepted with no P0/P1 remaining.

## 4.3 Venue Hardware Print Test

- Evidence slot: printer model, paper/label stock, screenshots/photos, margin/scaling notes.
- Cover: CheckInSheet, ScoresheetReport, ResultLabels, ArmbandLabelsReport on label printer and laser printer.
- Pass condition: readable, correctly scaled, no clipped official fields.

## 4.5 Real-User Testing

- Evidence slot: participant role, written tasks, confusion log, fixes/acceptances.
- Cover: one secretary and one or two exhibitors, silent observation, no coaching.
- Pass condition: no confusion-level finding remains unresolved.

## 4.6 Scorecard Close-Out

- Evidence slot: scorecard diff and links to evidence above.
- Cover: Show-day reliability, Offline-first behavior, Data correctness, Reports and official forms, UX clarity, and Operational readiness.
- Pass condition: only flip rows Green when evidence links exist; launch still requires no Red, no open P0/P1, and all Primary dimensions Green.
