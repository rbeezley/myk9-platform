# Entry Management Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Entry Management in place so it uses the shared search/filter/view controls, defaults to a denser table-first workflow, replaces status tabs with filters, and keeps card view grouped by enrollment with dog subgroups.

**Architecture:** Keep the existing Entry Management data and mutation hooks as the source of truth. Add a small URL/control adapter around the current filter state, migrate the visible UI in slices, and reuse shared primitives (`ListControls`, `RowActionMenu`, `DataTable`) rather than building new controls.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, TanStack Table, shadcn/Base UI wrappers, existing myK9Show hooks and components.

## Global Constraints

- Preserve the secretary intent: **"That was easy."**
- Do not add a new page, sheet, dialog, or duplicate Show Desk/Show Map.
- Do not introduce new direct Supabase reads or writes for core entry data.
- Use TypeScript only.
- Keep files under 500 lines by extracting focused helpers/components when needed.
- Use `ListControls` for search/filter/view controls.
- Use `RowActionMenu` for row and bulk action overflow menus.
- Table view is the default.
- Existing `entryTab` and `tab=waitlist` URLs must keep working by translating to filters.
- Add or update tests before considering each slice complete.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This is a production UI/state-flow change in myK9Show that affects secretary entry review and show-day actions, so focused component tests plus a browser smoke are required.

---

## File Structure

- Modify `apps/myk9show/src/hooks/useEntryManagementFilters.ts`: own URL compatibility, view mode default, status/attention filter values, and shared filter output.
- Create `apps/myk9show/src/components/entries/management/entryManagementFilters.ts`: filter constants, filter definitions, URL legacy mapping helpers.
- Modify `apps/myk9show/src/components/entries/management/RegistrationView.tsx`: replace stats/filter/tabs shell with `ListControls`, table-first rendering, and filtered content routing.
- Modify `apps/myk9show/src/components/entries/management/EntriesTableView.tsx`: armband-first columns, `showSearch={false}`, row action menu column, and controlled selection compatibility.
- Create `apps/myk9show/src/components/entries/management/EntryRowActionMenu.tsx`: row-level action menu builder using `RowActionMenu`.
- Create `apps/myk9show/src/components/entries/management/EntryBulkActionMenu.tsx`: selected-row bulk action overflow menu using `RowActionMenu`.
- Modify `apps/myk9show/src/components/entries/management/EnrollmentCard.tsx`: preserve existing enrollment grouping and expose dog-level grouping/action affordances where already available.
- Add/update tests under `apps/myk9show/src/components/entries/management/__tests__/` and `apps/myk9show/src/test/components/entries/management/`.

---

### Task 1: Filter Constants And Legacy URL Mapping

**Files:**

- Create: `apps/myk9show/src/components/entries/management/entryManagementFilters.ts`
- Modify: `apps/myk9show/src/hooks/useEntryManagementFilters.ts`
- Test: `apps/myk9show/src/components/entries/management/__tests__/entryManagementFilters.test.ts`

**Interfaces:**

- Produces: `ENTRY_ATTENTION_FILTERS`, `ENTRY_VIEW_MODES`, `normalizeEntryManagementSearchParams(params: URLSearchParams): { params: URLSearchParams; attention: EntryAttentionFilter; view: EntryManagementViewMode; mode: EntryWorkMode }`
- Consumes: existing `EntryManagementEntry`, `EntryStatus`, `PaymentStatus`, `isPendingEntry`, `isAcceptedEntry`, `isWaitlistEntry`, `isIssueEntry`.

- [ ] **Step 1: Write failing tests for legacy tab translation**

