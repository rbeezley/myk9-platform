# remind-registry-deadline

One email, two days before a registry's results deadline, for a line still open on the Finish the show list. MYK9-2077 (phase 4b of `docs/plan-show-closeout.md`).

## What it decides

- **The date** comes from `resultsDeadlineFor` and `lastTrialDay` in `_shared/showCloseout/resultsDeadline.ts`, the same module the Finish list uses. Nothing here calculates a deadline.
- **Open line:** the show has no `result_submissions` row for the registry with status `sent` or `submitted` (a row naming no registry covers every registry, as on the list). UKC has no verified deadline, so it never gets a reminder.
- **When:** the show's own calendar day (the time zone of the trial that holds the last day) is 0 to 2 days before the deadline. The run is hourly, so the day turns over for each show at its own midnight. The window stays open through the deadline day so one missed run still sends; the claim keeps it to one email.
- **A corrected file reopens the line,** by the list's own rule (`_shared/showCloseout/submissionCoverage.ts`, shared with the app): an app-sent AKC file stays ticked only until a score it carries (result, search time, placement, scored flag in `entry_score_audit`) changes after the newest send or recorded filing. The email then says the corrected file has not been sent. If the score history cannot be read, the file reads as current, as the list does ("could not check").
- **Who:** the show's NAMED secretary, from `show_officials` with role `secretary` (what `grant_show_official` writes and `get_show_officials` reads). Not club admins, not `user_roles`. `show_officials` allows only secretary, chairman and steward, so there is no trial secretary to include. A failed lookup is a failure (the claim is released and the run logs it); only a successful lookup with no address counts as nobody to tell.
- **Registry and time zone** are read through `_shared/registrySelectors.ts`, the same selectors the app's `getTrialRegistry` and `getTrialTimezone` call.

## One reminder per show, registry and deadline

`registry_deadline_reminders` has a unique `(show_id, registry_id, deadline_date)`. The function claims with `INSERT ... ON CONFLICT DO NOTHING` before sending, so a re-run claims nothing and sends nothing. Each provider-accepted address (one that returned a message id) is saved to `accepted_recipients`, and `sent_at` is stamped only when every intended address is in it. If some are missing, the claim stays and a later run (after the 15 minute lease) mails only those. If none were accepted, or nobody can be reached, the claim is released so a later run in the window tries again. A claim with no `sent_at` older than 15 minutes belongs to a run that died or is still finishing and is taken over by exactly one run. Every attempt is written to `email_log` (type `registry_deadline_reminder`) so `resend-webhook` can mark a bounce.

If the last trial day moves, the deadline moves, and one new reminder is sent for the new date.

## Calling it

Server-to-server only, by pg_cron (`registry-deadline-reminder`, hourly at minute 20) through `request_registry_deadline_reminders`. Shares `PACKET_CRON_SECRET` with the packet functions.

```
POST /functions/v1/remind-registry-deadline
Authorization: Bearer $PACKET_CRON_SECRET
{}
```

## Deploy

1. `supabase db push` (creates the table and the cron; the cron is scheduled only if the Vault secret `packet_cron_secret` exists).
2. Deploy the updated webhook first, then the sender. The webhook change makes a delivery or bounce event that arrives before the reminder's `email_log` row be retried, so Delivery history does not stay at "Sent":

```bash
supabase functions deploy resend-webhook --no-verify-jwt --project-ref sojmvhhwsjxmfistvzbe
supabase functions deploy remind-registry-deadline --no-verify-jwt --project-ref sojmvhhwsjxmfistvzbe
```

Needs `PACKET_CRON_SECRET` and `RESEND_API_KEY` as function secrets, and the Vault secrets `edge_function_base_url` and `packet_cron_secret`, all of which the packet reminders already use.
