# remind-registry-deadline

One email, two days before a registry's results deadline, for a line still open on the Finish the show list. MYK9-2077 (phase 4b of `docs/plan-show-closeout.md`).

## What it decides

- **The date** comes from `resultsDeadlineFor` and `lastTrialDay` in `_shared/showCloseout/resultsDeadline.ts`, the same module the Finish list uses. Nothing here calculates a deadline.
- **Open line:** the show has no `result_submissions` row for the registry with status `sent` or `submitted` (a row naming no registry covers every registry, as on the list). UKC has no verified deadline, so it never gets a reminder.
- **When:** the show's own calendar day (the time zone of the trial that holds the last day) is 0 to 2 days before the deadline. The run is hourly, so the day turns over for each show at its own midnight. The window stays open through the deadline day so one missed run still sends; the claim keeps it to one email.
- **Who:** the same officials as the packet emails (show secretaries and club admins with an email address).

Not covered: the "a score changed after the file was sent" state (`sentFileCheck: changed`) the list shows for AKC. It needs the score-change history the app reads, so a stale-but-sent file does not get a reminder here.

## One reminder per show, registry and deadline

`registry_deadline_reminders` has a unique `(show_id, registry_id, deadline_date)`. The function claims with `INSERT ... ON CONFLICT DO NOTHING` before sending, so a re-run claims nothing and sends nothing. If every send fails or nobody can be reached, the claim is released so a later run in the window tries again. A claim with no `sent_at` older than 15 minutes belongs to a run that died and is taken over by exactly one run.

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
2. Deploy the function:

```bash
supabase functions deploy remind-registry-deadline --no-verify-jwt --project-ref sojmvhhwsjxmfistvzbe
```

Needs `PACKET_CRON_SECRET` and `RESEND_API_KEY` as function secrets, and the Vault secrets `edge_function_base_url` and `packet_cron_secret`, all of which the packet reminders already use.
