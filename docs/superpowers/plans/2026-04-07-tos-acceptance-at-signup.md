# TOS Acceptance at Signup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require all users to agree to the platform's Terms of Service and Privacy Policy before creating an account.

**Architecture:** A checkbox on the signup page gates both the "Sign up" and "Continue with Google" buttons. When a `people` row is created (email or OAuth path), `agreed_to_tos_at` is set to the current timestamp. Placeholder `/terms` and `/privacy` routes render a simple under-construction page.

**Tech Stack:** React, React Router, Supabase (Postgres migration), Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-04-07-tos-acceptance-at-signup-design.md`

---

## File Map

| Action | File                                                         | Responsibility                                                  |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------------- |
| Create | `supabase/migrations/121_add_agreed_to_tos_at.sql`           | Add `agreed_to_tos_at` column to `people`                       |
| Modify | `apps/myk9show/src/hooks/useAuth.ts:42-76,150-160`           | Add `agreed_to_tos_at` to both `people` insert payloads         |
| Modify | `apps/myk9show/src/pages/SignUpPage.tsx:7-258`               | Add checkbox state, disable buttons, render checkbox with links |
| Create | `apps/myk9show/src/pages/LegalPlaceholderPage.tsx`           | Shared placeholder for Terms and Privacy pages                  |
| Modify | `apps/myk9show/src/routes/publicRoutes.tsx:15-25,46`         | Add lazy import + `/terms` and `/privacy` routes                |
| Modify | `apps/myk9show/src/test/auth/useAuth.test.ts:89-132,334-397` | Add `agreed_to_tos_at` assertions to signup and OAuth tests     |
| Modify | `apps/myk9show/src/test/pages/SignUpPage.test.tsx`           | Add checkbox gating tests                                       |
| Create | `apps/myk9show/src/test/pages/LegalPlaceholderPage.test.tsx` | Placeholder page render tests                                   |

---

### Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/121_add_agreed_to_tos_at.sql`

> **Note:** Before creating, verify `121` is the next available number by checking `supabase/migrations/`. If a higher number exists, use the next available.

- [ ] **Step 1: Create migration file**

```sql
-- Add TOS agreement timestamp to people table
ALTER TABLE people
  ADD COLUMN agreed_to_tos_at timestamptz;

COMMENT ON COLUMN people.agreed_to_tos_at IS 'Timestamp when the user agreed to the Terms of Service and Privacy Policy during signup';
```

- [ ] **Step 2: Verify migration syntax**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && grep -c 'agreed_to_tos_at' supabase/migrations/121_add_agreed_to_tos_at.sql`
Expected: `2` (the ALTER and the COMMENT)

- [ ] **Step 3: Regenerate Supabase types** `[ADDED]`

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm supabase gen types typescript --local > packages/supabase/src/database.types.ts`

