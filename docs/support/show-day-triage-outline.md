# Show-Day Triage Outline

Outline for the live show-day support runbook. This file governs what gets drafted in the final `docs/support/show-day-triage.md` (gated on Phase 6 verification).

**Context:** Show day is the highest-stress support window. A secretary at a venue with 80 dogs, spotty cell signal, and 30 exhibitors lined up does not have time to wait for troubleshooting steps. Resolutions need to be under 5 minutes or they need an immediate workaround that unblocks the show.

---

## Severity Levels

| Level | Definition | Response target | Example |
|---|---|---|---|
| P0 | Show cannot proceed or ring is stopped | Respond in 5 minutes | Secretary locked out, scoring down, no entries visible |
| P1 | A role is blocked but the show can continue | Respond in 15 minutes | One exhibitor can't check in; judge dashboard not loading |
| P2 | Non-blocking: something is wrong or confusing | Respond in 2 hours | An entry shows the wrong armband; a report won't print |

---

## First Five Minutes

Whenever a show-day incident is reported, run this checklist before starting any investigation.

1. **Confirm severity.** Is the show stopped, or is one person having a problem?
2. **Confirm the show.** Get the show name, date, club, and the person's role (secretary / exhibitor / judge / steward).
3. **Confirm connectivity.** "Are you at the venue? Is the app showing an offline banner?"
4. **Check Supabase status.** Open [status.supabase.com](https://status.supabase.com). If there's an active incident, that is likely the root cause — communicate the status page link and estimated resolution.
5. **Confirm other users.** "Is this just you or is everyone at the show seeing this?" One person = device issue. Everyone = server or sync issue.
6. **Apply the offline rule first.** If they're at a venue with spotty signal, missing data will appear when connection restores. Start there before investigating data bugs.

---

## Offline and Sync

### Section outline

- What the offline banner means and when it's expected (venue, network)
- How to confirm sync will catch up (signal icon, retry button)
- When offline data is stale vs when it's correct
- Steps to force a sync when back on connection (reload / clear cache)
- Differentiating "offline at venue" (expected) from "offline at home" (investigate)

### Escalation link

Investigation cookbook: `docs/support/investigation-cookbook.md#offline-or-sync-issue`

### Customer-facing KB candidates

- "The app says Offline — is something wrong?" → `offline-mode.md`

---

## Entry Visibility

### Section outline

- Why a secretary might not see an entry that an exhibitor paid for (webhook delay, filter active)
- How to rule out a filter quickly (clear all filters in Entry Management)
- How to check whether a late-walk-in entry was created
- Armband numbers: when they are assigned and why they might appear as "Pending"
- Secretary entry count vs dashboard count mismatch (known root cause: some statuses excluded from dashboard count)

### Escalation link

Investigation cookbook: `docs/support/investigation-cookbook.md#entry-visibility-mismatch`

### Customer-facing KB candidates

- "The entry count on the dashboard doesn't match Entry Management" → `entry-count-mismatch.md`

---

## Check-In Issues

### Section outline

- Exhibitor check-in: requires the show to have self-check-in enabled (Results Control)
- ShowTodayBanner only appears on show day — exhibitors arriving early will not see it
- Judge check-in: goes through the Judge Interface, not the exhibitor check-in flow
- Steward: Gate Steward Interface is separate from exhibitor flow
- Offline check-in: all check-ins are captured offline-first and sync when connection restores
- If check-in shows as complete on device but not visible to secretary: sync delay at venue

### Customer-facing KB candidates

- "How do I check in on show day?" → `check-in.md`

---

## Scoring Issues

### Section outline

- Confirm which surface is being used for scoring: ringside tablet via `/at-show/:showId` or secretary entry
- If score entered but not visible: sync delay, not data loss — wait for sync
- If scoring is completely blocked: the at-show surface is available for every show, so check **access** rather than a feature flag — confirm the user has a valid RBAC role or show-scoped passcode grant that clears `AtShowAccessGate` (Updated 2026-06-23: the `unified_ringside_enabled` flag was removed — see [`../archive/plan-remove-unified-ringside-flag.md`](../archive/plan-remove-unified-ringside-flag.md))
- Results not released to exhibitors: secretary releases from Results Control after show, not during
- Scoresheet not printing: Reports page → select trial → select report type

### Escalation link

Contact engineering for scoring data issues — do not mutate scoring data from the Supabase console without engineering oversight.

---

## Communications

### Section outline

- Secretary sending a show-day announcement: Show Workbench → Announcements → compose and send
- Secretary direct message to one exhibitor: Message Center → find exhibitor → send
- If notification does not arrive: push notifications are best-effort at venues; check in-app Messages tab as the reliable fallback
- Exhibitor reporting they never got the secretary's message: direct them to Messages tab in myK9Show

### Customer-facing KB candidates

- "How do I send an announcement to all exhibitors?" → `send-announcement.md`

---

## Physical Fallback Steps

Include in the final runbook for cases where the app is down and the show must continue.

1. **Scoresheet backup:** Print paper scoresheets before the show from Reports → Scoresheets. Instruct secretary to use paper if app is unavailable; enter results after connectivity restores.
2. **Run order backup:** Print the run order from Reports → Run Order before the show starts.
3. **Armband fallback:** Pre-print armband labels. If label printing fails, hand-write armbands from the printed run order.
4. **Entry receipt backup:** Remind exhibitors that their Stripe receipt email is proof of payment if app entry list is unavailable.
5. **Check-in fallback:** Use the printed run order or armband label sheet as a paper check-in log.

---

## Escalation Paths

| Issue type | Escalate to | What to provide |
|---|---|---|
| Data missing or incorrect in the database | Engineering | Cookbook recipe followed, exact symptom, table/entry IDs |
| Supabase service outage | Wait for Supabase status resolution | Status page URL, estimated ETA for customer |
| Stripe payout blocked during show | Stripe support (treasurer) | Connect account ID |
| App completely inaccessible (not offline) | Engineering (P0) | Device, browser, error message, time it started |
| Scoring data inconsistency | Engineering (P0) | Class ID, entry IDs, what was expected vs. actual |

---

## Post-Show Checklist

After a show-day incident closes, run this checklist before marking it resolved.

- [ ] Confirm the customer confirmed the issue is resolved.
- [ ] If a workaround was used, log the gap in the product backlog (`OPEN-TODOS.md`).
- [ ] If a new question or symptom appeared that is not in the question bank (`docs/support/question-bank.md`), add it.
- [ ] If the investigation recipe needed a step that was not in the cookbook, add it.
- [ ] If the incident was a P0, write a one-paragraph debrief: what happened, how it was resolved, what to do differently next time.

---

## Triage Sections to Draft in Final Runbook

The final `docs/support/show-day-triage.md` will expand each outline section above into a numbered resolution path with:
- Symptom as the user says it
- Confirm severity
- First steps (offline check, filter check)
- Resolution steps (numbered)
- Fallback if unresolved in 5 minutes
- Escalation path

Sections to expand (in priority order):
1. App shows offline for secretary (P0 risk)
2. Secretary cannot see any entries (P0 risk)
3. Scoring surface not loading (P0 risk)
4. Entry not showing for one exhibitor (P1)
5. Check-in not working (P1)
6. Judge dashboard not loading (P1)
7. Report / scoresheet won't print (P2)
8. Communication / announcement not received (P2)
