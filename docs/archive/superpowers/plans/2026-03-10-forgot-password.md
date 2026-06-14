# Forgot Password Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a forgot password page and link from sign-in so users can reset their password via email.

**Architecture:** New `ForgotPasswordPage` component with form/success states, using existing `useAuthContext().resetPassword()`. Add route in `App.tsx` and link in `SignInPage.tsx`.

**Tech Stack:** React, React Router, Tailwind CSS, Supabase Auth (already wired), Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-10-forgot-password-design.md`

---

## File Structure

| File                                                       | Action | Responsibility                                        |
| ---------------------------------------------------------- | ------ | ----------------------------------------------------- |
| `apps/myk9show/src/pages/ForgotPasswordPage.tsx`           | Create | Forgot password form + success state                  |
| `apps/myk9show/src/pages/SignInPage.tsx`                   | Modify | Add "Forgot your password?" link below sign-in button |
| `apps/myk9show/src/App.tsx`                                | Modify | Add lazy import + `/forgot-password` route            |
| `apps/myk9show/src/test/pages/ForgotPasswordPage.test.tsx` | Create | Unit tests for forgot password page                   |
| `apps/myk9show/src/test/pages/SignInPage.test.tsx`         | Create | Test that forgot password link exists                 |

---

## Task 1: ForgotPasswordPage — Tests

**Files:**

- Create: `apps/myk9show/src/test/pages/ForgotPasswordPage.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';

