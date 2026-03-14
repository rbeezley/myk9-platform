# Google Authentication Design Spec

## Goal

Add "Continue with Google" as a sign-in/sign-up option on both SignInPage and SignUpPage, reducing registration friction. First-time Google users get an auto-created `people` record with the `exhibitor` role, matching the existing email/password signup flow.

## Architecture

### OAuth Flow

Supabase handles the entire OAuth exchange. The client calls `supabase.auth.signInWithOAuth({ provider: 'google' })`, which redirects to Google's consent screen, then back to the app. Supabase creates or matches the auth user automatically.

The redirect lands on `/auth/callback`. The existing `AuthCallbackPage` handles OTP-based verification (email confirm, password reset). OAuth callbacks use a different mechanism — Supabase returns the session via URL hash fragments, and the Supabase client's `detectSessionInUrl` (already enabled in `supabaseClient.ts`) picks it up automatically. The `onAuthStateChange` listener in `useAuth.ts` fires with the new session, and the app routes the user.

### People Record Creation

When a Google user signs in for the first time, there is no `people` record. The existing `signUp` function in `useAuth.ts` creates this record inline, but `signInWithOAuth` doesn't go through that code path.

Solution: Handle people record creation in the `onAuthStateChange` listener in `useAuth.ts`. When a `SIGNED_IN` event fires and the user has an OAuth provider in `app_metadata`, check if a `people` record exists for that `auth_user_id`. If not, create one using Google profile metadata with `roles: ['exhibitor']`.

This approach:

- Works for any OAuth provider added in the future
- Handles the case where `signInWithOAuth` redirects away (no inline code runs after the call)
- Is idempotent — the check-then-insert pattern means repeated sign-ins don't create duplicates

### Pre-Existing Bug Fix: `user_id` vs `auth_user_id`

The existing `signUp` function in `useAuth.ts` inserts into `people` with `user_id: data.user.id`, but the actual database column is `auth_user_id` (added in migration 009, with a unique constraint added in migration 012). This is a pre-existing bug — the insert likely succeeds because PostgREST ignores unknown columns, but the `auth_user_id` column is never populated for email/password signups. Fix this as part of this work by changing `user_id` to `auth_user_id` in the existing `signUp` function.

### Duplicate Email Handling

If a user has an existing email/password account and tries Google sign-in with the same email, Supabase behavior depends on the "Allow linking" setting in the Supabase Dashboard (Authentication > Providers). With linking enabled (recommended), Supabase merges the identities under one user. The existing `people` record stays intact.

If linking is disabled, Supabase rejects the Google sign-in with an error. We handle this by showing a message: "An account with this email already exists. Please sign in with your password."

## Changes

### 1. Google Cloud Console Setup (Manual)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use existing) named "myK9Show"
3. Configure OAuth consent screen:
   - App name: myK9Show
   - User support email: your email
   - Authorized domains: `myk9show.com`, `supabase.co`
   - Scopes: `email`, `profile`, `openid` (default for Google sign-in)
4. Create OAuth 2.0 Client ID (Web application):
   - Authorized JavaScript origins: `https://sojmvhhwsjxmfistvzbe.supabase.co`
   - Authorized redirect URIs: `https://sojmvhhwsjxmfistvzbe.supabase.co/auth/v1/callback`
5. Copy the Client ID and Client Secret

Note: No separate Google API needs to be enabled — OAuth consent screen + credentials is sufficient for sign-in.

### 2. Supabase Dashboard Setup (Manual)

1. Go to Authentication > Providers > Google
2. Enable Google provider
3. Paste Client ID and Client Secret from Google Cloud Console
4. Ensure "Allow linking" is enabled under Authentication > Settings (so users with existing email/password accounts can also use Google)
5. Add redirect URLs under Authentication > URL Configuration:
   - `https://myk9-platform-myk9show.vercel.app/auth/callback`
   - `https://myk9show.com/auth/callback`

### 3. `supabase/config.toml` — Add Local Dev Redirect URLs

This file controls the local Supabase CLI environment only. Production/staging redirect URLs are configured in the Supabase Dashboard (step 2 above).

```toml
additional_redirect_urls = [
  "http://localhost:5174",
  "http://localhost:5173/auth/callback"
]
```

### 4. `useAuth.ts` — Add `signInWithGoogle` + Fix `auth_user_id` Bug

