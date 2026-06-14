# ClassCheckIn Page — Real Data + ShowDay Entry Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `/exhibitor/check-in/:entryId` to real Supabase data and add "Manage check-in →" secondary links to `NextUpCard` and `ClassTimelineCard` on the Show Day page.

**Architecture:** A new `ClassCheckInPage` page wrapper reads `entryId` from the URL, fetches the entry via a new `useClassCheckInData` hook, and passes a real `ExhibitorClassInfo` object to the existing `ClassCheckIn` display component. `NextUpCard` and `ClassTimelineCard` each gain an optional `onManage` prop that renders the link; `ShowDayHero` threads it down from `ShowDayPage`.

**Tech Stack:** React, TypeScript, React Query (`@tanstack/react-query`), Supabase JS client, Vitest + React Testing Library, shadcn/ui `Card`/`Button`, React Router `useParams` / `useNavigate`.

---

## File Map

| Action | Path |
|---|---|
| **Create** | `apps/myk9show/src/hooks/queries/useClassCheckInData.ts` |
| **Create** | `apps/myk9show/src/hooks/queries/__tests__/useClassCheckInData.test.ts` |
| **Create** | `apps/myk9show/src/pages/ClassCheckInPage.tsx` |
| **Create** | `apps/myk9show/src/test/pages/ClassCheckInPage.test.tsx` |
| **Modify** | `apps/myk9show/src/routes/publicRoutes.tsx` |
| **Modify** | `apps/myk9show/src/components/exhibitor/NextUpCard.tsx` |
| **Modify** | `apps/myk9show/src/test/components/NextUpCard.test.tsx` |
| **Modify** | `apps/myk9show/src/components/exhibitor/ClassTimelineCard.tsx` |
| **Modify** | `apps/myk9show/src/test/components/ClassTimelineCard.test.tsx` |
| **Modify** | `apps/myk9show/src/components/exhibitor/ShowDayHero.tsx` |
| **Modify** | `apps/myk9show/src/pages/ShowDayPage.tsx` |

---

## Task 1: `mapRowToClassInfo` — pure mapping function + unit tests

**Files:**
- Create: `apps/myk9show/src/hooks/queries/useClassCheckInData.ts`
- Create: `apps/myk9show/src/hooks/queries/__tests__/useClassCheckInData.test.ts`

The mapping function converts a raw Supabase row into the `ExhibitorClassInfo` shape that `ClassCheckIn` expects. Extracting it as an exported pure function makes it trivially testable without mocking Supabase or React Query.

- [ ] **Step 1: Write the failing tests**

