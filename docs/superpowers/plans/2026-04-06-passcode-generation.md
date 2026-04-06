# myK9Q Passcode Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let secretaries see and share myK9Q access codes (admin/judge/steward/exhibitor) derived from the show UUID, surfaced in the show creation wizard and the Show Settings page.

**Architecture:** Passcodes are derived from `shows.id` (UUID) using a pure client-side function — no DB writes. The `validate-passcode` edge function is updated to derive passcodes from `show.id` instead of `show.license_key`. A new `MyK9QAccessCard` component renders all four codes with copy and print actions.

**Tech Stack:** React, TypeScript, shadcn/ui, `qrcode.react` (already installed), Vitest, Deno (edge function)

---

## File Map

**New files:**

- `apps/myk9show/src/utils/passcodes.ts` — `generatePasscodesFromShowId`, `getExhibitorLoginUrl`
- `apps/myk9show/src/utils/passcodes.test.ts` — unit tests for the above
- `apps/myk9show/src/components/secretary/MyK9QAccessCard.tsx` — card component
- `apps/myk9show/src/components/secretary/MyK9QAccessCard.test.tsx` — component tests

**Modified files:**

- `apps/myk9q/src/utils/auth.ts` — update `generatePasscodesFromLicenseKey` for UUID format
- `apps/myk9q/src/utils/auth.test.ts` — add UUID test cases
- `apps/myk9q/supabase/functions/validate-passcode/index.ts` — update algorithm + derivation source
- `apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx` — add `MyK9QAccessCard`
- `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts` — add `onCreated` callback
- `apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx` — add success overlay

---

## Task 1: Passcode utility (myK9Show)

**Files:**

- Create: `apps/myk9show/src/utils/passcodes.ts`
- Create: `apps/myk9show/src/utils/passcodes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/myk9show/src/utils/passcodes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generatePasscodesFromShowId, getExhibitorLoginUrl } from './passcodes';

const TEST_UUID = '63165809-e025-25c6-6cf9-979f63165809';

describe('generatePasscodesFromShowId', () => {
  it('derives four passcodes from a valid UUID', () => {
    expect(generatePasscodesFromShowId(TEST_UUID)).toEqual({
      admin: 'ae025',
      judge: 'j25c6',
      steward: 's6cf9',
      exhibitor: 'e979f',
    });
  });

  it('returns null for a string with fewer than 5 segments', () => {
    expect(generatePasscodesFromShowId('myK9Q1-d8609f3b-d3fd43aa-6323a604')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(generatePasscodesFromShowId('')).toBeNull();
  });

  it('returns null for a plain string with no hyphens', () => {
    expect(generatePasscodesFromShowId('notauuid')).toBeNull();
  });
});

describe('getExhibitorLoginUrl', () => {
  it('returns the pre-filled myK9Q login URL', () => {
    expect(getExhibitorLoginUrl(TEST_UUID)).toBe('https://app.myk9q.com/login?code=e979f');
  });

  it('returns an empty string for an invalid showId', () => {
    expect(getExhibitorLoginUrl('bad-id')).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/myk9show && npx vitest run src/utils/passcodes.test.ts
```

Expected: FAIL — `Cannot find module './passcodes'`

- [ ] **Step 3: Implement the utility**

Create `apps/myk9show/src/utils/passcodes.ts`:

```typescript
export interface ShowPasscodes {
  admin: string;
  judge: string;
  steward: string;
  exhibitor: string;
}

/**
 * Derives four role passcodes from a show UUID.
 *
 * UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (5 segments)
 *   Admin    → 'a' + segment[1]           (4 hex chars)
 *   Judge    → 'j' + segment[2]           (4 hex chars)
 *   Steward  → 's' + segment[3]           (4 hex chars)
 *   Exhibitor→ 'e' + segment[4].slice(0,4)(first 4 of 12 hex chars)
 */
export function generatePasscodesFromShowId(showId: string): ShowPasscodes | null {
  const parts = showId.split('-');
  if (parts.length !== 5) return null;
  return {
    admin: `a${parts[1]}`,
    judge: `j${parts[2]}`,
    steward: `s${parts[3]}`,
    exhibitor: `e${parts[4].slice(0, 4)}`,
  };
}

/**
 * Returns the pre-filled myK9Q login URL for the exhibitor passcode.
 * Returns '' if showId is not a valid UUID.
 */
export function getExhibitorLoginUrl(showId: string): string {
  const passcodes = generatePasscodesFromShowId(showId);
  if (!passcodes) return '';
  return `https://app.myk9q.com/login?code=${passcodes.exhibitor}`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/utils/passcodes.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/utils/passcodes.ts apps/myk9show/src/utils/passcodes.test.ts
