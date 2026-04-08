# UX Fixes — Shows Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 confirmed UX bugs across shows pages — default dog filter, register button label, currency formatting, and empty state messages.

**Architecture:** Four independent, surgically scoped fixes. Each modifies 1-2 files. `formatFee` utility already exists at `apps/myk9show/src/utils/format.ts` — reuse it instead of creating a new formatter.

**Tech Stack:** React, TypeScript, Vitest, shadcn/ui, Tailwind CSS

---

### Task 1: Fix default dog filter showing 0 results for new entrants (P1-02)

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/DogSearchInterface.tsx:67,293-321`

- [ ] **Step 1: Change default quickFilter from `'registered'` to `''`**

In `DogSearchInterface.tsx`, change two locations:

Line 67 — initial state:

```tsx
// Before:
quickFilter: 'registered',
// After:
quickFilter: '',
```

Line 299 — `defaultFilters` constant:

```tsx
// Before:
quickFilter: 'registered',
// After:
quickFilter: '',
```

Line 313 — `hasActiveFilters` baseline comparison. Currently the "registered" filter is treated as the baseline (not counted as "active"). With the default now being `''`, this logic needs to count any non-empty quickFilter as active:

```tsx
// Before:
filters.quickFilter !== '' && filters.quickFilter !== 'registered';
// After:
filters.quickFilter !== '';
```

Line 320 — `activeFilterCount` same baseline fix:

```tsx
// Before:
filters.quickFilter !== 'registered' ? filters.quickFilter : '',
// After:
filters.quickFilter,
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: No new type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/DogSearchInterface.tsx
git commit -m "fix(registration): default dog filter to show all dogs instead of 'registered'

New exhibitors registering for the first time saw 0 dogs because the
'registered' filter was active by default (showing only dogs already
entered in the show). Default to no filter so all dogs appear immediately.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Change "Register" button to "Manage Entry" when user has entries (P2-01)

**Files:**

- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx:291-293`

- [ ] **Step 1: Update the primary action label based on entry status**

In `ShowDetailsPage.tsx`, replace lines 291-293:

```tsx
// Before:
{...(entryStatus.canEnter
  ? { primaryAction: { label: 'Register', onClick: handleRegisterForShow } }
  : {})}

// After:
{...(entryStatus.canEnter
  ? { primaryAction: { label: hasUserEntries ? 'Manage Entry' : 'Register', onClick: handleRegisterForShow } }
  : hasUserEntries
    ? { primaryAction: { label: 'View Entry', onClick: handleRegisterForShow } }
    : {})}
```

This covers three states:

1. `canEnter && !hasUserEntries` → "Register" (new entry)
2. `canEnter && hasUserEntries` → "Manage Entry" (add more dogs/classes)
3. `!canEnter && hasUserEntries` → "View Entry" (entries closed but user can still view)
4. `!canEnter && !hasUserEntries` → no button (entries closed, user never registered)

- [ ] **Step 2: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: No new type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/ShowDetailsPage.tsx
git commit -m "fix(shows): show 'Manage Entry' button when user already has entries

The Register button always showed 'Register' even when the user had
submitted entries, conflicting with the 'Entry Submitted' badge. Now
shows 'Manage Entry' when entries exist, and 'View Entry' when entries
are closed but user has submissions.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Fix currency formatting in show cards (P2-03)

**Files:**

- Modify: `apps/myk9show/src/components/shows/browse/ShowCardHorizontal.tsx:4,87-92`
- Modify: `apps/myk9show/src/components/shows/overview/QuickInfoCards.tsx:62-63`

- [ ] **Step 1: Fix ShowCardHorizontal — replace DollarSign icon with formatFee**

In `ShowCardHorizontal.tsx`:

Update imports (line 4):

```tsx
// Before:
import { MapPin, DollarSign } from 'lucide-react';
// After:
import { MapPin } from 'lucide-react';
import { formatFee } from '@/utils/format';
```

Replace the fee display (lines 87-92):

```tsx
// Before:
{
  show.preEntryFee && (
    <div className="flex items-center gap-1 flex-shrink-0">
      <DollarSign className="h-3.5 w-3.5" />
      <span>{show.preEntryFee}</span>
    </div>
  );
}

// After:
{
  show.preEntryFee && <span className="flex-shrink-0">{formatFee(show.preEntryFee)}</span>;
}
```

- [ ] **Step 2: Fix QuickInfoCards — apply formatFee to fee values**

In `QuickInfoCards.tsx` (lines 62-63):

Add import at top of file:

```tsx
import { formatFee } from '@/utils/format';
```

Replace the raw fee display:

```tsx
// Before:
value={show.preEntryFee || 'TBD'}
secondary={show.dayOfShowFee ? `Day of show: ${show.dayOfShowFee}` : null}

