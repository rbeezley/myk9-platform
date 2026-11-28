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

Build the phone channel once, as **a property of the `operator_alerts` row**, delivered by one worker. Whoever writes an urgent row (`alertAdmin`, a SQL function, an RPC), the same worker pages for it. MYK9-1960 then becomes "mark three money kinds urgent", with no second delivery path.

1. **Urgency lives on the row, delivery in one worker.**
   - Migration on `operator_alerts`:
     - `urgent boolean not null default false`;
     - `page_state` (`pending`, `paged`, `no_device`, `failed`; null when not urgent);
     - `page_attempts int`, `paged_at`, `reminded_at`, and `page_detail jsonb` holding the per-outcome counts.
   - `alertAdmin({ ..., urgent: true })` only sets the column. It sends nothing itself, so the first-insert dedupe guard never stands between a row and its page.
   - An `AFTER INSERT` trigger on urgent rows calls one new root function, `page-operator`, by `net.http_post`. This is the pattern `trg_notify_support_message` already uses.
   - `page-operator` lives in `supabase/functions/`, beside `send-push-notification`, so no import crosses a deployment tree (`scripts/qa/edge-function-imports.test.ts`). It reads its recipients from one SQL function, `private.operator_page_recipients()`, which returns every site admin with an account, the same rule as `push-trigger-support-message`'s query. It then pushes to each recipient and writes the outcome back to the row.
   - Message: the alert's kind, plus the show name only when the row carries a verified show, then "Open myK9Show". No names, emails or amounts. It opens `/admin/health`.
2. **Retry, one reminder, no repeats.** `cron-health-check` already runs every five minutes, so it also does two jobs:
   - It calls `page-operator` again for any unresolved urgent row still `pending` or `failed`, up to five attempts. A push outage delays the page instead of losing it.
   - It sends one reminder when a row is still unresolved 30 minutes after `paged_at` and `reminded_at` is null.

   Resolving the alert stops both. Dedupe keys carry no date, so an incident still open across midnight stays one row and one page. A resolved alert that fires again is a new row and pages again.

3. **Show-day signals that become urgent rows.** Only the ones the server can see, or can be told about cheaply, and attributed to a show only when the signal names one:
   - **Scoring conflicts:** the `ringside_conflicts` counter is platform-wide, with no show id. So when the check crosses its threshold while any show is `in_progress`, it writes one **platform-level** urgent row ("Scoring conflicts are high"), with no show and the key `ringside-conflicts`. Attributing conflicts to a show would need show-scoped counts first. That is out of scope here.
   - **Score not saving / short download:** a device calls one new RPC, `report_show_day_problem(p_kind, p_show_id)`, when it holds a score unsent for more than 10 minutes while online, or when it sees a short download.
     - `p_show_id` is required for `score_stuck`, since the queued mutation carries its show. For `short_download` it is passed only when the replica scope is a show id. Unscoped downloads, such as the people directory (`allPeoplePaged.ts`, `scope: undefined`), are a platform-level row.
     - The RPC is authenticated and checks the caller has a role at that show.
     - It is rate-limited per caller and kind.
     - It inserts an urgent row keyed by kind and show (no date). The insert trigger then pages, so this signal reaches the phone by the same worker as every other. The test proves exactly that.
   - **Support ticket during a show:** today every message pushes, and nothing reminds anyone.
     - A new ticket with `is_show_day_priority` also inserts an urgent row keyed by `support-ticket:<ticket id>`, which pages once and reminds once.
     - The first operator reply, or closing the ticket, resolves that row.
     - Ordinary message pushes are unchanged, and they never touch the row, so follow-ups do not re-page.
   - **Sign-in failures:** not in this plan. The server cannot tell a wrong password from an outage, and the client cannot report while signed out. A Sentry rule on the 5xx rate of auth calls is proposed as a follow-up instead.