Create `apps/myk9show/src/components/entries/management/__tests__/entryManagementFilters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  normalizeEntryManagementSearchParams,
  ENTRY_ATTENTION_FILTER_VALUES,
} from '../entryManagementFilters';

describe('entryManagementFilters', () => {
  it('maps entryTab=pending to the pending attention filter', () => {
    const result = normalizeEntryManagementSearchParams(new URLSearchParams('entryTab=pending'));

    expect(result.attention).toBe('pending');
    expect(result.params.get('attention')).toBe('pending');
    expect(result.params.has('entryTab')).toBe(false);
  });

  it('maps tab=waitlist to the waitlist attention filter', () => {
    const result = normalizeEntryManagementSearchParams(new URLSearchParams('tab=waitlist'));

    expect(result.attention).toBe('waitlist');
    expect(result.params.get('attention')).toBe('waitlist');
    expect(result.params.has('tab')).toBe(false);
  });

  it('keeps table as the default view', () => {
    const result = normalizeEntryManagementSearchParams(new URLSearchParams(''));

    expect(result.view).toBe('table');
  });

  it('only accepts known attention filter values', () => {
    expect(ENTRY_ATTENTION_FILTER_VALUES).toContain('move-ups');
    const result = normalizeEntryManagementSearchParams(new URLSearchParams('attention=bad'));

    expect(result.attention).toBe('all');
    expect(result.params.has('attention')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/entries/management/__tests__/entryManagementFilters.test.ts
```

Expected: FAIL because `entryManagementFilters.ts` does not exist.

- [ ] **Step 3: Implement filter constants and URL normalization**

Create `apps/myk9show/src/components/entries/management/entryManagementFilters.ts`:

```ts
import type { FilterDefinition } from '@/components/common/FilterChips';
import type { ViewMode } from '@/components/common/ViewToggle';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

export const ENTRY_ATTENTION_FILTER_VALUES = [
  'all',
  'pending',
  'accepted',
  'waitlist',
  'move-ups',
  'pulled',
  'issues',
] as const;

export type EntryAttentionFilter = (typeof ENTRY_ATTENTION_FILTER_VALUES)[number];

export const ENTRY_WORK_MODE_VALUES = ['review', 'day-of'] as const;
export type EntryWorkMode = (typeof ENTRY_WORK_MODE_VALUES)[number];

export const ENTRY_VIEW_MODE_VALUES = ['table', 'cards'] as const;
export type EntryManagementViewMode = (typeof ENTRY_VIEW_MODE_VALUES)[number];

export const ENTRY_VIEW_MODES: readonly ViewMode[] = [
  { key: 'table', label: 'Table', icon: 'table' },
  { key: 'cards', label: 'Cards', icon: 'grid' },
];

export const ENTRY_MANAGEMENT_FILTERS: FilterDefinition[] = [
  {
    key: 'attention',
    label: 'Attention',
    options: [
      { label: 'All entries', value: 'all' },
      { label: 'Pending review', value: 'pending' },
      { label: 'Accepted', value: 'accepted' },
      { label: 'Waitlist', value: 'waitlist' },
      { label: 'Move-up requested', value: 'move-ups' },
      { label: 'Pulled / no-show', value: 'pulled' },
      { label: 'Issues', value: 'issues' },
    ],
  },
  {
    key: 'payment',
    label: 'Payment',
    options: [
      { label: 'All payments', value: 'all' },
      { label: 'Payment due', value: PaymentStatus.PENDING },
      { label: 'Paid online', value: PaymentStatus.PAID_ONLINE },
      { label: 'Paid by check', value: PaymentStatus.PAID_BY_CHECK },
      { label: 'Refunded', value: PaymentStatus.REFUNDED },
    ],
  },
];

export function isEntryAttentionFilter(value: string | null): value is EntryAttentionFilter {
  return ENTRY_ATTENTION_FILTER_VALUES.includes(value as EntryAttentionFilter);
}

function isEntryWorkMode(value: string | null): value is EntryWorkMode {
  return ENTRY_WORK_MODE_VALUES.includes(value as EntryWorkMode);
}

function isEntryManagementViewMode(value: string | null): value is EntryManagementViewMode {
  return ENTRY_VIEW_MODE_VALUES.includes(value as EntryManagementViewMode);
}

function legacyEntryTabToAttention(value: string | null): EntryAttentionFilter | null {
  switch (value) {
    case 'pending':
    case 'accepted':
    case 'waitlist':
    case 'issues':
      return value;
    case 'move-ups':
      return 'move-ups';
    case 'scratches':
      return 'pulled';
    default:
      return null;
  }
}

export function normalizeEntryManagementSearchParams(searchParams: URLSearchParams): {
  params: URLSearchParams;
  attention: EntryAttentionFilter;
  mode: EntryWorkMode;
  view: EntryManagementViewMode;
} {
  const params = new URLSearchParams(searchParams);
  const legacyAttention = legacyEntryTabToAttention(params.get('entryTab'));
  const waitlistTab = params.get('tab') === 'waitlist';
  const rawAttention = params.get('attention');
  const attention =
    legacyAttention ??
    (waitlistTab ? 'waitlist' : isEntryAttentionFilter(rawAttention) ? rawAttention : 'all');
  const mode = isEntryWorkMode(params.get('mode')) ? params.get('mode') : 'review';
  const view = isEntryManagementViewMode(params.get('view')) ? params.get('view') : 'table';

  params.delete('entryTab');
  if (waitlistTab) params.delete('tab');
  if (attention === 'all') params.delete('attention');
  else params.set('attention', attention);
  if (mode === 'review') params.delete('mode');
  else params.set('mode', mode);
  if (view === 'table') params.delete('view');
  else params.set('view', view);

  return { params, attention, mode: mode ?? 'review', view };
}

export function isMoveUpStatus(status: EntryStatus): boolean {
  return status === EntryStatus.MOVE_UP_REQUESTED;
}

export function isPulledStatus(status: EntryStatus): boolean {
  return status === EntryStatus.SCRATCHED || status === EntryStatus.CANCELLED;
}
```

