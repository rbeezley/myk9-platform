# send-access-request-emails

Sends the access-request emails queued in `public.access_request_email_jobs`. MYK9-681.

```
request row INSERT / status change  →  trigger queues a job (same transaction)
pg_cron every minute                →  POST here when a job is due
this function                       →  claim  →  send via Resend  →  finish
```

## What gets sent

| Event     | Recipients                                                                           |
| --------- | ------------------------------------------------------------------------------------ |
| submitted | While the request is still pending: the requester (confirmation) and each reviewer   |
| approved  | The requester, with the reviewer's note when there is one                            |
| denied    | The requester, with the reviewer's note, or a generic explanation when there is none |

Reviewers: site admins for a new-club request and for any role request not routed to a club (including the ones signup creates); the club's active club admins for a membership request and for a club-routed secretary request.

## Once-only and retries

- The trigger's job key is `(request_kind, request_id, event)`, unique, so a repeat, a refresh or a second review never queues a second job.
- The worker claims **one job at a time** (`claim_access_request_email_jobs(1)`), each with a token and a 10-minute lease, so a slow provider can never leave later jobs claimed but untouched until their lease runs out. A run stops claiming after 20 jobs or 45 seconds; the rest wait for the next run. `finish_access_request_email_job` only accepts that token.
- A failed send moves the job back to `pending` with a 1, 4, 16 then 64-minute backoff; the fifth failure is terminal (`failed`, with `last_error`). Addresses already reached are kept in `delivered_to` and skipped on the retry.
- A submitted job whose request was already reviewed sends nothing (`skipped`): a "waiting for review" confirmation would contradict the decision email.
- Each provider call carries `Idempotency-Key: access-request-<job id>-<address>`, which covers a send that landed but whose result was never recorded.
- Every attempt is also written to `email_log`.

To resend a terminally failed job after fixing the cause:

```sql
update public.access_request_email_jobs
set status = 'pending', attempts = 0, next_attempt_at = now()
where id = '<job id>' and status = 'failed';
```

## Calling it

Server-to-server only; the body is ignored.

```
POST /functions/v1/send-access-request-emails
Authorization: Bearer $ACCESS_REQUEST_EMAIL_CRON_SECRET
{}
```

Returns `{ claimed, sent, skipped, retried, failed, lost }`. `lost` counts results that could not be recorded because the claim's lease had passed to another run.

## Configuration

| Secret                             | Purpose                                                       |
| ---------------------------------- | ------------------------------------------------------------- |
| `ACCESS_REQUEST_EMAIL_CRON_SECRET` | Bearer secret for the cron. **Unset means 503**, not open.    |
| `RESEND_API_KEY`                   | Email delivery. Unset means 503 before any job is claimed.    |
| `SITE_URL`                         | Links in the emails. Defaults to the production myK9Show URL. |

Vault holds the same cron secret as `access_request_email_cron_secret`, next to the existing `edge_function_base_url`. Requires `20260925054100_myk9_681_access_request_email_jobs.sql`.

```bash
supabase functions deploy send-access-request-emails --no-verify-jwt --project-ref sojmvhhwsjxmfistvzbe
```

## The schedule

`pg_cron` job `access-request-emails`, every 5 minutes (`*/5 * * * *`, owner decision 2026-09-26, set live with `cron.alter_job`). It posts only when a job is due (or a lease has expired), so an idle run is one indexed read. An email therefore goes out up to 5 minutes after the request, and the 1-minute first retry waits for the next run. The migration's own `cron.schedule` still says `* * * * *`; when you schedule it by hand, use `*/5 * * * *`. The migration schedules it **only if `access_request_email_cron_secret` already exists in Vault**; otherwise it warns and skips, and jobs wait in the queue until the schedule exists. A successful `db push` is not proof the schedule exists: check `cron.job` by name.