Create `apps/myk9show/src/hooks/queries/__tests__/useClassCheckInData.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { mapRowToClassInfo } from '@/hooks/queries/useClassCheckInData';

// Minimal raw row matching the Supabase query shape
const baseRow = {
  id: 'entry-1',
  entry_status: 'checked-in',
  armband: '42',
  run_order: 7,
  handler_id: 'handler-1',
  dog: {
    id: 'dog-1',
    call_name: 'Storm',
    breed: 'Border Collie',
    sex: 'male',
    date_of_birth: '2021-03-15',
  },
  class: {
    id: 'class-1',
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    max_entries: 30,
    ring_number: 2,
    start_time: '2026-05-03T09:00:00Z',
    judge_name: 'Ellen Heavner',
    trial: {
      id: 'trial-1',
      name: 'Scent Work Day 1',
      date: '2026-05-03',
      planned_start_time: '08:00',
      show: {
        id: 'show-1',
        name: 'Spring Classic',
        location: 'Main Hall',
      },
    },
  },
};

describe('mapRowToClassInfo', () => {
  it('maps class fields correctly', () => {
    const result = mapRowToClassInfo(baseRow);
    expect(result.class.id).toBe('class-1');
    expect(result.class.name).toBe('Container Novice A');
    expect(result.class.element).toBe('Container');
    expect(result.class.level).toBe('Novice');
    expect(result.class.maxEntries).toBe(30);
    expect(result.class.ringNumber).toBe(2);
    expect(result.class.startTime).toBe('2026-05-03T09:00:00Z');
    expect(result.class.judgeName).toBe('Ellen Heavner');
    expect(result.class.showId).toBe('show-1');
    expect(result.class.trialId).toBe('trial-1');
  });

  it('maps trial fields correctly', () => {
    const result = mapRowToClassInfo(baseRow);
    expect(result.trial.id).toBe('trial-1');
    expect(result.trial.name).toBe('Scent Work Day 1');
    expect(result.trial.date).toBe('2026-05-03');
    expect(result.trial.showId).toBe('show-1');
    expect(result.trial.location).toBe('Main Hall');
    expect(result.trial.startTime).toBe('08:00');
  });

  it('maps entry fields correctly', () => {
    const result = mapRowToClassInfo(baseRow);
    expect(result.entry.id).toBe('entry-1');
    expect(result.entry.armband).toBe('42');
    expect(result.entry.runningOrder).toBe(7);
    expect(result.entry.handlerId).toBe('handler-1');
    expect(result.entry.checkInStatus).toBe('checked-in');
    expect(result.entry.dogCallName).toBe('Storm');
    expect(result.entry.className).toBe('Container Novice A');
    expect(result.entry.ringNumber).toBe(2);
    expect(result.entry.judgeName).toBe('Ellen Heavner');
  });

  it('maps dog fields correctly', () => {
    const result = mapRowToClassInfo(baseRow);
    expect(result.entry.dog?.id).toBe('dog-1');
    expect(result.entry.dog?.breed).toBe('Border Collie');
    expect(result.entry.dog?.sex).toBe('male');
    expect(result.entry.dog?.callName).toBe('Storm');
  });

  it('builds minimal ringStatus stub', () => {
    const result = mapRowToClassInfo(baseRow);
    expect(result.ringStatus.classId).toBe('class-1');
    expect(result.ringStatus.ringNumber).toBe(2);
    expect(result.ringStatus.judgeName).toBe('Ellen Heavner');
    expect(result.ringStatus.onDeck).toEqual([]);
  });

  it('handles nullable fields with safe defaults', () => {
    const sparse = {
      ...baseRow,
      entry_status: null,
      armband: null,
      run_order: null,
      dog: { ...baseRow.dog, call_name: null, sex: null, date_of_birth: null },
      class: {
        ...baseRow.class,
        element: null,
        level: null,
        max_entries: null,
        ring_number: null,
        start_time: null,
        judge_name: null,
      },
    };
    const result = mapRowToClassInfo(sparse);
    expect(result.entry.armband).toBe('');
    expect(result.entry.checkInStatus).toBe('pending');
    expect(result.entry.dogCallName).toBe('');
    expect(result.class.element).toBe('');
    expect(result.class.level).toBe('');
    expect(result.class.maxEntries).toBe(0);
    expect(result.class.ringNumber).toBe(0);
    expect(result.class.judgeName).toBe('');
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail (module not found)**

```bash
cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useClassCheckInData.test.ts
```

Expected: `Cannot find module '@/hooks/queries/useClassCheckInData'`

- [ ] **Step 3: Create the mapping function**

Create `apps/myk9show/src/hooks/queries/useClassCheckInData.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { supabase } from '@/services/database/supabaseClient';
import type { ExhibitorClassInfo } from '@/types/exhibitor-types';
import type { CheckInStatus } from '@/types/exhibitor-types';

// Raw shape returned by the Supabase query — typed manually because
// ring_number was added via a migration after codegen was last run.
interface CheckInDataRow {
  id: string;
  entry_status: string | null;
  armband: string | null;
  run_order: number | null;
  handler_id: string;
  dog: {
    id: string;
    call_name: string | null;
    breed: string;
    sex: string | null;
    date_of_birth: string | null;
  };
  class: {
    id: string;
    name: string;
    element: string | null;
    level: string | null;
    max_entries: number | null;
    ring_number: number | null;
    start_time: string | null;
    judge_name: string | null;
    trial: {
      id: string;
      name: string;
      date: string;
      planned_start_time: string | null;
      show: {
        id: string;
        name: string;
        location: string | null;
      };
    };
  };
}

