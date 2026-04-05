# Configurable Payment Methods Per Show — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-show check/cash payment toggles — online is always enabled, check and cash are opt-in — and surface accepted methods on the show details page and registration wizard.

**Architecture:** Two boolean columns (`accept_check_payments`, `accept_cash_payments`) on the `shows` table flow through the replication layer → app types → wizard store → show creation/edit UI. `QuickInfoCards` displays the accepted methods as pill badges. `PaymentMethodSelector` hides check/cash cards when the show flags are false.

**Tech Stack:** Supabase migration, TypeScript, React, Zustand, shadcn/ui `Checkbox` and `Badge` components.

---

## File Map

**Created:**

- `supabase/migrations/115_add_payment_method_flags.sql`
- `apps/myk9show/src/components/shows/overview/__tests__/QuickInfoCards.test.tsx`
- `apps/myk9show/src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx`
- `apps/myk9show/src/components/panels/edit/__tests__/ShowEditFeesTab.payment.test.tsx`
- `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentMethodSelector.test.tsx`

**Modified:**

- `apps/myk9show/src/types/supabase.ts` — adds columns to shows Row/Insert/Update
- `apps/myk9show/src/services/replication/ReplicatedShowsTable.ts` — interface, rowToShow, toSupabaseRow
- `apps/myk9show/src/types/show-types.ts` — Show, ShowInput
- `apps/myk9show/src/store/showStore.ts` — ShowInput, replicatedToShow, addShow, updateShow
- `apps/myk9show/src/store/wizardStore.ts` — WizardState, initialState
- `apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts` — WizardShowData, transformWizardDataToShow, showToShowInput
- `apps/myk9show/src/components/panels/edit/ShowEditPanel.types.ts` — ShowEditFormData
- `apps/myk9show/src/components/panels/edit/ShowEditPanel.helpers.ts` — showToFormData, formDataToShow
- `apps/myk9show/src/components/shows/overview/QuickInfoCards.tsx` — payment method badges
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx` — Payment Methods section
- `apps/myk9show/src/components/panels/edit/ShowEditFeesTab.tsx` — Payment Methods section
- `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/types.ts` — acceptedMethods prop
- `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/PaymentMethodSelector.tsx` — filter check/cash
- `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/index.tsx` — pass acceptedMethods

---

## Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/115_add_payment_method_flags.sql`
- Modify: `apps/myk9show/src/types/supabase.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/115_add_payment_method_flags.sql
ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS accept_check_payments BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accept_cash_payments  BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN shows.accept_check_payments IS 'Whether exhibitors may pay by check at this show. Online payment is always enabled.';
COMMENT ON COLUMN shows.accept_cash_payments  IS 'Whether exhibitors may pay by cash at this show. Online payment is always enabled.';
```

- [ ] **Step 2: Push migration**

Run from project root (password in `supabase/.env`):

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && supabase db push
```

Expected: `Applying migration 115_add_payment_method_flags...` with no errors.

- [ ] **Step 3: Update generated Supabase types**

In `apps/myk9show/src/types/supabase.ts`, find the `shows` table `Row` block (search for `pre_entry_fee: number | null`). Add the two new columns immediately after `pre_entry_fee`:

```typescript
// In Row block — find: pre_entry_fee: number | null
// Add after it:
accept_check_payments: boolean;
accept_cash_payments: boolean;
```

Then find the `Insert` block (search for `pre_entry_fee?: number | null` in the shows Insert section). Add:

```typescript
// In Insert block — find: pre_entry_fee?: number | null
// Add after it:
accept_check_payments?: boolean | null
accept_cash_payments?: boolean | null
```

Then find the `Update` block (same pattern). Add:

```typescript
// In Update block — find: pre_entry_fee?: number | null
// Add after it:
accept_check_payments?: boolean | null
accept_cash_payments?: boolean | null
```

- [ ] **Step 4: Verify types compile**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck 2>&1 | tail -5
```

Expected: `Tasks: N successful` with no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/115_add_payment_method_flags.sql \
        apps/myk9show/src/types/supabase.ts