- [ ] **Step 4: Wire normalization into `useEntryManagementFilters`**

Modify `apps/myk9show/src/hooks/useEntryManagementFilters.ts`:

```ts
import {
  type EntryAttentionFilter,
  type EntryManagementViewMode,
  type EntryWorkMode,
  isMoveUpStatus,
  isPulledStatus,
  normalizeEntryManagementSearchParams,
} from '@/components/entries/management/entryManagementFilters';
```

Update the return interface:

```ts
  attentionFilter: EntryAttentionFilter;
  setAttentionFilter: (filter: EntryAttentionFilter) => void;
  workMode: EntryWorkMode;
  setWorkMode: (mode: EntryWorkMode) => void;
  entryViewMode: EntryManagementViewMode;
  setEntryViewMode: (view: EntryManagementViewMode) => void;
```

Replace `routeEntryTab` / `selectedTab` derivation with:

```ts
const normalized = useMemo(
  () => normalizeEntryManagementSearchParams(searchParams),
  [searchParams]
);
const attentionFilter = normalized.attention;
const workMode = normalized.mode;
const entryViewMode = normalized.view;

useEffect(() => {
  if (normalized.params.toString() !== searchParams.toString()) {
    setSearchParams(normalized.params, { replace: true });
  }
}, [normalized, searchParams, setSearchParams]);
```

Replace `setSelectedTab` with:

```ts
const setAttentionFilter = useCallback(
  (filter: EntryAttentionFilter) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (filter === 'all') next.delete('attention');
        else next.set('attention', filter);
        next.delete('entryTab');
        next.delete('tab');
        return next;
      },
      { replace: true }
    );
  },
  [setSearchParams]
);
```

Add setters for mode/view using the same pattern:

```ts
const setWorkMode = useCallback(
  (mode: EntryWorkMode) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (mode === 'review') next.delete('mode');
        else next.set('mode', mode);
        return next;
      },
      { replace: true }
    );
  },
  [setSearchParams]
);

const setEntryViewMode = useCallback(
  (view: EntryManagementViewMode) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (view === 'table') next.delete('view');
        else next.set('view', view);
        return next;
      },
      { replace: true }
    );
  },
  [setSearchParams]
);
```

