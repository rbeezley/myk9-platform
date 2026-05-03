# Early Adopter Exhibitor Release — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Release a polished exhibitor experience on myK9Show — dog management, title tracking, training journal, health records, and pedigree — for early adopters while show-related features show "coming soon" screens.

**Architecture:** Feature flags config + ComingSoonPage gate show-related routes. Early adopter boolean on `exhibitor_profiles` bypasses the BlurGate premium lock. A new Log Qualifying Score dialog wires into the existing `useCreateManualResultMutation` and surfaces from the Title Progress tab.

**Tech Stack:** React, TypeScript, Supabase, React Query, shadcn/ui, vitest. AKC Scent Work titles already seeded (migration 031). Test with `cd apps/myk9show && npx vitest run <path>`. Always use the custom render from `src/test/utils/testUtils.tsx`.

**Design doc:** `docs/plans/2026-05-02-title-tracker-design.md`

---

### Task 1: Feature Flags Config

**Files:**
- Create: `apps/myk9show/src/config/features.ts`
- Create: `apps/myk9show/src/config/__tests__/features.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/myk9show/src/config/__tests__/features.test.ts
import { describe, it, expect } from 'vitest';
import { features } from '../features';

describe('features', () => {
  it('exposes all expected keys', () => {
    expect(features).toHaveProperty('browseShows');
    expect(features).toHaveProperty('showRegistration');
    expect(features).toHaveProperty('myEntries');
    expect(features).toHaveProperty('calendar');
    expect(features).toHaveProperty('showDay');
    expect(features).toHaveProperty('analytics');
    expect(features).toHaveProperty('competitionsTab');
    expect(features).toHaveProperty('statisticsTab');
    expect(features).toHaveProperty('titleTracking');
    expect(features).toHaveProperty('trainingJournal');
    expect(features).toHaveProperty('healthRecords');
    expect(features).toHaveProperty('pedigree');
  });

  it('show-related flags are off by default', () => {
    expect(features.browseShows).toBe(false);
    expect(features.showRegistration).toBe(false);
    expect(features.myEntries).toBe(false);
    expect(features.calendar).toBe(false);
    expect(features.showDay).toBe(false);
    expect(features.analytics).toBe(false);
    expect(features.competitionsTab).toBe(false);
    expect(features.statisticsTab).toBe(false);
  });

  it('dog tool flags are on by default', () => {
    expect(features.titleTracking).toBe(true);
    expect(features.trainingJournal).toBe(true);
    expect(features.healthRecords).toBe(true);
    expect(features.pedigree).toBe(true);
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/config/__tests__/features.test.ts
```
Expected: FAIL — `Cannot find module '../features'`

**Step 3: Create the config file**

```typescript
// apps/myk9show/src/config/features.ts
export const features = {
  // Dog tools — live for early adopters
  titleTracking: true,
  trainingJournal: true,
  healthRecords: true,
  pedigree: true,

  // Dog Details tabs — hidden until show management is ready
  competitionsTab: false,
  statisticsTab: false,

  // Show management — coming soon
  browseShows: false,
  showRegistration: false,
  myEntries: false,
  calendar: false,
  showDay: false,
  analytics: false,
} as const;

export type Features = typeof features;
```

**Step 4: Run test to confirm it passes**

```bash
cd apps/myk9show && npx vitest run src/config/__tests__/features.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/myk9show/src/config/features.ts apps/myk9show/src/config/__tests__/features.test.ts
git commit -m "feat(early-adopter): add feature flags config"
```

---

### Task 2: Coming Soon Component

**Files:**
- Create: `apps/myk9show/src/components/common/ComingSoonPage.tsx`
- Create: `apps/myk9show/src/components/common/__tests__/ComingSoonPage.test.tsx`

**Step 1: Write the failing test**