If the project uses a different types generation command, check `package.json` for a `gen:types` script and use that instead. The goal is for the `people` table type to include `agreed_to_tos_at: string | null`. If the local database isn't running or this step fails, skip it — the insert uses a plain object and won't break at runtime, but type safety is reduced.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/121_add_agreed_to_tos_at.sql packages/supabase/src/database.types.ts
git commit -m "feat: add agreed_to_tos_at column to people table (migration 121)"
```

---

### Task 2: Add `agreed_to_tos_at` to useAuth People Inserts

**Files:**

- Modify: `apps/myk9show/src/hooks/useAuth.ts:44,150`
- Test: `apps/myk9show/src/test/auth/useAuth.test.ts`

- [ ] **Step 1: Write failing test for email signup path**

In `apps/myk9show/src/test/auth/useAuth.test.ts`, add inside the existing `describe('signUp')` block after the last test (after line ~131):

```typescript
it('should include agreed_to_tos_at in people insert payload', async () => {
  const insertChain = {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-person-id' }, error: null }),
      }),
    }),
  };
  const profileInsertChain = {
    insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };

  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'people') return insertChain;
    if (table === 'exhibitor_profiles') return profileInsertChain;
    return createChainableQuery();
  });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signUp('test@example.com', 'password123', {
      firstName: 'Test',
      lastName: 'User',
    });
  });

  expect(insertChain.insert).toHaveBeenCalledWith([
    expect.objectContaining({
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      auth_user_id: 'test-user-id',
      agreed_to_tos_at: expect.any(String),
    }),
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/auth/useAuth.test.ts -t "should include agreed_to_tos_at in people insert payload"`
Expected: FAIL — the insert payload does not contain `agreed_to_tos_at`

- [ ] **Step 3: Write failing test for OAuth path**

In `apps/myk9show/src/test/auth/useAuth.test.ts`, update the existing `'should create people record for first-time OAuth user'` test. Change the assertion at line ~385 from:

```typescript
expect(insertChain.insert).toHaveBeenCalledWith([
  expect.objectContaining({
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'test@example.com',
    auth_user_id: 'test-user-id',
  }),
]);
```

to:

```typescript
expect(insertChain.insert).toHaveBeenCalledWith([
  expect.objectContaining({
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'test@example.com',
    auth_user_id: 'test-user-id',
    agreed_to_tos_at: expect.any(String),
  }),
]);
```

- [ ] **Step 4: Run tests to verify both fail**

Run: `cd apps/myk9show && npx vitest run src/test/auth/useAuth.test.ts`
Expected: 2 failures related to `agreed_to_tos_at`

- [ ] **Step 5: Add `agreed_to_tos_at` to email signup insert**

In `apps/myk9show/src/hooks/useAuth.ts`, in the `signUp` function (~line 150), change the `people` insert from:

```typescript
const { data: newPerson, error: insertError } = await supabase.from('people').insert([
  {
    first_name: metadata?.firstName || 'First',
    last_name: metadata?.lastName || 'Name',
    email: email,
    auth_user_id: data.user.id,
  },
]);
```

to:

```typescript
const { data: newPerson, error: insertError } = await supabase.from('people').insert([
  {
    first_name: metadata?.firstName || 'First',
    last_name: metadata?.lastName || 'Name',
    email: email,
    auth_user_id: data.user.id,
    agreed_to_tos_at: new Date().toISOString(),
  },
]);
```

- [ ] **Step 6: Add `agreed_to_tos_at` to OAuth insert**

In `apps/myk9show/src/hooks/useAuth.ts`, in the `createOAuthPeopleRecord` function (~line 42), change the `people` insert from:

```typescript
const { data: newPerson, error: insertError } = await supabase.from('people').insert([
  {
    first_name: firstName,
    last_name: lastName,
    email: freshUser?.email ?? sessionUser.email ?? null,
    auth_user_id: userId,
  },
]);
```

to:

```typescript
const { data: newPerson, error: insertError } = await supabase.from('people').insert([
  {
    first_name: firstName,
    last_name: lastName,
    email: freshUser?.email ?? sessionUser.email ?? null,
    auth_user_id: userId,
    agreed_to_tos_at: new Date().toISOString(),
  },
]);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/test/auth/useAuth.test.ts`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/hooks/useAuth.ts apps/myk9show/src/test/auth/useAuth.test.ts
git commit -m "feat: record agreed_to_tos_at when creating people records"
```

---

### Task 3: Add TOS Checkbox to SignUpPage

**Files:**

- Modify: `apps/myk9show/src/pages/SignUpPage.tsx`
- Test: `apps/myk9show/src/test/pages/SignUpPage.test.tsx`

- [ ] **Step 1: Write failing tests for checkbox behavior**

Replace the contents of `apps/myk9show/src/test/pages/SignUpPage.test.tsx` with:

```typescript
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from '@/pages/SignUpPage';

const mockSignUp = vi.fn();
const mockSignInWithGoogle = vi.fn();

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    signUp: mockSignUp,
    signInWithGoogle: mockSignInWithGoogle,
    loading: false,
  }),
}));

describe('SignUpPage', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockSignInWithGoogle.mockReset();
  });

  it('renders a Continue with Google button', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('renders an "or" divider between Google button and email form', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  describe('TOS Agreement Checkbox', () => {
    it('renders a TOS agreement checkbox', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(screen.getByText(/I agree to the/)).toBeInTheDocument();
    });

    it('renders links to Terms of Service and Privacy Policy', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      const tosLink = screen.getByRole('link', { name: /terms of service/i });
      const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
      expect(tosLink).toHaveAttribute('href', '/terms');
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });

    it('disables Sign up button when checkbox is unchecked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: /sign up/i })).toBeDisabled();
    });

    it('disables Continue with Google button when checkbox is unchecked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled();
    });

    it('enables Sign up button when checkbox is checked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByRole('checkbox'));
      expect(screen.getByRole('button', { name: /sign up/i })).not.toBeDisabled();
    });

    it('enables Continue with Google button when checkbox is checked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByRole('checkbox'));
      expect(screen.getByRole('button', { name: /continue with google/i })).not.toBeDisabled();
    });

    it('calls signInWithGoogle when Google button is clicked after checkbox is checked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
      expect(mockSignInWithGoogle).toHaveBeenCalled();
    });

    it('does not call signInWithGoogle when Google button is clicked without checkbox', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      // Button is disabled, but verify the mock wasn't called even if someone tries
      const googleBtn = screen.getByRole('button', { name: /continue with google/i });
      fireEvent.click(googleBtn);
      expect(mockSignInWithGoogle).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd apps/myk9show && npx vitest run src/test/pages/SignUpPage.test.tsx`
Expected: Several failures — checkbox doesn't exist yet, buttons aren't disabled

- [ ] **Step 3: Add checkbox state and UI to SignUpPage**

In `apps/myk9show/src/pages/SignUpPage.tsx`:

**a)** Add `Link` to the import from `react-router-dom` (line 2) — it's already imported, confirm it's there.

**b)** Add state after the existing state declarations (after line 17):