// Mock useAuthContext
const mockResetPassword = vi.fn();
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    resetPassword: mockResetPassword,
  }),
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

  it('renders the reset password form', () => {
    renderPage();
    expect(screen.getByText('Reset your password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeInTheDocument();
  });

  it('has a link back to sign in', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toHaveAttribute('href', '/sign-in');
  });

  it('submits email and shows success state', async () => {
    mockResetPassword.mockResolvedValue(undefined);
    renderPage();

    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
    expect(mockResetPassword).toHaveBeenCalledWith('user@example.com');
  });

  it('shows success even when resetPassword throws (prevents email enumeration)', async () => {
    mockResetPassword.mockRejectedValue(new Error('User not found'));
    renderPage();

    await userEvent.type(screen.getByLabelText('Email address'), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
  });

  it('shows error message on network failure', async () => {
    const networkError = new Error('Failed to fetch');
    networkError.name = 'FetchError';
    mockResetPassword.mockRejectedValue(networkError);
    renderPage();

    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });

  it('shows loading state while submitting', async () => {
    let resolveReset: () => void;
    mockResetPassword.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveReset = resolve;
        })
    );
    renderPage();

    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    expect(screen.getByText('Sending...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();

    resolveReset!();
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
  });

  it('requires email field to be filled', () => {
    renderPage();
    const emailInput = screen.getByLabelText('Email address');
    expect(emailInput).toBeRequired();
  });

  it('shows back to sign in link in success state', async () => {
    mockResetPassword.mockResolvedValue(undefined);
    renderPage();

    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
    const link = screen.getByRole('link', { name: /back to sign in/i });
    expect(link).toHaveAttribute('href', '/sign-in');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && pnpm test -- --run src/test/pages/ForgotPasswordPage.test.tsx`
Expected: FAIL — `ForgotPasswordPage` module not found

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/myk9show/src/test/pages/ForgotPasswordPage.test.tsx
git commit -m "test: add ForgotPasswordPage tests (red)"
```

---

## Task 2: ForgotPasswordPage — Implementation

**Files:**

- Create: `apps/myk9show/src/pages/ForgotPasswordPage.tsx`

**Reference:** Match the style of `apps/myk9show/src/pages/SignInPage.tsx` — same centered layout, Tailwind classes, and form structure.

- [ ] **Step 1: Create the ForgotPasswordPage component**

```tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, CheckCircle } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const { resetPassword } = useAuthContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await resetPassword(email);
      setSubmitted(true);
    } catch (err) {
      // Network errors — show generic error so user knows to retry
      // Auth errors (user not found, etc.) — show success to prevent enumeration
      if (
        err instanceof Error &&
        (err.name === 'FetchError' || err.message === 'Failed to fetch')
      ) {
        setError('Something went wrong. Please try again.');
      } else {
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-2">
        <div
          className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center"
          aria-live="polite"
        >
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-green-500/10 border border-green-500/20">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Check your email</h2>
          <p className="text-muted-foreground mb-6">
            We sent a password reset link to your email address. The link will expire in 24 hours.
          </p>
          <Link to="/sign-in" className="text-primary hover:underline font-medium">
            &larr; Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-2">
      <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-center mb-4">
          <Link
            to="/"
            className="text-3xl font-bold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded transition"
          >
            myK9Show
          </Link>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold mb-2 text-center">Reset your password</h2>
        <p className="text-muted-foreground text-center mb-6">
          Enter your email and we'll send you a reset link
        </p>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block mb-1 font-medium" htmlFor="email">
              Email address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Mail size={18} />
              </span>
              <input
                type="email"
                id="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full p-2 pl-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                required
              />
            </div>
          </div>
          {error && <div className="text-destructive mb-4 text-center">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 dark:bg-primary/90 dark:text-white dark:hover:bg-primary/80"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Sending...
              </>
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>
        <div className="text-center mt-6">
          <span className="text-muted-foreground">Remember your password? </span>
          <Link to="/sign-in" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
```

- [ ] **Step 2: Run ForgotPasswordPage tests**

Run: `cd apps/myk9show && pnpm test -- --run src/test/pages/ForgotPasswordPage.test.tsx`
Expected: All 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/ForgotPasswordPage.tsx
git commit -m "feat: add ForgotPasswordPage component"
```

---

## Task 3: Sign-in Page Link + Route

**Files:**

- Modify: `apps/myk9show/src/pages/SignInPage.tsx:127-128` (after the `</button>`, before `</form>`)
- Modify: `apps/myk9show/src/App.tsx:17-18` (lazy imports), `App.tsx:263-273` (routes, after `/sign-in`)

- [ ] **Step 1: Add "Forgot your password?" link to SignInPage**

In `SignInPage.tsx`, add after the closing `</button>` tag (line 127) and before `</form>` (line 128):

```tsx
<div className="text-center mt-4">
  <Link to="/forgot-password" className="text-primary hover:underline text-sm font-medium">
    Forgot your password?
  </Link>
</div>
```

Note: `Link` is already imported from `react-router-dom` on line 2.

- [ ] **Step 2: Add lazy import and route in App.tsx**

In `App.tsx`, add after the `SignUpPage` lazy import (line 18):

```tsx
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage'));
```

Add a new `<Route>` after the `/sign-up` route block (after line 273):

```tsx
<Route
  path="/forgot-password"
  element={
    <PageTransition>
      <Suspense fallback={<PageLoadingFallback />}>
        <ForgotPasswordPage />
      </Suspense>
    </PageTransition>
  }
/>
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/pages/SignInPage.tsx apps/myk9show/src/App.tsx
git commit -m "feat: add forgot password link to sign-in and register route"
```

---

## Task 4: SignInPage Link Test

**Files:**

- Create: `apps/myk9show/src/test/pages/SignInPage.test.tsx`

- [ ] **Step 1: Write test for forgot password link**

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignInPage from '@/pages/SignInPage';

// Mock useAuthContext
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    signIn: vi.fn(),
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
});
```

- [ ] **Step 2: Run all tests**

Run: `cd apps/myk9show && pnpm test -- --run src/test/pages/SignInPage.test.tsx src/test/pages/ForgotPasswordPage.test.tsx`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/test/pages/SignInPage.test.tsx
git commit -m "test: add SignInPage forgot password link test"
```

---

## Task 5: Final Verification

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `cd apps/myk9show && pnpm test -- --run`
Expected: All tests pass, no regressions

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev:show`
Verify:

1. Sign-in page at `/sign-in` shows "Forgot your password?" link below button
2. Clicking link navigates to `/forgot-password`
3. Forgot password page renders with email form
4. Submitting email shows "Check your email" success state
5. "Back to sign in" link works

- [ ] **Step 4: Update TO-DOS.md**

Remove or mark complete the "Add Forgot Password to Sign-In" todo entry.

- [ ] **Step 5: Final commit if any cleanup needed**
