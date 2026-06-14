# Resend Email Integration — Design Spec

**Date:** 2026-03-13
**Status:** Draft
**Scope:** Tier 1 — Auth emails + registration confirmation + delivery tracking

## Problem

1. **Auth email rate limit:** Supabase's built-in email sender caps at ~3-4 emails/hour on the free tier. Creating test users or onboarding real users hits this limit quickly.
2. **Broken confirmation redirect:** Signup confirmation and password reset links redirect to `site_url` but there is no `/auth/callback` route to handle the token — users land on a blank/404 page.
3. **No transactional emails:** Exhibitors receive no confirmation after registering, leaving them with no receipt, no show details, and no proof of entry.
4. **No delivery visibility:** Secretaries have no way to know if an exhibitor received their confirmation email — a frequent question from users.

## Decisions

| Decision            | Choice                                          | Rationale                                                                                     |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Email provider      | Resend                                          | Free tier 3K/month, React Email support, webhook delivery tracking, SMTP + API                |
| Architecture        | All Resend API via Edge Functions               | Single system, all templates in code, consistent with push notification Edge Function pattern |
| Template format     | React Email (TSX)                               | Version-controlled, type-safe, composable components                                          |
| Template style      | Clean & minimal                                 | White background, brand color accents, system fonts, reliable across email clients            |
| Auth emails         | Supabase Auth Hook → Edge Function → Resend API | Full control over auth email templates and delivery                                           |
| Delivery tracking   | `email_log` table + Resend webhooks             | Secretaries can see delivery status per entry                                                 |
| Custom content      | `confirmation_message` TEXT on `shows` table    | Secretary adds show-specific info included in registration confirmations                      |
| Password reset page | New `/reset-password` route                     | Clean separation from ForgotPasswordPage                                                      |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    myK9Show App                      │
│                                                      │
│  SignUpPage ──signUp()──→ Supabase Auth              │
│                              │                       │
│                              │ Auth Hook (send_email) │
│                              ▼                       │
│                     send-auth-email                   │
│                     (Edge Function)                   │
│                          │                           │
│                          ▼                           │
│                      Resend API ──→ Email delivered   │
│                          │                           │
│                          ▼                           │
│                    email_log row                      │
│                    (status: sent)                     │
│                                                      │
│  User clicks link ──→ /auth/callback                 │
│                          │                           │
│                          ▼                           │
│                    verifyOtp()                        │
│                          │                           │
│                    redirect to / or /reset-password   │
│                                                      │
│  RegistrationWorkflow                                │
│    confirmRegistration() ──→ send-registration-email │
│                              (Edge Function)         │
│                                  │                   │
│                                  ▼                   │
│                              Resend API              │
│                                  │                   │
│                                  ▼                   │
│                            email_log row             │
│                                                      │
│  Resend webhook ──→ resend-webhook (Edge Function)   │
│                          │                           │
│                          ▼                           │
│                    email_log.status updated           │
│                    (delivered/bounced/failed)         │
└─────────────────────────────────────────────────────┘
```

## Package: `packages/email/`

New workspace package `@myk9/email` containing React Email templates and shared components.

### Shared Components

- **`EmailLayout`** — Wrapper with header (myK9Show text logo + primary color bar), footer (support link, mailing address for CAN-SPAM), responsive container (max-width 600px)
- **`EmailButton`** — Branded CTA button (primary color background, white text, rounded corners)
- **`EmailHeading`** / **`EmailText`** — Consistent typography using system font stack

### Style Tokens

- Background: `#ffffff`
- Text: `#1a1a1e`
- Primary (buttons, header bar): app's primary brand color
- Muted text: `#6b7280`
- Border: `#e5e7eb`
- Font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

### Templates

#### `ConfirmEmail`

**Props:** `{ confirmUrl: string, firstName: string }`

Content:

- Heading: "Confirm your email"
- Body: "Hi {firstName}, thanks for signing up for myK9Show. Please confirm your email address to get started."
- Button: "Confirm Email" → `confirmUrl`
- Footer: "If you didn't create an account, you can safely ignore this email."

#### `ResetPassword`

**Props:** `{ resetUrl: string, firstName: string }`

Content:

- Heading: "Reset your password"
- Body: "Hi {firstName}, we received a request to reset your password. Click the button below to choose a new one."
- Button: "Reset Password" → `resetUrl`
- Footer: "If you didn't request this, you can safely ignore this email. The link expires in 24 hours."

#### `RegistrationConfirmation`

**Props:**

```typescript
{
  firstName: string;
  confirmationNumber: string; // e.g., "MK9-001234"
  show: {
    name: string;
    startDate: string;
    endDate: string;
    location: string;
    venue?: string;
    confirmationMessage?: string; // secretary custom message
  };
  entries: Array<{
    dogName: string;
    className: string;
    armband?: string;
  }>;
  payment: {
    subtotal: number;
    discount?: number;
    total: number;
    method: string; // "Visa ending in 4242"
  };
}
```

Content:

- Heading: "Registration Confirmed"
- Confirmation number badge: `MK9-001234`
- Show details section: name, dates, location/venue
- Secretary custom message (if set) — styled as a callout/note block
- Entries table: dog name, class, armband number
- Payment summary: line items, total
- Footer: "Questions? Contact the show secretary."

## Edge Functions

### `send-auth-email`

**Trigger:** Supabase Auth Hook (Auth > Hooks > Send Email in dashboard)

Supabase calls this function instead of sending its own email. Receives:

```typescript
{
  user: { email: string; user_metadata: { first_name?: string } };
  email_data: {
    token_hash: string;
    redirect_to: string;
    email_action_type: 'signup' | 'recovery' | 'magic_link';
  };
}
```

**Logic:**

1. Build callback URL: `${SITE_URL}/auth/callback?token_hash=${token_hash}&type=${email_action_type}`
2. Select template based on `email_action_type`
3. Render React Email template to HTML
4. Send via Resend API (`POST https://api.resend.com/emails`)
5. Write row to `email_log` (status: `sent`, resend_message_id from response)
6. Return `{ success: true }` to Supabase (required response shape for Auth Hooks)
7. For `magic_link` type: use ConfirmEmail template with adjusted copy ("Sign in to myK9Show")

**[ADDED] Error handling:** If Resend API call fails, log the error and still return `{ success: true }` to Supabase so the signup/reset flow completes. Write an `email_log` row with status `failed` and `error_message`. The user can request a new confirmation email from the sign-in page ("Didn't receive an email? Resend"). This prevents a Resend outage from blocking all signups.

**Deployment:** `--no-verify-jwt` (called by Supabase Auth, not an authenticated user)
**Secrets:** `RESEND_API_KEY`, `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY` [ADDED]
**From address:** `myK9Show <noreply@myk9show.com>`

### `send-registration-email`

**Trigger:** Called from app via `supabase.functions.invoke('send-registration-email', { body: { registrationId } })`

**Logic:**

1. Fetch registration, entries, show (including `confirmation_message`), and person data from Supabase
2. Render RegistrationConfirmation template
3. Send via Resend API
4. Write row to `email_log`
5. Return `{ success: true, emailLogId }`

**Called from:** `useRegistrationWorkflow` or `entryStore.confirmRegistration()` — fire-and-forget (registration succeeds regardless of email delivery)

**[ADDED] Idempotency:** Include `registrationId` as Resend's `Idempotency-Key` header to prevent duplicate sends on retry or double-click.

**Deployment:** Standard JWT verification (called from authenticated app)
**Secrets:** `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` [ADDED]
**From address:** `myK9Show <noreply@myk9show.com>`

### `resend-webhook`

**Trigger:** Resend webhook (configured in Resend dashboard to POST to this function URL)

**Events handled:** `email.delivered`, `email.bounced`, `email.delivery_delayed`, `email.complained`

**Logic:**

1. Verify webhook signature (Resend provides `svix-id`, `svix-timestamp`, `svix-signature` headers)
2. Extract `resend_message_id` from payload
3. Update `email_log` row: set `status`, `status_updated_at`, `error_message` (for bounces)