Update filtering:

```ts
if (attentionFilter === 'pending') filtered = filtered.filter(isPendingEntry);
else if (attentionFilter === 'accepted') filtered = filtered.filter(isAcceptedEntry);
else if (attentionFilter === 'waitlist') filtered = filtered.filter(isWaitlistEntry);
else if (attentionFilter === 'issues') filtered = filtered.filter(isIssueEntry);
else if (attentionFilter === 'move-ups')
  filtered = filtered.filter(e => isMoveUpStatus(e.entryStatus));
else if (attentionFilter === 'pulled')
  filtered = filtered.filter(e => isPulledStatus(e.entryStatus));
```

Return the new fields while keeping legacy `selectedTab`/`setSelectedTab` aliases temporarily:

```ts
    selectedTab: attentionFilter,
    setSelectedTab: setAttentionFilter,
    attentionFilter,
    setAttentionFilter,
    workMode,
    setWorkMode,
    entryViewMode,
    setEntryViewMode,
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/entries/management/__tests__/entryManagementFilters.test.ts
```

Expected: PASS.

---

### Task 2: Shared Controls And Table Default In Registration View

**Files:**

- Modify: `apps/myk9show/src/components/entries/management/RegistrationView.tsx`
- Modify: `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx`
- Test: `apps/myk9show/src/components/entries/management/__tests__/RegistrationView.test.tsx`

**Interfaces:**

- Consumes: `ENTRY_MANAGEMENT_FILTERS`, `ENTRY_VIEW_MODES`, `attentionFilter`, `setAttentionFilter`, `entryViewMode`, `setEntryViewMode`.
- Produces: a `RegistrationView` that renders `ListControls`, defaults to table view, and no longer renders status tabs for normal entry filters.

- [ ] **Step 1: Write failing tests for shared controls and default table**

Add to `RegistrationView.test.tsx`:

```ts
it('renders shared list controls and defaults to table view', () => {
  render(<RegistrationView {...makeProps()} entryViewMode="table" />);

  expect(screen.getByPlaceholderText('Search entries...')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /table view/i })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('table')).toBeInTheDocument();
});

it('does not render the old entry status tab row', () => {
  render(<RegistrationView {...makeProps()} entryViewMode="table" />);

  expect(screen.queryByRole('tab', { name: /pending/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: /accepted/i })).not.toBeInTheDocument();
});
```

If `makeProps()` does not exist, use the existing test helper in that file and add these props:

```ts
attentionFilter="all"
setAttentionFilter={vi.fn()}
entryViewMode="table"
setEntryViewMode={vi.fn()}
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/entries/management/__tests__/RegistrationView.test.tsx -t "shared list controls"
```

Expected: FAIL because `RegistrationView` still renders the old tab controls.

- [ ] **Step 3: Update RegistrationView props**

In `RegistrationView.tsx`, remove local `entryViewMode` state and add props:

```ts
  attentionFilter: EntryAttentionFilter;
  setAttentionFilter: (filter: EntryAttentionFilter) => void;
  entryViewMode: EntryManagementViewMode;
  setEntryViewMode: (view: EntryManagementViewMode) => void;
```

Import:

```ts
import { ListControls } from '@/components/common/ListControls';
import {
  ENTRY_MANAGEMENT_FILTERS,
  ENTRY_VIEW_MODES,
  type EntryAttentionFilter,
  type EntryManagementViewMode,
} from './entryManagementFilters';
```

- [ ] **Step 4: Replace old tabs/filter chrome with ListControls**

Replace the stats/filter/tabs wrapper with:

```tsx
<EntryStatsCards stats={stats} />

<ListControls
  search={searchTerm}
  onSearchChange={setSearchTerm}
  searchPlaceholder="Search entries..."
  filters={ENTRY_MANAGEMENT_FILTERS}
  filterValues={{
    attention: attentionFilter === 'all' ? '' : attentionFilter,
    payment: paymentFilter === 'all' ? '' : paymentFilter,
  }}
  onFilterChange={(key, value) => {
    if (key === 'attention') setAttentionFilter((value || 'all') as EntryAttentionFilter);
    if (key === 'payment') setPaymentFilter(value || 'all');
  }}
  viewMode={entryViewMode}
  onViewModeChange={mode => setEntryViewMode(mode as EntryManagementViewMode)}
  viewModes={ENTRY_VIEW_MODES}
  resultsShowing={filteredEntries.length}
  resultsTotal={entries.length}
  filtered={filteredEntries.length !== entries.length || searchTerm.length > 0 || paymentFilter !== 'all' || attentionFilter !== 'all'}
  entityName="entries"
/>
```

Render table/cards directly:

```tsx
{entryViewMode === 'table' ? (
  <EntriesTableView
    entries={filteredEntries}
    emailStatusMap={emailStatusMap}
    onResendEmail={handleResendEmail}
    isResendDisabled={isResendDisabled}
    selection={tableSelection}
  />
) : (
  <div className="space-y-3">
    {enrollmentGroups.map(group => (
      <EnrollmentCard key={group.groupKey} ... />
    ))}
  </div>
)}
```

Keep `MoveUpRequestsTab` and `PullManagementTab` imports only until Task 4 moves those queues behind filters; for this task, remove their old tab rendering if `attentionFilter` filtering is already enough.

- [ ] **Step 5: Pass new props from EntryManagementPage**

In `EntryManagementPage.tsx`, destructure from `useEntryManagementFilters`:

```ts
attentionFilter,
setAttentionFilter,
entryViewMode,
setEntryViewMode,
```

Pass them to `RegistrationView`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/entries/management/__tests__/RegistrationView.test.tsx src/components/entries/management/__tests__/RegistrationView.multiselect.test.tsx
```

Expected: PASS.

---

### Task 3: Armband-First Table And Row Action Menu

**Files:**

- Modify: `apps/myk9show/src/components/entries/management/EntriesTableView.tsx`
- Create: `apps/myk9show/src/components/entries/management/EntryRowActionMenu.tsx`
- Test: `apps/myk9show/src/components/entries/management/__tests__/EntriesTableView.selection.test.tsx`

**Interfaces:**

- Produces: `EntryRowActionMenu` with row-level callbacks for status, check-in, armband, comp/uncomp, remove, and resend email.
- Consumes: `RowActionMenu`, current `EntryManagementEntry`, `ArmbandBadge`, existing table selection, and existing `RegistrationView` action handlers.

- [ ] **Step 1: Write failing tests for armband-first and row actions**

Add to `EntriesTableView.selection.test.tsx`:

```ts
it('renders armband as the first data column after selection', () => {
  render(<EntriesTableView entries={makeEntries()} selection={makeSelection()} {...makeActionProps()} />);

  const headers = screen.getAllByRole('columnheader').map(header => header.textContent?.trim());
  expect(headers[1]).toBe('Armband');
});

