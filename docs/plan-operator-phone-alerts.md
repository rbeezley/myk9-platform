# Operator phone alerts on a show weekend (MYK9-2402)

> **Status:** Active

Docs only; no code here. Owner decision 2026-11-27: push only, SMS out of scope.

## What exists today, and why

The evidence comment on MYK9-2402 has the file:line for each point below.

- **One alert path, two channels.** `alertAdmin` (`apps/myk9show/supabase/functions/_shared/alertAdminCore.ts`) writes an `operator_alerts` row, then emails `PLATFORM_ALERT_EMAIL`. About fifty callers use it, nearly all of them money. It never pushes. That was a deliberate choice: email was the only channel that reached the owner when it was built. MYK9-1960 (Backlog, `needs:decision`) asks to add the phone for three money alerts and says to add urgency "there, once, not per caller".
- **The board polls.** `/admin/health` reads unresolved rows every 60 seconds. `cron-health-check` runs every five minutes (`healthCheckCadence.ts`) and writes snapshot rows. A check only colours the board.
- **Push already reaches site admins in one place.** For support messages, `push-trigger-support-message` picks every site admin with an account (`recipients.ts:32-49`) and calls `send-push-notification` once per user id. Push is keyed by user id (`push_subscriptions`), so an admin is reachable only after turning on alerts on that device.
- **Most show-day failures never reach the server.**
  - A score that fails to save stays in the device's queue (`MutationManager.ts`).
  - A short download goes to Sentry only (`shortReplicaAlert.ts`).
  - Sign-in failures are not captured at all.
  - The server does see OCC conflicts (`ringside_conflicts`) and support tickets.

## Proposed shape

Build the phone channel once, inside `alertAdmin`. MYK9-1960 then becomes "mark three money kinds urgent", with no second delivery path.

1. **Urgent flag, one place.**
   - `alertAdmin({ ..., urgent: true })`.
   - On the **first insert only** (not on a dedupe hit), push to every site admin: the support-message recipient query, moved to `_shared/operatorRecipients.ts` and shared.
   - Message: the alert's kind and the show name, then "Open myK9Show". No names, emails or amounts. It opens `/admin/health`.
   - Migration: two columns on `operator_alerts`, `paged_at` and `reminded_at` (timestamptz, null), so the board can show "sent to your phone at 7:04".
2. **One reminder, no repeats.** `cron-health-check` (already every five minutes) re-pushes an urgent alert once, when it is still unresolved 30 minutes after `paged_at` and `reminded_at` is null. Resolving the alert stops it. A resolved alert that fires again pages again; that is a new problem.
3. **Show-day signals that become urgent alerts.** Only the ones the server can see, or can be told about cheaply:
   - **Scoring conflicts:** the `ringside_conflicts` check crossing its threshold while any show is `in_progress` writes an urgent alert (dedupe key: show and day).
   - **Score not saving / short download:** a device that holds a score unsent for more than 10 minutes while online, or sees a short download, calls one new RPC, `report_show_day_problem(p_show_id, p_kind)`. The RPC is authenticated, rate-limited per device and kind, and writes an urgent alert with dedupe key show plus kind plus day. It sends no payload beyond the kind.
   - **Support ticket during a show:** already pushes. The push title gains "Show day:" when `is_show_day_priority` is set. Nothing else changes.
   - **Sign-in failures:** not in this plan. The server cannot tell a wrong password from an outage, and the client cannot report while signed out. Proposed instead: a 5xx rate on auth calls via Sentry, as a follow-up.
4. **Test alert.** A **Send a test alert to my phone** button on `/admin/health`. It calls an edge function that pushes to the caller only, and says "Sent" or "No phone set up: turn on alerts in Account". This is the show-eve check, and the board shows the last time it worked.

## Do nothing, delete or link

- **Link: Sentry alert rules plus the Sentry phone app.** This needs no code: a rule on the `short-replica` fingerprint and on error spikes, delivered by Sentry's own push.
  - It misses OCC conflicts and support tickets, and it misses a score stuck on an offline device. Nothing reaches Sentry until the device is back online.
  - It puts show-day paging in a tool the owner does not open daily, so in effect it is a third-party paging service, which this issue lists as a non-goal.
  - It is worth doing anyway as a backstop. It is a settings change, not a PR.
- **Do nothing.** Today the support push already wakes the owner for the most common show-day problem, an exhibitor or secretary asking for help. The silent failures (a stuck score, a short download) are the ones a person would not report, and those are the ones this plan adds.
- **Delete.** Nothing here to delete.

Recommendation: build steps 1, 2 and 4 first, as one PR with one migration. Step 3 follows as a second PR. MYK9-1960 then needs no delivery code of its own.

## Owner questions

1. **Who gets the push?** Every site admin (today, just you), or only you? Recommend every site admin, the same as support messages.
2. **Reminder after 30 minutes, once?** Recommend yes.
3. **Which signals?** Recommend scoring conflicts, a stuck score, a short download, and show-day support tickets. Sign-in stays a Sentry follow-up.
4. **Set up the Sentry backstop rule as well?** Recommend yes. You do it in Sentry; it is a five-minute settings change.

## Testing phase

- **Deno (beside `alertAdminCore.test.ts`):**
  - An urgent alert pushes once to each site admin, and a non-urgent one pushes nothing.
  - A dedupe hit pushes nothing.
  - The push body carries only the kind and the show name.
  - A push failure still records the row and sends the email, and marks the failure.
- **Deno (cron-health-check):**
  - The reminder fires once after 30 minutes.
  - It does not fire when the alert is resolved or `reminded_at` is set.
- **SQL:**
  - `report_show_day_problem` refuses `anon`.
  - It refuses a caller with no role at that show.
  - It rate-limits repeats.
  - It writes one urgent row per show, kind and day.
- **App:**
  - The health board shows "sent to your phone at …".
  - The test button reports both outcomes.
  - A device with a score unsent for 10 minutes online calls the RPC once.
- **After deploy:** on a show eve, press the test button, then raise a real urgent alert on a test show and confirm one push, one reminder at 30 minutes, and silence after Resolve.