// After:
value={show.preEntryFee ? formatFee(show.preEntryFee) : 'TBD'}
secondary={show.dayOfShowFee ? `Day of show: ${formatFee(show.dayOfShowFee)}` : null}
```

- [ ] **Step 3: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: No new type errors. `DollarSign` import removal should not cause unused-import errors elsewhere.

- [ ] **Step 4: Run existing ShowCardHorizontal tests**

```bash
cd apps/myk9show && npx vitest run src/components/shows/browse/__tests__/ShowCardHorizontal.test.tsx
```

Expected: All tests pass. The test at line 27 sets `preEntryFee: '30'` — this will now render as `$30.00` instead of a DollarSign icon + `30`. The existing tests don't assert on the fee text, so they should still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/browse/ShowCardHorizontal.tsx apps/myk9show/src/components/shows/overview/QuickInfoCards.tsx
git commit -m "fix(shows): format fees with currency symbol using formatFee utility

Show cards rendered fees as '$ 10' (icon + space + number) and the
overview card showed raw values like '10' with no symbol. Now uses
the existing formatFee() utility for consistent '$10.00' formatting.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Add tab-specific empty state messages in dog selection (P3-04)

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/DogSelectionStepEnhanced.tsx:541-547`

- [ ] **Step 1: Understand the data flow**

`DogSelectionStepEnhanced` doesn't directly know which quick filter is active — it receives `filteredDogs` via `DogSearchInterface`'s `onDogsFiltered` callback. The empty state at line 541 fires when `visibleDogs.length === 0` after filtering + sorting.

To show filter-specific messages, `DogSelectionStepEnhanced` needs to know the active filter. Two approaches:

- (A) Add a callback prop to `DogSearchInterface` that reports the active filter
- (B) Check `searchQuery` (already tracked via `onSearchQueryChange`) + infer from `filteredDogs` vs `accessibleDogs`

Approach (A) is cleaner. Add an `onActiveFilterChange` callback to `DogSearchInterface`.

- [ ] **Step 2: Add onActiveFilterChange callback to DogSearchInterface**

In `DogSearchInterface.tsx`, add to the props interface (line 19):

```tsx
interface DogSearchInterfaceProps {
  dogs: Dog[];
  onDogsFiltered: (filteredDogs: Dog[]) => void;
  onSearchQueryChange?: (query: string) => void;
  onActiveFilterChange?: (activeFilter: string) => void; // Add this
  placeholder?: string;
  showQuickFilters?: boolean;
  showAdvancedFilters?: boolean;
  enablePersistence?: boolean;
  className?: string;
}
```

Destructure in component (line 47):

```tsx
export const DogSearchInterface: React.FC<DogSearchInterfaceProps> = ({
  dogs,
  onDogsFiltered,
  onSearchQueryChange,
  onActiveFilterChange, // Add this
  placeholder = 'Search by call name, breed, owner, or reg #...',
  ...
```

Fire callback when quickFilter changes. Add a `useEffect` after the existing `onDogsFiltered` effect (after line 240):

```tsx
useEffect(() => {
  onActiveFilterChange?.(filters.quickFilter);
}, [filters.quickFilter, onActiveFilterChange]);
```

- [ ] **Step 3: Track active filter in DogSelectionStepEnhanced and render specific empty states**

In `DogSelectionStepEnhanced.tsx`, add state (after line 199):

```tsx
const [activeQuickFilter, setActiveQuickFilter] = useState('');
```

Pass the callback to `DogSearchInterface` (find where `<DogSearchInterface` is rendered and add the prop):

```tsx
<DogSearchInterface
  dogs={accessibleDogs}
  onDogsFiltered={setFilteredDogs}
  onSearchQueryChange={setSearchQuery}
  onActiveFilterChange={setActiveQuickFilter}
  // ... other existing props
/>
```

Replace the generic empty state (lines 541-547):

```tsx
) : (
  <div className="text-center py-8">
    <p className="text-muted-foreground">
      {searchQuery.trim()
        ? 'No dogs match your search. Try a different name or breed.'
        : activeQuickFilter === 'registered'
          ? 'None of your dogs are entered in this show yet. Clear the filter to see all your dogs.'
          : activeQuickFilter === 'unregistered'
            ? 'All your dogs are already entered in this show.'
            : activeQuickFilter === 'recent'
              ? 'No recently active dogs found. Clear the filter to see all your dogs.'
              : "You don't have any dogs yet. Add a dog from your profile to get started."}
    </p>
  </div>
)}
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: No new type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/DogSearchInterface.tsx apps/myk9show/src/components/shows/RegistrationWorkflow/DogSelectionStepEnhanced.tsx
git commit -m "fix(registration): show filter-specific empty states in dog selection

The generic 'No dogs found matching your criteria' message was shown
regardless of which filter tab was active. Now shows contextual messages:
- Registered: directs to clear filter
- Unregistered: confirms all dogs are already entered
- Recent: suggests clearing filter
- No filter: suggests adding dogs
- Search: suggests trying different terms

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: [ADDED] Write unit tests for all 4 fixes

**Files:**

- Modify: `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`
- Modify: `apps/myk9show/src/components/shows/browse/__tests__/ShowCardHorizontal.test.tsx`

- [ ] **Step 1: Add "Manage Entry" / "View Entry" tests to ShowDetailsPage.test.tsx**

The existing `DetailHero` mock (line 109) doesn't pass through `primaryAction`, so update it:

```tsx
// Before (line 109-111):
vi.mock('@/components/common/DetailHero', () => ({
  DetailHero: ({ name }: { name: string }) => <div data-testid="detail-hero">{name}</div>,
}));

