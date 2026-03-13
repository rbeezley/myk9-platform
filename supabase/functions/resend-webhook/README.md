# resend-webhook

Receives Resend webhook events (delivery, bounce, complaint) and updates email_log status.

## Configuration

- `RESEND_WEBHOOK_SECRET` — Svix webhook signing secret from Resend dashboard
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — auto-provided by Supabase

## Deployment

```bash
supabase functions deploy resend-webhook --no-verify-jwt
```

Then configure webhook URL in Resend Dashboard → Webhooks.

## Test Scenarios

1. **Valid delivery event:** Receives `email.delivered` with valid Svix signature → updates email_log status to "delivered"
2. **Valid bounce event:** Receives `email.bounced` → updates status to "bounced" with error_message
3. **Invalid signature:** Wrong Svix signature → returns 401
4. **Missing signature headers:** No svix-id/timestamp/signature → returns 401
5. **Stale timestamp:** svix-timestamp > 5 minutes old → returns 401
6. **Unknown event type:** Receives unrecognized event → returns 200 (acknowledged, not processed)
7. **No webhook secret configured:** RESEND_WEBHOOK_SECRET not set → logs warning, processes event anyway
8. **Non-POST method:** GET request → returns 405
