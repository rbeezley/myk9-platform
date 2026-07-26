# resend-webhook

Receives Resend webhook events (delivery, bounce, complaint) and updates email_log status.

## Configuration

- `RESEND_WEBHOOK_SECRET` — Svix webhook signing secret from Resend dashboard
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — auto-provided by Supabase
- The Resend webhook must subscribe to `email.delivered`, `email.delivery_delayed`,
  `email.bounced`, `email.complained`, `email.failed`, and `email.suppressed`.

## Deployment

```bash
supabase functions deploy resend-webhook --no-verify-jwt
```

Then configure webhook URL in Resend Dashboard → Webhooks.

## Test Scenarios

1. **Valid delivery event:** Receives `email.delivered` with valid Svix signature → updates email_log status to "delivered"
2. **Valid bounce event:** Receives `email.bounced` with `data.bounce` details → updates status to "bounced"; auth-email bounces also raise a masked operator alert
3. **Valid complaint event:** Receives `email.complained` → updates status to "complained"; auth-email complaints also raise a masked operator alert
4. **Valid failed event:** Receives `email.failed` → records the provider reason and raises an auth-email operator alert
5. **Valid suppressed event:** Receives `email.suppressed` → records the suppression reason and raises an auth-email operator alert
6. **Replay/backfill:** A replayed terminal failure skips the redundant log update but retries the deduplicated operator alert
7. **Persistence failure or missing auth log:** Returns 500 so Resend retries the signed event instead of silently losing the status or operator alert; auth sends carry a `myk9_email_type` tag so a webhook that races the initial email-log insert can be retried without blocking unrelated Resend traffic
8. **Invalid signature:** Wrong Svix signature → returns 401
9. **Missing signature headers:** No svix-id/timestamp/signature → returns 401
10. **Stale timestamp:** svix-timestamp > 5 minutes old → returns 401
11. **Unknown event type:** Receives unrecognized event → returns 200 (acknowledged, not processed)
12. **No webhook secret configured:** RESEND_WEBHOOK_SECRET not set → returns 503 without processing the event
13. **Non-POST method:** GET/HEAD returns 200 for Resend endpoint validation; other methods return 405