```typescript
// apps/myk9show/src/components/common/__tests__/ComingSoonPage.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComingSoonPage } from '../ComingSoonPage';

describe('ComingSoonPage', () => {
  it('renders the title', () => {
    render(<ComingSoonPage title="Browse Shows" description="Coming soon." />);
    expect(screen.getByText('Browse Shows')).toBeInTheDocument();
  });

  it('renders the description', () => {
    render(<ComingSoonPage title="Browse Shows" description="Coming soon." />);
    expect(screen.getByText('Coming soon.')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/components/common/__tests__/ComingSoonPage.test.tsx
```
Expected: FAIL — `Cannot find module '../ComingSoonPage'`

**Step 3: Create the component**

```tsx
// apps/myk9show/src/components/common/ComingSoonPage.tsx
import { Clock } from 'lucide-react';

interface ComingSoonPageProps {
  title: string;
  description: string;
}

export function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="p-4 rounded-full bg-muted mb-6">
        <Clock className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="text-2xl font-semibold mb-3">{title}</h2>
      <p className="text-muted-foreground max-w-md">{description}</p>
    </div>
  );
}
```

**Step 4: Run test to confirm it passes**

```bash
cd apps/myk9show && npx vitest run src/components/common/__tests__/ComingSoonPage.test.tsx
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/myk9show/src/components/common/ComingSoonPage.tsx apps/myk9show/src/components/common/__tests__/ComingSoonPage.test.tsx
git commit -m "feat(early-adopter): add ComingSoonPage component"
```

---

### Task 3: Wire Feature Flags into Routes

**Files:**
- Modify: `apps/myk9show/src/routes/publicRoutes.tsx`

**Step 1: Add imports at the top of publicRoutes.tsx**

After the existing imports, add:

```typescript
import { features } from '@/config/features';
import { ComingSoonPage } from '@/components/common/ComingSoonPage';
```

**Step 2: Gate the `/shows` route**

Find the `/shows` route and wrap the inner component:

```tsx
// Before:
<BrowseShowsPage />

// After:
{features.browseShows ? <BrowseShowsPage /> : (
  <ComingSoonPage
    title="Browse Shows"
    description="Show discovery and entry management is coming soon. Your dogs and training data will be ready and waiting when it arrives."
  />
)}
```

**Step 3: Gate the remaining show-related routes**

Apply the same pattern to each flagged route. Replace the inner page component (leave `SuspenseWrapper`, `PageTransition`, and `ProtectedRoute` wrappers intact):

| Route | Flag | Coming Soon Title |
|---|---|---|
| `/shows/:id` | `browseShows` | `"Show Details"` |
| `/shows/:showId/register` | `showRegistration` | `"Show Registration"` |
| `/exhibitor/entries` and `/my-entries` | `myEntries` | `"My Entries"` |
| `/exhibitor/show-day` | `showDay` | `"Show Day"` |
| `/exhibitor/analytics` | `analytics` | `"Analytics"` |
| `/calendar` | `calendar` | `"Calendar"` |

Description for all: `"Show entry and competition management is coming soon. Your dogs and training data will be ready and waiting when it arrives."`

**Step 4: Run typecheck to confirm no errors**

```bash
cd apps/myk9show && npx tsc --noEmit
```
Expected: no errors

**Step 5: Nav/sidebar visibility decision**

For the early adopter release, leave sidebar nav links visible — clicking a gated link shows the "Coming Soon" screen. This signals future roadmap features without dead-end errors. If the product decision changes to hide nav items entirely, apply `features.browseShows` etc. to the sidebar nav item definitions as a follow-up task.

**Step 6: Commit**

```bash
git add apps/myk9show/src/routes/publicRoutes.tsx
git commit -m "feat(early-adopter): gate show-related routes behind feature flags"
```

---

### Task 4: Gate Dog Details Tabs

**Files:**
- Modify: `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx`
- Test: `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.test.tsx`

**Step 1: Write the failing test**

Open `DogDetailsTabs.test.tsx` and add two new test cases:

```typescript
it('does not render competitions tab when feature flag is off', () => {
  // Mock features.competitionsTab = false (default)
  render(<DogDetailsTabs dog={mockDog} />);
  expect(screen.queryByText('Competitions')).not.toBeInTheDocument();
});

it('does not render statistics tab when feature flag is off', () => {
  render(<DogDetailsTabs dog={mockDog} />);
  expect(screen.queryByText('Statistics')).not.toBeInTheDocument();
});
```

**Step 2: Run tests to confirm they fail**

```bash
cd apps/myk9show && npx vitest run src/components/dogs/DogDetailsMain/DogDetailsTabs.test.tsx
```
Expected: FAIL — both tabs currently visible

**Step 3: Add feature flag import and gate the tabs**

At the top of `DogDetailsTabs.tsx`, add:

```typescript
import { features } from '@/config/features';
```

**Important:** The `useMemo` has two branches — the secretary early return and the exhibitor array. The feature-flag gates apply **only in the exhibitor array** (the `return [...]` after the `if (isSecretary)` block). Do not modify the secretary branch.

Replace the exhibitor-only `return [...]` with:

```typescript
// Exhibitor tabs — ONLY inside the non-secretary branch, after the isSecretary early return
const showLock = !isLoading && !isPremium;
return [
  ...base,
  ...(features.competitionsTab ? [{ id: 'competitions', label: 'Competitions', icon: Trophy }] : []),
  { id: 'title-progress', label: 'Title Progress', icon: Crown, locked: showLock },
  ...(features.statisticsTab ? [{ id: 'statistics', label: 'Statistics', icon: BarChart3, locked: showLock }] : []),
  { id: 'health-records', label: 'Health Records', icon: Stethoscope, locked: showLock },
  { id: 'training-journal', label: 'Training Journal', icon: BookOpen, locked: showLock },
  { id: 'pedigree', label: 'Pedigree', icon: GitBranch, locked: showLock },
];
```

Note: `title-progress` is **not** gated by a feature flag — it stays visible but BlurGate-locked until Task 5 unlocks it for early adopters.

Also wrap the corresponding `<TabsContent>` blocks:

```tsx
{features.competitionsTab && !isSecretary && (
  <TabsContent value="competitions" className="pt-6">
    ...
  </TabsContent>
)}

{features.statisticsTab && !isSecretary && (
  <TabsContent value="statistics" className="pt-6">
    ...
  </TabsContent>
)}
```

**Step 4: Run tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/components/dogs/DogDetailsMain/DogDetailsTabs.test.tsx
```
Expected: all tests PASS

**Step 5: Commit**

```bash
git add apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.test.tsx
git commit -m "feat(early-adopter): gate competitions and statistics tabs behind feature flags"
```

---

### Task 5: Early Adopter Flag Migration

**Files:**
- Create: `supabase/migrations/185_early_adopter_flag.sql`
- Modify: `apps/myk9show/src/hooks/useExhibitorProfile.ts`
- Modify: `apps/myk9show/src/hooks/useSubscriptionGate.ts`
- Create: `apps/myk9show/src/hooks/__tests__/useSubscriptionGate.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/myk9show/src/hooks/__tests__/useSubscriptionGate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSubscriptionGate } from '../useSubscriptionGate';

vi.mock('../useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({
    profile: {
      subscription_tier: 'free',
      subscription_expires_at: null,
      is_early_adopter: true,
    },
    isLoading: false,
  }),
}));

