# Supabase Auth Email — Resend, Rate Limits & Manual Confirmation

**Status:** operational runbook · **Last updated:** 2026-06-03

How account/auth emails work in myK9Show, why the email rate limit sits at a tiny
default, how to raise it **safely**, and how to manually confirm a user when you
can't wait for (or didn't receive) the email.

> Scope: this is about **GoTrue auth emails** — signup confirmation, magic link,
> password reset, email-change. It does **not** cover the *entry/registration*
> confirmation emails (`send-registration-email`, `send-confirmation-email`),
> which are invoked directly and bypass GoTrue entirely (see below).

---

## How auth email is actually sent

Auth emails go out through a **Supabase Send Email Hook**, not Supabase's
built-in mailer and not Custom SMTP:

- GoTrue calls the [`send-auth-email`](../../supabase/functions/send-auth-email/index.ts)
  edge function.
- That function sends via the **Resend HTTP API** (`POST https://api.resend.com/emails`)
  using the `RESEND_API_KEY` secret, from `notifications@myk9show.com`.
- The user clicks the link → `/auth/callback` → `supabase.auth.verifyOtp(...)`.

So: **we use Resend** — but through the *hook* (Resend's API), which is a
different configuration slot than Supabase **Custom SMTP**.

---

## The rate-limit gotcha (why ~2 emails/hour, why "Save" is greyed out)

Symptom: signup/resend fails with **"email rate limit exceeded"**, and on
**Dashboard → Authentication → Rate Limits** the *Save* button for "Rate limit
for sending emails" is **disabled**.

Root cause: Supabase decides which email rate limit applies by asking **"is
Custom SMTP configured?"** — **not** "is a hook sending the mail?"

- With the Custom SMTP slot **empty** (our case — only the hook is set), the
  project is treated as using the **built-in** email service, which is hard-capped
  at a tiny rate (~2/hour). The hook does the actual sending, but GoTrue still
  counts and throttles the **send action** *before* the hook runs.
- The "emails per hour" field stays **locked** (greyed-out Save) until Custom SMTP
  is enabled.

Key consequences:
- **A Send Email Hook does not lift the cap.** Resend's own throughput is
  irrelevant while GoTrue's counter is the ceiling.
- **Only auth emails count.** Entry/registration confirmation emails are invoked
  directly via `supabase.functions.invoke(...)` and never touch GoTrue's mailer,
  so they are not subject to this limit.

---

## Fix: raise the limit by pointing Custom SMTP at Resend

Resend offers SMTP in addition to its API. Configuring Supabase **Custom SMTP**
with Resend's SMTP credentials (a) flips the project off the built-in ~2/hour cap
and (b) unlocks the adjustable `rate_limit_email_sent`. The hook keeps sending
(an enabled Send Email Hook still wins over SMTP), so branded templates are
preserved.

SMTP values (Resend):

| Field          | Value                          |
| -------------- | ------------------------------ |
| Host           | `smtp.resend.com`              |
| Port           | `465` (SSL) or `587` (TLS)     |
| Username       | `resend`                       |
| Password       | your Resend API key (`re_…`)   |
| Sender email   | `notifications@myk9show.com`   |
| Sender name    | `myK9Show`                     |

> The sender domain `myk9show.com` is already verified in Resend (the hook sends
> from it), so no new DNS is required.

### Apply it the safe way — Management API PATCH (NOT `config push`)

> ⚠️ **Do not use `supabase config push` for this.** That command reconciles the
> **entire** remote auth config against local `supabase/config.toml`, and our
> `config.toml` is a localhost dev scaffold (`site_url = http://localhost:5173`,
> no Google OAuth, no email-hook entry). Pushing it would repoint production
> `site_url` to localhost, wipe the redirect allowlist, and likely disable Google
> sign-in **and the Resend email hook itself**. Also never put live Resend SMTP in
> `config.toml` — it drives local `supabase start`, which should capture mail in
> inbucket, not send real email.

The Management API patches **only** the fields you send, leaving OAuth, redirects,
hooks, and `site_url` untouched:

```bash
# Secrets — keep in your shell, never commit
export SUPABASE_ACCESS_TOKEN="sbp_…"   # https://supabase.com/dashboard/account/tokens
export RESEND_API_KEY="re_…"           # same key the hook uses

REF=sojmvhhwsjxmfistvzbe

# 1) Back up current auth config first (restore point + shows exact field names)
curl -s "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" > /tmp/auth-config-backup.json

# 2) Patch ONLY smtp_* + rate_limit_email_sent
curl -s -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg pass "$RESEND_API_KEY" '{
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: $pass,
    smtp_admin_email: "notifications@myk9show.com",
    smtp_sender_name: "myK9Show",
    rate_limit_email_sent: 100
  }')" | jq '{smtp_host, smtp_port, smtp_admin_email, rate_limit_email_sent}'
```

- If the combined call is rejected (rate limit validated before SMTP "commits"),
  run it twice: `smtp_*` first, then `rate_limit_email_sent`.
- **`rate_limit_email_sent` is per hour.** `100` absorbs a registration-open
  burst. Your *real* volume ceiling is your **Resend plan** (free = 100/day,
  3k/month) — size that plan for expected launch volume.

### Verify after applying
1. One real signup → the email should still arrive from the **branded
   `send-auth-email` template** (hook precedence). If it looks like a plain
   default template, consolidate onto one path (keep SMTP, move HTML into
   Auth → Email Templates, retire the hook).
2. Rapid signups no longer hit "email rate limit exceeded."

---

## Resend confirmation email (in-app)

The "Check your email" screen has a **Resend email** button
([`SignUpPage.tsx`](../../apps/myk9show/src/pages/SignUpPage.tsx), shipped in
[#506](https://github.com/rbeezley/myk9-platform/pull/506)):

- Calls `resendConfirmationEmail(email)` →
  `supabase.auth.resend({ type: 'signup', email })`
  (in [`useAuth.ts`](../../apps/myk9show/src/hooks/useAuth.ts)), routing through
  the same Send Email Hook so the resent mail is identical to the original.
- 60-second cooldown countdown — aligns with Supabase's **per-address** minimum
  interval (distinct from the project-wide hourly cap above). If the user beats
  the server window, the real rate-limit message surfaces in an error toast.

---

## Manual confirmation (testing / blocked email)

When the email is rate-limited or undelivered, confirm an account directly. The
only field GoTrue gates sign-in on is `auth.users.email_confirmed_at`.

```sql
-- 1) Verify the account exists and its state
select id, email, email_confirmed_at, created_at
from auth.users
where lower(email) = 'user@example.com';

-- 2) Confirm so the user can sign in
update auth.users
set email_confirmed_at = now()
where lower(email) = 'user@example.com'
  and email_confirmed_at is null;
```

Notes:
- **Set `email_confirmed_at`, never `confirmed_at`.** `confirmed_at` is a
  *generated* column (`LEAST(email_confirmed_at, phone_confirmed_at)`); writing it
  throws "cannot insert into generated column." It populates automatically.
- **`lower(email)`** — GoTrue normalizes stored emails to lowercase, even if the
  signup form showed mixed case.
- **The `people` / `exhibitor_profiles` rows already exist.** `handle_new_user`
  (migration 165) fires on *insert* into `auth.users`, independent of
  confirmation — so confirming the email is the only missing step. The rate limit
  blocks the *email send*, not the user/profile creation.
- **No row returned?** The user was never created — confirm/retry the signup once
  the email limit allows, or create the user from Auth → Users.
- Prefer the **dashboard** alternative for one-offs: Auth → Users → row → confirm
  (no email sent, no quota burned). Run raw SQL in the **SQL Editor** — this is a
  data fix, *not* a migration; do not add it to `supabase/migrations/`.

### Connecting via `psql` (session pooler)

```bash
set -a; . supabase/.env; set +a   # provides SUPABASE_DB_PASSWORD
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
  "postgresql://postgres.sojmvhhwsjxmfistvzbe@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require"
```

`PGPASSWORD` + `sslmode=require` keeps the secret out of the process list and
shell history.

---

## Related

- `supabase/functions/send-auth-email/` — the auth-email Send Email Hook (Resend API)
- `docs/superpowers/specs/2026-03-13-resend-email-integration-design.md` — original Resend integration design
- Migration 165 — `handle_new_user` trigger (creates `people` + `exhibitor_profiles` on signup)
