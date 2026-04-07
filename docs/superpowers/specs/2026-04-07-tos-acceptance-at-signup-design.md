# TOS and Privacy Policy Acceptance at Signup

**Date:** 2026-04-07
**Status:** Design approved
**Approach:** Frontend-only gate (Approach A)

## Summary

Require all users to agree to the platform's Terms of Service and Privacy Policy before creating an account. A checkbox on the signup page gates both the email "Sign up" button and the "Continue with Google" button. The agreement timestamp is recorded on the `people` table when the row is created.

## Database

**Next available migration** (121 or later, check `supabase/migrations/` at implementation time) — Add `agreed_to_tos_at` column to `people`.

```sql
ALTER TABLE people
  ADD COLUMN agreed_to_tos_at timestamptz;
```

- Nullable. Existing test users will have `NULL` (acceptable — no interstitial needed for them).
- No default value. Set explicitly by application code at signup time.
- No new tables, triggers, or RLS changes.

## Signup Page UI

**File:** `apps/myk9show/src/pages/SignUpPage.tsx`

- Add `agreedToTerms` boolean state (default `false`).
- Render a checkbox below the confirm password field, above the error message area.
- Label: `I agree to the Terms of Service and Privacy Policy` with React Router `<Link>` elements pointing to `/terms` and `/privacy`.
- Both the "Sign up" button and the "Continue with Google" button are `disabled` until `agreedToTerms === true` (combined with existing loading checks).
- No changes to form submission logic — `agreedToTerms` is a UI gate only.

## Auth Hook Changes

**File:** `apps/myk9show/src/hooks/useAuth.ts`

Two places create `people` rows:

1. **`signUp` function** (~line 150) — email signup path. Add `agreed_to_tos_at: new Date().toISOString()` to the `people` insert payload.
2. **`createOAuthPeopleRecord` function** (~line 42) — Google OAuth path. Add `agreed_to_tos_at: new Date().toISOString()` to the `people` insert payload.

No new function parameters needed. If the user reached the signup code, they checked the box.

## Placeholder Pages

**New file:** `apps/myk9show/src/pages/LegalPlaceholderPage.tsx`

A shared component that accepts a `title` prop ("Terms of Service" or "Privacy Policy") and renders:

- myK9Show header link
- Page title
- "This page is under construction. Please check back soon." message

**Routes:** Add `/terms` and `/privacy` as public routes in `apps/myk9show/src/routes/publicRoutes.tsx`. No auth required — these must be accessible before signup.

## Testing

### SignUpPage tests

- Both buttons disabled when checkbox unchecked.
- Both buttons enabled when checkbox checked (and other conditions met).
- Checkbox renders with correct label text.
- Links to `/terms` and `/privacy` present in label.

### useAuth tests

- `agreed_to_tos_at` included in `people` insert payload for email signup.
- `agreed_to_tos_at` included in `people` insert payload for OAuth signup.

### Placeholder page tests

- Renders title and placeholder message for Terms of Service.
- Renders title and placeholder message for Privacy Policy.

## Out of Scope

- TOS/Privacy Policy content (to be written separately).
- Versioned consent tracking (can be added later if TOS changes require re-consent).
- Interstitial for existing users (only test users exist currently).
- Database-level enforcement (unnecessary at current stage).
