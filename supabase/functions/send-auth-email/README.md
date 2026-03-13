# send-auth-email

Supabase Auth Hook that sends auth emails (signup confirmation, password reset, magic link) via Resend API.

## Configuration

- `RESEND_API_KEY` — Resend API key
- `SITE_URL` — App URL for callback links (default: `http://localhost:5173`)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — auto-provided by Supabase

## Deployment

```bash
supabase functions deploy send-auth-email --no-verify-jwt
```

Then configure as Auth Hook in Supabase Dashboard → Authentication → Hooks → Send Email.

## Test Scenarios

1. **Happy path (signup):** Receives signup payload → calls Resend API → writes email_log with status "sent" → returns `{ success: true }`
2. **Happy path (recovery):** Receives recovery payload → sends reset email → writes email_log → returns `{ success: true }`
3. **Resend API failure:** Resend returns 500 → writes email_log with status "failed" and error_message → still returns `{ success: true }`
4. **Missing RESEND_API_KEY:** No API key configured → writes email_log with status "failed" → returns `{ success: true }`
5. **Network error:** fetch throws → writes email_log with status "failed" → returns `{ success: true }`
6. **XSS in firstName:** user_metadata.first_name contains `<script>` → escapeHtml sanitizes it
7. **Magic link type:** email_action_type is "magiclink" → uses "Sign in to myK9Show" copy
