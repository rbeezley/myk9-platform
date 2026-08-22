# generate-trial-packet

Builds the emergency trial packet for a show — one PDF per trial day — and delivers it, without anyone pressing a button. MYK9-228.

```
emergency_packet_input(show, day?)  →  model  →  PDF  →  trial-packets bucket  →  deliverStoredPacket
```

Everything downstream of the query is the code the browser runs: the same model builder, the same renderer, the same delivery step. There is no second implementation to drift.

## Calling it

Server-to-server only. No CORS origins are advertised and there is no JWT path.

```
POST /functions/v1/generate-trial-packet
Authorization: Bearer $PACKET_CRON_SECRET
{ "showId": "<uuid>", "trialDate": "2026-09-19" }
```

`trialDate` is optional — omit it to generate every trial day of the show. The response reports what was generated and what was skipped, and why:

- `already-delivered` — a `sent` snapshot already exists for that show and day
- `nothing-to-print` — the day has no runnable classes or entries

## Configuration

| Secret | Purpose |
| --- | --- |
| `PACKET_CRON_SECRET` | Bearer secret for the trigger. **Unset means 503**, not open. |
| `RESEND_API_KEY` | Email delivery, shared with the manual path. |

Requires `20260821220000_emergency_packet_input_rpc.sql` and `20260821230000_trial_packet_automation_columns.sql`.

```bash
supabase functions deploy generate-trial-packet --no-verify-jwt --project-ref sojmvhhwsjxmfistvzbe
```

## What this function does NOT do

It has no schedule. The pg_cron triggers, their claim/lease so two workers cannot double-send, and the print reminder are phases 4 and 5 of `docs/plan-trial-packet-automation.md`. The re-run guard here is a cheap check for an existing delivered packet, not a lock.