// After:
vi.mock('@/components/common/DetailHero', () => ({
  DetailHero: ({
    name,
    primaryAction,
  }: {
    name: string;
    primaryAction?: { label: string; onClick: () => void };
  }) => (
    <div data-testid="detail-hero">
      {name}
      {primaryAction && <button data-testid="hero-action">{primaryAction.label}</button>}
    </div>
  ),
}));
```

Add show dates to `mockShow` in `beforeEach` so `getEntryStatus` can compute `canEnter`:

```tsx
// Add to mockShow in beforeEach (after line 143):
entryOpenDate: '2026-01-01',
entryCloseDate: '2027-12-31',
```

Then add test cases after the existing tests (after line 201):

```tsx
it('shows "Register" button when user has no entries and entries are open', () => {
  mockUserEntries = [];
  renderPage();
  const btn = screen.getByTestId('hero-action');
  expect(btn).toHaveTextContent('Register');
});

it('shows "Manage Entry" button when user has entries and entries are open', () => {
  mockUserEntries = [{ id: 'e1', showId: 'show-1' }];
  renderPage();
  const btn = screen.getByTestId('hero-action');
  expect(btn).toHaveTextContent('Manage Entry');
});

it('shows "View Entry" button when user has entries and entries are closed', () => {
  mockShow = {
    ...mockShow,
    entryOpenDate: '2020-01-01',
    entryCloseDate: '2020-12-31',
  };
  mockUserEntries = [{ id: 'e1', showId: 'show-1' }];
  renderPage();
  const btn = screen.getByTestId('hero-action');
  expect(btn).toHaveTextContent('View Entry');
});

it('shows no action button when entries are closed and user has no entries', () => {
  mockShow = {
    ...mockShow,
    entryOpenDate: '2020-01-01',
    entryCloseDate: '2020-12-31',
  };
  mockUserEntries = [];
  renderPage();
  expect(screen.queryByTestId('hero-action')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add fee formatting assertion to ShowCardHorizontal.test.tsx**

Add a test after the existing tests (after the `ShowCardHorizontalSkeleton` block):

```tsx
it('renders entry fee with currency formatting', () => {
  render(<ShowCardHorizontal show={createMockShow({ preEntryFee: '30' })} />);
  expect(screen.getByText('$30.00')).toBeInTheDocument();
});

it('does not render fee when preEntryFee is empty', () => {
  render(<ShowCardHorizontal show={createMockShow({ preEntryFee: '' })} />);
  expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run all affected tests**

```bash
cd apps/myk9show && npx vitest run src/test/pages/ShowDetailsPage.test.tsx src/components/shows/browse/__tests__/ShowCardHorizontal.test.tsx
```

Expected: All tests pass including the new ones.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx apps/myk9show/src/components/shows/browse/__tests__/ShowCardHorizontal.test.tsx
git commit -m "test: add unit tests for UX fixes — button labels and fee formatting

Tests for P2-01 (Register/Manage Entry/View Entry button states) and
P2-03 (currency formatting in show cards). P1-02 and P3-04 are
internal state changes tested through integration behavior.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Update UX_FIXES_shows.md with results

**Files:**

- Modify: `docs/UX_FIXES_shows.md`

- [ ] **Step 1: Mark fixed items as done and closed items as invalid**

In `docs/UX_FIXES_shows.md`, update the checkboxes:

```
### [x] P1-02: Dog list clipped off-screen in entry registration wizard
```

Change `[ ]` to `[x]` for: P1-02, P2-01, P2-03, P3-04.

For closed items (P1-01, P2-02, P2-04, P2-05, P3-01, P3-02, P3-03, P3-05, P4-01, P4-02, P4-03), change `[ ]` to `[x]` and add "**Closed:**" with reason at the end of each Fix section. Example:

```
### [x] P1-01: Dog list clipped off-screen in entry registration wizard
...
**Closed:** Normal full-page scroll behavior. Wizard is not a dialog.
```

- [ ] **Step 2: Update TO-DOS.md — mark item done**

In `TO-DOS.md`, change the item under "Review UX Fix Backlog for Shows Pages" from `- **Validate...` to `- [x] **Validate...` and add " — Done. 4 fixes applied (P1-02, P2-01, P2-03, P3-04). 11 issues closed as false positives or already fixed."

- [ ] **Step 3: Commit**

```bash
git add docs/UX_FIXES_shows.md TO-DOS.md
git commit -m "docs: mark UX shows audit complete — 4 fixed, 11 closed

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