export function mapRowToClassInfo(row: CheckInDataRow): ExhibitorClassInfo {
  const cls = row.class;
  const trial = cls.trial;
  const show = trial.show;

  return {
    class: {
      id: cls.id,
      showId: show.id,
      trialId: trial.id,
      name: cls.name,
      element: cls.element ?? '',
      level: cls.level ?? '',
      maxEntries: cls.max_entries ?? 0,
      judgeName: cls.judge_name ?? '',
      startTime: cls.start_time ?? new Date().toISOString(),
      ringNumber: cls.ring_number ?? 0,
    },
    trial: {
      id: trial.id,
      showId: show.id,
      name: trial.name,
      date: trial.date,
      startTime: trial.planned_start_time ?? '',
      endTime: '',
      location: show.location ?? '',
      organization: '',
    },
    entry: {
      id: row.id,
      classId: cls.id,
      dogId: row.dog.id,
      handlerId: row.handler_id,
      armband: row.armband ?? '',
      runningOrder: row.run_order ?? undefined,
      checkInStatus: (row.entry_status as CheckInStatus) ?? 'pending',
      dogCallName: row.dog.call_name ?? '',
      dogRegistrationNumber: '',
      breed: row.dog.breed,
      handlerName: '',
      className: cls.name,
      ringNumber: cls.ring_number ?? 0,
      judgeName: cls.judge_name ?? '',
      dog: {
        id: row.dog.id,
        name: row.dog.call_name ?? '',
        breed: row.dog.breed,
        sex: (row.dog.sex === 'female' ? 'female' : 'male') as 'male' | 'female',
        callName: row.dog.call_name ?? '',
        ownerId: row.handler_id,
        dateOfBirth: row.dog.date_of_birth ?? undefined,
        gender: row.dog.sex === 'female' ? 'Female' : 'Male',
        registrations: [],
      },
    },
    ringStatus: {
      classId: cls.id,
      className: cls.name,
      ringNumber: cls.ring_number ?? 0,
      judgeName: cls.judge_name ?? '',
      judgeStatus: 'active',
      totalEntries: 0,
      completedEntries: 0,
      onDeck: [],
      lastUpdated: new Date(),
    },
  };
}

// Hook and query function added in Task 2.
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useClassCheckInData.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useClassCheckInData.ts \
        apps/myk9show/src/hooks/queries/__tests__/useClassCheckInData.test.ts
git commit -m "feat(checkin): add mapRowToClassInfo pure mapping function + tests"
```

---

## Task 2: `useClassCheckInData` — Supabase query hook + hook tests

**Files:**
- Modify: `apps/myk9show/src/hooks/queries/useClassCheckInData.ts`
- Modify: `apps/myk9show/src/hooks/queries/__tests__/useClassCheckInData.test.ts`

- [ ] **Step 1: Write the failing hook tests**

Append to `apps/myk9show/src/hooks/queries/__tests__/useClassCheckInData.test.ts` (imports are already at the top from Task 1 — only add the new `describe` block):

```typescript
import { useClassCheckInData } from '@/hooks/queries/useClassCheckInData';

// Supabase mock — chain that resolves to { data, error }
const mockChain = {
  data: null as unknown,
  error: null as unknown,
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
};
for (const key of ['select', 'eq'] as const) {
  mockChain[key] = vi.fn().mockReturnValue(mockChain);
}
mockChain.single = vi.fn().mockImplementation(() => Promise.resolve({
  data: mockChain.data,
  error: mockChain.error,
}));