it('renders one row action menu per entry', () => {
  render(<EntriesTableView entries={makeEntries()} selection={makeSelection()} {...makeActionProps()} />);

  expect(screen.getAllByRole('button', { name: /actions for/i })).toHaveLength(makeEntries().length);
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/entries/management/__tests__/EntriesTableView.selection.test.tsx
```

Expected: FAIL because the current first data column is dog name and there is no row action column.

- [ ] **Step 3: Create EntryRowActionMenu**

Create `EntryRowActionMenu.tsx`:

```tsx
import {
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  Mail,
  PencilLine,
  Ticket,
  Trash2,
  XCircle,
} from 'lucide-react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

interface EntryRowActionMenuProps {
  entry: EntryManagementEntry;
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  onCheckInEntry: (entryId: string) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onOpenCompDialog: (entry: EntryManagementEntry) => void;
  onUncompEntry: (entryId: string) => void;
  onRemoveEntry: (entryId: string) => void;
  onResendEmail?: (registrationId: string) => void;
  isResendDisabled?: (registrationId: string) => boolean;
}

export function EntryRowActionMenu({
  entry,
  onStatusChange,
  onCheckInEntry,
  onOpenArmbandDialog,
  onOpenCompDialog,
  onUncompEntry,
  onRemoveEntry,
  onResendEmail,
  isResendDisabled,
}: EntryRowActionMenuProps) {
  const actions: RowAction[] = [
    {
      id: 'accept',
      label: 'Accept entry',
      icon: <CheckCircle2 className="h-4 w-4" />,
      onSelect: () => onStatusChange(entry.id, EntryStatus.ACCEPTED),
    },
    {
      id: 'waitlist',
      label: 'Move to waitlist',
      icon: <Ticket className="h-4 w-4" />,
      onSelect: () => onStatusChange(entry.id, EntryStatus.WAITLIST),
    },
    {
      id: 'check-in',
      label: 'Check in all classes',
      icon: <ClipboardCheck className="h-4 w-4" />,
      onSelect: () => onCheckInEntry(entry.id),
    },
    {
      id: 'armband',
      label: entry.armbandNumber ? 'Change armband' : 'Assign armband',
      icon: <PencilLine className="h-4 w-4" />,
      onSelect: () => onOpenArmbandDialog(entry),
    },
    {
      id: 'comp',
      label: entry.comped ? 'Remove comp' : 'Comp entry',
      icon: <DollarSign className="h-4 w-4" />,
      onSelect: () => (entry.comped ? onUncompEntry(entry.id) : onOpenCompDialog(entry)),
    },
    {
      id: 'resend-email',
      label: 'Resend confirmation',
      icon: <Mail className="h-4 w-4" />,
      onSelect: () => onResendEmail?.(entry.registrationId),
      disabled: !onResendEmail || isResendDisabled?.(entry.registrationId) === true,
      hidden: !entry.registrationId,
    },
    {
      id: 'reject',
      label: 'Reject entry',
      icon: <XCircle className="h-4 w-4" />,
      onSelect: () => onStatusChange(entry.id, EntryStatus.REJECTED),
      variant: 'destructive',
    },
    {
      id: 'remove',
      label: 'Remove entry',
      icon: <Trash2 className="h-4 w-4" />,
      onSelect: () => onRemoveEntry(entry.id),
      variant: 'destructive',
    },
  ];

  return <RowActionMenu actions={actions} size="sm" label={`Actions for ${entry.dogName}`} />;
}
```

- [ ] **Step 4: Reorder table columns and disable table search**

In `EntriesTableView.tsx`, add matching callback props and place armband column before dog column and add actions column at the end:

```ts
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  onCheckInEntry: (entryId: string) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onOpenCompDialog: (entry: EntryManagementEntry) => void;
  onUncompEntry: (entryId: string) => void;
  onRemoveEntry: (entryId: string) => void;
```

```tsx
{
  accessorKey: 'armbandNumber',
  header: 'Armband',
  accessorFn: entry => (entry.armbandNumber ?? '').toLowerCase(),
  cell: ({ row }) => <ArmbandBadge armband={row.original.armbandNumber} />,
},
{
  accessorKey: 'dogName',
  header: 'Dog',
  ...
},
...
{
  id: '_actions',
  header: '',
  cell: ({ row }) => (
    <span onClick={e => e.stopPropagation()} role="presentation">
      <EntryRowActionMenu
        entry={row.original}
        onStatusChange={onStatusChange}
        onCheckInEntry={onCheckInEntry}
        onOpenArmbandDialog={onOpenArmbandDialog}
        onOpenCompDialog={onOpenCompDialog}
        onUncompEntry={onUncompEntry}
        onRemoveEntry={onRemoveEntry}
        onResendEmail={onResendEmail}
        isResendDisabled={isResendDisabled}
      />
    </span>
  ),
  enableSorting: false,
  enableHiding: false,
}
```

Pass `showSearch={false}` to `DataTable`:

```tsx
<DataTable<EntryManagementEntry>
  tableId="entriesManagement"
  data={entries}
  columns={columns}
  getRowId={entry => entry.id}
  showSearch={false}
  {...(onEntryClick !== undefined ? { onRowClick: onEntryClick } : {})}
/>
```

Pass the callbacks from `RegistrationView` into `EntriesTableView`. Implement `onCheckInEntry` as
`entryId => onBulkCheckIn([entryId])` so the table row menu uses the existing bulk check-in mutation
path instead of adding a second check-in write path.

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/entries/management/__tests__/EntriesTableView.selection.test.tsx
```

Expected: PASS.

---

### Task 4: Selected-Row Bulk Action Menu

**Files:**

- Create: `apps/myk9show/src/components/entries/management/EntryBulkActionMenu.tsx`
- Modify: `apps/myk9show/src/components/entries/management/EntryBulkActionsBar.tsx`
- Test: `apps/myk9show/src/components/entries/management/__tests__/EntryBulkActionsBar.test.tsx`

**Interfaces:**

- Produces: `EntryBulkActionMenu` using `RowActionMenu`.
- Consumes: existing `EntryBulkActionsBar` selected entries and handlers.

- [ ] **Step 1: Write failing test for bulk three-dot menu**

In `EntryBulkActionsBar.test.tsx`, add:

```ts
it('renders selected-entry bulk actions through an overflow menu', async () => {
  const onBulkStatusChange = vi.fn();
  const { user } = render(
    <EntryBulkActionsBar
      selectedEntries={makeSelectedEntries(2)}
      onBulkStatusChange={onBulkStatusChange}
      onBulkCheckIn={vi.fn()}
      onClear={vi.fn()}
    />
  );

  await user.click(screen.getByRole('button', { name: /bulk actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /accept selected/i }));

  expect(onBulkStatusChange).toHaveBeenCalledWith(expect.any(Array), 'accepted');
});
```

- [ ] **Step 2: Create EntryBulkActionMenu**

Create `EntryBulkActionMenu.tsx`:

```tsx
import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

interface EntryBulkActionMenuProps {
  selectedEntries: EntryManagementEntry[];
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
  onBulkCheckIn: (entryIds: string[]) => void;
}

export function EntryBulkActionMenu({
  selectedEntries,
  onBulkStatusChange,
  onBulkCheckIn,
}: EntryBulkActionMenuProps) {
  const entryIds = selectedEntries.map(entry => entry.id);
  const disabled = entryIds.length === 0;
  const actions: RowAction[] = [
    {
      id: 'accept-selected',
      label: 'Accept selected',
      icon: <CheckCircle2 className="h-4 w-4" />,
      onSelect: () => onBulkStatusChange(entryIds, EntryStatus.ACCEPTED),
      disabled,
    },
    {
      id: 'check-in-selected',
      label: 'Check in selected',
      icon: <ClipboardCheck className="h-4 w-4" />,
      onSelect: () => onBulkCheckIn(entryIds),
      disabled,
    },
    {
      id: 'reject-selected',
      label: 'Reject selected',
      icon: <XCircle className="h-4 w-4" />,
      onSelect: () => onBulkStatusChange(entryIds, EntryStatus.REJECTED),
      disabled,
      variant: 'destructive',
    },
  ];

  return <RowActionMenu actions={actions} size="touch" label="Bulk actions" disabled={disabled} />;
}
```

- [ ] **Step 3: Use menu inside EntryBulkActionsBar**

Keep the selected count and clear button, replace individual primary action buttons with:

```tsx
<EntryBulkActionMenu
  selectedEntries={selectedEntries}
  onBulkStatusChange={onBulkStatusChange}
  onBulkCheckIn={onBulkCheckIn}
/>
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/entries/management/__tests__/EntryBulkActionsBar.test.tsx
```

Expected: PASS.

---

### Task 5: Enrollment Card Dog Subgroups

**Files:**

- Modify: `apps/myk9show/src/components/entries/management/EnrollmentCard.tsx`
- Test: `apps/myk9show/src/components/entries/management/__tests__/EnrollmentCard.test.tsx`

**Interfaces:**

- Consumes: existing `EnrollmentGroup` shape and `group.entries`.
- Produces: dog subgroups within each enrollment card, keeping payment actions at enrollment scope.

- [ ] **Step 1: Write failing test for dog subgroups**

Add to `EnrollmentCard.test.tsx`:

```ts
it('groups entries by dog inside an enrollment card', () => {
  render(<EnrollmentCard {...makeProps({ group: makeEnrollmentGroupWithTwoDogs() })} />);

  expect(screen.getByRole('heading', { name: /fido/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /spot/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Add local dog grouping helper**

Inside `EnrollmentCard.tsx`, add:

```ts
const dogGroups = useMemo(() => {
  const map = new Map<string, EntryManagementEntry[]>();
  for (const entry of group.entries) {
    const key = entry.dogId || entry.dogName;
    const rows = map.get(key) ?? [];
    rows.push(entry);
    map.set(key, rows);
  }
  return Array.from(map.entries()).map(([dogKey, entries]) => ({
    dogKey,
    dogName: entries[0]?.dogName ?? 'Unknown dog',
    entries,
  }));
}, [group.entries]);
```

- [ ] **Step 3: Render dog sections inside the enrollment card**

Replace the flat entry list area with dog sections:

```tsx
{dogGroups.map(dogGroup => (
  <section key={dogGroup.dogKey} className="rounded-md border border-border/50 p-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold">{dogGroup.dogName}</h3>
      <span className="text-xs text-muted-foreground">
        {dogGroup.entries.length} {dogGroup.entries.length === 1 ? 'entry' : 'entries'}
      </span>
    </div>
    <div className="mt-3 space-y-2">
      {dogGroup.entries.map(entry => (
        <EntryListCard key={entry.id} entry={entry} ... />
      ))}
    </div>
  </section>
))}
```

Keep existing payment controls outside dog sections at enrollment-card scope.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/entries/management/__tests__/EnrollmentCard.test.tsx
```

Expected: PASS.

---

### Task 6: Final Verification And Browser Smoke

**Files:**

- Verify: all files changed above
- Test: focused Vitest files from Tasks 1-5

**Interfaces:**

- Consumes: all prior task outputs.
- Produces: verified implementation ready for PR review.

- [ ] **Step 1: Run focused component tests**

Run:

```bash
cd apps/myk9show && npx vitest run \
  src/components/entries/management/__tests__/entryManagementFilters.test.ts \
  src/components/entries/management/__tests__/RegistrationView.test.tsx \
  src/components/entries/management/__tests__/RegistrationView.multiselect.test.tsx \
  src/components/entries/management/__tests__/EntriesTableView.selection.test.tsx \
  src/components/entries/management/__tests__/EntryBulkActionsBar.test.tsx \
  src/components/entries/management/__tests__/EnrollmentCard.test.tsx
```

Expected: PASS. If a suite hangs for more than 60 seconds, stop and report it.

- [ ] **Step 2: Run typecheck for myK9Show**

Run:

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Browser smoke**

Run the app with:

```bash
pnpm dev:show
```

Open a secretary Entry Management route with seeded data and verify:

- Table view is selected by default.
- Search/filter/view controls render once.
- `entryTab=pending` lands on the pending filter.
- `tab=waitlist` lands on the waitlist filter.
- The table's first data column is armband.
- Each row has a row action menu.
- Selecting rows enables bulk actions.
- Card view shows enrollment cards with dog subgroups.

- [ ] **Step 4: Docs and tracking**

Update `docs/plan-entry-management-layout.md` with an implementation note listing completed phases and verification results. Keep the status `Active` until the PR merges.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/myk9show/src docs/plan-entry-management-layout.md docs/superpowers/plans/2026-06-19-entry-management-layout.md
git commit -m "refactor: streamline entry management layout"
```

Expected: commit succeeds from the feature worktree.