git commit -m "feat(db): add accept_check_payments and accept_cash_payments to shows"
```

---

## Task 2: Replication Layer

**Files:**

- Modify: `apps/myk9show/src/services/replication/ReplicatedShowsTable.ts:24-49,54-75,119-141`

- [ ] **Step 1: Add fields to ReplicatedShow interface**

In `ReplicatedShowsTable.ts`, find `allowsNonOwnerHandlers?: boolean | undefined;` (line ~39) and add after it:

```typescript
  acceptCheckPayments?: boolean | undefined;
  acceptCashPayments?: boolean | undefined;
```

- [ ] **Step 2: Add mappings to rowToShow**

In `rowToShow`, find `allowsNonOwnerHandlers: row.allow_non_owner_handlers ?? undefined,` and add after it:

```typescript
    acceptCheckPayments: row.accept_check_payments ?? undefined,
    acceptCashPayments: row.accept_cash_payments ?? undefined,
```

- [ ] **Step 3: Add mappings to toSupabaseRow**

In `toSupabaseRow`, find `allow_non_owner_handlers: show.allowsNonOwnerHandlers ?? null,` and add after it:

```typescript
      accept_check_payments: show.acceptCheckPayments ?? null,
      accept_cash_payments: show.acceptCashPayments ?? null,
```

- [ ] **Step 4: Typecheck**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/services/replication/ReplicatedShowsTable.ts
git commit -m "feat(replication): map accept_check/cash_payments through ReplicatedShowsTable"
```

---

## Task 3: App-Level TypeScript Types and Store

**Files:**

- Modify: `apps/myk9show/src/types/show-types.ts:59-106,112-140`
- Modify: `apps/myk9show/src/store/showStore.ts:32-64,89-117,164-195,280-348`

- [ ] **Step 1: Add fields to Show interface**

In `apps/myk9show/src/types/show-types.ts`, find `startingArmbandNumber?: number | undefined;` (line ~98) and add after it:

```typescript
  // Payment method configuration
  acceptCheckPayments?: boolean | undefined;
  acceptCashPayments?: boolean | undefined;
```

- [ ] **Step 2: Add fields to ShowInput in show-types.ts**

Find `startingArmbandNumber?: number | undefined;` in the `ShowInput` interface (~line 137) and add after it:

```typescript
  acceptCheckPayments?: boolean | undefined;
  acceptCashPayments?: boolean | undefined;
```

- [ ] **Step 3: Add fields to ShowInput in showStore.ts**

In `apps/myk9show/src/store/showStore.ts`, find `startingArmbandNumber?: number | undefined;` in the `ShowInput` interface (~line 106) and add after it:

```typescript
  acceptCheckPayments?: boolean | undefined;
  acceptCashPayments?: boolean | undefined;
```

- [ ] **Step 4: Add fields to replicatedToShow**

In `replicatedToShow` (~line 32), find `_localOnly: replicated._localOnly || false,` and add before it:

```typescript
    acceptCheckPayments: replicated.acceptCheckPayments,
    acceptCashPayments: replicated.acceptCashPayments,
```

- [ ] **Step 5: Pass fields in addShow**

In `addShow` (~line 178), find the `replicatedShowsTable.createShow` call block. After `clubId: showData.clubId || undefined,` add:

```typescript
        acceptCheckPayments: showData.acceptCheckPayments,
        acceptCashPayments: showData.acceptCashPayments,
```

- [ ] **Step 6: Pass fields in updateShow**

In the `updateShow` method (~line 288), in the `replicatedUpdates` block, after `if (updates.clubId !== undefined) replicatedUpdates.clubId = updates.clubId;` add:

```typescript
if (updates.acceptCheckPayments !== undefined)
  replicatedUpdates.acceptCheckPayments = updates.acceptCheckPayments;
if (updates.acceptCashPayments !== undefined)
  replicatedUpdates.acceptCashPayments = updates.acceptCashPayments;
```

In the `definedUpdates` block (~line 327), after `if (updates.clubId !== undefined) definedUpdates.clubId = updates.clubId;` add:

```typescript
if (updates.acceptCheckPayments !== undefined)
  definedUpdates.acceptCheckPayments = updates.acceptCheckPayments;
if (updates.acceptCashPayments !== undefined)
  definedUpdates.acceptCashPayments = updates.acceptCashPayments;
```

- [ ] **Step 7: Typecheck**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/types/show-types.ts apps/myk9show/src/store/showStore.ts
git commit -m "feat(types): add acceptCheckPayments/acceptCashPayments to Show and showStore"
```

---

## Task 4: Wizard Store and Transformer

**Files:**

- Modify: `apps/myk9show/src/store/wizardStore.ts:13-68,97-130`
- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts:10-28,172-194,240-276`

