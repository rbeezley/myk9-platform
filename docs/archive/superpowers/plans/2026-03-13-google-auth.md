# Google Auth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Continue with Google" OAuth sign-in/sign-up to myK9Show via Supabase, with auto-created people records for first-time Google users.

**Architecture:** Supabase handles the OAuth exchange. Client calls `signInWithOAuth({ provider: 'google' })`, which redirects to Google, then back to `/auth/callback`. The `onAuthStateChange` listener creates a `people` record for first-time OAuth users. A pre-existing `user_id` → `auth_user_id` bug in the signup flow is fixed.

**Tech Stack:** Supabase Auth (OAuth), React, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-google-auth-design.md`

---

## File Map

| Action | File                                                     | Responsibility                                                              |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| Modify | `supabase/config.toml`                                   | Add local dev redirect URL                                                  |
| Create | `apps/myk9show/src/components/icons/GoogleIcon.tsx`      | 4-color Google "G" SVG icon                                                 |
| Modify | `apps/myk9show/src/hooks/useAuth.ts`                     | Add `signInWithGoogle`, fix `user_id` bug, add OAuth people record creation |
| Modify | `apps/myk9show/src/context/AuthContext.tsx`              | Add `signInWithGoogle` to interface                                         |
| Modify | `apps/myk9show/src/pages/SignInPage.tsx`                 | Add Google button + divider                                                 |
| Modify | `apps/myk9show/src/pages/SignUpPage.tsx`                 | Add Google button + divider                                                 |
| Modify | `apps/myk9show/src/pages/AuthCallbackPage.tsx`           | Handle OAuth redirects (no OTP params)                                      |
| Modify | `apps/myk9show/src/test/auth/useAuth.test.ts`            | Tests for signInWithGoogle + OAuth people record                            |
| Modify | `apps/myk9show/src/test/pages/SignInPage.test.tsx`       | Tests for Google button                                                     |
| Create | `apps/myk9show/src/test/pages/SignUpPage.test.tsx`       | Tests for Google button                                                     |
| Modify | `apps/myk9show/src/test/pages/AuthCallbackPage.test.tsx` | Tests for OAuth callback handling                                           |

---

## Task 1: Config + GoogleIcon Component

**Files:**

- Modify: `supabase/config.toml:31`
- Create: `apps/myk9show/src/components/icons/GoogleIcon.tsx`

- [ ] **Step 1: Update `supabase/config.toml`**

Add the OAuth callback URL for local dev:

```toml
additional_redirect_urls = ["http://localhost:5174", "http://localhost:5173/auth/callback"]
```

- [ ] **Step 2: Create `GoogleIcon.tsx`**

```tsx
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml apps/myk9show/src/components/icons/GoogleIcon.tsx
git commit -m "feat(auth): add GoogleIcon component and update config redirect URLs"
```

---

## Task 2: Fix `auth_user_id` Bug + Add `signInWithGoogle` to `useAuth`

**Files:**

- Modify: `apps/myk9show/src/hooks/useAuth.ts`
- Modify: `apps/myk9show/src/test/auth/useAuth.test.ts`

- [ ] **Step 1: Write failing tests for `signInWithGoogle`**

First, add `signInWithOAuth` mock setup to the existing `beforeEach` block (after the `updateUser` mock on ~line 52), since `vi.clearAllMocks()` clears the default mock implementation:

```typescript
mockSupabase.auth.signInWithOAuth.mockResolvedValue({
  data: { url: '', provider: '' },
  error: null,
});
```

Then add to `apps/myk9show/src/test/auth/useAuth.test.ts`, inside a new `describe('signInWithGoogle', ...)` block:

```typescript
describe('signInWithGoogle', () => {
  it('should call signInWithOAuth with google provider', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  });

  it('should throw on OAuth error', async () => {
    const mockError = new Error('OAuth failed');
    mockSupabase.auth.signInWithOAuth.mockResolvedValue({
      data: { url: null, provider: '' },
      error: mockError,
    });

    const { result } = renderHook(() => useAuth());

    await expect(async () => {
      await act(async () => {
        await result.current.signInWithGoogle();
      });
    }).rejects.toThrow('OAuth failed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm test -- --run src/test/auth/useAuth.test.ts`
Expected: FAIL — `signInWithGoogle` is not a function

- [ ] **Step 3: Write failing tests for OAuth people record creation**

Add a new `describe('OAuth people record creation', ...)` block in the same test file:

```typescript
describe('OAuth people record creation', () => {
  it('should create people record for first-time OAuth user', async () => {
    const oauthUser: User = {
      ...mockUser,
      app_metadata: { provider: 'google' },
      user_metadata: { given_name: 'Jane', family_name: 'Doe' },
    };

    // Mock: no existing people record
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const insertChain = {
      insert: vi.fn().mockResolvedValue({ data: [{}], error: null }),
    };

    let authChangeCallback: (event: string, session: { user: User } | null) => void;
    mockSupabase.auth.onAuthStateChange.mockImplementation(
      (cb: (event: string, session: { user: User } | null) => void) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }
    );

    // First call to from('people') returns select chain, second returns insert chain
    let fromCallCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'people') {
        fromCallCount++;
        if (fromCallCount === 1) return selectChain;
        if (fromCallCount === 2) return insertChain;
      }
      return createChainableQuery();
    });

    renderHook(() => useAuth());

    await act(async () => {
      authChangeCallback!('SIGNED_IN', { user: oauthUser });
    });

    expect(selectChain.eq).toHaveBeenCalledWith('auth_user_id', 'test-user-id');
    expect(insertChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'test@example.com',
        roles: ['exhibitor'],
        auth_user_id: 'test-user-id',
      }),
    ]);
  });

  it('should not create people record if one already exists', async () => {
    const oauthUser: User = {
      ...mockUser,
      app_metadata: { provider: 'google' },
      user_metadata: { given_name: 'Jane', family_name: 'Doe' },
    };

    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'existing-id' }, error: null }),
    };

    let authChangeCallback: (event: string, session: { user: User } | null) => void;
    mockSupabase.auth.onAuthStateChange.mockImplementation(
      (cb: (event: string, session: { user: User } | null) => void) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }
    );

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'people') return selectChain;
      return createChainableQuery();
    });

    renderHook(() => useAuth());

    await act(async () => {
      authChangeCallback!('SIGNED_IN', { user: oauthUser });
    });

    // Should check but NOT insert
    expect(selectChain.eq).toHaveBeenCalledWith('auth_user_id', 'test-user-id');
    // from('people') only called once (for select, not for insert)
    expect(mockSupabase.from).toHaveBeenCalledWith('people');
  });

  it('should not create people record for email provider', async () => {
    const emailUser: User = {
      ...mockUser,
      app_metadata: { provider: 'email' },
    };

    let authChangeCallback: (event: string, session: { user: User } | null) => void;
    mockSupabase.auth.onAuthStateChange.mockImplementation(
      (cb: (event: string, session: { user: User } | null) => void) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }
    );

    renderHook(() => useAuth());

    await act(async () => {
      authChangeCallback!('SIGNED_IN', { user: emailUser });
    });

    // Should NOT query people table for email users
    expect(mockSupabase.from).not.toHaveBeenCalledWith('people');
  });

  // [ADDED] Test insert failure doesn't break sign-in
  it('should log error but not throw when people record insert fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oauthUser: User = {
      ...mockUser,
      app_metadata: { provider: 'google' },
      user_metadata: { given_name: 'Jane', family_name: 'Doe' },
    };

    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const insertChain = {
      insert: vi.fn().mockResolvedValue({ data: null, error: { message: 'RLS blocked' } }),
    };

    let authChangeCallback: (event: string, session: { user: User } | null) => void;
    mockSupabase.auth.onAuthStateChange.mockImplementation(
      (cb: (event: string, session: { user: User } | null) => void) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }
    );

    let fromCallCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'people') {
        fromCallCount++;
        if (fromCallCount === 1) return selectChain;
        if (fromCallCount === 2) return insertChain;
      }
      return createChainableQuery();
    });

    renderHook(() => useAuth());

    // Should not throw
    await act(async () => {
      authChangeCallback!('SIGNED_IN', { user: oauthUser });
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to create people record for OAuth user:',
      expect.objectContaining({ message: 'RLS blocked' })
    );
    consoleSpy.mockRestore();
  });
});
```

Add `createChainableQuery` to the import at the top of the test file:

```typescript
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm test -- --run src/test/auth/useAuth.test.ts`
Expected: FAIL

- [ ] **Step 5: Implement changes in `useAuth.ts`**

**Fix the `user_id` bug** — change line 84 from `user_id: data.user.id` to `auth_user_id: data.user.id`.

**Add `signInWithGoogle` method** after the `signIn` callback (~line 121):

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

**Update `onAuthStateChange` listener** — replace the existing callback (lines 37-40) with:

```typescript
supabase.auth.onAuthStateChange(async (_event, session) => {
  setUser(session?.user ?? null);
  setLoading(false);

  // Create people record for first-time OAuth users
  if (_event === 'SIGNED_IN' && session?.user) {
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

**Add `signInWithGoogle` to the return object** (line ~182):

```typescript
return {
  user,
  loading,
  signUp,
  signIn,
  signInWithGoogle,
  signOut,
  resetPassword,
  updatePassword,
  updateProfile,
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm test -- --run src/test/auth/useAuth.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS — `AuthProvider` spreads `...auth` so extra properties from `useAuth` are allowed by TypeScript

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/hooks/useAuth.ts apps/myk9show/src/test/auth/useAuth.test.ts
git commit -m "feat(auth): add signInWithGoogle, OAuth people record creation, fix auth_user_id bug"
```

---

## Task 3: Update AuthContext Interface + UI Pages

**Files:**

- Modify: `apps/myk9show/src/context/AuthContext.tsx:50-95` (interface only)
- Modify: `apps/myk9show/src/pages/SignInPage.tsx`
- Modify: `apps/myk9show/src/pages/SignUpPage.tsx`
- Modify: `apps/myk9show/src/test/pages/SignInPage.test.tsx`
- Create: `apps/myk9show/src/test/pages/SignUpPage.test.tsx`

- [ ] **Step 1: Add `signInWithGoogle` to `AuthContextType`**

In `apps/myk9show/src/context/AuthContext.tsx`, add after line 57 (`signOut`):

```typescript
signInWithGoogle: () => Promise<void>;
```

- [ ] **Step 2: Run typecheck to verify it compiles**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS (since `useAuth` already returns `signInWithGoogle` and `AuthProvider` spreads `...auth`)

- [ ] **Step 3: Write failing test for Google button on SignInPage**

Update `apps/myk9show/src/test/pages/SignInPage.test.tsx`. Replace the mock to include `signInWithGoogle`:

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignInPage from '@/pages/SignInPage';

const mockSignInWithGoogle = vi.fn();

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    signIn: vi.fn(),
    signInWithGoogle: mockSignInWithGoogle,
    loading: false,
  }),
}));

describe('SignInPage', () => {
  it('has a forgot password link pointing to /forgot-password', () => {
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /forgot your password/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });

  it('renders a Continue with Google button', () => {
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('calls signInWithGoogle when Google button is clicked', () => {
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(mockSignInWithGoogle).toHaveBeenCalled();
  });

  it('renders an "or" divider between Google button and email form', () => {
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    );
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  // [ADDED] Test error display when Google sign-in fails
  it('displays error when signInWithGoogle fails', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('Popup closed'));
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    await waitFor(() => {
      expect(screen.getByText('Popup closed')).toBeInTheDocument();
    });
  });
});
```

Update the imports to include `waitFor`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm test -- --run src/test/pages/SignInPage.test.tsx`
Expected: FAIL — no Google button exists yet

- [ ] **Step 5: Write failing test for Google button on SignUpPage**

Create `apps/myk9show/src/test/pages/SignUpPage.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from '@/pages/SignUpPage';

const mockSignInWithGoogle = vi.fn();

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    signUp: vi.fn(),
    signInWithGoogle: mockSignInWithGoogle,
    loading: false,
  }),
}));