**Fix pre-existing bug:** Change `user_id` to `auth_user_id` in the existing `signUp` insert.

**Add new method:**

```typescript
const signInWithGoogle = useCallback(async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
}, []);
```

**Update `onAuthStateChange` listener** to handle first-time OAuth users. The people record creation runs asynchronously after the UI has already updated (user is set and loading is false), so there's no blocking delay:

```typescript
supabase.auth.onAuthStateChange(async (event, session) => {
  setUser(session?.user ?? null);
  setLoading(false);

  // Create people record for first-time OAuth users
  if (event === 'SIGNED_IN' && session?.user) {
    const user = session.user;
    const isOAuth = user.app_metadata?.provider !== 'email';
    if (isOAuth) {
      try {
        const { data: existing } = await supabase
          .from('people')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        if (!existing) {
          const { error: insertError } = await supabase.from('people').insert([
            {
              first_name:
                user.user_metadata?.given_name ||
                user.user_metadata?.full_name?.split(' ')[0] ||
                'First',
              last_name:
                user.user_metadata?.family_name ||
                user.user_metadata?.full_name?.split(' ').slice(1).join(' ') ||
                'Name',
              email: user.email,
              roles: ['exhibitor'],
              auth_user_id: user.id,
            },
          ]);

          if (insertError) {
            console.error('Failed to create people record for OAuth user:', insertError);
          }
        }
      } catch (err) {
        console.error('Error checking/creating people record for OAuth user:', err);
      }
    }
  }
});
```

Key details:

- Uses `given_name`/`family_name` from Google metadata (more reliable than splitting `full_name`)
- Falls back to `full_name` split if structured fields aren't available
- Wraps in try/catch — failure to create people record shouldn't break the sign-in flow
- Logs errors for debugging

Return `signInWithGoogle` from the hook.

### 5. `AuthContext.tsx` — Expose `signInWithGoogle`

Add `signInWithGoogle: () => Promise<void>` to `AuthContextType` interface and wire it through the provider.

### 6. `SignInPage.tsx` — Add Google Button

Add a "Continue with Google" button between the form header and the email/password form, separated by a divider:

```
[Continue with Google]  (Google "G" icon + text)
———— or ————
[Email field]
[Password field]
[Sign in button]
```

The button calls `signInWithGoogle()` from auth context. Show a loading state while redirecting. Display errors if the OAuth call fails.

### 7. `SignUpPage.tsx` — Add Google Button

Same layout as SignInPage — "Continue with Google" button above the form with an "or" divider.

### 8. `AuthCallbackPage.tsx` — Handle OAuth Redirects

The existing page handles OTP verification via `token_hash` + `type` query params. OAuth redirects don't have these params — they use hash fragments handled by the Supabase client automatically.

Update the page to distinguish three cases:

1. **OTP params present** (`token_hash` + `type`): existing verification flow (unchanged)
2. **Hash fragment present** (OAuth redirect): show loading spinner, Supabase client processes the hash, `onAuthStateChange` fires, then navigate to `/`
3. **Neither present** (direct navigation): show error "Invalid or missing verification link"

Add a `useEffect` that watches for the user becoming authenticated (via `useAuthContext`) and navigates to `/` (or `returnTo` from session storage).

### 9. Google Icon Component

Create a small `GoogleIcon` SVG component (the standard 4-color Google "G") in `apps/myk9show/src/components/icons/GoogleIcon.tsx`. Inline SVG, no external dependencies.

## Testing

- **`useAuth.test.ts`**: Test `signInWithGoogle` calls `supabase.auth.signInWithOAuth` with correct params. Test people record creation on `SIGNED_IN` event for OAuth users (uses `given_name`/`family_name`). Test idempotency (no duplicate insert if record exists). Test error handling (insert failure doesn't throw).
- **`SignInPage.test.tsx`**: Test Google button renders. Test click calls `signInWithGoogle`. Test error display on failure.
- **`SignUpPage.test.tsx`**: Test Google button renders. Test click calls `signInWithGoogle`.
- **`AuthCallbackPage.test.tsx`**: Test OAuth redirect (no token_hash params, hash fragment present) shows spinner. Test direct navigation (no params) shows error.

## Out of Scope

- Other OAuth providers (GitHub, Apple) — can follow this same pattern later
- Account linking UI (manual merge of Google + email accounts)
- Google One Tap / popup mode (redirect is simpler and more reliable)