describe('useSubscriptionGate', () => {
  it('treats early adopters as premium', () => {
    const { result } = renderHook(() => useSubscriptionGate());
    expect(result.current.isPremium).toBe(true);
  });

  it('exposes isEarlyAdopter flag', () => {
    const { result } = renderHook(() => useSubscriptionGate());
    expect(result.current.isEarlyAdopter).toBe(true);
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/useSubscriptionGate.test.ts
```
Expected: FAIL — `isEarlyAdopter` does not exist, `isPremium` is false for free tier

**Step 2.5: Verify RLS before writing migration**

Confirm the existing `exhibitor_profiles` SELECT policy uses `SELECT *` (not an explicit column list) — if it does, the new column is automatically included after migration. Check in the Supabase dashboard under Authentication → Policies → exhibitor_profiles, or run:

```sql
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'exhibitor_profiles';
```

If any policy has an explicit column list, add `is_early_adopter` to it.

**Step 3: Create the migration**

> **Note:** The next available migration number is `185`. Migration `184` is already taken by `184_shows_cc_secretary_toggle.sql`.

```sql
-- supabase/migrations/185_early_adopter_flag.sql
-- Adds is_early_adopter flag to exhibitor_profiles.
-- Early adopters receive free premium access to dog management tools
-- during the pre-launch period. Set manually via Supabase dashboard.

ALTER TABLE exhibitor_profiles
  ADD COLUMN IF NOT EXISTS is_early_adopter BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS exhibitor_profiles_early_adopter_idx
  ON exhibitor_profiles(is_early_adopter)
  WHERE is_early_adopter = TRUE;

-- Rollback (run manually if needed):
-- ALTER TABLE exhibitor_profiles DROP COLUMN IF EXISTS is_early_adopter;
-- DROP INDEX IF EXISTS exhibitor_profiles_early_adopter_idx;
```

**Step 4: Update ExhibitorProfile type**

In `apps/myk9show/src/hooks/useExhibitorProfile.ts`, add `is_early_adopter` to the `ExhibitorProfile` interface:

```typescript
export interface ExhibitorProfile {
  // ... existing fields ...
  is_early_adopter: boolean;  // add this line
}
```

In `mapToExhibitorProfile`, add:

```typescript
is_early_adopter: (data.is_early_adopter as boolean) ?? false,
```

**Step 5: Update useSubscriptionGate**

In `apps/myk9show/src/hooks/useSubscriptionGate.ts`, update the hook:

```typescript
export function useSubscriptionGate(options?: SubscriptionGateOptions) {
  const { profile, isLoading } = useExhibitorProfile();

  const isEarlyAdopter = profile?.is_early_adopter ?? false;
  const rawTier: PlanType = profile?.subscription_tier ?? 'free';
  const expiresAt = profile?.subscription_expires_at;

  const isExpired = rawTier === 'premium' && (!expiresAt || new Date(expiresAt) < new Date());
  const paidTier: PlanType = isExpired ? 'free' : rawTier;
  const isPaidPremium = paidTier === 'premium';

  const isInTrial =
    !isPaidPremium &&
    !isExpired &&
    options?.trialShowCount !== undefined &&
    options.trialShowCount <= TRIAL_SHOW_LIMIT;

  const tier: PlanType = isPaidPremium || isInTrial || isEarlyAdopter ? 'premium' : 'free';

  return {
    tier,
    isPremium: tier === 'premium',
    isExpired,
    isInTrial,
    isEarlyAdopter,
    isLoading,
  } as const;
}
```

**Step 6: Run tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/useSubscriptionGate.test.ts
```
Expected: PASS

**Step 7: Push migration**

```bash
source .env.local && npx supabase db push --db-url "postgresql://postgres.sojmvhhwsjxmfistvzbe:${SUPABASE_DB_PASSWORD}@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
```

**Step 8: Commit**

```bash
git add supabase/migrations/185_early_adopter_flag.sql apps/myk9show/src/hooks/useExhibitorProfile.ts apps/myk9show/src/hooks/useSubscriptionGate.ts apps/myk9show/src/hooks/__tests__/useSubscriptionGate.test.ts
git commit -m "feat(early-adopter): add is_early_adopter flag — bypasses premium BlurGate"
```

---

### Task 6: My Dogs Page Heading

`useRoleBasedDogs` already filters to the exhibitor's own dogs. The only change needed is showing "My Dogs" as the page heading for exhibitors instead of "Browse Dogs."

**Files:**
- Modify: `apps/myk9show/src/pages/BrowseDogsPage.tsx`
- Test: `apps/myk9show/src/pages/__tests__/BrowseDogsPage.test.tsx` (create if missing)

**Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/__tests__/BrowseDogsPage.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import BrowseDogsPage from '../BrowseDogsPage';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    getUserRoles: () => ['exhibitor'],
    userWithRoles: { id: 'user-1', roles: ['exhibitor'] },
    hasRole: (role: string) => role === 'exhibitor',
  }),
  getPrimaryRole: () => 'exhibitor',
}));