describe('SignUpPage', () => {
  it('renders a Continue with Google button', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('calls signInWithGoogle when Google button is clicked', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(mockSignInWithGoogle).toHaveBeenCalled();
  });

  it('renders an "or" divider between Google button and email form', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
    expect(screen.getByText('or')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Add Google button + divider to `SignInPage.tsx`**

In `apps/myk9show/src/pages/SignInPage.tsx`:

Add imports:

```typescript
import { GoogleIcon } from '@/components/icons/GoogleIcon';
```

Add `signInWithGoogle` to the destructured auth context:

```typescript
const { signIn, signInWithGoogle, loading: authLoading } = useAuthContext();
```

Add state for Google errors:

```typescript
const [googleLoading, setGoogleLoading] = useState(false);
```

Add handler:

```typescript
const handleGoogleSignIn = async () => {
  setError('');
  setGoogleLoading(true);
  try {
    await signInWithGoogle();
  } catch (error: unknown) {
    setError(error instanceof Error ? error.message : 'Google sign-in failed');
    setGoogleLoading(false);
  }
};
```

Insert between the "Don't have an account?" text and the `<form>`, this block:

```tsx
<button
  type="button"
  onClick={handleGoogleSignIn}
  disabled={isLoading || googleLoading}
  className="w-full flex items-center justify-center gap-3 border border-input bg-background text-foreground py-2 px-4 rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
>
  <GoogleIcon className="h-5 w-5" />
  Continue with Google
</button>
<div className="relative my-6">
  <div className="absolute inset-0 flex items-center">
    <div className="w-full border-t border-input" />
  </div>
  <div className="relative flex justify-center text-sm">
    <span className="bg-card px-2 text-muted-foreground">or</span>
  </div>
</div>
```

- [ ] **Step 7: Add Google button + divider to `SignUpPage.tsx`**

Same pattern as SignInPage. In `apps/myk9show/src/pages/SignUpPage.tsx`:

Add imports:

```typescript
import { GoogleIcon } from '@/components/icons/GoogleIcon';
```

Add `signInWithGoogle` to destructured auth context:

```typescript
const { signUp, signInWithGoogle, loading: authLoading } = useAuthContext();
```

Add state + handler (same as SignInPage):

```typescript
const [googleLoading, setGoogleLoading] = useState(false);

const handleGoogleSignIn = async () => {
  setError('');
  setGoogleLoading(true);
  try {
    await signInWithGoogle();
  } catch (error: unknown) {
    setError(error instanceof Error ? error.message : 'Google sign-in failed');
    setGoogleLoading(false);
  }
};
```

Insert the same Google button + divider block between the "Already have an account?" text and the `<form>`.

- [ ] **Step 8: Run all tests**

Run: `cd apps/myk9show && pnpm test -- --run src/test/pages/SignInPage.test.tsx src/test/pages/SignUpPage.test.tsx`
Expected: ALL PASS

- [ ] **Step 9: Run typecheck + lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/myk9show/src/context/AuthContext.tsx apps/myk9show/src/pages/SignInPage.tsx apps/myk9show/src/pages/SignUpPage.tsx apps/myk9show/src/test/pages/SignInPage.test.tsx apps/myk9show/src/test/pages/SignUpPage.test.tsx
git commit -m "feat(auth): add Continue with Google button to sign-in and sign-up pages"
```

---

## Task 4: Update AuthCallbackPage for OAuth Redirects

**Files:**

- Modify: `apps/myk9show/src/pages/AuthCallbackPage.tsx`
- Modify: `apps/myk9show/src/test/pages/AuthCallbackPage.test.tsx`

- [ ] **Step 1: Write failing test for OAuth callback**

Add new tests to `apps/myk9show/src/test/pages/AuthCallbackPage.test.tsx`:

```typescript
it('shows loading state for OAuth callback (no token_hash params)', () => {
  // OAuth redirects have no query params — hash fragments are handled by Supabase client
  renderWithRouter('');
  // Should show loading, not error, since it could be an OAuth redirect
  expect(screen.getByText(/verifying/i)).toBeInTheDocument();
});
```

Update the existing "shows error when params are missing" test — it currently expects an error for empty params, but after our change, empty params should show a loading spinner (to handle OAuth). Update that test to expect loading instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm test -- --run src/test/pages/AuthCallbackPage.test.tsx`
Expected: FAIL — current code shows error for missing params

- [ ] **Step 3: Update `AuthCallbackPage.tsx`**

Replace the entire file with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const AuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as 'signup' | 'recovery' | 'magiclink' | null;
    return tokenHash && type ? { tokenHash, type } : null;
  }, [searchParams]);

  // Handle OTP verification (email confirm, password reset)
  useEffect(() => {
    if (!params) return;

    supabase.auth
      .verifyOtp({ token_hash: params.tokenHash, type: params.type })
      .then(({ error: verifyError }) => {
        if (verifyError) {
          setError('This link may have expired. Please request a new one.');
          return;
        }
        if (params.type === 'recovery') {
          navigate('/reset-password', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      });
  }, [params, navigate]);

  // Handle OAuth redirect (no OTP params — session is picked up by onAuthStateChange)
  useEffect(() => {
    if (params) return; // OTP flow handles its own navigation

    // Check if user is already authenticated (OAuth session was picked up)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/', { replace: true });
      }
    });

    // Listen for auth state changes (OAuth callback may still be processing)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/', { replace: true });
      }
    });

    // Timeout: if no auth event after 10 seconds, show error
    const timeout = setTimeout(() => {
      setError('Authentication timed out. Please try again.');
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [params, navigate]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
        <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Verification Failed</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link to="/sign-in" className="text-primary hover:underline font-medium">
            &larr; Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Verifying your email...</p>
    </div>
  );
};

