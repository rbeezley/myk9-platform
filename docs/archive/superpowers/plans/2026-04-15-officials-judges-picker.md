# Officials & Judges Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, role-filtered pickers in the Show Creation Wizard with grouped comboboxes that auto-fill the secretary field, surface qualified suggestions first, and allow inline person/credential creation without requiring admin involvement.

**Architecture:** New `GroupedSearchablePopover` UI primitive used by two new feature components (`OfficialPicker`, `JudgesPicker`). `ShowDetailsStep` is simplified to wire them up and auto-fill the secretary. `getAllUsers` query is updated to include the `judge_qualifications` join so `judgeInfo` is populated on every user in the store. No platform roles are assigned during show creation.

**Tech Stack:** React 18, TypeScript, shadcn/ui (Popover, Badge, Button, Input), Zustand (`userStore`), React Query, Supabase (`people` + `judge_qualifications` tables via `judgeQualificationQueries.create` and `createUser`), Vitest + Testing Library, Playwright (E2E).

---

## File Map

**Create:**
- `apps/myk9show/src/components/ui/grouped-searchable-popover.tsx` — generic grouped list popover with section headers and footer slot
- `apps/myk9show/src/components/shows/wizard/steps/OfficialPicker.tsx` — self-contained chairman/secretary picker with inline create form
- `apps/myk9show/src/components/shows/wizard/steps/JudgesPicker.tsx` — multi-select judges picker with credentials form and new-person form
- `apps/myk9show/src/test/components/ui/GroupedSearchablePopover.test.tsx`
- `apps/myk9show/src/test/components/wizard/OfficialPicker.test.tsx`
- `apps/myk9show/src/test/components/wizard/JudgesPicker.test.tsx`
- `apps/myk9show/src/test/e2e/secretary/show-wizard-officials.spec.ts`

**Modify:**
- `apps/myk9show/src/services/database/queries/userQueries.ts:22` — add `judge_qualifications` join to `getAllUsers` select
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.helpers.ts` — add `groupPeopleForOfficial` and `groupPeopleForJudges`; remove `getAvailableJudges` (replaced)
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx` — add `loadPeople` mount effect, secretary auto-fill, render new pickers, remove panelManager flows and per-picker search state
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx` — delete `OfficialsSection` and `JudgesSection` exports (ClubSection stays)

---

## Task 1: `GroupedSearchablePopover` component

**Files:**
- Create: `apps/myk9show/src/components/ui/grouped-searchable-popover.tsx`
- Test: `apps/myk9show/src/test/components/ui/GroupedSearchablePopover.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/test/components/ui/GroupedSearchablePopover.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupedSearchablePopover } from '@/components/ui/grouped-searchable-popover';

interface Item { id: string; name: string; }

const people: Item[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
];
const judges: Item[] = [{ id: '3', name: 'Carol' }];

function renderPicker(overrides: Partial<Parameters<typeof GroupedSearchablePopover>[0]> = {}) {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <GroupedSearchablePopover<Item>
      open={true}
      onOpenChange={onOpenChange}
      triggerLabel="Select person"
      searchPlaceholder="Search..."
      searchTerm=""
      onSearchChange={vi.fn()}
      groups={[
        { groupKey: 'suggested', label: 'Suggested', items: judges },
        { groupKey: 'all', label: 'All People', items: people },
      ]}
      renderItem={(item) => <span>{item.name}</span>}
      onSelect={onSelect}
      {...overrides}
    />
  );
  return { onSelect, onOpenChange };
}