vi.mock('@/hooks/useBrowseDogsData', () => ({
  useBrowseDogsData: () => ({
    dogs: [],
    filteredDogs: [],
    isLoading: false,
    hasError: false,
    handleRetry: vi.fn(),
    filters: { search: '', breed: 'all', sex: 'all' },
    setFilters: vi.fn(),
    hasActiveFilters: false,
    clearAllFilters: vi.fn(),
    availableBreeds: [],
  }),
}));

describe('BrowseDogsPage', () => {
  it('shows "My Dogs" heading for exhibitors', () => {
    render(<BrowseDogsPage />);
    expect(screen.getByText('My Dogs')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/pages/__tests__/BrowseDogsPage.test.tsx
```
Expected: FAIL — heading does not say "My Dogs"

**Step 3: Add role-aware heading to BrowseDogsPage**

In `BrowseDogsPage.tsx`, use the existing `getPrimaryRole` and `getUserRoles` that are already imported:

```typescript
const roles = getUserRoles();
const isExhibitor = getPrimaryRole(roles) === 'exhibitor';
const pageTitle = isExhibitor ? 'My Dogs' : 'Dogs';
```

Pass `pageTitle` to the `<PageHeader>` title prop (check the exact prop name in the existing code and use it).

**Step 4: Run test to confirm it passes**

```bash
cd apps/myk9show && npx vitest run src/pages/__tests__/BrowseDogsPage.test.tsx
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/myk9show/src/pages/BrowseDogsPage.tsx apps/myk9show/src/pages/__tests__/BrowseDogsPage.test.tsx
git commit -m "feat(early-adopter): show My Dogs heading for exhibitor role"
```

---

### Task 7: Log Qualifying Score Dialog

Exhibitors need a way to manually add qualifying legs from the Title Progress tab. The existing `useCreateManualResultMutation` handles the write — this task builds the form UI.

**Files:**
- Create: `apps/myk9show/src/components/dogs/DogDetails/TitleTracking/LogQualifyingScoreDialog.tsx`
- Create: `apps/myk9show/src/components/dogs/DogDetails/TitleTracking/__tests__/LogQualifyingScoreDialog.test.tsx`

**Step 1: Write the failing test**

```typescript
// .../__tests__/LogQualifyingScoreDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { LogQualifyingScoreDialog } from '../LogQualifyingScoreDialog';

const mockCreate = vi.fn();
vi.mock('@/hooks/queries/useManualResultsDatabase', () => ({
  useCreateManualResultMutation: () => ({ mutate: mockCreate, isPending: false }),
}));
vi.mock('@/hooks/queries/useSportTemplates', () => ({
  useSportTemplatesQuery: () => ({ data: [{ id: 'akc-sw-id', sport_code: 'akc-scent-work', organization: 'AKC', sport_name: 'Scent Work', elements: ['Container', 'Interior', 'Exterior', 'Buried'], levels: ['Novice', 'Advanced', 'Excellent', 'Master'] }] }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

describe('LogQualifyingScoreDialog', () => {
  const defaultProps = {
    dogId: 'dog-1',
    open: true,
    onOpenChange: vi.fn(),
    defaultElement: 'Container',
    defaultLevel: 'Novice',
  };

  it('renders element and level pre-filled', () => {
    render(<LogQualifyingScoreDialog {...defaultProps} />);
    expect(screen.getByDisplayValue('Container')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Novice')).toBeInTheDocument();
  });

  it('requires show name before submitting', async () => {
    render(<LogQualifyingScoreDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  it('disables Save when sport template is unavailable', () => {
    vi.mocked(useSportTemplatesQuery).mockReturnValueOnce({ data: [] } as ReturnType<typeof useSportTemplatesQuery>);
    render(<LogQualifyingScoreDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('calls createMutation with correct data on submit', async () => {
    render(<LogQualifyingScoreDialog {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText(/show name/i), {
      target: { value: 'AKC Spring Trial 2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          dog_id: 'dog-1',
          element: 'Container',
          level: 'Novice',
          show_name: 'AKC Spring Trial 2026',
          result_status: 'qualified',
          source: 'manual',
        })
      );
    });
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/components/dogs/DogDetails/TitleTracking/__tests__/LogQualifyingScoreDialog.test.tsx
```
Expected: FAIL

**Step 3: Create the dialog component**

```tsx
// LogQualifyingScoreDialog.tsx
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateManualResultMutation } from '@/hooks/queries/useManualResultsDatabase';
import { useSportTemplatesQuery } from '@/hooks/queries/useSportTemplates';
import { useAuthContext } from '@/hooks/useAuthContext';

interface LogQualifyingScoreDialogProps {
  dogId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultElement?: string;
  defaultLevel?: string;
}

const ELEMENTS = ['Container', 'Interior', 'Exterior', 'Buried'];
const LEVELS = ['Novice', 'Advanced', 'Excellent', 'Master'];
const PLACEMENTS = ['1st', '2nd', '3rd', '4th+'];

export function LogQualifyingScoreDialog({
  dogId,
  open,
  onOpenChange,
  defaultElement = '',
  defaultLevel = '',
}: LogQualifyingScoreDialogProps) {
  const { user } = useAuthContext();
  const { data: templates = [] } = useSportTemplatesQuery();
  const { mutate: createResult, isPending } = useCreateManualResultMutation();

  const [element, setElement] = useState(defaultElement);
  const [level, setLevel] = useState(defaultLevel);
  const [showName, setShowName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [placement, setPlacement] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const akcTemplate = templates.find(t => t.sport_code === 'akc-scent-work');

  const templateMissing = !akcTemplate;

  const handleSubmit = () => {
    if (!showName.trim()) {
      setError('Show name is required.');
      return;
    }
    if (!user?.id || !akcTemplate) return;

    setError('');
    createResult(
      {
        dog_id: dogId,
        owner_id: user.id,
        organization: 'AKC',
        sport_template_id: akcTemplate.id,
        element,
        level,
        show_name: showName.trim(),
        trial_date: date,
        judge: null,
        location: null,
        section: null,
        result_status: 'qualified',
        search_time_seconds: null,
        placement: placement ? PLACEMENTS.indexOf(placement) + 1 : null,
        points_earned: 0,
        notes: notes.trim() || null,
        source: 'manual',
      },
      {
        onSuccess: () => {
          setShowName('');
          setNotes('');
          setPlacement('');
          setDate(new Date().toISOString().split('T')[0]);
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Qualifying Score</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Element</Label>
              <Select value={element} onValueChange={setElement}>
                <SelectTrigger>
                  <SelectValue placeholder="Element" />
                </SelectTrigger>
                <SelectContent>
                  {ELEMENTS.map(e => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map(l => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Show Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="Show name"
              value={showName}
              onChange={e => { setShowName(e.target.value); setError(''); }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Placement <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Select value={placement} onValueChange={setPlacement}>
              <SelectTrigger>
                <SelectValue placeholder="Select placement" />
              </SelectTrigger>
              <SelectContent>
                {PLACEMENTS.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              placeholder="Any notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          {templateMissing && (
            <p className="text-sm text-destructive mr-auto">Sport template unavailable. Please try again.</p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || templateMissing}>
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 4: Run tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/components/dogs/DogDetails/TitleTracking/__tests__/LogQualifyingScoreDialog.test.tsx
```
Expected: all PASS

**Step 5: Commit**

```bash
git add apps/myk9show/src/components/dogs/DogDetails/TitleTracking/LogQualifyingScoreDialog.tsx apps/myk9show/src/components/dogs/DogDetails/TitleTracking/__tests__/LogQualifyingScoreDialog.test.tsx
git commit -m "feat(early-adopter): add LogQualifyingScoreDialog for manual score entry"
```

---

### Task 8: Wire Log Score Button into Title Progress Tab

**Files:**
- Modify: `apps/myk9show/src/components/dogs/DogDetails/TitleTracking/TitleProgressSection.tsx`
- Test: same file's test (create if missing)

**Step 1: Write the failing test**

Create `apps/myk9show/src/components/dogs/DogDetails/TitleTracking/__tests__/TitleProgressSection.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import TitleProgressSection from '../TitleProgressSection';

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: () => ({ progressBySport: {}, templates: [], isLoading: false }),
}));

describe('TitleProgressSection', () => {
  it('renders the Log Qualifying Score button', () => {
    render(<TitleProgressSection dogId="dog-1" />);
    expect(screen.getByRole('button', { name: /log qualifying score/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/components/dogs/DogDetails/TitleTracking/__tests__/TitleProgressSection.test.tsx
```
Expected: FAIL

**Step 3: Add the button to TitleProgressSection**

In `TitleProgressSection.tsx`, add a `useState` for dialog open, import `LogQualifyingScoreDialog` and `Button`, and render the button + dialog:

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { LogQualifyingScoreDialog } from './LogQualifyingScoreDialog';

// Inside the component, add:
const [logScoreOpen, setLogScoreOpen] = useState(false);

// In the header area of the returned JSX, add the button:
<div className="flex items-center justify-between mb-4">
  <h3 className="text-lg font-semibold">Title Progress</h3>
  <Button size="sm" variant="outline" onClick={() => setLogScoreOpen(true)}>
    <PlusCircle className="h-4 w-4 mr-2" />
    Log Qualifying Score
  </Button>
</div>

// After the main content, add the dialog:
<LogQualifyingScoreDialog
  dogId={dogId}
  open={logScoreOpen}
  onOpenChange={setLogScoreOpen}
/>
```

**Step 4: Run tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/components/dogs/DogDetails/TitleTracking/__tests__/TitleProgressSection.test.tsx
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/myk9show/src/components/dogs/DogDetails/TitleTracking/TitleProgressSection.tsx apps/myk9show/src/components/dogs/DogDetails/TitleTracking/__tests__/TitleProgressSection.test.tsx
git commit -m "feat(early-adopter): wire Log Qualifying Score button into Title Progress tab"
```

---

### Task 9: Full Typecheck + QA Walk

**Step 1: Run full typecheck**

```bash
cd apps/myk9show && npx tsc --noEmit
```
Expected: zero errors

**Step 2: Run full test suite**

```bash
cd apps/myk9show && npx vitest run
```
Expected: all tests pass, no regressions

**Step 3: Start dev server and walk the early adopter experience**

```bash
pnpm dev:show
```

Walk this sequence in the browser at `localhost:5173`:

1. Sign in as `exhibitor1@myk9t.com` / `TestPass1234!`
2. Confirm landing is `/exhibitor/entries` → shows "Coming Soon" screen
3. Navigate to `/shows` → shows "Coming Soon" screen
4. Navigate to `/calendar` → shows "Coming Soon" screen
5. Navigate to `/dogs` → shows "My Dogs" heading, only exhibitor's own dogs
6. Open any dog → verify Competitions and Statistics tabs are absent
7. Open Title Progress tab → verify not blurred (set `is_early_adopter = true` for this user in Supabase dashboard first)
8. Click "Log Qualifying Score" → verify dialog opens, pre-fill works, form saves
9. Confirm saved score appears in the title progress

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(early-adopter): QA pass complete — early adopter exhibitor release ready"
```
