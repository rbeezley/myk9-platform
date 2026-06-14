# Forgot Password Flow — Design Spec

## Overview

Add a forgot password flow to myK9Show so users can reset their password via email. The backend infrastructure (Supabase `resetPasswordForEmail`, `useAuth.resetPassword`, `AuthContext`) already exists — this is purely a UI task.

## Decisions

| Decision          | Choice                             | Rationale                                             |
| ----------------- | ---------------------------------- | ----------------------------------------------------- |
| Flow type         | Separate page (`/forgot-password`) | Industry standard, keeps sign-in clean, shareable URL |
| Layout            | Centered minimal                   | Matches sign-in page style                            |
| Link placement    | Below sign-in button               | Cleaner form, secondary action position               |
| Email enumeration | Always show success                | Security best practice — prevents email harvesting    |
| Post-submit UX    | Success message replaces form      | Standard pattern (GitHub, Stripe)                     |

## Components

### 1. Sign-in Page Update (`SignInPage.tsx`)

Add "Forgot your password?" link below the Sign In button, linking to `/forgot-password`.

### 2. Forgot Password Page (`ForgotPasswordPage.tsx`)

New page with two states:

**Form state:**

- Title: "Reset your password"
- Subtitle: "Enter your email and we'll send you a reset link"
- Email input field
- "Send Reset Link" button (with loading spinner during submission)
- "Remember your password? Sign in" link

**Success state (after submit):**

- Checkmark icon in green circle
- Title: "Check your email"
- Subtitle: "We sent a password reset link to your email address. The link will expire in 24 hours."
- "Back to sign in" link

### 3. Route Registration (`App.tsx`)

Add `/forgot-password` as a public route (no auth required), lazy-loaded.

## Technical Details

- Uses `useAuthContext().resetPassword(email)` — calls Supabase `resetPasswordForEmail()`
- Always shows success state after submit (even if email doesn't exist)
- Catches errors silently for security; only shows generic error for network failures
- No backend changes needed
- Supabase handles email delivery and reset token flow

## Out of Scope

- Update/change password page (for when user clicks the email link) — follow-up task
- Password strength requirements on reset
- Rate limiting UI (Supabase handles server-side)

## Testing

- `ForgotPasswordPage.test.tsx` — renders form, submits email, shows success state, handles errors
- `SignInPage.test.tsx` — verify forgot password link exists and points to `/forgot-password`