git commit -m "feat: add generatePasscodesFromShowId utility (myK9Show)"
```

---

## Task 2: Update myK9Q auth.ts for UUID format

**Files:**

- Modify: `apps/myk9q/src/utils/auth.ts`
- Modify: `apps/myk9q/src/utils/auth.test.ts`

- [ ] **Step 1: Add UUID test cases to auth.test.ts**

Open `apps/myk9q/src/utils/auth.test.ts` and add a new `describe` block after the existing `generatePasscodesFromLicenseKey` block:

```typescript
describe('generatePasscodesFromLicenseKey — UUID format', () => {
  const uuid = '63165809-e025-25c6-6cf9-979f63165809';

  test('derives correct passcodes from a show UUID', () => {
    expect(generatePasscodesFromLicenseKey(uuid)).toEqual({
      admin: 'ae025',
      judge: 'j25c6',
      steward: 's6cf9',
      exhibitor: 'e979f',
    });
  });

  test('legacy 4-part format still works', () => {
    expect(generatePasscodesFromLicenseKey('myK9Q1-d8609f3b-d3fd43aa-6323a604')).toEqual({
      admin: 'ad860',
      judge: 'j9f3b',
      steward: 'sd3fd',
      exhibitor: 'e6323',
    });
  });

  test('returns null for a 3-segment string', () => {
    expect(generatePasscodesFromLicenseKey('a-b-c')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm UUID tests fail**

```bash
cd apps/myk9q && npm test -- --testPathPattern=utils/auth
```

Expected: the two new UUID tests FAIL, existing tests PASS

- [ ] **Step 3: Update generatePasscodesFromLicenseKey in auth.ts**

In `apps/myk9q/src/utils/auth.ts`, replace the `generatePasscodesFromLicenseKey` function (lines 79–104) with:

```typescript
export function generatePasscodesFromLicenseKey(mobileAppLicKey: string): {
  admin: string;
  judge: string;
  steward: string;
  exhibitor: string;
} | null {
  if (!mobileAppLicKey) return null;

  const parts = mobileAppLicKey.split('-');

  if (parts.length === 5) {
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    return {
      admin: `a${parts[1]}`,
      judge: `j${parts[2]}`,
      steward: `s${parts[3]}`,
      exhibitor: `e${parts[4].slice(0, 4)}`,
    };
  }

  if (parts.length === 4) {
    // Legacy format: myK9Q1-8hex-8hex-8hex
    return {
      admin: `a${parts[1].slice(0, 4)}`,
      judge: `j${parts[1].slice(4, 8)}`,
      steward: `s${parts[2].slice(0, 4)}`,
      exhibitor: `e${parts[3].slice(0, 4)}`,
    };
  }

  return null;
}
```

- [ ] **Step 4: Run all auth tests to confirm they pass**

```bash
cd apps/myk9q && npm test -- --testPathPattern=utils/auth
```

Expected: all tests PASS (existing legacy tests + new UUID tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9q/src/utils/auth.ts apps/myk9q/src/utils/auth.test.ts
git commit -m "feat: update generatePasscodesFromLicenseKey to support UUID format (myK9Q)"
```

---

## Task 3: Update validate-passcode edge function

**Files:**

- Modify: `apps/myk9q/supabase/functions/validate-passcode/index.ts`

This edge function cannot be unit tested automatically. Manual test instructions are at the end of this task.

- [ ] **Step 1: Replace generatePasscodesFromLicenseKey in the edge function**

In `apps/myk9q/supabase/functions/validate-passcode/index.ts`, replace the `generatePasscodesFromLicenseKey` function (lines 88–102) with:

```typescript
// Generate passcodes from show UUID or legacy license key
function generatePasscodesFromLicenseKey(licenseKey: string): {
  admin: string;
  judge: string;
  steward: string;
  exhibitor: string;
} | null {
  if (!licenseKey) return null;

  const parts = licenseKey.split('-');

  if (parts.length === 5) {
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    return {
      admin: `a${parts[1]}`,
      judge: `j${parts[2]}`,
      steward: `s${parts[3]}`,
      exhibitor: `e${parts[4].slice(0, 4)}`,
    };
  }

  if (parts.length === 4) {
    // Legacy format: myK9Q1-8hex-8hex-8hex
    return {
      admin: `a${parts[1].slice(0, 4)}`,
      judge: `j${parts[1].slice(4, 8)}`,
      steward: `s${parts[2].slice(0, 4)}`,
      exhibitor: `e${parts[3].slice(0, 4)}`,
    };
  }

  return null;
}
```

- [ ] **Step 2: Change show fetch query to use platform column names**

Find the shows query (around line 217) and replace it:

```typescript
// Before:
const { data: shows, error: showsError } = await supabaseClient
  .from('shows')
  .select('id, show_name, club_name, start_date, license_key, organization, show_type')
  .order('created_at', { ascending: false });

// After:
const { data: shows, error: showsError } = await supabaseClient
  .from('shows')
  .select('id, name, start_date, organization, type')
  .order('created_at', { ascending: false });
```

- [ ] **Step 3: Update the validation loop to use show.id**

Find the validation loop (around line 241) and change the derivation source:

```typescript
// Before:
for (const show of shows || []) {
  const result = validatePasscodeAgainstLicenseKey(passcode, show.license_key)

// After:
for (const show of shows || []) {
  const result = validatePasscodeAgainstLicenseKey(passcode, show.id)
```

- [ ] **Step 4: Update the debug log and record_login_attempt call**

Find and replace the debug log (around line 232):

```typescript
// Before:
const licenseKeys = shows.map(s => s.license_key?.substring(0, 15) + '...');
console.log(`[Auth] License key prefixes: ${licenseKeys.join(', ')}`);

// After:
const showIds = shows.map((s: { id: string }) => s.id.substring(0, 8) + '...');
console.log(`[Auth] Show ID prefixes: ${showIds.join(', ')}`);
```

Find and replace the `record_login_attempt` call (around line 255):

```typescript
// Before:
p_license_key: matchedShow?.license_key || null,

// After:
p_license_key: matchedShow?.id || null,
```

- [ ] **Step 5: Update the success response**

Find the `showData` construction (around line 281) and replace:

```typescript
// Before:
console.log(`[Auth] Successful login for license: ${matchedShow.license_key.substring(0, 10)}...`);

const showData: ShowData = {
  showId: matchedShow.id.toString(),
  showName: matchedShow.show_name,
  clubName: matchedShow.club_name,
  showDate: matchedShow.start_date,
  licenseKey: matchedShow.license_key,
  org: matchedShow.organization || '',
  competition_type: matchedShow.show_type || 'Regular',
};

// After:
console.log(`[Auth] Successful login for show: ${matchedShow.id.substring(0, 8)}...`);

const showData: ShowData = {
  showId: matchedShow.id,
  showName: matchedShow.name,
  clubName: '',
  showDate: matchedShow.start_date,
  licenseKey: matchedShow.id,
  org: matchedShow.organization || '',
  competition_type: matchedShow.type || 'Regular',
};
```

- [ ] **Step 6: Deploy the edge function**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
npx supabase functions deploy validate-passcode --no-verify-jwt
```

- [ ] **Step 7: Manual test**

Get a show UUID from the database. Derive the exhibitor passcode:

```
UUID: <copy from Supabase shows table>
Exhibitor code: e + first 4 chars of the 5th UUID segment
```

Then POST to the edge function:

```bash
curl -X POST \
  "$(cat apps/myk9q/.env | grep VITE_SUPABASE_URL | cut -d= -f2)/functions/v1/validate-passcode" \
  -H "Content-Type: application/json" \
  -H "apikey: $(cat apps/myk9q/.env | grep VITE_SUPABASE_ANON_KEY | cut -d= -f2)" \
  -d '{"passcode":"e<4-hex-chars>"}'
```

Expected: `{"success":true,"role":"exhibitor","showData":{...}}`

- [ ] **Step 8: Commit**

```bash
git add apps/myk9q/supabase/functions/validate-passcode/index.ts
git commit -m "feat: update validate-passcode edge function to derive passcodes from show UUID"
```

---

## Task 4: MyK9QAccessCard component

**Files:**

- Create: `apps/myk9show/src/components/secretary/MyK9QAccessCard.tsx`
- Create: `apps/myk9show/src/components/secretary/MyK9QAccessCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/myk9show/src/components/secretary/MyK9QAccessCard.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/testUtils';
import { MyK9QAccessCard } from './MyK9QAccessCard';

// Stable test UUID — segments: [63165809, e025, 25c6, 6cf9, 979f63165809]
const TEST_SHOW_ID = '63165809-e025-25c6-6cf9-979f63165809';

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <svg data-testid="qr-code" />,
}));

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  vi.spyOn(window, 'open').mockReturnValue({
    document: { write: vi.fn(), close: vi.fn() },
    focus: vi.fn(),
    print: vi.fn(),
  } as unknown as Window);
});

describe('MyK9QAccessCard', () => {
  it('renders all four passcodes', () => {
    renderWithProviders(<MyK9QAccessCard showId={TEST_SHOW_ID} />);
    expect(screen.getByText('ae025')).toBeInTheDocument();
    expect(screen.getByText('j25c6')).toBeInTheDocument();
    expect(screen.getByText('s6cf9')).toBeInTheDocument();
    expect(screen.getByText('e979f')).toBeInTheDocument();
  });

  it('copies admin code to clipboard', async () => {
    renderWithProviders(<MyK9QAccessCard showId={TEST_SHOW_ID} />);
    const copyButtons = screen.getAllByRole('button', { name: /copy/i });
    await userEvent.click(copyButtons[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ae025');
  });

  it('copies exhibitor login link to clipboard', async () => {
    renderWithProviders(<MyK9QAccessCard showId={TEST_SHOW_ID} />);
    await userEvent.click(screen.getByRole('button', { name: /copy link/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://app.myk9q.com/login?code=e979f'
    );
  });

  it('opens a print window for the exhibitor slip', async () => {
    renderWithProviders(<MyK9QAccessCard showId={TEST_SHOW_ID} showName="Spring Trial" />);
    await userEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(window.open).toHaveBeenCalledWith('', '_blank', expect.any(String));
  });

  it('renders nothing for an invalid showId', () => {
    const { container } = renderWithProviders(<MyK9QAccessCard showId="not-a-uuid" />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/myk9show && npx vitest run src/components/secretary/MyK9QAccessCard.test.tsx
```

Expected: FAIL — `Cannot find module './MyK9QAccessCard'`

- [ ] **Step 3: Implement the component**

Create `apps/myk9show/src/components/secretary/MyK9QAccessCard.tsx`:

```typescript
import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Link, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { notifications } from '@/lib/notifications';
import { generatePasscodesFromShowId, getExhibitorLoginUrl } from '@/utils/passcodes';

interface MyK9QAccessCardProps {
  showId: string;
  showName?: string;
  showDate?: string;
}

export function MyK9QAccessCard({ showId, showName, showDate }: MyK9QAccessCardProps) {
  const passcodes = generatePasscodesFromShowId(showId);
  const exhibitorUrl = getExhibitorLoginUrl(showId);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  if (!passcodes) return null;

  async function copyToClipboard(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    notifications.success(`${label} copied`);
  }

  function printSlip() {
    const svgMarkup = qrContainerRef.current?.innerHTML ?? '';
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>myK9Q Access — ${showName ?? 'Show'}</title>
  <style>
    body{font-family:sans-serif;display:flex;justify-content:center;padding:32px}
    .slip{border:2px dashed #ccc;border-radius:12px;padding:24px;width:280px;text-align:center}
    .show-name{font-size:18px;font-weight:bold;margin-bottom:4px}
    .show-date{font-size:13px;color:#666;margin-bottom:16px}
    .qr{margin:0 auto 16px}
    .code{font-family:monospace;font-size:28px;font-weight:bold;letter-spacing:4px;margin-bottom:8px}
    .url{font-size:11px;color:#888}
    @media print{body{padding:0}}
  </style>
</head>
<body>
  <div class="slip">
    <div class="show-name">${showName ?? 'Dog Show'}</div>
    ${showDate ? `<div class="show-date">${showDate}</div>` : ''}
    <div class="qr">${svgMarkup}</div>
    <div class="code">${passcodes.exhibitor}</div>
    <div class="url">app.myk9q.com</div>
  </div>
</body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  const rows = [
    { role: 'Admin',    code: passcodes.admin,     isExhibitor: false },
    { role: 'Judge',    code: passcodes.judge,     isExhibitor: false },
    { role: 'Steward',  code: passcodes.steward,   isExhibitor: false },
    { role: 'Exhibitor',code: passcodes.exhibitor, isExhibitor: true  },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>myK9Q Access Codes</CardTitle>
        <CardDescription>
          Share these with your team to access this show in the myK9Q ringside app
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Hidden QR SVG used by printSlip */}
        <div ref={qrContainerRef} className="hidden">
          <QRCodeSVG value={exhibitorUrl} size={80} />
        </div>

        {rows.map(({ role, code, isExhibitor }) => (
          <div
            key={role}
            className="flex items-center justify-between gap-2 rounded-lg border p-3"
          >
            <div className="flex items-center gap-3">
              <span className="w-16 text-sm font-medium">{role}</span>
              <code className="rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                {code}
              </code>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Copy ${role} code`}
                onClick={() => copyToClipboard(code, `${role} code`)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              {isExhibitor && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Copy link"
                    onClick={() => copyToClipboard(exhibitorUrl, 'Login link')}
                  >
                    <Link className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Print slip"
                    onClick={printSlip}
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/components/secretary/MyK9QAccessCard.test.tsx
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/secretary/MyK9QAccessCard.tsx \
        apps/myk9show/src/components/secretary/MyK9QAccessCard.test.tsx
git commit -m "feat: add MyK9QAccessCard component with copy and print slip"
```

---

## Task 5: Add MyK9QAccessCard to ShowSettingsPage

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx`

- [ ] **Step 1: Add the import and render the card**

In `apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx`:

Add import at the top with the other imports:

```typescript
import { MyK9QAccessCard } from '@/components/secretary/MyK9QAccessCard';
```

Add the card at the bottom of the container div, after the `<WaitListSettingsCard>`:

```typescript
{/* myK9Q Access Codes */}
{selectedShowId && (
  <MyK9QAccessCard
    showId={selectedShowId}
    showName={selectedShow?.name}
  />
)}
```

- [ ] **Step 2: Run the existing ShowSettingsPage tests**

```bash
cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ShowSettingsPage.test.tsx
```

Expected: all existing tests PASS (no tests check for the new card — that's fine)

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx
git commit -m "feat: add myK9Q access codes card to ShowSettingsPage"
```

---

## Task 6: Wizard success screen

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`
- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx`

- [ ] **Step 1: Add onCreated callback to useShowCreationWizardActions**

In `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`:

Update the options interface (around line 71):

```typescript
interface UseShowCreationWizardActionsOptions {
  editMode?: EditMode | undefined;
  setIsLoading: (loading: boolean) => void;
  onCreated?: (showId: string, showName: string) => void;
}
```

Update the function signature (around line 76) to destructure `onCreated`:

```typescript
export function useShowCreationWizardActions({
  editMode,
  setIsLoading,
  onCreated,
}: UseShowCreationWizardActionsOptions) {
```

Find the navigation block inside `saveShow` (around line 340) and replace the non-draft path:

```typescript
// Navigate: drafts go to show detail, created shows go to pipeline (mission control)
if (status === 'draft') {
  navigate(`/shows/${realShowId}`);
} else if (onCreated) {
  onCreated(realShowId, savedShow.name);
} else {
  navigate('/secretary/dashboard');
}
```

- [ ] **Step 2: Add createdShow state and success overlay to ShowCreationWizardPage**

In `apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx`:

Add import at the top with the other imports:

```typescript
import { CheckCircle } from 'lucide-react';
import { MyK9QAccessCard } from '@/components/secretary/MyK9QAccessCard';
```

Add the `createdShow` state after the other `useState` calls (around line 37):

```typescript
const [createdShow, setCreatedShow] = useState<{ id: string; name: string } | null>(null);
```

Pass `onCreated` to the hook (around line 72):

```typescript
const { handleSaveDraft, handleCreateShow, handleCreateAndPublish, handleSaveProgress } =
  useShowCreationWizardActions({
    editMode,
    setIsLoading,
    onCreated: (id, name) => setCreatedShow({ id, name }),
  });
```

Add the success overlay as the first child inside the outermost `<div className="min-h-screen bg-background">` wrapper (before the header div):

```typescript
{/* Success overlay — shown after show creation, before navigating away */}
{createdShow && (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background p-8">
    <CheckCircle className="h-16 w-16 text-green-500" />
    <div className="text-center">
      <h1 className="text-3xl font-bold">Show Created!</h1>
      <p className="mt-1 text-muted-foreground">{createdShow.name}</p>
    </div>
    <div className="w-full max-w-md">
      <MyK9QAccessCard showId={createdShow.id} showName={createdShow.name} />
    </div>
    <Button
      size="lg"
      onClick={() => {
        setCreatedShow(null);
        resetWizard();
        navigate('/secretary/dashboard');
      }}
    >
      Go to Dashboard
    </Button>
  </div>
)}
```

Note: `resetWizard` and `navigate` are already in scope in `ShowCreationWizardPage`.

- [ ] **Step 3: Write tests for the success overlay**

Create `apps/myk9show/src/pages/secretary/__tests__/ShowCreationWizardPage.success.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, act } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/testUtils';
import ShowCreationWizardPage from '../ShowCreationWizardPage';

// Capture the onCreated callback the page passes to the hook so we can
// trigger it directly in tests — avoids navigating through wizard steps.
let capturedOnCreated: ((id: string, name: string) => void) | undefined;

vi.mock('@/pages/secretary/ShowCreationWizard/useShowCreationWizardActions', () => ({
  useShowCreationWizardActions: (opts: {
    onCreated?: (id: string, name: string) => void;
    setIsLoading: (v: boolean) => void;
  }) => {
    capturedOnCreated = opts.onCreated;
    return {
      handleSaveDraft: vi.fn(),
      handleCreateShow: vi.fn(),
      handleCreateAndPublish: vi.fn(),
      handleSaveProgress: vi.fn(),
    };
  },
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <svg data-testid="qr-code" />,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
}));

describe('ShowCreationWizardPage success overlay', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    capturedOnCreated = undefined;
  });

  it('shows the success overlay with passcodes after show creation', () => {
    renderWithProviders(<ShowCreationWizardPage />);

    // Simulate the hook calling onCreated after a successful save
    act(() => {
      capturedOnCreated?.('63165809-e025-25c6-6cf9-979f63165809', 'Spring Trial');
    });

    expect(screen.getByText('Show Created!')).toBeInTheDocument();
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
    expect(screen.getByText('ae025')).toBeInTheDocument();
    expect(screen.getByText('j25c6')).toBeInTheDocument();
    expect(screen.getByText('s6cf9')).toBeInTheDocument();
    expect(screen.getByText('e979f')).toBeInTheDocument();
  });

  it('navigates to the dashboard when Go to Dashboard is clicked', async () => {
    renderWithProviders(<ShowCreationWizardPage />);

    act(() => {
      capturedOnCreated?.('63165809-e025-25c6-6cf9-979f63165809', 'Spring Trial');
    });

    await userEvent.click(screen.getByRole('button', { name: /go to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/secretary/dashboard');
  });
});
```

- [ ] **Step 4: Run the tests**

```bash
cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ShowCreationWizardPage.success.test.tsx
```

Expected: both tests PASS

- [ ] **Step 5: Run the full myK9Show test suite**

```bash
cd apps/myk9show && pnpm test
```

Expected: all tests pass (or pre-existing failures only — do not introduce new failures)

- [ ] **Step 6: Commit**

```bash
git add \
  apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts \
  apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx \
  apps/myk9show/src/pages/secretary/__tests__/ShowCreationWizardPage.success.test.tsx
git commit -m "feat: show myK9Q access codes on wizard success screen"
```