export default AuthCallbackPage;
```

- [ ] **Step 4: Update tests for new behavior**

Replace the full test file `apps/myk9show/src/test/pages/AuthCallbackPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthCallbackPage from '@/pages/AuthCallbackPage';

const mockVerifyOtp = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderWithRouter(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <AuthCallbackPage />
    </MemoryRouter>
  );
}

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  describe('OTP verification flow', () => {
    it('shows loading state during verification', () => {
      mockVerifyOtp.mockReturnValue(new Promise(() => {}));
      renderWithRouter('?token_hash=abc&type=signup');
      expect(screen.getByText(/verifying/i)).toBeInTheDocument();
    });

    it('redirects to home on successful signup verification', async () => {
      mockVerifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
      renderWithRouter('?token_hash=abc&type=signup');
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
    });

    it('redirects to reset-password on successful recovery verification', async () => {
      mockVerifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
      renderWithRouter('?token_hash=abc&type=recovery');
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/reset-password', { replace: true })
      );
    });

    it('shows error state when verification fails', async () => {
      mockVerifyOtp.mockResolvedValue({ data: {}, error: { message: 'Token expired' } });
      renderWithRouter('?token_hash=abc&type=signup');
      await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
    });
  });

  describe('OAuth callback flow', () => {
    it('shows loading state for OAuth callback (no query params)', () => {
      renderWithRouter('');
      expect(screen.getByText(/verifying/i)).toBeInTheDocument();
    });

    it('redirects to home when session is already available', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: '123' } } },
        error: null,
      });
      renderWithRouter('');
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
    });

    it('redirects to home when auth state changes to SIGNED_IN', async () => {
      mockOnAuthStateChange.mockImplementation(
        (cb: (event: string, session: unknown) => void) => {
          // Simulate delayed SIGNED_IN event
          setTimeout(() => cb('SIGNED_IN', { user: { id: '123' } }), 50);
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }
      );
      renderWithRouter('');
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
    });

    // [ADDED] Test timeout shows error when no auth event arrives
    it('shows timeout error when no auth event arrives within 10 seconds', async () => {
      vi.useFakeTimers();
      renderWithRouter('');

      // Initially shows loading
      expect(screen.getByText(/verifying/i)).toBeInTheDocument();

      // Fast-forward past timeout
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      expect(screen.getByText(/timed out/i)).toBeInTheDocument();
      vi.useRealTimers();
    });
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd apps/myk9show && pnpm test -- --run src/test/pages/AuthCallbackPage.test.tsx`
Expected: ALL PASS

- [ ] **Step 6: Run typecheck + lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/AuthCallbackPage.tsx apps/myk9show/src/test/pages/AuthCallbackPage.test.tsx
git commit -m "feat(auth): update AuthCallbackPage to handle OAuth redirects"
```

---

## Task 5: Full Test Suite + Final Verification

- [ ] **Step 1: Run full myK9Show test suite**

Run: `cd apps/myk9show && pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 2: Run monorepo typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Manual verification checklist**

Before testing end-to-end, complete the manual setup steps:

1. Google Cloud Console: Create OAuth credentials (see spec section 1)
2. Supabase Dashboard: Enable Google provider, paste credentials, enable account linking, add redirect URLs (see spec section 2)

After setup, verify:

- [ ] Sign-in page shows "Continue with Google" button with Google icon
- [ ] Sign-up page shows "Continue with Google" button with Google icon
- [ ] Both pages show "or" divider between Google button and email form
- [ ] Clicking Google button redirects to Google consent screen
- [ ] After Google consent, user is redirected back and signed in
- [ ] First-time Google users get a `people` record with `exhibitor` role
- [ ] Repeated Google sign-ins don't create duplicate people records
- [ ] Existing email/password users can also sign in with Google (same email)