```typescript
const [agreedToTerms, setAgreedToTerms] = useState(false);
```

**c)** Change the confirm password wrapper `div` class from `mb-6` to `mb-4` (line 222 in SignUpPage.tsx) to tighten spacing before the checkbox. Then add the checkbox between that `div` and the error message `div`. Insert this block: `[EXPANDED]`

```tsx
<div className="mb-6 flex items-start gap-2">
  <input
    type="checkbox"
    id="agreedToTerms"
    checked={agreedToTerms}
    onChange={e => setAgreedToTerms(e.target.checked)}
    className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
  />
  <label htmlFor="agreedToTerms" className="text-sm text-muted-foreground">
    I agree to the{' '}
    <Link to="/terms" className="text-primary hover:underline">
      Terms of Service
    </Link>{' '}
    and{' '}
    <Link to="/privacy" className="text-primary hover:underline">
      Privacy Policy
    </Link>
  </label>
</div>
```

**d)** Update the "Continue with Google" button disabled prop (line 117) from:

```tsx
          disabled={isLoading || googleLoading}
```

to:

```tsx
          disabled={isLoading || googleLoading || !agreedToTerms}
```

**e)** Update the "Sign up" submit button disabled prop (line 256) from:

```tsx
disabled = { isLoading };
```

to:

```tsx
            disabled={isLoading || !agreedToTerms}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/test/pages/SignUpPage.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/SignUpPage.tsx apps/myk9show/src/test/pages/SignUpPage.test.tsx
git commit -m "feat: add TOS agreement checkbox to signup page"
```

---

### Task 4: Placeholder Legal Pages and Routes

**Files:**

- Create: `apps/myk9show/src/pages/LegalPlaceholderPage.tsx`
- Modify: `apps/myk9show/src/routes/publicRoutes.tsx`
- Create: `apps/myk9show/src/test/pages/LegalPlaceholderPage.test.tsx`

- [ ] **Step 1: Write failing tests for the placeholder page**