- [ ] **Step 1: Add fields to WizardState show shape**

In `apps/myk9show/src/store/wizardStore.ts`, find `judgeIds: string[]; // Judges assigned to the show` in the `show` block (~line 37). Add after it:

```typescript
acceptCheckPayments: boolean;
acceptCashPayments: boolean;
```

- [ ] **Step 2: Add defaults to initialState**

In the `initialState` (~line 97), find `judgeIds: [],` in the `show` block and add after it:

```typescript
      acceptCheckPayments: false,
      acceptCashPayments: false,
```

- [ ] **Step 3: Add fields to WizardShowData**

In `showCreationWizardTransformers.ts`, find `judgeIds: string[];` in the `WizardShowData` interface (~line 27). Add after it:

```typescript
acceptCheckPayments: boolean;
acceptCashPayments: boolean;
```

- [ ] **Step 4: Map fields in transformWizardDataToShow**

In `transformWizardDataToShow`, find `startingArmbandNumber: show.startingArmbandNumber ?? 100,` (~line 274). Add after it:

```typescript
    acceptCheckPayments: show.acceptCheckPayments,
    acceptCashPayments: show.acceptCashPayments,
```

- [ ] **Step 5: Map fields in showToShowInput**

In `showToShowInput`, find `startingArmbandNumber: show.startingArmbandNumber,` (~line 192). Add after it:

```typescript
    acceptCheckPayments: show.acceptCheckPayments,
    acceptCashPayments: show.acceptCashPayments,
```

- [ ] **Step 6: Typecheck**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/store/wizardStore.ts \
        apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts
git commit -m "feat(wizard): thread acceptCheckPayments/acceptCashPayments through wizard store and transformer"
```

---

## Task 5: ShowEditPanel Types and Helpers

**Files:**

- Modify: `apps/myk9show/src/components/panels/edit/ShowEditPanel.types.ts`
- Modify: `apps/myk9show/src/components/panels/edit/ShowEditPanel.helpers.ts`

- [ ] **Step 1: Add fields to ShowEditFormData**

In `ShowEditPanel.types.ts`, find `allowNonOwnerHandlers?: boolean;` and add after it:

```typescript
  acceptCheckPayments?: boolean;
  acceptCashPayments?: boolean;
```

- [ ] **Step 2: Update showToFormData**

In `ShowEditPanel.helpers.ts`, find `allowNonOwnerHandlers: show.allowNonOwnerHandlers,` in the `showToFormData` function and add after it:

```typescript
    acceptCheckPayments: show.acceptCheckPayments ?? false,
    acceptCashPayments: show.acceptCashPayments ?? false,
```

- [ ] **Step 3: Update formDataToShow**

In `formDataToShow`, find `allowNonOwnerHandlers: formData.allowNonOwnerHandlers,` and add after it:

```typescript
  acceptCheckPayments: formData.acceptCheckPayments,
  acceptCashPayments: formData.acceptCashPayments,
```

- [ ] **Step 4: Typecheck**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/ShowEditPanel.types.ts \
        apps/myk9show/src/components/panels/edit/ShowEditPanel.helpers.ts
git commit -m "feat(edit-panel): add acceptCheckPayments/acceptCashPayments to ShowEditFormData and helpers"
```

---

## Task 6: QuickInfoCards Payment Badges (TDD)

**Files:**