describe('GroupedSearchablePopover', () => {
  it('renders section headers for each group', () => {
    renderPicker();
    expect(screen.getByText('Suggested')).toBeInTheDocument();
    expect(screen.getByText('All People')).toBeInTheDocument();
  });

  it('renders items in each group', () => {
    renderPicker();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('hides empty groups', () => {
    renderPicker({
      groups: [
        { groupKey: 'suggested', label: 'Suggested', items: [] },
        { groupKey: 'all', label: 'All People', items: people },
      ],
    });
    expect(screen.queryByText('Suggested')).not.toBeInTheDocument();
    expect(screen.getByText('All People')).toBeInTheDocument();
  });

  it('calls onSelect with item and groupKey when an item is clicked', () => {
    const { onSelect } = renderPicker();
    fireEvent.click(screen.getByText('Carol'));
    expect(onSelect).toHaveBeenCalledWith({ id: '3', name: 'Carol' }, 'suggested');
  });

  it('renders footer when provided', () => {
    renderPicker({ footer: <button>Add new</button> });
    expect(screen.getByText('Add new')).toBeInTheDocument();
  });

  it('shows "No results" when all groups are empty', () => {
    renderPicker({
      groups: [
        { groupKey: 'suggested', label: 'Suggested', items: [] },
        { groupKey: 'all', label: 'All People', items: [] },
      ],
    });
    expect(screen.getByText('No results')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL (component doesn't exist yet)**

```bash
cd apps/myk9show && npx vitest run src/test/components/ui/GroupedSearchablePopover.test.tsx
```
Expected: FAIL — "Cannot find module '@/components/ui/grouped-searchable-popover'"

- [ ] **Step 3: Create the component**

```typescript
// apps/myk9show/src/components/ui/grouped-searchable-popover.tsx
import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search } from 'lucide-react';

export interface PopoverGroup<T> {
  label: string;
  items: T[];
  groupKey: string;
}

export interface GroupedSearchablePopoverProps<T extends { id: string }> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  searchPlaceholder: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  groups: PopoverGroup<T>[];
  renderItem: (item: T, groupKey: string) => React.ReactNode;
  onSelect: (item: T, groupKey: string) => void;
  footer?: React.ReactNode;
}

function GroupedSearchablePopover<T extends { id: string }>({
  open,
  onOpenChange,
  triggerLabel,
  searchPlaceholder,
  searchTerm,
  onSearchChange,
  groups,
  renderItem,
  onSelect,
  footer,
}: GroupedSearchablePopoverProps<T>) {
  const visibleGroups = groups.filter(g => g.items.length > 0);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          {triggerLabel}
          <Search className="ml-auto h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <Input
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-auto">
          {visibleGroups.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground text-center">No results</div>
          )}
          {visibleGroups.map((group, idx) => (
            <React.Fragment key={group.groupKey}>
              {idx > 0 && <div className="h-px bg-border mx-2" />}
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </div>
              {group.items.map(item => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelect(item, group.groupKey);
                    onOpenChange(false);
                  }}
                >
                  {renderItem(item, group.groupKey)}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
        {footer && <div className="border-t p-2">{footer}</div>}
      </PopoverContent>
    </Popover>
  );
}

export { GroupedSearchablePopover };
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd apps/myk9show && npx vitest run src/test/components/ui/GroupedSearchablePopover.test.tsx
```
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/myk9show && git add src/components/ui/grouped-searchable-popover.tsx src/test/components/ui/GroupedSearchablePopover.test.tsx && git commit -m "feat(wizard): add GroupedSearchablePopover component"
```

---

## Task 2: Update `getAllUsers` to include judge qualifications join

**Files:**
- Modify: `apps/myk9show/src/services/database/queries/userQueries.ts:22`

The mapper at `userMappers.ts` already handles `judge_qualifications` in the mapping logic, but `getAllUsers` doesn't include the join — so `judgeInfo` is always `undefined` in the store. One-line fix.

- [ ] **Step 1: Update the query**

In `apps/myk9show/src/services/database/queries/userQueries.ts`, find the `getAllUsers` function (line 16). Change:

```typescript
      const { data, error } = await supabase
        .from('people')
        .select(`*, ${USER_ROLES_FK}(role:roles(name))`)
        .is('deleted_at', null)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });
```

To:

```typescript
      const { data, error } = await supabase
        .from('people')
        .select(`*, ${USER_ROLES_FK}(role:roles(name)), ${JUDGE_QUALIFICATIONS_SELECT}`)
        .is('deleted_at', null)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });
```

`JUDGE_QUALIFICATIONS_SELECT` is already defined at line 7 of the same file as:
```typescript
const JUDGE_QUALIFICATIONS_SELECT = `judge_qualifications(
  id, organization, qualification_level, disciplines, judge_number,
  date_obtained, expiration_date, is_active
)`;
```

- [ ] **Step 2: Run the full unit test suite to verify no regressions**

```bash
cd apps/myk9show && npx vitest run src/test/services/database/queries/userQueries.test.ts
```
Expected: all existing tests PASS

- [ ] **Step 3: Commit**

```bash
cd apps/myk9show && git add src/services/database/queries/userQueries.ts && git commit -m "fix(store): include judge_qualifications in getAllUsers query"
```

---

## Task 3: Add grouping helpers to `ShowDetailsStep.helpers.ts`

**Files:**
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.helpers.ts`
- Test: `apps/myk9show/src/test/components/wizard/ShowDetailsStep.helpers.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/myk9show/src/test/components/wizard/ShowDetailsStep.helpers.test.tsx
import { describe, it, expect } from 'vitest';
import { groupPeopleForOfficial, groupPeopleForJudges } from '@/components/shows/wizard/steps/ShowDetailsStep.helpers';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';

function makeUser(overrides: Partial<User> & { id: string }): User {
  return {
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    roles: [],
    judgeInfo: undefined,
    ...overrides,
  } as User;
}

describe('groupPeopleForOfficial', () => {
  const chairman = makeUser({ id: '1', firstName: 'Alice', roles: [UserRole.CHAIRMAN] });
  const secretary = makeUser({ id: '2', firstName: 'Bob', roles: [UserRole.SECRETARY] });
  const exhibitor = makeUser({ id: '3', firstName: 'Carol', roles: [UserRole.EXHIBITOR] });

  it('puts role-holders in suggested, everyone else in others', () => {
    const result = groupPeopleForOfficial(
      [chairman, secretary, exhibitor],
      [UserRole.CHAIRMAN],
      ''
    );
    expect(result.suggested).toEqual([chairman]);
    expect(result.others).toContain(secretary);
    expect(result.others).toContain(exhibitor);
  });

  it('filters by search term across both groups', () => {
    const result = groupPeopleForOfficial([chairman, secretary, exhibitor], [UserRole.CHAIRMAN], 'ali');
    expect(result.suggested).toHaveLength(1);
    expect(result.others).toHaveLength(0);
  });

  it('returns all in others when no suggested roles match', () => {
    const result = groupPeopleForOfficial([exhibitor], [UserRole.CHAIRMAN], '');
    expect(result.suggested).toHaveLength(0);
    expect(result.others).toHaveLength(1);
  });
});

describe('groupPeopleForJudges', () => {
  const qualified = makeUser({
    id: '1',
    firstName: 'Alice',
    judgeInfo: { judgeNumber: 'AKC-1', qualifications: [{ judgeNumber: 'AKC-1', organization: 'AKC' } as never], certifications: [], availability: { startDate: null, endDate: null, blackoutDates: [], maxShowsPerMonth: 0, travelRadius: 0 } },
  });
  const unqualified = makeUser({ id: '2', firstName: 'Bob' });
  const alreadySelected = makeUser({ id: '3', firstName: 'Carol' });

  it('puts people with judgeInfo in qualified group', () => {
    const result = groupPeopleForJudges([qualified, unqualified], [], '');
    expect(result.qualified).toEqual([qualified]);
    expect(result.others).toEqual([unqualified]);
  });

  it('excludes already-selected judges from both groups', () => {
    const result = groupPeopleForJudges([qualified, unqualified, alreadySelected], ['3'], '');
    expect(result.qualified).not.toContain(alreadySelected);
    expect(result.others).not.toContain(alreadySelected);
  });

  it('filters by name search term', () => {
    const result = groupPeopleForJudges([qualified, unqualified], [], 'ali');
    expect(result.qualified).toHaveLength(1);
    expect(result.others).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
cd apps/myk9show && npx vitest run src/test/components/wizard/ShowDetailsStep.helpers.test.tsx
```
Expected: FAIL — "groupPeopleForOfficial is not exported"

- [ ] **Step 3: Add helpers to the file**

In `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.helpers.ts`, append after the existing exports:

```typescript
import { UserRole } from '@/types/auth-types';

/**
 * Split all people into "suggested" (has one of the given roles) and "others".
 * Both groups are filtered by searchTerm. Used by OfficialPicker.
 */
export function groupPeopleForOfficial(
  people: User[],
  suggestedRoles: UserRole[],
  searchTerm: string
): { suggested: User[]; others: User[] } {
  const sorted = getAllPeopleSorted(people);
  const filtered = filterPeopleByName(sorted, searchTerm);
  return {
    suggested: filtered.filter(p =>
      p.roles?.some(r => suggestedRoles.includes(r as UserRole))
    ),
    others: filtered.filter(
      p => !p.roles?.some(r => suggestedRoles.includes(r as UserRole))
    ),
  };
}

/**
 * Split people (minus already-selected) into "qualified" (has judge_qualifications)
 * and "others". Both groups are filtered by searchTerm. Used by JudgesPicker.
 */
export function groupPeopleForJudges(
  people: User[],
  selectedIds: string[],
  searchTerm: string
): { qualified: User[]; others: User[] } {
  const sorted = getAllPeopleSorted(people);
  const available = sorted.filter(p => !selectedIds.includes(p.id));
  const filtered = filterPeopleByName(available, searchTerm);
  return {
    qualified: filtered.filter(
      p => (p.judgeInfo?.qualifications?.length ?? 0) > 0
    ),
    others: filtered.filter(
      p => (p.judgeInfo?.qualifications?.length ?? 0) === 0
    ),
  };
}
```

Also add `User` to the imports at the top of the file (it already imports from `@/types/user-types` via the re-export — add the direct import if needed):

```typescript
import type { User } from '@/types/user-types';
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd apps/myk9show && npx vitest run src/test/components/wizard/ShowDetailsStep.helpers.test.tsx
```
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/myk9show && git add src/components/shows/wizard/steps/ShowDetailsStep.helpers.ts src/test/components/wizard/ShowDetailsStep.helpers.test.tsx && git commit -m "feat(wizard): add groupPeopleForOfficial and groupPeopleForJudges helpers"
```

---

## Task 4: `OfficialPicker` component + tests

A self-contained component for the chairman or secretary field. Owns its own popover open state, search term state, and "create new person" form state.

**Files:**
- Create: `apps/myk9show/src/components/shows/wizard/steps/OfficialPicker.tsx`
- Test: `apps/myk9show/src/test/components/wizard/OfficialPicker.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/myk9show/src/test/components/wizard/OfficialPicker.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OfficialPicker } from '@/components/shows/wizard/steps/OfficialPicker';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';
import { renderWithProviders } from '@/test/utils/testUtils';

function makeUser(id: string, firstName: string, roles: UserRole[] = []): User {
  return { id, firstName, lastName: 'Smith', email: `${firstName.toLowerCase()}@test.com`, roles } as User;
}

const chairman = makeUser('1', 'Alice', [UserRole.CHAIRMAN]);
const exhibitor = makeUser('2', 'Bob', [UserRole.EXHIBITOR]);

describe('OfficialPicker', () => {
  it('shows selected person name when selectedPersonId is set', () => {
    renderWithProviders(
      <OfficialPicker
        label="Show Chairman"
        selectedPersonId="1"
        people={[chairman, exhibitor]}
        suggestedRoles={[UserRole.CHAIRMAN]}
        onSelect={vi.fn()}
        onCreatePerson={vi.fn()}
      />
    );
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows auto-fill badge when autoFillBadge is provided', () => {
    renderWithProviders(
      <OfficialPicker
        label="Show Secretary"
        selectedPersonId="2"
        people={[chairman, exhibitor]}
        suggestedRoles={[UserRole.SECRETARY]}
        autoFillBadge="You"
        onSelect={vi.fn()}
        onCreatePerson={vi.fn()}
      />
    );
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('calls onSelect when a person is chosen from the popover', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <OfficialPicker
        label="Show Chairman"
        selectedPersonId={undefined}
        people={[chairman, exhibitor]}
        suggestedRoles={[UserRole.CHAIRMAN]}
        onSelect={onSelect}
        onCreatePerson={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /select chairman/i }));
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('expands create form when "Add new" is clicked', async () => {
    renderWithProviders(
      <OfficialPicker
        label="Show Chairman"
        selectedPersonId={undefined}
        people={[chairman]}
        suggestedRoles={[UserRole.CHAIRMAN]}
        onSelect={vi.fn()}
        onCreatePerson={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /select chairman/i }));
    await waitFor(() => screen.getByText(/add new chairman/i));
    fireEvent.click(screen.getByText(/add new chairman/i));
    expect(screen.getByPlaceholderText('First name')).toBeInTheDocument();
  });

  it('calls onCreatePerson with form data when "Add" is submitted', async () => {
    const onCreatePerson = vi.fn().mockResolvedValue('new-id');
    renderWithProviders(
      <OfficialPicker
        label="Show Chairman"
        selectedPersonId={undefined}
        people={[]}
        suggestedRoles={[UserRole.CHAIRMAN]}
        onSelect={vi.fn()}
        onCreatePerson={onCreatePerson}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /select chairman/i }));
    await waitFor(() => screen.getByText(/add new chairman/i));
    fireEvent.click(screen.getByText(/add new chairman/i));
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'jane@doe.com' } });
    fireEvent.click(screen.getByRole('button', { name: /add chairman/i }));
    await waitFor(() =>
      expect(onCreatePerson).toHaveBeenCalledWith({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@doe.com',
      })
    );
  });

  it('disables the save button when required fields are empty', async () => {
    renderWithProviders(
      <OfficialPicker
        label="Show Chairman"
        selectedPersonId={undefined}
        people={[]}
        suggestedRoles={[UserRole.CHAIRMAN]}
        onSelect={vi.fn()}
        onCreatePerson={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /select chairman/i }));
    await waitFor(() => screen.getByText(/add new chairman/i));
    fireEvent.click(screen.getByText(/add new chairman/i));
    expect(screen.getByRole('button', { name: /add chairman/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
cd apps/myk9show && npx vitest run src/test/components/wizard/OfficialPicker.test.tsx
```
Expected: FAIL — "Cannot find module '.../OfficialPicker'"

- [ ] **Step 3: Create the component**

```typescript
// apps/myk9show/src/components/shows/wizard/steps/OfficialPicker.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { GroupedSearchablePopover } from '@/components/ui/grouped-searchable-popover';
import { groupPeopleForOfficial, getPersonName } from './ShowDetailsStep.helpers';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';

interface CreatePersonData {
  firstName: string;
  lastName: string;
  email: string;
}

export interface OfficialPickerProps {
  label: string;
  required?: boolean;
  selectedPersonId: string | undefined;
  people: User[];
  suggestedRoles: UserRole[];
  autoFillBadge?: string;
  onSelect: (personId: string) => void;
  onCreatePerson: (data: CreatePersonData) => Promise<string>;
}

export const OfficialPicker: React.FC<OfficialPickerProps> = ({
  label,
  required = false,
  selectedPersonId,
  people,
  suggestedRoles,
  autoFillBadge,
  onSelect,
  onCreatePerson,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedName = getPersonName(people, selectedPersonId);
  const { suggested, others } = groupPeopleForOfficial(people, suggestedRoles, searchTerm);

  const handleOpenAddNew = () => {
    setOpen(false);
    setShowCreateForm(true);
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setFirstName('');
    setLastName('');
    setEmail('');
  };

  const handleSaveCreate = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    setSaving(true);
    try {
      const newId = await onCreatePerson({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() });
      onSelect(newId);
      handleCancelCreate();
    } finally {
      setSaving(false);
    }
  };

  const canSave = firstName.trim() !== '' && lastName.trim() !== '' && email.trim() !== '';

  const renderPersonRow = (person: User) => (
    <div className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{person.firstName} {person.lastName}</span>
      </div>
      {person.email && <div className="text-xs text-muted-foreground">{person.email}</div>}
    </div>
  );

  return (
    <div className="space-y-2">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>

      {/* Trigger / selected state */}
      {!showCreateForm && (
        <GroupedSearchablePopover<User>
          open={open}
          onOpenChange={setOpen}
          triggerLabel={
            selectedName
              ? selectedName
              : `Select ${label.toLowerCase()}`
          }
          searchPlaceholder={`Search ${label.toLowerCase()}…`}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          groups={[
            { groupKey: 'suggested', label: 'Suggested', items: suggested },
            { groupKey: 'all', label: 'All People', items: others },
          ]}
          renderItem={renderPersonRow}
          onSelect={person => onSelect(person.id)}
          footer={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-primary"
              onClick={handleOpenAddNew}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add new {label.toLowerCase()}
            </Button>
          }
        />
      )}

      {/* Auto-fill badge */}
      {autoFillBadge && selectedName && !showCreateForm && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-indigo-400 border-indigo-400/30">
          {autoFillBadge}
        </Badge>
      )}

      {/* Inline create form */}
      {showCreateForm && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
          <p className="text-sm font-semibold">New {label}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">First name *</Label>
              <Input
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last name *</Label>
              <Input
                placeholder="Last name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email *</Label>
            <Input
              placeholder="email@example.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCancelCreate}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSave || saving}
              onClick={handleSaveCreate}
            >
              Add {label}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd apps/myk9show && npx vitest run src/test/components/wizard/OfficialPicker.test.tsx
```
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/myk9show && git add src/components/shows/wizard/steps/OfficialPicker.tsx src/test/components/wizard/OfficialPicker.test.tsx && git commit -m "feat(wizard): add OfficialPicker grouped combobox with inline create form"
```

---

## Task 5: `JudgesPicker` component + tests

Multi-select picker with chips, grouped combobox, and two distinct form states: (a) add credentials to existing person, (b) create new person + credentials.

**Files:**
- Create: `apps/myk9show/src/components/shows/wizard/steps/JudgesPicker.tsx`
- Test: `apps/myk9show/src/test/components/wizard/JudgesPicker.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/myk9show/src/test/components/wizard/JudgesPicker.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JudgesPicker } from '@/components/shows/wizard/steps/JudgesPicker';
import type { User } from '@/types/user-types';
import type { ResolvedJudge } from '@/components/shows/wizard/steps/ShowDetailsStep.types';
import { renderWithProviders } from '@/test/utils/testUtils';

function makeUser(id: string, firstName: string, hasCredentials = false): User {
  return {
    id,
    firstName,
    lastName: 'Smith',
    email: `${firstName.toLowerCase()}@test.com`,
    roles: [],
    judgeInfo: hasCredentials
      ? {
          judgeNumber: 'AKC-1',
          qualifications: [{ judgeNumber: 'AKC-1', organization: 'AKC' } as never],
          certifications: [],
          availability: { startDate: null, endDate: null, blackoutDates: [], maxShowsPerMonth: 0, travelRadius: 0 },
        }
      : undefined,
  } as User;
}

const qualifiedJudge = makeUser('1', 'Alice', true);
const unqualified = makeUser('2', 'Bob', false);

const resolvedAlice: ResolvedJudge = { id: '1', name: 'Alice Smith', judgeNumber: 'AKC-1' };

describe('JudgesPicker', () => {
  it('renders selected judge chips', () => {
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[resolvedAlice]}
        people={[qualifiedJudge, unqualified]}
        onAddJudge={vi.fn()}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={vi.fn()}
        onCreateJudge={vi.fn()}
      />
    );
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('#AKC-1')).toBeInTheDocument();
  });

  it('calls onRemoveJudge when chip × is clicked', () => {
    const onRemoveJudge = vi.fn();
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[resolvedAlice]}
        people={[qualifiedJudge]}
        onAddJudge={vi.fn()}
        onRemoveJudge={onRemoveJudge}
        onSaveCredentials={vi.fn()}
        onCreateJudge={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /remove alice smith/i }));
    expect(onRemoveJudge).toHaveBeenCalledWith('1');
  });

  it('calls onAddJudge immediately when selecting from Qualified group', async () => {
    const onAddJudge = vi.fn();
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[]}
        people={[qualifiedJudge, unqualified]}
        onAddJudge={onAddJudge}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={vi.fn()}
        onCreateJudge={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /search and add judges/i }));
    await waitFor(() => screen.getByText('Alice Smith'));
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(onAddJudge).toHaveBeenCalledWith('1');
  });

  it('opens credentials form when selecting from All People group', async () => {
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[]}
        people={[qualifiedJudge, unqualified]}
        onAddJudge={vi.fn()}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={vi.fn()}
        onCreateJudge={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /search and add judges/i }));
    await waitFor(() => screen.getByText('Bob Smith'));
    fireEvent.click(screen.getByText('Bob Smith'));
    expect(screen.getByText(/add judge credentials.*bob smith/i)).toBeInTheDocument();
  });

  it('calls onSaveCredentials with form data when credentials form is submitted', async () => {
    const onSaveCredentials = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[]}
        people={[qualifiedJudge, unqualified]}
        onAddJudge={vi.fn()}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={onSaveCredentials}
        onCreateJudge={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /search and add judges/i }));
    await waitFor(() => screen.getByText('Bob Smith'));
    fireEvent.click(screen.getByText('Bob Smith'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 98234'), { target: { value: 'AKC-99' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'bob@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /save & add to show/i }));
    await waitFor(() =>
      expect(onSaveCredentials).toHaveBeenCalledWith('2', {
        organization: 'AKC',
        judgeNumber: 'AKC-99',
        email: 'bob@test.com',
      })
    );
  });

  it('opens new judge form when "Add new judge" footer is clicked', async () => {
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[]}
        people={[]}
        onAddJudge={vi.fn()}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={vi.fn()}
        onCreateJudge={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /search and add judges/i }));
    await waitFor(() => screen.getByText(/add new judge/i));
    fireEvent.click(screen.getByText(/add new judge/i));
    expect(screen.getByPlaceholderText('First name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Last name')).toBeInTheDocument();
  });

  it('calls onCreateJudge with full form data', async () => {
    const onCreateJudge = vi.fn().mockResolvedValue('new-id');
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[]}
        people={[]}
        onAddJudge={vi.fn()}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={vi.fn()}
        onCreateJudge={onCreateJudge}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /search and add judges/i }));
    await waitFor(() => screen.getByText(/add new judge/i));
    fireEvent.click(screen.getByText(/add new judge/i));
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Lee' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 98234'), { target: { value: 'UKC-55' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'dana@lee.com' } });
    fireEvent.click(screen.getByRole('button', { name: /add judge/i }));
    await waitFor(() =>
      expect(onCreateJudge).toHaveBeenCalledWith({
        firstName: 'Dana',
        lastName: 'Lee',
        organization: 'AKC',
        judgeNumber: 'UKC-55',
        email: 'dana@lee.com',
      })
    );
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
cd apps/myk9show && npx vitest run src/test/components/wizard/JudgesPicker.test.tsx
```
Expected: FAIL — "Cannot find module '.../JudgesPicker'"

- [ ] **Step 3: Create the component**

```typescript
// apps/myk9show/src/components/shows/wizard/steps/JudgesPicker.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Plus, GraduationCap } from 'lucide-react';
import { GroupedSearchablePopover } from '@/components/ui/grouped-searchable-popover';
import { groupPeopleForJudges } from './ShowDetailsStep.helpers';
import type { User } from '@/types/user-types';
import type { ResolvedJudge } from './ShowDetailsStep.types';

interface SaveCredentialsData {
  organization: string;
  judgeNumber: string;
  email: string;
}

interface CreateJudgeData {
  firstName: string;
  lastName: string;
  organization: string;
  judgeNumber: string;
  email: string;
}

export interface JudgesPickerProps {
  selectedJudges: ResolvedJudge[];
  people: User[];
  onAddJudge: (personId: string) => void;
  onRemoveJudge: (personId: string) => void;
  onSaveCredentials: (personId: string, data: SaveCredentialsData) => Promise<void>;
  onCreateJudge: (data: CreateJudgeData) => Promise<string>;
}

type FormState =
  | { type: 'none' }
  | { type: 'credentials'; person: User }
  | { type: 'new' };

const ORGS = ['AKC', 'UKC'] as const;

export const JudgesPicker: React.FC<JudgesPickerProps> = ({
  selectedJudges,
  people,
  onAddJudge,
  onRemoveJudge,
  onSaveCredentials,
  onCreateJudge,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formState, setFormState] = useState<FormState>({ type: 'none' });
  const [org, setOrg] = useState<string>('AKC');
  const [judgeNumber, setJudgeNumber] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedIds = selectedJudges.map(j => j.id);
  const { qualified, others } = groupPeopleForJudges(people, selectedIds, searchTerm);

  const resetForm = () => {
    setFormState({ type: 'none' });
    setOrg('AKC');
    setJudgeNumber('');
    setEmail('');
    setFirstName('');
    setLastName('');
  };

  const handleSelect = (person: User, groupKey: string) => {
    if (groupKey === 'qualified') {
      onAddJudge(person.id);
    } else {
      setFormState({ type: 'credentials', person });
      setEmail(person.email ?? '');
    }
  };

  const handleOpenNewForm = () => {
    setOpen(false);
    setFormState({ type: 'new' });
  };

  const handleSaveCredentials = async () => {
    if (formState.type !== 'credentials') return;
    if (!judgeNumber.trim() || !email.trim()) return;
    setSaving(true);
    try {
      await onSaveCredentials(formState.person.id, {
        organization: org,
        judgeNumber: judgeNumber.trim(),
        email: email.trim(),
      });
      onAddJudge(formState.person.id);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateJudge = async () => {
    if (!firstName.trim() || !lastName.trim() || !judgeNumber.trim() || !email.trim()) return;
    setSaving(true);
    try {
      const newId = await onCreateJudge({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        organization: org,
        judgeNumber: judgeNumber.trim(),
        email: email.trim(),
      });
      onAddJudge(newId);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const renderJudgeRow = (judge: User, groupKey: string) => (
    <div className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
      <div className="font-medium text-sm">
        {judge.firstName} {judge.lastName}
        {groupKey === 'qualified' && judge.judgeInfo?.judgeNumber && (
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 text-emerald-400 border-emerald-400/30">
            {judge.judgeInfo.qualifications[0]?.organization ?? ''} #{judge.judgeInfo.judgeNumber}
          </Badge>
        )}
      </div>
      {judge.email && (
        <div className="text-xs text-muted-foreground">{judge.email}</div>
      )}
      {groupKey === 'all' && (
        <div className="text-xs text-muted-foreground italic">Tap to add credentials</div>
      )}
    </div>
  );

  const credPerson = formState.type === 'credentials' ? formState.person : null;
  const canSaveCredentials = judgeNumber.trim() !== '' && email.trim() !== '';
  const canCreateJudge =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    judgeNumber.trim() !== '' &&
    email.trim() !== '';

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-1.5">
        <GraduationCap className="h-4 w-4" />
        Show Judges
      </Label>

      {/* Selected judge chips */}
      {selectedJudges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedJudges.map(judge => (
            <Badge key={judge.id} variant="secondary" className="flex items-center gap-1.5 py-1.5 px-3 text-sm">
              <span>{judge.name}</span>
              {judge.judgeNumber && (
                <span className="text-muted-foreground text-xs">#{judge.judgeNumber}</span>
              )}
              <button
                type="button"
                aria-label={`Remove ${judge.name}`}
                onClick={() => onRemoveJudge(judge.id)}
                className="ml-1 hover:text-destructive transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search popover */}
      {formState.type === 'none' && (
        <GroupedSearchablePopover<User>
          open={open}
          onOpenChange={setOpen}
          triggerLabel={
            selectedJudges.length > 0
              ? `${selectedJudges.length} judge${selectedJudges.length !== 1 ? 's' : ''} selected — add more`
              : 'Search and add judges'
          }
          searchPlaceholder="Search by name or judge number…"
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          groups={[
            { groupKey: 'qualified', label: 'Qualified Judges — Credentials on File', items: qualified },
            { groupKey: 'all', label: 'All People — No Credentials Yet', items: others },
          ]}
          renderItem={renderJudgeRow}
          onSelect={handleSelect}
          footer={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-primary"
              onClick={handleOpenNewForm}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add new judge
              <span className="ml-1 text-[10px] opacity-60">(person not in system)</span>
            </Button>
          }
        />
      )}

      {/* Credentials form — existing person */}
      {formState.type === 'credentials' && credPerson && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">
              Add Judge Credentials — {credPerson.firstName} {credPerson.lastName}
            </p>
            <p className="text-xs text-emerald-500 mt-1">
              Adding credentials to {credPerson.firstName}&apos;s existing profile. No duplicate record will be created.
            </p>
          </div>
          <OrgAndJudgeNumberFields
            org={org}
            setOrg={setOrg}
            judgeNumber={judgeNumber}
            setJudgeNumber={setJudgeNumber}
          />
          <div className="space-y-1">
            <Label className="text-xs">Email *</Label>
            <Input
              placeholder="email@example.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSaveCredentials || saving}
              onClick={handleSaveCredentials}
            >
              Save &amp; Add to Show
            </Button>
          </div>
        </div>
      )}

      {/* New judge form — person not in system */}
      {formState.type === 'new' && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
          <p className="text-sm font-semibold">New Judge</p>
          <p className="text-xs text-muted-foreground">
            Person not in the system yet. Creates their profile and credentials.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">First name *</Label>
              <Input
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last name *</Label>
              <Input
                placeholder="Last name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <OrgAndJudgeNumberFields
            org={org}
            setOrg={setOrg}
            judgeNumber={judgeNumber}
            setJudgeNumber={setJudgeNumber}
          />
          <div className="space-y-1">
            <Label className="text-xs">Email *</Label>
            <Input
              placeholder="email@example.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canCreateJudge || saving}
              onClick={handleCreateJudge}
            >
              Add Judge
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Shared sub-component — org dropdown + judge number input           */
/* ------------------------------------------------------------------ */

interface OrgAndJudgeNumberFieldsProps {
  org: string;
  setOrg: (v: string) => void;
  judgeNumber: string;
  setJudgeNumber: (v: string) => void;
}

const OrgAndJudgeNumberFields: React.FC<OrgAndJudgeNumberFieldsProps> = ({
  org, setOrg, judgeNumber, setJudgeNumber,
}) => (
  <div className="grid grid-cols-2 gap-3">
    <div className="space-y-1">
      <Label className="text-xs">Organization *</Label>
      <Select value={org} onValueChange={setOrg}>
        <SelectTrigger className="h-8 text-sm !bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORGS.map(o => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-1">
      <Label className="text-xs">Judge Number *</Label>
      <Input
        placeholder="e.g. 98234"
        value={judgeNumber}
        onChange={e => setJudgeNumber(e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  </div>
);
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd apps/myk9show && npx vitest run src/test/components/wizard/JudgesPicker.test.tsx
```
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/myk9show && git add src/components/shows/wizard/steps/JudgesPicker.tsx src/test/components/wizard/JudgesPicker.test.tsx && git commit -m "feat(wizard): add JudgesPicker with credentials and new-person inline forms"
```

---

## Task 6: Wire up `ShowDetailsStep` — mount fix, auto-fill, new pickers

Replace the old per-picker search state, panelManager flows, and section components with the new pickers. Secretary is auto-filled from `AuthContext`.

**Files:**
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx`

- [ ] **Step 1: Add `loadPeople` mount effect and secretary auto-fill to `ShowDetailsStep.tsx`**

At the top of `ShowDetailsStep.tsx`, add the `useAuthContext` import:

```typescript
import { useAuthContext } from '@/hooks/useAuthContext';
```

Also add the new picker imports:

```typescript
import { OfficialPicker } from './OfficialPicker';
import { JudgesPicker } from './JudgesPicker';
import { createUser } from '@/services/database/queries/userQueries';
import { judgeQualificationQueries } from '@/services/database/queries/judgeQueries';
import { updateUser } from '@/services/database/queries/userQueries';
import { UserRole } from '@/types/auth-types';
```

Inside the component body, add after the existing `useUserStore` destructure:

```typescript
const { userWithRoles } = useAuthContext();
```

Add a new `useEffect` after the existing clubs load effect:

```typescript
// Load people on mount so pickers have data regardless of navigation path
useEffect(() => {
  if (people.length === 0) {
    loadPeople();
  }
}, [people.length, loadPeople]);
```

Add a new `useEffect` to auto-fill the secretary field when the wizard opens:

```typescript
// Auto-fill secretary with the logged-in user (overridable)
useEffect(() => {
  if (
    !show.officials.secretary[0] &&
    userWithRoles?.databaseUserId
  ) {
    updateShowData({
      officials: { ...show.officials, secretary: [userWithRoles.databaseUserId] },
    });
  }
}, [userWithRoles?.databaseUserId]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: Add handler functions for the new pickers**

Add these three handlers inside the component body, replacing the old `handleCreateChairman`, `handleCreateSecretary`, and `handleCreateJudge` functions:

```typescript
const handleCreateOfficialPerson = async (data: {
  firstName: string;
  lastName: string;
  email: string;
}): Promise<string> => {
  const result = await createUser({
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
  });
  if (result.error) throw result.error;
  await loadPeople();
  return result.data!.id;
};

const handleSaveJudgeCredentials = async (
  personId: string,
  data: { organization: string; judgeNumber: string; email: string }
): Promise<void> => {
  await judgeQualificationQueries.create({
    person_id: personId,
    organization: data.organization,
    qualification_level: 'General',
    disciplines: [],
    judge_number: data.judgeNumber,
    date_obtained: new Date().toISOString().split('T')[0],
    is_active: true,
  });
  // Update email on the people record if it was previously empty
  const person = people.find(p => p.id === personId);
  if (data.email && !person?.email) {
    await updateUser(personId, { email: data.email });
  }
  await loadPeople();
};

const handleCreateNewJudge = async (data: {
  firstName: string;
  lastName: string;
  organization: string;
  judgeNumber: string;
  email: string;
}): Promise<string> => {
  const result = await createUser({
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
  });
  if (result.error) throw result.error;
  const personId = result.data!.id;
  await judgeQualificationQueries.create({
    person_id: personId,
    organization: data.organization,
    qualification_level: 'General',
    disciplines: [],
    judge_number: data.judgeNumber,
    date_obtained: new Date().toISOString().split('T')[0],
    is_active: true,
  });
  await loadPeople();
  return personId;
};
```

- [ ] **Step 3: Replace the Officials and Judges sections in the JSX**

In the return JSX of `ShowDetailsStep.tsx`, replace the `<OfficialsSection .../>` block with:

```tsx
{/* Show Officials */}
<div className="group relative bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
  <div className="relative">
    <h3 className="text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300">
      Show Officials
    </h3>
    <div className="grid grid-cols-2 gap-4">
      <OfficialPicker
        label="Show Chairman"
        required
        selectedPersonId={show.officials.chairman[0]}
        people={people}
        suggestedRoles={[UserRole.CHAIRMAN, UserRole.CLUB_ADMIN]}
        onSelect={id =>
          updateShowData({ officials: { ...show.officials, chairman: [id] } })
        }
        onCreatePerson={handleCreateOfficialPerson}
      />
      <OfficialPicker
        label="Show Secretary"
        required
        selectedPersonId={show.officials.secretary[0]}
        people={people}
        suggestedRoles={[UserRole.SECRETARY]}
        autoFillBadge={
          show.officials.secretary[0] === userWithRoles?.databaseUserId ? 'You' : undefined
        }
        onSelect={id =>
          updateShowData({ officials: { ...show.officials, secretary: [id] } })
        }
        onCreatePerson={handleCreateOfficialPerson}
      />
    </div>
  </div>
</div>
```

Replace the `<JudgesSection .../>` block with:

```tsx
{/* Show Judges */}
<div className="group relative bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5">
  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
  <div className="relative">
    <JudgesPicker
      selectedJudges={selectedJudges}
      people={people}
      onAddJudge={person => {
        const p = people.find(x => x.id === person);
        if (!p) return;
        addJudgeToShow(p.id, {
          name: `${p.firstName} ${p.lastName}`,
          email: p.email ?? '',
          phone: '',
        });
      }}
      onRemoveJudge={removeJudgeFromShow}
      onSaveCredentials={handleSaveJudgeCredentials}
      onCreateJudge={handleCreateNewJudge}
    />
    <p className="text-xs text-muted-foreground mt-3">
      Judges added here will be available for class assignment in the next steps.
    </p>
  </div>
</div>
```

- [ ] **Step 4: Remove now-unused state and imports from `ShowDetailsStep.tsx`**

Delete the following state declarations (no longer needed — pickers own their own state):
```typescript
// DELETE these:
const [chairmanSearchTerm, setChairmanSearchTerm] = useState('');
const [showChairmanSearch, setShowChairmanSearch] = useState(false);
const [secretarySearchTerm, setSecretarySearchTerm] = useState('');
const [showSecretarySearch, setShowSecretarySearch] = useState(false);
const [judgeSearchTerm, setJudgeSearchTerm] = useState('');
const [showJudgeSearch, setShowJudgeSearch] = useState(false);
```

Delete these derived data memos (no longer needed):
```typescript
// DELETE these:
const allPeopleSorted = React.useMemo(...)
const filteredChairmen = React.useMemo(...)
const filteredSecretaries = React.useMemo(...)
const availableJudges = React.useMemo(...)
const hasAnyJudges = React.useMemo(...)
```

Delete the old handler functions:
```typescript
// DELETE these:
const handleCreateChairman = () => { ... }
const handleCreateSecretary = () => { ... }
const handleCreateJudge = () => { ... }
const handleAddJudge = (person) => { ... }
```

Remove imports no longer needed: `usePanelManager`, `OfficialsSection`, `JudgesSection`, `getAvailableJudges`, `filterPeopleByName`, `getAllPeopleSorted` (if no longer used elsewhere in the file).

- [ ] **Step 5: Remove `OfficialsSection` and `JudgesSection` from `ShowDetailsStep.sections.tsx`**

Delete everything from line 104 onward in `ShowDetailsStep.sections.tsx` (the `OfficialPicker` interface through the end of file). Keep only the imports and `ClubSection`. The file should end after the `ClubSection` export.

- [ ] **Step 6: Run TypeScript check**

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | head -50
```
Expected: 0 type errors. Fix any that appear before proceeding.

- [ ] **Step 7: Commit**

```bash
cd apps/myk9show && git add src/components/shows/wizard/steps/ShowDetailsStep.tsx src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx && git commit -m "feat(wizard): wire OfficialPicker and JudgesPicker into ShowDetailsStep, add loadPeople mount effect and secretary auto-fill"
```

---

## Task 7: E2E smoke test

Covers the critical secretary path: wizard opens with populated pickers, secretary is auto-filled, a judge can be added from Suggested, and a new judge can be created inline.

**Files:**
- Create: `apps/myk9show/src/test/e2e/secretary/show-wizard-officials.spec.ts`

- [ ] **Step 1: Write the E2E test**

```typescript
// apps/myk9show/src/test/e2e/secretary/show-wizard-officials.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage, ShowCreationWizardPage } from '../page-objects';

/**
 * Smoke test: Officials & Judges pickers in the Show Creation Wizard.
 *
 * Prerequisites:
 * - A secretary test user exists (run scripts/create-secretary-test-user.js)
 * - At least one person with judge_qualifications exists in the DB
 * - Dev server running on localhost:5173
 */
test.describe('Show Wizard — Officials & Judges Pickers', () => {
  let loginPage: LoginPage;
  let wizardPage: ShowCreationWizardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    wizardPage = new ShowCreationWizardPage(page);
    await loginPage.goto();
    await loginPage.loginAsSecretary();
    await wizardPage.goto();
  });

  test('Show Details step loads with populated pickers (store not cold)', async ({ page }) => {
    // Navigate to Show Details step
    await wizardPage.navigateToStep('Show Details');

    // Open the Chairman picker and confirm it has items (not empty)
    await page.getByRole('button', { name: /select show chairman/i }).click();
    // Popover should open and show at least one section header
    await expect(
      page.locator('[class*="text-muted-foreground"]').filter({ hasText: /suggested|all people/i }).first()
    ).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
  });

  test('Secretary field is auto-filled with the logged-in user', async ({ page }) => {
    await wizardPage.navigateToStep('Show Details');

    // The "You" badge should be visible next to the secretary field
    await expect(page.getByText('You')).toBeVisible({ timeout: 5000 });
  });

  test('Selecting a qualified judge adds them as a chip immediately', async ({ page }) => {
    await wizardPage.navigateToStep('Show Details');

    // Open judge search
    await page.getByRole('button', { name: /search and add judges/i }).click();

    // Click the first judge in "Qualified Judges" section
    const qualifiedSection = page.locator('text=Qualified Judges — Credentials on File');
    await expect(qualifiedSection).toBeVisible({ timeout: 5000 });
    const firstJudge = page.locator('[data-judge-row]').first();
    const judgeName = await firstJudge.textContent();
    await firstJudge.click();

    // Judge should now appear as a chip
    if (judgeName) {
      await expect(page.locator(`text=${judgeName.trim()}`).first()).toBeVisible();
    }
  });

  test('"Add new judge" footer expands the new-person form', async ({ page }) => {
    await wizardPage.navigateToStep('Show Details');

    await page.getByRole('button', { name: /search and add judges/i }).click();
    await page.getByText(/add new judge/i).click();

    // The new judge form should be visible
    await expect(page.getByPlaceholder('First name')).toBeVisible({ timeout: 3000 });
    await expect(page.getByPlaceholder('Last name')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. 98234')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the E2E test (expect it to pass or identify any real gaps)**

```bash
cd apps/myk9show && pnpm test:e2e --grep "Officials & Judges Pickers"
```
Expected: tests pass against a running dev server. If a test fails due to missing test data, note the gap — do not modify the component code to work around a data issue.

- [ ] **Step 3: Commit**

```bash
cd apps/myk9show && git add src/test/e2e/secretary/show-wizard-officials.spec.ts && git commit -m "test(e2e): add officials and judges picker smoke tests for show wizard"
```

---

## Task 8: Add judge directory pre-load to TO-DOS.md (out-of-scope task capture)

- [ ] **Step 1: Add the pre-production task to `TO-DOS.md`**

Open `TO-DOS.md` and add the following under the `## Pre-Launch Housekeeping` section:

```markdown
### Pre-load AKC & UKC Judge Directory — 2026-04-15

- **Pre-load judge directory before production launch** — AKC and UKC each maintain judge directories. Importing them into `people` + `judge_qualifications` before launch means secretaries will find most judges in the "Qualified Judges" suggested section without creating new entries. **Problem:** Format is TBD — need to check what export/download format each org provides. Email addresses will likely not be available from the directory; secretaries will be prompted to supply the email the first time they assign a judge to a show (the "Add credentials" form pre-fills email from the people record if present, or leaves it blank). **Files:** `supabase/migrations/` (one-time seed migration or a standalone seed script), `apps/myk9show/src/services/database/queries/judgeQueries.ts` (`judgeQualificationQueries.create` — the insert path). **Solution:** (1) Obtain directory export from AKC (check akc.org judge directory for CSV/XML download). (2) Obtain directory from UKC. (3) Write a seed script that maps each row to a `people` insert + `judge_qualifications` insert. (4) Check for existing people by email before inserting (avoid duplicate records if some judges are already in the DB). (5) Run against staging, verify counts, then production. (6) No migration needed — use `judgeQualificationQueries.create` directly from the script.
```

- [ ] **Step 2: Commit**

```bash
cd apps/myk9show && git add ../../TO-DOS.md && git commit -m "chore: add judge directory pre-load to pre-launch housekeeping"
```

---

## Self-Review Checklist

After writing this plan, checked against spec:

| Spec requirement | Task that implements it |
|---|---|
| `loadPeople()` on wizard mount | Task 6, Step 1 |
| Secretary auto-fill from AuthContext | Task 6, Step 1 |
| `GroupedSearchablePopover` component | Task 1 |
| `getAllUsers` includes judge_qualifications | Task 2 |
| `groupPeopleForOfficial` / `groupPeopleForJudges` helpers | Task 3 |
| `OfficialPicker` — chairman grouped search | Task 4 |
| `OfficialPicker` — inline create (name + email) | Task 4 |
| `JudgesPicker` — qualified group → chip immediately | Task 5 |
| `JudgesPicker` — all people → credentials form | Task 5 |
| `JudgesPicker` — new judge form (name + org + number + email) | Task 5 |
| Remove old panelManager flows | Task 6, Steps 2–5 |
| Unit tests for all new components | Tasks 1, 3, 4, 5 |
| E2E test | Task 7 |
| Judge directory pre-load task captured | Task 8 |
| No platform role assignment during show creation | All handler functions — confirmed no `assignRole` calls |