const mockFrom = vi.fn().mockReturnValue(mockChain);

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: 'user-123' },
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('useClassCheckInData', () => {
  beforeEach(() => {
    mockChain.data = null;
    mockChain.error = null;
    vi.clearAllMocks();
    for (const key of ['select', 'eq'] as const) {
      mockChain[key] = vi.fn().mockReturnValue(mockChain);
    }
    mockChain.single = vi.fn().mockImplementation(() => Promise.resolve({
      data: mockChain.data,
      error: mockChain.error,
    }));
    mockFrom.mockReturnValue(mockChain);
  });

  it('returns mapped ExhibitorClassInfo on success', async () => {
    mockChain.data = baseRow; // baseRow defined in Task 1 tests above
    mockChain.single = vi.fn().mockResolvedValue({ data: baseRow, error: null });

    const { result } = renderHook(() => useClassCheckInData('entry-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.class.name).toBe('Container Novice A');
    expect(result.current.data?.entry.armband).toBe('42');
    expect(result.current.error).toBeNull();
  });

  it('returns null data when entry not found (empty row)', async () => {
    mockChain.single = vi.fn().mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useClassCheckInData('missing-entry'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('surfaces error on Supabase failure', async () => {
    mockChain.single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'DB error' },
    });

    const { result } = renderHook(() => useClassCheckInData('entry-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeUndefined();
  });

  it('is disabled when entryId is empty', () => {
    const { result } = renderHook(() => useClassCheckInData(''), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect hook tests to fail (hook not exported yet)**

```bash
cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useClassCheckInData.test.ts
```

Expected: `useClassCheckInData is not a function` (or similar)

- [ ] **Step 3: Add the hook to the module**

Append to the bottom of `apps/myk9show/src/hooks/queries/useClassCheckInData.ts`:

```typescript
async function fetchCheckInData(
  entryId: string,
  userId: string
): Promise<ExhibitorClassInfo | null> {
  const { data, error } = await supabase
    .from('entries')
    .select(
      `
      id, entry_status, armband, run_order, handler_id,
      dog:dogs!inner(id, call_name, breed, sex, date_of_birth),
      class:classes!inner(
        id, name, element, level, max_entries, ring_number, start_time, judge_name,
        trial:trials!inner(
          id, name, date, planned_start_time,
          show:shows!inner(id, name, location)
        )
      )
    `
    )
    .eq('id', entryId)
    .eq('handler_id', userId)
    .single();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRowToClassInfo(data as unknown as CheckInDataRow);
}

export function useClassCheckInData(entryId: string) {
  const { userWithRoles } = useAuthContext();
  const userId = userWithRoles?.databaseUserId ?? '';

  return useQuery({
    queryKey: ['entries', entryId, 'checkin-data'],
    queryFn: () => fetchCheckInData(entryId, userId),
    enabled: !!entryId && !!userId,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: 1,
  });
}
```

- [ ] **Step 4: Run all tests in the file — expect them all to pass**

```bash
cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useClassCheckInData.test.ts
```

Expected: all tests pass (mapping tests from Task 1 + hook tests).

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useClassCheckInData.ts \
        apps/myk9show/src/hooks/queries/__tests__/useClassCheckInData.test.ts
git commit -m "feat(checkin): add useClassCheckInData hook with Supabase query + tests"
```

---

## Task 3: `ClassCheckInPage` — page component + page tests

**Files:**
- Create: `apps/myk9show/src/pages/ClassCheckInPage.tsx`
- Create: `apps/myk9show/src/test/pages/ClassCheckInPage.test.tsx`

- [ ] **Step 1: Write the failing page tests**

Create `apps/myk9show/src/test/pages/ClassCheckInPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import ClassCheckInPage from '@/pages/ClassCheckInPage';
import type { ExhibitorClassInfo } from '@/types/exhibitor-types';

// Minimal valid ExhibitorClassInfo for rendering ClassCheckIn
const mockClassInfo: ExhibitorClassInfo = {
  class: {
    id: 'class-1',
    showId: 'show-1',
    trialId: 'trial-1',
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    maxEntries: 30,
    judgeName: 'Ellen Heavner',
    startTime: new Date(Date.now() + 90 * 60000).toISOString(), // 90 min from now
    ringNumber: 1,
  },
  trial: {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Scent Work Day 1',
    date: new Date().toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '17:00',
    location: 'Main Hall',
    organization: 'AKC',
  },
  entry: {
    id: 'entry-1',
    classId: 'class-1',
    dogId: 'dog-1',
    handlerId: 'handler-1',
    armband: '42',
    checkInStatus: 'pending',
    dogCallName: 'Storm',
    dogRegistrationNumber: '',
    breed: 'Border Collie',
    handlerName: 'Jane Smith',
    className: 'Container Novice A',
    ringNumber: 1,
    judgeName: 'Ellen Heavner',
    dog: {
      id: 'dog-1',
      name: 'Storm',
      breed: 'Border Collie',
      sex: 'male',
      callName: 'Storm',
      ownerId: 'handler-1',
      registrations: [],
    },
  },
  ringStatus: {
    classId: 'class-1',
    className: 'Container Novice A',
    ringNumber: 1,
    judgeName: 'Ellen Heavner',
    judgeStatus: 'active',
    totalEntries: 0,
    completedEntries: 0,
    onDeck: [],
    lastUpdated: new Date(),
  },
};

const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutateAsync: mockMutateAsync }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: 'user-123' },
  }),
}));

const mockUseClassCheckInData = vi.fn();
vi.mock('@/hooks/queries/useClassCheckInData', () => ({
  useClassCheckInData: (entryId: string) => mockUseClassCheckInData(entryId),
}));

function renderPage(entryId = 'entry-1') {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[`/exhibitor/check-in/${entryId}`]}>
        <Routes>
          <Route path="/exhibitor/check-in/:entryId" element={<ClassCheckInPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ClassCheckInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows spinner while loading', () => {
    mockUseClassCheckInData.mockReturnValue({ isLoading: true, data: undefined, error: null });
    renderPage();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error card on fetch failure', () => {
    mockUseClassCheckInData.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error('DB error'),
    });
    renderPage();
    expect(screen.getByText(/Unable to load/i)).toBeInTheDocument();
  });

  it('shows 404 card when entry not found', () => {
    mockUseClassCheckInData.mockReturnValue({ isLoading: false, data: null, error: null });
    renderPage();
    expect(screen.getByText(/Entry not found/i)).toBeInTheDocument();
  });

  it('renders ClassCheckIn when data loads', () => {
    mockUseClassCheckInData.mockReturnValue({
      isLoading: false,
      data: mockClassInfo,
      error: null,
    });
    renderPage();
    expect(screen.getByText('Check In')).toBeInTheDocument();
    expect(screen.getByText('Container Novice A')).toBeInTheDocument();
  });

  it('calls mutation with checked-in when user selects Present', async () => {
    mockUseClassCheckInData.mockReturnValue({
      isLoading: false,
      data: mockClassInfo,
      error: null,
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /present/i }));
    // Confirm dialog appears
    await userEvent.click(screen.getByRole('button', { name: /confirm check.in/i }));
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        entryId: 'entry-1',
        newStatus: 'checked-in',
      })
    );
  });

  it('calls mutation with pulled when user selects Scratch', async () => {
    mockUseClassCheckInData.mockReturnValue({
      isLoading: false,
      data: mockClassInfo,
      error: null,
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /scratch/i }));
    // Scratch warning dialog appears
    await userEvent.click(screen.getByRole('button', { name: /confirm scratch/i }));
    // Then confirmation dialog
    await userEvent.click(screen.getByRole('button', { name: /confirm check.in/i }));
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        entryId: 'entry-1',
        newStatus: 'pulled',
      })
    );
  });

  it('navigates to /exhibitor/show-day after successful check-in', async () => {
    mockUseClassCheckInData.mockReturnValue({
      isLoading: false,
      data: mockClassInfo,
      error: null,
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /present/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm check.in/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/exhibitor/show-day'));
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail (module not found)**

```bash
cd apps/myk9show && npx vitest run src/test/pages/ClassCheckInPage.test.tsx
```

Expected: `Cannot find module '@/pages/ClassCheckInPage'`

- [ ] **Step 3: Create the page component**

Create `apps/myk9show/src/pages/ClassCheckInPage.tsx`:

```typescript
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { CheckInStatus } from '@myk9/core';
import type { CheckInRequest } from '@/types/exhibitor-types';
import { useClassCheckInData } from '@/hooks/queries/useClassCheckInData';
import { useCheckInMutation } from '@/hooks/mutations/useCheckInMutation';
import { ClassCheckIn } from '@/components/exhibitor/ClassCheckIn';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function toCheckInStatus(s: 'present' | 'scratch'): CheckInStatus {
  return s === 'present' ? 'checked-in' : 'pulled';
}

const ClassCheckInPage: React.FC = () => {
  const { entryId = '' } = useParams<{ entryId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useClassCheckInData(entryId);
  const checkInMutation = useCheckInMutation();

  const handleCheckIn = async (req: CheckInRequest): Promise<void> => {
    await checkInMutation.mutateAsync({
      entryId: req.entryId,
      newStatus: toCheckInStatus(req.status),
    });
    navigate('/exhibitor/show-day');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Unable to load check-in. Please try again.</p>
            <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Entry not found.</p>
            <Button onClick={() => navigate('/exhibitor/show-day')} variant="outline" className="mt-4">
              Back to Show Day
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ClassCheckIn
      classInfo={data}
      availableHandlers={[]}
      onCheckIn={handleCheckIn}
    />
  );
};

export default ClassCheckInPage;
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
cd apps/myk9show && npx vitest run src/test/pages/ClassCheckInPage.test.tsx
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/ClassCheckInPage.tsx \
        apps/myk9show/src/test/pages/ClassCheckInPage.test.tsx
git commit -m "feat(checkin): add ClassCheckInPage with real data loading + tests"
```

---

## Task 4: Wire route to `ClassCheckInPage`

**Files:**
- Modify: `apps/myk9show/src/routes/publicRoutes.tsx`

- [ ] **Step 1: Swap the lazy import and route element**

In `apps/myk9show/src/routes/publicRoutes.tsx`, make two changes:

Replace the import line:
```typescript
// Before
const ClassCheckIn = lazy(() => import('@/components/exhibitor/ClassCheckIn'));

// After
const ClassCheckInPage = lazy(() => import('@/pages/ClassCheckInPage'));
```

Replace the route element (around line 196):
```tsx
// Before
<ClassCheckIn />

// After
<ClassCheckInPage />
```

- [ ] **Step 2: Run typecheck to verify no type errors**

```bash
cd apps/myk9show && npx tsc --noEmit
```

Expected: no errors related to the changed import.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/routes/publicRoutes.tsx
git commit -m "feat(checkin): wire /exhibitor/check-in route to ClassCheckInPage"
```

---

## Task 5: `NextUpCard` — add `onManage` prop + tests

**Files:**
- Modify: `apps/myk9show/src/components/exhibitor/NextUpCard.tsx`
- Modify: `apps/myk9show/src/test/components/NextUpCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `apps/myk9show/src/test/components/NextUpCard.test.tsx` (inside the existing `describe('NextUpCard', ...)` block):

```typescript
  it('renders Manage button when onManage is provided', () => {
    const onManage = vi.fn();
    render(<NextUpCard classData={makeClass({ entryStatus: 'no-status' })} onManage={onManage} />);
    expect(screen.getByRole('button', { name: /manage check.in/i })).toBeInTheDocument();
  });

  it('does not render Manage button when onManage is omitted', () => {
    render(<NextUpCard classData={makeClass({ entryStatus: 'no-status' })} />);
    expect(screen.queryByRole('button', { name: /manage check.in/i })).not.toBeInTheDocument();
  });

  it('calls onManage with entryId when Manage button is clicked', async () => {
    const onManage = vi.fn();
    render(
      <NextUpCard classData={makeClass({ entryId: 'entry-42', entryStatus: 'no-status' })} onManage={onManage} />
    );
    await userEvent.click(screen.getByRole('button', { name: /manage check.in/i }));
    expect(onManage).toHaveBeenCalledWith('entry-42');
  });
```

- [ ] **Step 2: Run tests — expect the new ones to fail**

```bash
cd apps/myk9show && npx vitest run src/test/components/NextUpCard.test.tsx
```

Expected: existing tests pass, the 3 new ones fail (`onManage` prop doesn't exist yet).

- [ ] **Step 3: Add `onManage` prop and button to `NextUpCard`**

In `apps/myk9show/src/components/exhibitor/NextUpCard.tsx`:

Add to the `NextUpCardProps` interface:
```typescript
  /** Navigates to the full check-in management page */
  onManage?: ((entryId: string) => void) | undefined;
```

Add to the function signature:
```typescript
export function NextUpCard({
  classData,
  onNavigate,
  onCheckInChange,
  selfCheckinEnabled = true,
  selfCheckinDisabledReason,
  onManage,
  className,
}: NextUpCardProps) {
```

Add the button at the very bottom of the component's JSX, just before the closing `</div>` of the outer container:
```tsx
      {/* Secondary: full manage page */}
      {onManage && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onManage(classData.entryId);
          }}
          className="mt-2 w-full text-center text-sm text-muted-foreground hover:underline underline-offset-2 min-h-[44px]"
        >
          Manage check-in →
        </button>
      )}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
cd apps/myk9show && npx vitest run src/test/components/NextUpCard.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/exhibitor/NextUpCard.tsx \
        apps/myk9show/src/test/components/NextUpCard.test.tsx
git commit -m "feat(checkin): add onManage prop to NextUpCard with Manage check-in button"
```

---

## Task 6: `ClassTimelineCard` — add `onManage` prop + tests

**Files:**
- Modify: `apps/myk9show/src/components/exhibitor/ClassTimelineCard.tsx`
- Modify: `apps/myk9show/src/test/components/ClassTimelineCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `apps/myk9show/src/test/components/ClassTimelineCard.test.tsx` (inside the existing `describe` block):

```typescript
  it('renders Manage button when onManage is provided and class is not completed', () => {
    const onManage = vi.fn();
    render(<ClassTimelineCard classData={makeClass({ isScored: false })} onManage={onManage} />);
    expect(screen.getByRole('button', { name: /manage check.in/i })).toBeInTheDocument();
  });

  it('does not render Manage button when onManage is omitted', () => {
    render(<ClassTimelineCard classData={makeClass()} />);
    expect(screen.queryByRole('button', { name: /manage check.in/i })).not.toBeInTheDocument();
  });

  it('calls onManage with entryId when Manage button is clicked', async () => {
    const onManage = vi.fn();
    render(
      <ClassTimelineCard
        classData={makeClass({ entryId: 'entry-99', isScored: false })}
        onManage={onManage}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /manage check.in/i }));
    expect(onManage).toHaveBeenCalledWith('entry-99');
  });
```

- [ ] **Step 2: Run tests — expect the new ones to fail**

```bash
cd apps/myk9show && npx vitest run src/test/components/ClassTimelineCard.test.tsx
```

Expected: existing tests pass, 3 new ones fail.

- [ ] **Step 3: Add `onManage` prop and button to `ClassTimelineCard`**

In `apps/myk9show/src/components/exhibitor/ClassTimelineCard.tsx`:

Add to `ClassTimelineCardProps`:
```typescript
  /** Navigates to the full check-in management page */
  onManage?: ((entryId: string) => void) | undefined;
```

Add to the function signature:
```typescript
export function ClassTimelineCard({
  classData,
  onNavigate,
  onCheckInChange,
  selfCheckinEnabled = true,
  onManage,
  className,
}: ClassTimelineCardProps) {
```

Add after the closing tag of the existing card content but inside the outer `<div>` (before the final `</div>`). Place it only when the class is not completed:

```tsx
      {/* Secondary: full manage page — hidden for completed classes */}
      {!isCompleted && onManage && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onManage(classData.entryId);
          }}
          className="text-xs text-muted-foreground hover:underline underline-offset-2 flex-shrink-0 min-h-[44px] px-1"
        >
          Manage →
        </button>
      )}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
cd apps/myk9show && npx vitest run src/test/components/ClassTimelineCard.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/exhibitor/ClassTimelineCard.tsx \
        apps/myk9show/src/test/components/ClassTimelineCard.test.tsx
git commit -m "feat(checkin): add onManage prop to ClassTimelineCard with Manage button"
```

---

## Task 7: Thread `onManage` through `ShowDayHero` and `ShowDayPage`

**Files:**
- Modify: `apps/myk9show/src/components/exhibitor/ShowDayHero.tsx`
- Modify: `apps/myk9show/src/pages/ShowDayPage.tsx`
- Modify: `apps/myk9show/src/test/pages/ShowDayPage.test.tsx` (verify existing tests still pass)

No new tests are needed for prop threading — the unit tests in Tasks 5 and 6 already verify the leaf behaviour, and the `ShowDayPage` mock of `ShowDayHero` means the integration is verified at typecheck. The existing `ShowDayPage` tests must still pass.

- [ ] **Step 1: Add `onManage` to `ShowDayHeroProps` and pass it to cards**

In `apps/myk9show/src/components/exhibitor/ShowDayHero.tsx`:

Add to `ShowDayHeroProps`:
```typescript
  /** Navigates to the full check-in management page for an entry */
  onManage?: ((entryId: string) => void) | undefined;
```

Add to the destructured props in `ShowDayHero`:
```typescript
  { data, onClassNavigate, onShowSelect, onCheckInChange, selfCheckinEnabledMap, onManage, className },
```

Pass `onManage` to `NextUpCard`:
```tsx
<NextUpCard
  classData={data.nextUp}
  onNavigate={onClassNavigate}
  onCheckInChange={onCheckInChange}
  selfCheckinEnabled={selfCheckinEnabledMap?.[data.nextUp.classId] ?? true}
  onManage={onManage}
/>
```

Pass `onManage` to each `ClassTimelineCard` in the "Later Today" section only (not to completed cards):
```tsx
{laterToday.map(c => (
  <ClassTimelineCard
    key={c.entryId}
    classData={c}
    onNavigate={onClassNavigate}
    onCheckInChange={onCheckInChange}
    selfCheckinEnabled={selfCheckinEnabledMap?.[c.classId] ?? true}
    onManage={onManage}
  />
))}
```

Leave the completed `ClassTimelineCard` instances without `onManage` (they already omit it by not passing the prop).

- [ ] **Step 2: Pass `onManage` from `ShowDayPage`**

In `apps/myk9show/src/pages/ShowDayPage.tsx`, add `onManage` to the `<ShowDayHero />` call:

```tsx
<ShowDayHero
  ref={heroRef}
  data={showDayData}
  onCheckInChange={handleCheckInChange}
  selfCheckinEnabledMap={selfCheckinEnabledMap}
  onClassNavigate={classId => navigate(`/classes/${classId}`)}
  onManage={entryId => navigate(`/exhibitor/check-in/${entryId}`)}
/>
```

- [ ] **Step 3: Run typecheck**

```bash
cd apps/myk9show && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run the full ShowDayPage test suite to confirm nothing broke**

```bash
cd apps/myk9show && npx vitest run src/test/pages/ShowDayPage.test.tsx
```

Expected: all existing tests pass.

- [ ] **Step 5: Run the full myk9show test suite**

```bash
cd apps/myk9show && npx vitest run
```

Expected: all tests pass. Note: if the test runner hangs for more than 30 seconds, stop it and report the issue per `CLAUDE.md` — this is a known pre-existing problem.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/exhibitor/ShowDayHero.tsx \
        apps/myk9show/src/pages/ShowDayPage.tsx
git commit -m "feat(checkin): thread onManage through ShowDayHero → ShowDayPage"
```

---

## Done

After Task 7, the feature is complete:

- `/exhibitor/check-in/:entryId` loads real entry data from Supabase and calls the `self_checkin_entry` RPC on confirm.
- A "Manage check-in →" link appears on `NextUpCard` and "Later Today" `ClassTimelineCard` items, navigating to the full check-in page.
- The existing inline one-tap "Check In" button is untouched.
- All new code is covered by unit tests.