- Create: `apps/myk9show/src/components/shows/overview/__tests__/QuickInfoCards.test.tsx`
- Modify: `apps/myk9show/src/components/shows/overview/QuickInfoCards.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/myk9show/src/components/shows/overview/__tests__/QuickInfoCards.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QuickInfoCards } from '../QuickInfoCards';
import type { Show } from '@/types/show-types';

const baseShow: Partial<Show> = {
  startDate: '2026-05-01T08:00:00Z',
  endDate: '2026-05-02T17:00:00Z',
  entryCloseDate: '2026-04-15T23:59:00Z',
  preEntryFee: '$15.00',
  dayOfShowFee: '$20.00',
  location: 'Dogtown Park',
  clubName: 'Happy Paws Club',
};

describe('QuickInfoCards — payment methods', () => {
  it('always renders Card badge', () => {
    render(<QuickInfoCards show={baseShow as Show} />);
    expect(screen.getByText('Card')).toBeInTheDocument();
  });

  it('does not render Check badge when acceptCheckPayments is false', () => {
    render(<QuickInfoCards show={{ ...baseShow, acceptCheckPayments: false } as Show} />);
    expect(screen.queryByText('Check')).not.toBeInTheDocument();
  });

  it('renders Check badge when acceptCheckPayments is true', () => {
    render(<QuickInfoCards show={{ ...baseShow, acceptCheckPayments: true } as Show} />);
    expect(screen.getByText('Check')).toBeInTheDocument();
  });

  it('does not render Cash badge when acceptCashPayments is false', () => {
    render(<QuickInfoCards show={{ ...baseShow, acceptCashPayments: false } as Show} />);
    expect(screen.queryByText('Cash')).not.toBeInTheDocument();
  });

  it('renders Cash badge when acceptCashPayments is true', () => {
    render(<QuickInfoCards show={{ ...baseShow, acceptCashPayments: true } as Show} />);
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });

  it('renders Card, Check, and Cash when both flags are true', () => {
    render(
      <QuickInfoCards
        show={{ ...baseShow, acceptCheckPayments: true, acceptCashPayments: true } as Show}
      />
    );
    expect(screen.getByText('Card')).toBeInTheDocument();
    expect(screen.getByText('Check')).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });

  it('renders the Payment Methods label', () => {
    render(<QuickInfoCards show={baseShow as Show} />);
    expect(screen.getByText('Payment Methods')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run src/components/shows/overview/__tests__/QuickInfoCards.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: 7 tests failing (components don't exist yet / missing badge elements).

- [ ] **Step 3: Implement payment badge row in QuickInfoCards**

In `apps/myk9show/src/components/shows/overview/QuickInfoCards.tsx`, replace the entire file with:

```tsx
import type { Show } from '@/types/show-types';

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function formatShowDate(startDate: string, endDate: string): string {
  const start = parseDate(startDate);
  if (!start) return 'TBD';
  const end = parseDate(endDate) || start;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

  if (start.getTime() === end.getTime()) {
    return start.toLocaleDateString('en-US', { weekday: 'short', ...opts });
  }
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', opts);
  return `${startStr} – ${endStr}`;
}