4. **Test alert, confirmed on the phone.** Add a **Send a test alert to my phone** button on `/admin/health`.
   - It calls `page-operator` for the caller only and reports three outcomes: "Sent to N devices", "No device set up: turn on alerts in Account", or "Sending failed".
   - A push service accepting the message proves nothing about the phone, so the test push's link opens `/admin/health?confirmTest=<id>`, and opening it records the confirmation.
   - The board shows "Last confirmed on a phone: <time>" from that confirmation only, never from the send count.
   - Each urgent alert on the board shows its `page_state` and counts: accepted by N devices, no device, or failed.

## Do nothing, delete or link

- **Link: Sentry alert rules plus the Sentry phone app.** This needs no code: a rule on the `short-replica` fingerprint and on error spikes, delivered by Sentry's own push.
  - It misses OCC conflicts and support tickets, and it misses a score stuck on an offline device. Nothing reaches Sentry until the device is back online.
  - It puts show-day paging in a tool the owner does not open daily, so in effect it is a third-party paging service, which this issue lists as a non-goal.
  - It is worth doing anyway as a backstop. It is a settings change, not a PR.
- **Do nothing.** Today the support push already wakes the owner for the most common show-day problem, an exhibitor or secretary asking for help. The silent failures (a stuck score, a short download) are the ones a person would not report, and those are the ones this plan adds.
- **Delete.** Nothing here to delete.

Recommendation: build steps 1, 2 and 4 first, as one PR with one migration. Step 3 follows as a second PR. MYK9-1960 then needs no delivery code of its own.

## Review notes

- Codex round 1 raised eight findings (one P1, seven P2). All were accepted and folded into the shape above:
  - one worker delivers every urgent row, so an RPC-written row pages too;
  - recipients come from a SQL function, so no import crosses a function tree;
  - a `pending` state with retries, so a failed first push is not lost;
  - conflicts are a platform-level alert;
  - only show-scoped downloads name a show;
  - dedupe keys carry no date;
  - show-day tickets get a row with its own lifecycle;
  - phone confirmation is separate from push acceptance.

## Owner questions

1. **Who gets the push?** Every site admin (today, just you), or only you? Recommend every site admin, the same as support messages.
2. **Reminder after 30 minutes, once?** Recommend yes.
3. **Which signals?** Recommend scoring conflicts, a stuck score, a short download, and show-day support tickets. Sign-in stays a Sentry follow-up.
4. **Set up the Sentry backstop rule as well?** Recommend yes. You do it in Sentry; it is a five-minute settings change.

## Testing phase

- **Deno (`alertAdminCore.test.ts`):** `urgent: true` writes `urgent = true, page_state = 'pending'` and sends no push itself; a dedupe hit writes nothing new; email behaviour is unchanged.
- **Deno (`page-operator`):**
  - It pushes once to each recipient and records `paged`.
  - No subscription records `no_device`; a push error records `failed` with the attempt count; a resolved row is skipped.
  - The body carries only the kind and the show name, and the show name only when the row has a show.
- **Deno (cron-health-check):**
  - A `pending` or `failed` row is retried, up to five attempts.
  - The reminder fires once 30 minutes after `paged_at`; it does not fire when the row is resolved or `reminded_at` is set.
  - The conflicts threshold writes one platform-level row with no show id, and a second crossing while that row is open writes nothing.
- **SQL:**
  - The insert trigger calls `page-operator` for an urgent row only.
  - `private.operator_page_recipients()` returns site admins with an account and is not executable by `anon` or `authenticated`.
  - `report_show_day_problem` refuses `anon` and a caller with no role at that show, rate-limits repeats, and keeps one open row per kind and show across a date change.
  - A show-day ticket inserts one urgent row; a follow-up message inserts none; the first operator reply resolves it.
- **End to end (one Deno integration test):** a `report_show_day_problem` call leads to a `page-operator` push. A row written by SQL alone must page, not just insert.
- **App:**
  - The health board shows "sent to your phone at …".
  - The test button reports all three outcomes.
  - "Last confirmed on a phone" changes only after the `confirmTest` link is opened.
  - A device with a score unsent for 10 minutes online calls the RPC once.
- **After deploy:** on a show eve, press the test button, then raise a real urgent alert on a test show and confirm one push, one reminder at 30 minutes, and silence after Resolve.
