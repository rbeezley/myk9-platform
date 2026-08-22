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

- `already-delivered` — the day is done: a completed claim, or a `sent` snapshot from the manual path
- `in-flight` — another run holds an unexpired claim. **Not** the same as delivered; this day may get its packet moments from now, and collapsing the two would make a stuck run look like a success
- `nothing-to-print` — the day has no runnable classes or entries

`unrecordedCompletions` counts packets that were delivered but whose claim could not be stamped. Self-healing, but never invisible.

## Idempotency

`trial_packet_generation_claims` holds one row per (show, trial day), unique. A run claims the day before rendering, and stamps `completed_at` only once the email is accepted. A claim with a null `completed_at` may belong to a run that died mid-render, so after a 10-minute lease another run takes it over by compare-and-swap. A failure releases the claim so a later run in the same evening retries.

The lease sits above the worst-case render and below the 30-minute cron gap — every run can rescue what its predecessor abandoned, and no healthy in-flight run is robbed of a day it is still working.

## Configuration

| Secret | Purpose |
| --- | --- |
| `PACKET_CRON_SECRET` | Bearer secret for the trigger. **Unset means 503**, not open. |
| `RESEND_API_KEY` | Email delivery, shared with the manual path. |

Requires `20260821220000_emergency_packet_input_rpc.sql` and `20260821230000_trial_packet_automation_columns.sql`.

```bash
supabase functions deploy generate-trial-packet --no-verify-jwt --project-ref sojmvhhwsjxmfistvzbe
```

## The schedule

`pg_cron` job `trial-packet-show-eve`, `5,35 * * * *` — it wakes twice an hour and does nothing unless some trial is inside its **own** 18:00–21:59 local window on the eve of its date. Eight attempts per trial, 30 minutes apart, comfortably above the 10-minute claim lease so each run can rescue what its predecessor abandoned.

A fixed UTC window cannot be "evening" everywhere: the first draft ran 21:00–23:59 UTC and let the earliest run win, so the packet was cut at 16:00 CDT — the afternoon before, missing the late scratches the trigger exists to capture.

Each repeat run pays the full `emergency_packet_input` RPC before the claim is consulted, so the empty runs are cheap but not free.

The job is scheduled **only if `packet_cron_secret` already exists in Vault**; otherwise the migration warns and skips it. A successful `db push` is therefore not proof the schedule exists — check `cron.job` by name.

Entry close is deliberately **not** a trigger — see `docs/plan-trial-packet-automation.md` phase 4 for why.

## What this function does NOT do

It cannot put paper in a box. The print reminder that keys on `paperwork_prints` rather than on this function's own success is phase 5.