function getEntryCloseText(entryCloseDate: string): string | null {
  const close = parseDate(entryCloseDate);
  if (!close) return null;
  if (close <= new Date()) return null;
  return `Entries close ${close.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

interface MetadataItemProps {
  label: string;
  value: string;
  secondary?: string | null;
}

function MetadataItem({ label, value, secondary }: MetadataItemProps) {
  return (
    <div className="flex-1 min-w-[120px] px-4 py-2.5 border-r border-border/50 last:border-r-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
      {secondary && <div className="text-xs text-muted-foreground mt-0.5">{secondary}</div>}
    </div>
  );
}

interface PaymentBadgeProps {
  label: string;
}

function PaymentBadge({ label }: PaymentBadgeProps) {
  return (
    <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/12 border border-indigo-500/30 text-indigo-300">
      {label}
    </span>
  );
}

interface QuickInfoCardsProps {
  show: Show;
}

export function QuickInfoCards({ show }: QuickInfoCardsProps) {
  const dateStr = formatShowDate(show.startDate, show.endDate);
  const entryCloseText = show.entryCloseDate ? getEntryCloseText(show.entryCloseDate) : null;

  return (
    <div className="flex flex-wrap">
      <MetadataItem label="Date" value={dateStr} secondary={entryCloseText} />
      <MetadataItem
        label="Entry Fee"
        value={show.preEntryFee || 'TBD'}
        secondary={show.dayOfShowFee ? `Day of show: ${show.dayOfShowFee}` : null}
      />
      <MetadataItem label="Location" value={show.location || 'TBD'} />
      <MetadataItem label="Host Club" value={show.clubName || 'TBD'} />
      <div className="flex-1 min-w-[120px] px-4 py-2.5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground/70 mb-1.5">
          Payment Methods
        </div>
        <div className="flex flex-wrap gap-1.5">
          <PaymentBadge label="Card" />
          {show.acceptCheckPayments && <PaymentBadge label="Check" />}
          {show.acceptCashPayments && <PaymentBadge label="Cash" />}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run src/components/shows/overview/__tests__/QuickInfoCards.test.tsx --reporter=verbose 2>&1 | tail -15
```

Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/overview/QuickInfoCards.tsx \
        apps/myk9show/src/components/shows/overview/__tests__/QuickInfoCards.test.tsx
git commit -m "feat(ui): add payment method badges to QuickInfoCards"
```

---

## Task 7: ShowDetailsStep — Payment Methods Section (TDD)

**Files:**

- Create: `apps/myk9show/src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx`
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/myk9show/src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx`:

```tsx
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal wizard store mock — only what ShowDetailsStep reads/writes for payment
const mockUpdateShowData = vi.fn();
vi.mock('@/store/wizardStore', () => ({
  useWizardStore: vi.fn(() => ({
    show: {
      name: '',
      organization: '',
      startDate: '',
      endDate: '',
      entryOpenDate: '',
      entryCloseDate: '',
      preEntryFee: 0,
      dayOfShowFee: 0,
      startingArmbandNumber: 100,
      clubId: '',
      officials: { secretary: [], chairman: [], steward: [] },
      judgeIds: [],
      acceptCheckPayments: false,
      acceptCashPayments: false,
    },
    updateShowData: mockUpdateShowData,
    addJudgeToShow: vi.fn(),
    removeJudgeFromShow: vi.fn(),
    judgeDetails: {},
  })),
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: vi.fn(() => ({ clubs: [], loadClubs: vi.fn(), syncClubs: vi.fn() })),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: vi.fn(() => ({ people: [], loadPeople: vi.fn() })),
}));

vi.mock('@/components/panels/hooks', () => ({
  usePanelManager: vi.fn(() => ({ openPanel: vi.fn() })),
}));

vi.mock('@/hooks/useUserClubIds', () => ({
  useUserClubIds: vi.fn(() => null),
}));

vi.mock('./CloneFromShowCombobox', () => ({
  CloneFromShowCombobox: () => null,
}));

import { ShowDetailsStep } from '../ShowDetailsStep';

describe('ShowDetailsStep — Payment Methods section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Payment Methods section heading', () => {
    render(<ShowDetailsStep />);
    expect(screen.getByText('Payment Methods')).toBeInTheDocument();
  });

  it('renders "Credit/Debit Card — always enabled" as a locked row', () => {
    render(<ShowDetailsStep />);
    expect(screen.getByText('Credit/Debit Card — always enabled')).toBeInTheDocument();
  });

  it('renders an unchecked Check checkbox', () => {
    render(<ShowDetailsStep />);
    const checkbox = screen.getByRole('checkbox', { name: /check \(pay at show\)/i });
    expect(checkbox).not.toBeChecked();
  });

  it('renders an unchecked Cash checkbox', () => {
    render(<ShowDetailsStep />);
    const checkbox = screen.getByRole('checkbox', { name: /cash \(pay at show\)/i });
    expect(checkbox).not.toBeChecked();
  });

  it('calls updateShowData with acceptCheckPayments: true when Check is toggled on', async () => {
    const user = userEvent.setup();
    render(<ShowDetailsStep />);
    await user.click(screen.getByRole('checkbox', { name: /check \(pay at show\)/i }));
    expect(mockUpdateShowData).toHaveBeenCalledWith({ acceptCheckPayments: true });
  });

  it('calls updateShowData with acceptCashPayments: true when Cash is toggled on', async () => {
    const user = userEvent.setup();
    render(<ShowDetailsStep />);
    await user.click(screen.getByRole('checkbox', { name: /cash \(pay at show\)/i }));
    expect(mockUpdateShowData).toHaveBeenCalledWith({ acceptCashPayments: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run "src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx" --reporter=verbose 2>&1 | tail -15
```

Expected: failures — payment section elements not found.

- [ ] **Step 3: Add Payment Methods section to ShowDetailsStep**

In `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`, add a `Checkbox` import. Find the existing imports block and add:

```tsx
import { Checkbox } from '@/components/ui/checkbox';
```

Then inside the component's return JSX, find the closing `</div>` of the `Basic Show Information` card (right before `{/* Club Information */}`). Add a new Payment Methods card section after it:

```tsx
{
  /* Payment Methods */
}
<div className="group relative bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
  <div className="relative">
    <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">
      Payment Methods
    </h3>
    <div className="space-y-3">
      {/* Online payment is always enabled — not configurable */}
      <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
        <Checkbox id="credit_card_locked" checked disabled aria-disabled="true" />
        <Label
          htmlFor="credit_card_locked"
          className="text-sm font-medium text-muted-foreground cursor-default"
        >
          Credit/Debit Card — always enabled
        </Label>
      </div>
      <div className="flex items-center gap-3 px-3 py-2 rounded-md">
        <Checkbox
          id="acceptCheckPayments"
          checked={show.acceptCheckPayments ?? false}
          onCheckedChange={(checked: boolean) => updateShowData({ acceptCheckPayments: checked })}
        />
        <Label htmlFor="acceptCheckPayments" className="text-sm font-medium cursor-pointer">
          Check (pay at show)
        </Label>
      </div>
      <div className="flex items-center gap-3 px-3 py-2 rounded-md">
        <Checkbox
          id="acceptCashPayments"
          checked={show.acceptCashPayments ?? false}
          onCheckedChange={(checked: boolean) => updateShowData({ acceptCashPayments: checked })}
        />
        <Label htmlFor="acceptCashPayments" className="text-sm font-medium cursor-pointer">
          Cash (pay at show)
        </Label>
      </div>
    </div>
  </div>
</div>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run "src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx" --reporter=verbose 2>&1 | tail -15
```

Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx \
        "apps/myk9show/src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx"
git commit -m "feat(wizard): add Payment Methods section to ShowDetailsStep"
```

---

## Task 8: ShowEditFeesTab — Payment Methods Section (TDD)

**Files:**

- Create: `apps/myk9show/src/components/panels/edit/__tests__/ShowEditFeesTab.payment.test.tsx`
- Modify: `apps/myk9show/src/components/panels/edit/ShowEditFeesTab.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/myk9show/src/components/panels/edit/__tests__/ShowEditFeesTab.payment.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ShowEditFeesTab } from '../ShowEditFeesTab';
import type { ShowEditFormData } from '../ShowEditPanel.types';

