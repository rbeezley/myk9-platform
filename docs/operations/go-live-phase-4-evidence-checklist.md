# Go Live Phase 4 Evidence Checklist

Use this checklist after Phases 1-3 are complete and the app is near-final. Paste links to screenshots, logs, SQL output, or notes back into `go-live-opsx-batches.md` and the scorecard before checking runbook items complete.

## 4.1 Show-Day Re-Walk

- Evidence slot: staging URL, tester, date/time, browser/device.
- Cover: public `/results` deep link cold, judge dashboard assignments, judge passcode `jh3k9`, steward passcode `s7m2p`, withdrawn counts, consistent trial badges.
- Pass condition: no P0/P1, no unresolved confusion-level show-day issue.

## 4.2 Offline Reconnect Rehearsal

- Evidence slot: two-browser notes, offline window timing, queued mutation/sync proof.
- Cover: secretary check-in while online, judge cold passcode session, offline scoring, reconnect, no silent data loss.
- Pass condition: scores/check-ins reconcile and both users see the expected final state.

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
- Cover: Show-day reliability, Offline-first behavior, Reports and official forms, UX clarity.
- Pass condition: only flip rows Green when evidence links exist; launch still requires no Red, no open P0/P1, and all Primary dimensions Green.
