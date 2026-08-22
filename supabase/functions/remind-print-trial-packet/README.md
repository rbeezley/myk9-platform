# remind-print-trial-packet

Chases the one step automation cannot do: putting paper in the trial box. MYK9-228 phase 5.

The reminder is deliberately **not** "please generate a packet" — a chore about our plumbing, easy to ignore because it reads as our problem. It is *"Saturday's packet is ready; print it and put it in the trial box,"* and it has a checkable exit condition.

## The exit condition is `paperwork_prints`, never the snapshot row

A packet appearing in Storage every night is worth nothing on a laptop that will not boot. Measuring packet **existence** would show green while the real failure mode stayed wide open. This function reads print confirmations, and any future dashboard or health check must do the same.

A packet confirmation is show-scoped with a null `trial_id` — the artifact is a trial DAY, and a day may hold several trials, so no `scope_kind` in `paperwork_prints_scope_shape` can express it. The day lives in `coverage.trialDate`, which phase 5a made first-class precisely so this question is answerable.

## Calling it

Server-to-server only, sharing `PACKET_CRON_SECRET` with `generate-trial-packet` — same feature, same trust boundary, one fewer secret to rotate.

```
POST /functions/v1/remind-print-trial-packet
Authorization: Bearer $PACKET_CRON_SECRET
{ "showId": "<uuid>", "trialDate": "2026-09-19", "kind": "evening-before" }
```

Outcomes:

| | |
| --- | --- |
| `sent` | Emailed the show officials, with a count |
| `no-packet` | Nothing to print. A reminder to print something that does not exist is noise, and noise is how a channel stops being read |
| `already-printed` | A non-voided confirmation covers the day — the exit condition |
| `already-reminded` | This slot already went out |
| `no-recipients` | No current official has an email address |

## Two slots, deliberately independent

`0 1 * * *` (evening before across US time zones, safely after generation) and `0 12 * * *` (the morning of, the last moment paper can still reach the box). Both target `current_date` — the trial day itself.

They are separate rows in `trial_packet_print_reminders`, so a sent evening reminder cannot suppress the morning one. A failed send **releases** the claim rather than burning the slot.

Not MYK9-198's original "48h out, daily": the evening-before regeneration supersedes anything printed earlier, so nagging before the packet is current asks for a print that will be stale by the trial.

## Configuration

Requires `20260822130000_trial_packet_print_reminder.sql`, plus `PACKET_CRON_SECRET` and `RESEND_API_KEY`.

```bash
supabase functions deploy remind-print-trial-packet --no-verify-jwt --project-ref sojmvhhwsjxmfistvzbe
```