const baseData: ShowEditFormData = {
  name: 'Test Show',
  status: 'draft',
  organization: 'AKC',
  clubId: 'c1',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  location: 'Dogtown',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-04-15',
  preEntryFee: '15',
  dayOfShowFee: '20',
  assignedJudges: [],
  acceptCheckPayments: false,
  acceptCashPayments: false,
};

describe('ShowEditFeesTab — Payment Methods section', () => {
  it('renders the Payment Methods heading', () => {
    render(
      <ShowEditFeesTab
        data={baseData}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.getByText('Payment Methods')).toBeInTheDocument();
  });

  it('renders "Credit/Debit Card — always enabled" row', () => {
    render(
      <ShowEditFeesTab
        data={baseData}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.getByText('Credit/Debit Card — always enabled')).toBeInTheDocument();
  });

  it('renders Check checkbox unchecked when acceptCheckPayments is false', () => {
    render(
      <ShowEditFeesTab
        data={baseData}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.getByRole('checkbox', { name: /check \(pay at show\)/i })).not.toBeChecked();
  });

  it('renders Check checkbox checked when acceptCheckPayments is true', () => {
    render(
      <ShowEditFeesTab
        data={{ ...baseData, acceptCheckPayments: true }}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.getByRole('checkbox', { name: /check \(pay at show\)/i })).toBeChecked();
  });

  it('calls handleCheckboxChange("acceptCheckPayments") when Check is toggled', async () => {
    const user = userEvent.setup();
    const mockHandleCheckboxChange = vi.fn(() => vi.fn());
    render(
      <ShowEditFeesTab
        data={baseData}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={mockHandleCheckboxChange}
      />
    );
    await user.click(screen.getByRole('checkbox', { name: /check \(pay at show\)/i }));
    expect(mockHandleCheckboxChange).toHaveBeenCalledWith('acceptCheckPayments');
  });

  it('calls handleCheckboxChange("acceptCashPayments") when Cash is toggled', async () => {
    const user = userEvent.setup();
    const mockHandleCheckboxChange = vi.fn(() => vi.fn());
    render(
      <ShowEditFeesTab
        data={baseData}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={mockHandleCheckboxChange}
      />
    );
    await user.click(screen.getByRole('checkbox', { name: /cash \(pay at show\)/i }));
    expect(mockHandleCheckboxChange).toHaveBeenCalledWith('acceptCashPayments');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run "src/components/panels/edit/__tests__/ShowEditFeesTab.payment.test.tsx" --reporter=verbose 2>&1 | tail -15
```

Expected: failures — payment section elements not found.

- [ ] **Step 3: Add Payment Methods section to ShowEditFeesTab**

In `apps/myk9show/src/components/panels/edit/ShowEditFeesTab.tsx`, find the closing `</CardContent>` of the card (just before `</Card>` near the end). Add a `<Separator />` and the Payment Methods section inside the card, after the Entry Limits section's closing `</div>`:

```tsx
          <Separator />

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Payment Methods
            </h4>
            <div className="space-y-3">
              {/* Online payment is always enabled — not configurable */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
                <Checkbox id="credit_card_locked_edit" checked disabled aria-disabled="true" />
                <Label
                  htmlFor="credit_card_locked_edit"
                  className="text-sm font-medium text-muted-foreground cursor-default"
                >
                  Credit/Debit Card — always enabled
                </Label>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md">
                <Checkbox
                  id="acceptCheckPaymentsEdit"
                  checked={data.acceptCheckPayments ?? false}
                  onCheckedChange={handleCheckboxChange('acceptCheckPayments')}
                />
                <Label htmlFor="acceptCheckPaymentsEdit" className="text-sm font-medium cursor-pointer">
                  Check (pay at show)
                </Label>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md">
                <Checkbox
                  id="acceptCashPaymentsEdit"
                  checked={data.acceptCashPayments ?? false}
                  onCheckedChange={handleCheckboxChange('acceptCashPayments')}
                />
                <Label htmlFor="acceptCashPaymentsEdit" className="text-sm font-medium cursor-pointer">
                  Cash (pay at show)
                </Label>
              </div>
            </div>
          </div>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run "src/components/panels/edit/__tests__/ShowEditFeesTab.payment.test.tsx" --reporter=verbose 2>&1 | tail -15
```

Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/ShowEditFeesTab.tsx \
        "apps/myk9show/src/components/panels/edit/__tests__/ShowEditFeesTab.payment.test.tsx"
git commit -m "feat(edit-panel): add Payment Methods section to ShowEditFeesTab"
```

---

## Task 9: PaymentMethodSelector — Filter by Show Flags (TDD)

**Files:**

- Create: `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentMethodSelector.test.tsx`
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/types.ts`
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/PaymentMethodSelector.tsx`
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/index.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentMethodSelector.test.tsx`:

```tsx
import { render, screen } from '@/test/utils/testUtils';
import { describe, it, expect, vi } from 'vitest';
import { PaymentMethodSelector } from '../PaymentMethodSelector';

const baseProps = {
  paymentMethod: '' as const,
  onPaymentMethodChange: vi.fn(),
};

describe('PaymentMethodSelector — acceptedMethods filtering', () => {
  it('shows check card when acceptedMethods.check is true', () => {
    render(<PaymentMethodSelector {...baseProps} acceptedMethods={{ check: true, cash: false }} />);
    expect(screen.getByText('Check (pay at show)')).toBeInTheDocument();
  });

  it('hides check card when acceptedMethods.check is false', () => {
    render(
      <PaymentMethodSelector {...baseProps} acceptedMethods={{ check: false, cash: false }} />
    );
    expect(screen.queryByText('Check (pay at show)')).not.toBeInTheDocument();
  });

  it('shows cash card when acceptedMethods.cash is true', () => {
    render(<PaymentMethodSelector {...baseProps} acceptedMethods={{ check: false, cash: true }} />);
    expect(screen.getByText('Cash (pay at show)')).toBeInTheDocument();
  });

  it('hides cash card when acceptedMethods.cash is false', () => {
    render(
      <PaymentMethodSelector {...baseProps} acceptedMethods={{ check: false, cash: false }} />
    );
    expect(screen.queryByText('Cash (pay at show)')).not.toBeInTheDocument();
  });

  it('shows all methods when acceptedMethods is not provided (default behaviour)', () => {
    render(<PaymentMethodSelector {...baseProps} />);
    expect(screen.getByText('Check (pay at show)')).toBeInTheDocument();
    expect(screen.getByText('Cash (pay at show)')).toBeInTheDocument();
  });

  it('always shows Credit/Debit Card regardless of acceptedMethods', () => {
    render(
      <PaymentMethodSelector {...baseProps} acceptedMethods={{ check: false, cash: false }} />
    );
    expect(screen.getByText('Credit/Debit Card (Online Payment)')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run "src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentMethodSelector.test.tsx" --reporter=verbose 2>&1 | tail -15
```

Expected: failures — filtering not implemented.

- [ ] **Step 3: Add acceptedMethods to PaymentMethodSelectorProps**

In `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/types.ts`, find the `PaymentMethodSelectorProps` interface and add:

```typescript
  /** Which at-show payment methods are enabled for this show. Defaults to all enabled. */
  acceptedMethods?: { check: boolean; cash: boolean } | undefined;
```

- [ ] **Step 4: Use acceptedMethods in PaymentMethodSelector**

In `PaymentMethodSelector.tsx`, update the component signature to destructure the new prop:

```tsx
export const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  paymentMethod,
  onPaymentMethodChange,
  onPaymentDetailsChange,
  acceptedMethods,
}) => {
```

Then, immediately after the state declarations add:

```tsx
const showCheck = acceptedMethods?.check ?? true;
const showCash = acceptedMethods?.cash ?? true;
```

Wrap the check `PaymentOptionCard` and its detail block in a conditional. Replace:

```tsx
            <PaymentOptionCard
              value="check"
              ...
            />

            {paymentMethod === 'check' && (
```

with:

```tsx
            {showCheck && (
              <PaymentOptionCard
                value="check"
                selected={paymentMethod === 'check'}
                icon={Check}
                title="Check (pay at show)"
                description="Bring check made payable to hosting club"
                onSelect={handleSelect}
              />
            )}

            {showCheck && paymentMethod === 'check' && (
```

And close the wrapping fragment after the check detail block (the `</div>` that closes `{paymentMethod === 'check' && ...}`).

Do the same for cash. Replace:

```tsx
            <PaymentOptionCard
              value="cash"
              ...
            />

            {paymentMethod === 'cash' && (
```

with:

```tsx
            {showCash && (
              <PaymentOptionCard
                value="cash"
                selected={paymentMethod === 'cash'}
                icon={DollarSign}
                title="Cash (pay at show)"
                description="Exact amount required at check-in"
                onSelect={handleSelect}
              />
            )}

            {showCash && paymentMethod === 'cash' && (
```

- [ ] **Step 5: Pass acceptedMethods in PaymentStep/index.tsx**

In `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/index.tsx`, derive `acceptedMethods` from the show object and pass it to `PaymentMethodSelector`. After `const show = showId ? shows.find(s => s.id === showId) : undefined;` add:

```tsx
const acceptedMethods = {
  check: show?.acceptCheckPayments ?? true,
  cash: show?.acceptCashPayments ?? true,
};
```

Then update the `<PaymentMethodSelector>` call to include the new prop:

```tsx
<PaymentMethodSelector
  paymentMethod={paymentMethod}
  onPaymentMethodChange={onPaymentMethodChange}
  onPaymentDetailsChange={onPaymentDetailsChange}
  acceptedMethods={acceptedMethods}
/>
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run "src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentMethodSelector.test.tsx" --reporter=verbose 2>&1 | tail -15
```

Expected: `6 passed`.

- [ ] **Step 7: Full typecheck and lint**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && pnpm lint 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 8: Commit and push**

```bash
git add \
  apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/types.ts \
  apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/PaymentMethodSelector.tsx \
  apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/index.tsx \
  "apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentMethodSelector.test.tsx"
git commit -m "feat(registration): filter check/cash payment methods based on show configuration"
git push
```

---

## Acceptance Checklist

- [ ] Migration 115 applied, no DB errors
- [ ] `accept_check_payments` and `accept_cash_payments` columns exist on `shows` table
- [ ] Show creation wizard Step 1 shows Payment Methods section with Card locked, Check/Cash checkboxes
- [ ] Show edit panel Fees tab shows identical Payment Methods section
- [ ] QuickInfoCards shows "Card" always, "Check"/"Cash" only when enabled
- [ ] Registration wizard hides Check/Cash payment options when show flags are false
- [ ] Secretary-only methods (secretary_paid, group_payment, waived) always visible to secretaries
- [ ] All 25 new tests pass
- [ ] Typecheck clean, lint clean (warnings only)