**Deployment:** `--no-verify-jwt` (called by Resend's servers, not an authenticated user)
**Secrets:** `RESEND_WEBHOOK_SECRET`

## Database Changes

### Migration: `shows` table

```sql
ALTER TABLE shows ADD COLUMN confirmation_message TEXT;
```

### Migration: `email_log` table

```sql
CREATE TABLE email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL, -- 'auth_confirmation', 'password_reset', 'registration_confirmation'
  related_id UUID, -- registration_id, show_id, etc.
  resend_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'delivered', 'bounced', 'failed', 'complained'
  status_updated_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_log_related ON email_log(related_id);
CREATE INDEX idx_email_log_resend_id ON email_log(resend_message_id);

-- RLS: platform admins and secretaries can read
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_log_select ON email_log
  FOR SELECT USING (
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM registrations r
      JOIN shows s ON s.id = r.show_id
      WHERE r.id = email_log.related_id
      AND is_show_secretary(s.id)
    )
  );

-- Edge Functions insert via service role key (no insert RLS needed for authenticated users)
```

## Auth Callback Route

### `/auth/callback` page

New lazy-loaded page component.

**Logic:**

1. On mount, read `token_hash` and `type` from URL search params
2. Call `supabase.auth.verifyOtp({ token_hash, type })`
3. On success:
   - `type === 'signup'` → redirect to `/` (home, now logged in)
   - `type === 'recovery'` → redirect to `/reset-password`
4. On error: show error message with link back to sign-in

**UI:** Loading spinner during verification. Error state with "This link may have expired" message and "Back to sign in" link.

### `/reset-password` page

New page. Only accessible during an active recovery session.

**UI:**

- Heading: "Choose a new password"
- New password field + confirm password field
- Submit button calls `supabase.auth.updateUser({ password })`
- Success state: "Password updated" with redirect to sign-in
- Validates: minimum length, passwords match

**[ADDED] Session guard:** On mount, check `supabase.auth.getSession()`. If no active session (user navigated directly or session expired), show message: "This link has expired. Please request a new password reset." with link to `/forgot-password`. Do not show the password form.

## Secretary UI — Email Delivery Status

### Entry Management Page

- Small icon next to each entry row indicating email status:
  - No icon: no email sent
  - Checkmark (green): delivered
  - Clock (yellow): sent, awaiting delivery
  - Warning triangle (red): bounced or failed — tooltip shows error
- "Resend" button appears on hover/click for bounced/failed entries [EXPANDED] — disabled for 60s after click to prevent rapid re-sends

### Show Entries Tab

- Optional "Email" column showing delivery status badge
- Filter option: "Email Status" (All / Delivered / Pending / Failed)

### Show Edit — Custom Message

- New textarea field in show edit form: "Confirmation Message"
- Helper text: "This message will be included in registration confirmation emails sent to exhibitors."
- Also available in the show creation wizard ReviewStep

## Supabase Dashboard Configuration

Manual steps (not in code):

1. **Auth > Hooks > Send Email:** Point to `send-auth-email` Edge Function URL
2. **Auth > Email:** Disable built-in email (or leave as fallback — Auth Hook takes priority when configured)
3. **Auth > URL Configuration:** Set `Site URL` to `https://myk9-platform-myk9show.vercel.app`, add `http://localhost:5173` to redirect allowlist
4. **Edge Function Secrets:** `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SITE_URL` (note: `SUPABASE_SERVICE_ROLE_KEY` is already available to Edge Functions by default) [EXPANDED]

## Resend Dashboard Configuration

Manual steps:

1. **Domain:** Add and verify `myk9show.com` (DNS records: SPF, DKIM, DMARC)
2. **Webhook:** Configure endpoint URL pointing to `resend-webhook` Edge Function
3. **Webhook events:** `email.delivered`, `email.bounced`, `email.delivery_delayed`, `email.complained`

## Out of Scope (Tier 2)

- Show reminder emails (1 week, 1 day before)
- New show announcement emails
- Results summary emails
- Notification preferences / unsubscribe management
- Email analytics dashboard for admins

## Testing

- Unit tests for template rendering (React Email → HTML string)
- Unit tests for Edge Function logic (mock Resend API responses)
- Integration test: signup → auth hook → email sent → callback → logged in
- Test webhook signature verification (valid and invalid signatures)
- [ADDED] Unit tests for AuthCallbackPage (success redirect, error state, missing params)
- [ADDED] Unit tests for ResetPasswordPage (session guard, validation, success state)
- [ADDED] Unit tests for secretary email status icons and resend button
- Verify email renders correctly in major clients (Gmail, Apple Mail, Outlook) via Resend preview or manual check