Create `apps/myk9show/src/test/pages/LegalPlaceholderPage.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LegalPlaceholderPage from '@/pages/LegalPlaceholderPage';

describe('LegalPlaceholderPage', () => {
  it('renders Terms of Service title', () => {
    render(
      <MemoryRouter>
        <LegalPlaceholderPage title="Terms of Service" />
      </MemoryRouter>
    );
    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
  });

  it('renders Privacy Policy title', () => {
    render(
      <MemoryRouter>
        <LegalPlaceholderPage title="Privacy Policy" />
      </MemoryRouter>
    );
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });

  it('renders placeholder message', () => {
    render(
      <MemoryRouter>
        <LegalPlaceholderPage title="Terms of Service" />
      </MemoryRouter>
    );
    expect(
      screen.getByText('This page is under construction. Please check back soon.')
    ).toBeInTheDocument();
  });

  it('renders a link back to the home page', () => {
    render(
      <MemoryRouter>
        <LegalPlaceholderPage title="Terms of Service" />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /myk9show/i })).toHaveAttribute('href', '/');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/test/pages/LegalPlaceholderPage.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create LegalPlaceholderPage component**

Create `apps/myk9show/src/pages/LegalPlaceholderPage.tsx`:

```tsx
import React from 'react';
import { Link } from 'react-router-dom';

interface LegalPlaceholderPageProps {
  title: string;
}

const LegalPlaceholderPage: React.FC<LegalPlaceholderPageProps> = ({ title }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-2 pt-20">
      <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
        <div className="flex justify-center mb-4">
          <Link
            to="/"
            className="text-3xl font-bold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded transition"
          >
            myK9Show
          </Link>
        </div>
        <h1 className="text-2xl font-bold mb-4">{title}</h1>
        <p className="text-muted-foreground">
          This page is under construction. Please check back soon.
        </p>
      </div>
    </div>
  );
};

export default LegalPlaceholderPage;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/test/pages/LegalPlaceholderPage.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Add routes to publicRoutes.tsx**

In `apps/myk9show/src/routes/publicRoutes.tsx`:

**a)** Add the lazy import after the existing imports (~line 25):

```typescript
const LegalPlaceholderPage = lazy(() => import('@/pages/LegalPlaceholderPage'));
```

**b)** Add the routes inside the `<>` fragment, before the closing `</>` (before line 420). Add after the Messages route block:

```tsx
    {/* Legal Pages — public, no auth required */}
    <Route
      path="/terms"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <LegalPlaceholderPage title="Terms of Service" />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    <Route
      path="/privacy"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <LegalPlaceholderPage title="Privacy Policy" />
          </PageTransition>
        </SuspenseWrapper>
      }
    />
```

- [ ] **Step 6: Run full test suite to verify nothing is broken**

Run: `cd apps/myk9show && npx vitest run src/test/pages/LegalPlaceholderPage.test.tsx src/test/pages/SignUpPage.test.tsx src/test/auth/useAuth.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/LegalPlaceholderPage.tsx apps/myk9show/src/routes/publicRoutes.tsx apps/myk9show/src/test/pages/LegalPlaceholderPage.test.tsx
git commit -m "feat: add placeholder Terms of Service and Privacy Policy pages"
```

---

### Task 5: Typecheck and Final Verification

**Files:**

- No file changes — verification only

- [ ] **Step 1: Run typecheck**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck`
Expected: No new type errors

- [ ] **Step 2: Run lint**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm lint`
Expected: No new lint errors

- [ ] **Step 3: Run all affected tests together**

Run: `cd apps/myk9show && npx vitest run src/test/pages/SignUpPage.test.tsx src/test/pages/LegalPlaceholderPage.test.tsx src/test/auth/useAuth.test.ts`
Expected: All PASS

- [ ] **Step 4: Fix any issues found, then commit if fixes were needed**

If fixes were needed:

```bash
git add -A
git commit -m "fix: address typecheck/lint issues from TOS signup feature"
```
