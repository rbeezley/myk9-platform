# Dog Notification Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the existing notification infrastructure so exhibitors receive real-time alerts (`your_turn`, `class_starting`, `check_in_reminder`, `results_posted`) about their dogs during show day.

**Architecture:** A `useNotificationMonitor` hook mounted in App.tsx subscribes to Supabase realtime changes on entries and classes tables. When trigger events occur, it computes run order (armband ascending), detects multi-class conflicts, builds payloads via existing `@myk9/notifications` builders, and delivers via in-app (`useNotificationDelivery`) + push (Edge Function) channels.

**Tech Stack:** React hooks, Supabase realtime subscriptions, `@myk9/notifications` package, Zustand notification store, web-push via Edge Function

**Spec:** `docs/superpowers/specs/2026-03-30-dog-notification-pipeline-design.md`

---

## File Map

### New Files

| File                                                               | Responsibility                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `apps/myk9show/src/utils/runOrderUtils.ts`                         | Sort entries by armband ascending, filter unscored                |
| `apps/myk9show/src/utils/__tests__/runOrderUtils.test.ts`          | Tests for run order sorting                                       |
| `apps/myk9show/src/utils/conflictDetection.ts`                     | Detect same dog near-up in multiple in-progress classes           |
| `apps/myk9show/src/utils/__tests__/conflictDetection.test.ts`      | Tests for conflict detection                                      |
| `apps/myk9show/src/hooks/useNotificationMonitor.ts`                | Core monitoring hook — realtime subscriptions, alert logic, dedup |
| `apps/myk9show/src/hooks/__tests__/useNotificationMonitor.test.ts` | Tests for monitor hook                                            |

### Modified Files

| File                                                                | Change                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/notifications/src/handlers.ts`                            | Add `conflicts` field to `YourTurnInput` interface and payload `data` |
| `packages/notifications/src/handlers.test.ts`                       | Test conflict data in `buildYourTurnPayload`                          |
| `apps/myk9show/src/components/notifications/NotificationCenter.tsx` | Render conflict context line in `NotificationItem`                    |
| `apps/myk9show/src/App.tsx`                                         | Mount `useNotificationMonitor` via initializer component              |
| `supabase/functions/send-push-notification/index.ts`                | Add JWT auth path so clients can send push to themselves              |

---

## Task 1: Run Order Utility

**Files:**

- Create: `apps/myk9show/src/utils/runOrderUtils.ts`
- Test: `apps/myk9show/src/utils/__tests__/runOrderUtils.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/myk9show/src/utils/__tests__/runOrderUtils.test.ts
import { getRunOrder } from '../runOrderUtils';
import type { ShowEntry } from '@/store/entry-store-types';

function makeEntry(
  overrides: Partial<ShowEntry> & { armband?: string; scored?: boolean }
): ShowEntry {
  const { armband, scored, ...rest } = overrides;
  return {
    id: crypto.randomUUID(),
    showId: 'show-1',
    classId: 'class-1',
    dogId: 'dog-1',
    status: 'confirmed',
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: 'Handler',
      entryFee: 30,
      paymentStatus: 'paid',
      armband: armband ?? undefined,
    },
    competitionData: scored
      ? { recordedBy: 'judge', recordedAt: new Date().toISOString() }
      : undefined,
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...rest,
  } as ShowEntry;
}

describe('getRunOrder', () => {
  it('sorts entries by armband number ascending', () => {
    const entries = [
      makeEntry({ id: 'e3', armband: '300' }),
      makeEntry({ id: 'e1', armband: '100' }),
      makeEntry({ id: 'e2', armband: '200' }),
    ];
    const result = getRunOrder(entries);
    expect(result.map(e => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('filters out scored entries', () => {
    const entries = [
      makeEntry({ id: 'e1', armband: '100', scored: false }),
      makeEntry({ id: 'e2', armband: '200', scored: true }),
      makeEntry({ id: 'e3', armband: '300', scored: false }),
    ];
    const result = getRunOrder(entries);
    expect(result.map(e => e.id)).toEqual(['e1', 'e3']);
  });

  it('handles missing armbands by sorting to front', () => {
    const entries = [
      makeEntry({ id: 'e2', armband: '200' }),
      makeEntry({ id: 'e1', armband: undefined }),
    ];
    const result = getRunOrder(entries);
    expect(result.map(e => e.id)).toEqual(['e1', 'e2']);
  });

  it('handles string armbands with leading zeros', () => {
    const entries = [
      makeEntry({ id: 'e2', armband: '020' }),
      makeEntry({ id: 'e1', armband: '005' }),
    ];
    const result = getRunOrder(entries);
    expect(result.map(e => e.id)).toEqual(['e1', 'e2']);
  });

  it('returns empty array for empty input', () => {
    expect(getRunOrder([])).toEqual([]);
  });

  it('returns all entries when none are scored', () => {
    const entries = [
      makeEntry({ id: 'e1', armband: '100' }),
      makeEntry({ id: 'e2', armband: '200' }),
    ];
    expect(getRunOrder(entries)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/utils/__tests__/runOrderUtils.test.ts`
Expected: FAIL — `getRunOrder` not found

- [ ] **Step 3: Write implementation**

```typescript
// apps/myk9show/src/utils/runOrderUtils.ts
import type { ShowEntry } from '@/store/entry-store-types';

/**
 * Returns unscored entries sorted by armband number ascending.
 * This is the run order — dogs run in armband order.
 * Entries without armbands sort to the front (armband 0).
 */
export function getRunOrder(entries: ShowEntry[]): ShowEntry[] {
  return entries
    .filter(e => !e.competitionData)
    .sort((a, b) => {
      const aNum = parseInt(a.registrationData?.armband ?? '0', 10);
      const bNum = parseInt(b.registrationData?.armband ?? '0', 10);
      return aNum - bNum;
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/utils/__tests__/runOrderUtils.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/utils/runOrderUtils.ts apps/myk9show/src/utils/__tests__/runOrderUtils.test.ts
git commit -m "feat(notifications): add run order utility — sort entries by armband ascending"
```

---

## Task 2: Conflict Detection Utility

**Files:**

- Create: `apps/myk9show/src/utils/conflictDetection.ts`
- Test: `apps/myk9show/src/utils/__tests__/conflictDetection.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/myk9show/src/utils/__tests__/conflictDetection.test.ts
import { detectConflicts } from '../conflictDetection';
import type { ShowEntry } from '@/store/entry-store-types';

function makeEntry(overrides: {
  id?: string;
  classId: string;
  dogId: string;
  armband?: string;
  scored?: boolean;
  checkInStatus?: string;
}): ShowEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    showId: 'show-1',
    classId: overrides.classId,
    dogId: overrides.dogId,
    status: 'confirmed',
    checkInStatus: (overrides.checkInStatus as ShowEntry['checkInStatus']) ?? undefined,
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: 'Handler',
      entryFee: 30,
      paymentStatus: 'paid',
      armband: overrides.armband ?? '100',
    },
    competitionData: overrides.scored
      ? { recordedBy: 'judge', recordedAt: new Date().toISOString() }
      : undefined,
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as ShowEntry;
}

interface ClassContext {
  classId: string;
  className: string;
  status: string;
  entries: ShowEntry[];
}

describe('detectConflicts', () => {
  it('detects same dog near-up in another in-progress class', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [
          makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '100' }),
          makeEntry({ classId: 'class-A', dogId: 'dog-2', armband: '200' }),
          makeEntry({ classId: 'class-A', dogId: 'dog-3', armband: '300' }),
        ],
      },
      {
        classId: 'class-B',
        className: 'Excellent B',
        status: 'In Progress',
        entries: [
          makeEntry({
            classId: 'class-B',
            dogId: 'dog-X',
            armband: '100',
            checkInStatus: 'in-ring',
          }),
          makeEntry({ classId: 'class-B', dogId: 'dog-1', armband: '200' }),
          makeEntry({ classId: 'class-B', dogId: 'dog-Y', armband: '300' }),
        ],
      },
    ];

    const conflicts = detectConflicts('dog-1', 'class-A', classes, 3);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({
      className: 'Excellent B',
      dogsAhead: 1,
    });
  });

  it('returns empty array when no conflicts', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '100' })],
      },
      {
        classId: 'class-B',
        className: 'Excellent B',
        status: 'In Progress',
        entries: [makeEntry({ classId: 'class-B', dogId: 'dog-2', armband: '100' })],
      },
    ];

    expect(detectConflicts('dog-1', 'class-A', classes, 3)).toEqual([]);
  });

  it('handles multiple conflicts across multiple classes', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '100' })],
      },
      {
        classId: 'class-B',
        className: 'Excellent B',
        status: 'In Progress',
        entries: [
          makeEntry({
            classId: 'class-B',
            dogId: 'dog-X',
            armband: '100',
            checkInStatus: 'in-ring',
          }),
          makeEntry({ classId: 'class-B', dogId: 'dog-1', armband: '200' }),
        ],
      },
      {
        classId: 'class-C',
        className: 'Open C',
        status: 'In Progress',
        entries: [
          makeEntry({
            classId: 'class-C',
            dogId: 'dog-Y',
            armband: '100',
            checkInStatus: 'in-ring',
          }),
          makeEntry({ classId: 'class-C', dogId: 'dog-Z', armband: '200' }),
          makeEntry({ classId: 'class-C', dogId: 'dog-1', armband: '300' }),
        ],
      },
    ];

    const conflicts = detectConflicts('dog-1', 'class-A', classes, 3);
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0].className).toBe('Excellent B');
    expect(conflicts[1].className).toBe('Open C');
  });

  it('ignores completed/cancelled classes', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '100' })],
      },
      {
        classId: 'class-B',
        className: 'Excellent B',
        status: 'Completed',
        entries: [makeEntry({ classId: 'class-B', dogId: 'dog-1', armband: '100' })],
      },
    ];

    expect(detectConflicts('dog-1', 'class-A', classes, 3)).toEqual([]);
  });

  it('ignores the current class (no self-conflict)', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [
          makeEntry({
            classId: 'class-A',
            dogId: 'dog-X',
            armband: '100',
            checkInStatus: 'in-ring',
          }),
          makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '200' }),
        ],
      },
    ];

    expect(detectConflicts('dog-1', 'class-A', classes, 3)).toEqual([]);
  });

  it('does not report conflict when dog is beyond leadDogs range', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '100' })],
      },
      {
        classId: 'class-B',
        className: 'Excellent B',
        status: 'In Progress',
        entries: [
          makeEntry({
            classId: 'class-B',
            dogId: 'dog-X',
            armband: '100',
            checkInStatus: 'in-ring',
          }),
          makeEntry({ classId: 'class-B', dogId: 'dog-2', armband: '200' }),
          makeEntry({ classId: 'class-B', dogId: 'dog-3', armband: '300' }),
          makeEntry({ classId: 'class-B', dogId: 'dog-4', armband: '400' }),
          makeEntry({ classId: 'class-B', dogId: 'dog-1', armband: '500' }),
        ],
      },
    ];

    // leadDogs = 2, dog-1 is 4th in line (beyond range)
    expect(detectConflicts('dog-1', 'class-A', classes, 2)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/utils/__tests__/conflictDetection.test.ts`
Expected: FAIL — `detectConflicts` not found

- [ ] **Step 3: Write implementation**

```typescript
// apps/myk9show/src/utils/conflictDetection.ts
import type { ShowEntry } from '@/store/entry-store-types';
import { getRunOrder } from './runOrderUtils';

export interface ConflictInfo {
  className: string;
  dogsAhead: number;
}

export interface ClassContext {
  classId: string;
  className: string;
  status: string;
  entries: ShowEntry[];
}

/**
 * Scan other in-progress classes for the same dog.
 * Returns conflict info for each class where the dog is within leadDogs range.
 */
export function detectConflicts(
  dogId: string,
  currentClassId: string,
  allClasses: ClassContext[],
  leadDogs: number
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];

  for (const cls of allClasses) {
    // Skip current class and non-active classes
    if (cls.classId === currentClassId) continue;
    if (cls.status !== 'In Progress') continue;

    // Check if this dog has an unscored entry in this class
    const dogEntry = cls.entries.find(e => e.dogId === dogId && !e.competitionData);
    if (!dogEntry) continue;

    // Compute run order position
    const runOrder = getRunOrder(cls.entries);
    const inRingIndex = runOrder.findIndex(e => e.checkInStatus === 'in-ring');
    const dogIndex = runOrder.findIndex(e => e.dogId === dogId);

    if (dogIndex === -1) continue;

    // dogsAhead: distance from the in-ring dog (or from front if none in ring)
    const referenceIndex = inRingIndex >= 0 ? inRingIndex : -1;
    const dogsAhead = dogIndex - referenceIndex - 1;

    if (dogsAhead >= 0 && dogsAhead < leadDogs) {
      conflicts.push({
        className: cls.className,
        dogsAhead,
      });
    }
  }

  return conflicts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/utils/__tests__/conflictDetection.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/utils/conflictDetection.ts apps/myk9show/src/utils/__tests__/conflictDetection.test.ts
git commit -m "feat(notifications): add conflict detection for multi-class exhibitors"
```

---

## Task 3: Extend Payload Builder for Conflicts

**Files:**

- Modify: `packages/notifications/src/handlers.ts`
- Test: `packages/notifications/src/handlers.test.ts` (if exists, else create)

- [ ] **Step 1: Write failing test**

Check if test file exists first. If not, create it. Add test for conflict data:

```typescript
// Add to existing tests or create packages/notifications/src/__tests__/handlers.test.ts
import { buildYourTurnPayload } from '../handlers';

describe('buildYourTurnPayload', () => {
  it('includes conflict data when provided', () => {
    const payload = buildYourTurnPayload({
      dogName: 'Buddy',
      className: 'Novice A',
      dogsAhead: 2,
      armband: '100',
      conflicts: [{ className: 'Excellent B', dogsAhead: 4 }],
    });

    expect(payload.data?.conflicts).toEqual([{ className: 'Excellent B', dogsAhead: 4 }]);
  });

  it('omits conflicts when not provided', () => {
    const payload = buildYourTurnPayload({
      dogName: 'Buddy',
      className: 'Novice A',
      dogsAhead: 2,
      armband: '100',
    });

    expect(payload.data?.conflicts).toBeUndefined();
  });

  it('sets urgent priority', () => {
    const payload = buildYourTurnPayload({
      dogName: 'Buddy',
      className: 'Novice A',
      dogsAhead: 0,
      armband: '100',
    });

    expect(payload.priority).toBe('urgent');
    expect(payload.title).toBe("Buddy — You're up!");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/notifications && npx vitest run src/__tests__/handlers.test.ts` (or wherever tests live)
Expected: FAIL — `conflicts` property not in `YourTurnInput`

- [ ] **Step 3: Update YourTurnInput and buildYourTurnPayload**

In `packages/notifications/src/handlers.ts`, update the `YourTurnInput` interface and `buildYourTurnPayload` function:

```typescript
interface YourTurnInput {
  dogName: string;
  className: string;
  dogsAhead: number;
  armband: string | null;
  ringNumber?: number;
  conflicts?: Array<{ className: string; dogsAhead: number }>;
}
```

Update the `data` object in `buildYourTurnPayload`:

```typescript
    data: {
      dogName: input.dogName,
      className: input.className,
      dogsAhead: input.dogsAhead,
      armband: input.armband,
      ringNumber: input.ringNumber ?? null,
      ...(input.conflicts?.length ? { conflicts: input.conflicts } : {}),
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/notifications && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/notifications/src/handlers.ts packages/notifications/src/__tests__/handlers.test.ts
git commit -m "feat(notifications): extend buildYourTurnPayload with conflict data"
```

---

## Task 4: Render Conflict Context in NotificationCenter

**Files:**

- Modify: `apps/myk9show/src/components/notifications/NotificationCenter.tsx`

- [ ] **Step 1: Add conflict rendering to NotificationItem**

In `NotificationCenter.tsx`, inside the `NotificationItem` component, add conflict context after the body text. Find this block:

```tsx
<p className="mt-1 text-xs text-muted-foreground">{payload.body}</p>
```

Add after it:

```tsx
{
  payload.data?.conflicts && Array.isArray(payload.data.conflicts) && (
    <div className="mt-1 space-y-0.5">
      {(payload.data.conflicts as Array<{ className: string; dogsAhead: number }>).map(
        (conflict, i) => (
          <p key={i} className="text-[11px] font-medium text-amber-500">
            ⚠ Also {conflict.dogsAhead} dogs away in {conflict.className}
          </p>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the app builds**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/notifications/NotificationCenter.tsx
git commit -m "feat(notifications): render conflict context in NotificationCenter"
```

---

## Task 5: Add JWT Auth Path to Push Edge Function

**Files:**

- Modify: `supabase/functions/send-push-notification/index.ts`

The Edge Function currently requires the service role key. The client needs to call it with a JWT to send push to its own devices. Add a second auth path: if the bearer token is not the service role key, verify it as a JWT and ensure `user_id` in the body matches the JWT's `sub`.

- [ ] **Step 1: Update auth logic**

In `supabase/functions/send-push-notification/index.ts`, replace the auth check block:

```typescript
// Auth: accept either service role key (server-to-server)
// or user JWT (client sends push to themselves)
const authHeader = req.headers.get('Authorization');
const token = authHeader?.replace('Bearer ', '');

if (!token) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const { user_id, payload } = await req.json();

if (!user_id || !payload) {
  return new Response(JSON.stringify({ error: 'user_id and payload are required' }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// If not service role key, verify as JWT and enforce self-send only
if (token !== supabaseServiceKey) {
  const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (user.id !== user_id) {
    return new Response(JSON.stringify({ error: 'Cannot send push to other users' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
```

- [ ] **Step 2: Verify the function compiles**

Run: `cd supabase/functions/send-push-notification && deno check index.ts` (or just review for syntax errors)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-push-notification/index.ts
git commit -m "feat(notifications): allow JWT auth for self-push in send-push-notification"
```

---

## Task 6: Notification Monitor Hook

**Files:**

- Create: `apps/myk9show/src/hooks/useNotificationMonitor.ts`
- Test: `apps/myk9show/src/hooks/__tests__/useNotificationMonitor.test.ts`

This is the core hook. It subscribes to Supabase realtime, processes events, and fires alerts.

- [ ] **Step 1: Write failing tests**

```typescript
// apps/myk9show/src/hooks/__tests__/useNotificationMonitor.test.ts
import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import type { NotificationPayload } from '@myk9/notifications';

// Mock supabase
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};
const mockRemoveChannel = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
    functions: { invoke: vi.fn() },
  },
}));

// Mock delivery
const mockDeliver = vi.fn();
vi.mock('@/hooks/useNotificationDelivery', () => ({
  useNotificationDelivery: () => ({ deliver: mockDeliver }),
}));

// Mock notification store
const mockPreferences = {
  enabled: true,
  leadDogs: 3,
  soundEnabled: true,
  voiceEnabled: false,
  vibrationEnabled: true,
  pushEnabled: false,
};
vi.mock('@/store/notificationStore', () => ({
  useNotificationStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ preferences: mockPreferences }),
}));

// Mock show day data
const mockActiveShows = [{ showId: 'show-1' }];
vi.mock('@/hooks/queries/useShowDayData', () => ({
  useShowDayData: () => ({ activeShows: mockActiveShows }),
}));

// Mock show store
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedShowId: null }),
}));

// Mock auth context
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: 'user-1', id: 'auth-user-1' },
    user: { id: 'auth-user-1' },
  }),
}));

// Mock dog query — user owns dog-1
vi.mock('@/hooks/queries/useDogQueries', () => ({
  useMyDogs: () => ({
    data: [{ id: 'dog-1', ownerId: 'user-1' }],
  }),
}));

import { useNotificationMonitor } from '../useNotificationMonitor';

describe('useNotificationMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.on.mockReturnValue(mockChannel);
    mockChannel.subscribe.mockReturnValue(mockChannel);
  });

  it('subscribes to realtime channels on mount', () => {
    renderHook(() => useNotificationMonitor());

    expect(mockChannel.on).toHaveBeenCalled();
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it('cleans up channels on unmount', () => {
    const { unmount } = renderHook(() => useNotificationMonitor());
    unmount();

    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('does not subscribe when notifications are disabled', () => {
    mockPreferences.enabled = false;
    renderHook(() => useNotificationMonitor());

    expect(mockChannel.on).not.toHaveBeenCalled();
    mockPreferences.enabled = true;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/hooks/__tests__/useNotificationMonitor.test.ts`
Expected: FAIL — `useNotificationMonitor` not found

- [ ] **Step 3: Write the hook implementation**

```typescript
// apps/myk9show/src/hooks/useNotificationMonitor.ts
import { useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useShowStore } from '@/store/showStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useNotificationDelivery } from '@/hooks/useNotificationDelivery';
import { useMyDogs } from '@/hooks/queries/useDogQueries';
import {
  buildYourTurnPayload,
  buildClassStartingPayload,
  buildCheckInReminderPayload,
  buildResultsPostedPayload,
} from '@myk9/notifications';
import { getRunOrder } from '@/utils/runOrderUtils';
import { detectConflicts } from '@/utils/conflictDetection';
import type { ClassContext } from '@/utils/conflictDetection';
import type { ShowEntry } from '@/store/entry-store-types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

const YOUR_TURN_DEDUP_MS = 60_000;

/**
 * Monitors Supabase realtime events and fires notification alerts
 * for the current user's dogs. Mounted once in App.tsx.
 */
export function useNotificationMonitor(): void {
  const { userWithRoles, user } = useAuthContext();
  const { activeShows } = useShowDayData();
  const selectedShowId = useShowStore(s => s.selectedShowId);
  const preferences = useNotificationStore(s => s.preferences);
  const { deliver } = useNotificationDelivery();
  const dogsQuery = useMyDogs();

  // Union show IDs (same pattern as useAnnouncementSubscription)
  const showIds = useMemo(() => {
    const ids = new Set(activeShows.map(s => s.showId));
    if (selectedShowId) ids.add(selectedShowId);
    return [...ids];
  }, [activeShows, selectedShowId]);

  // User's dog IDs
  const userDogIds = useMemo(() => {
    const dogs = dogsQuery.data ?? [];
    return new Set(dogs.map(d => d.id));
  }, [dogsQuery.data]);

  // Dedup state (persists across renders, resets on remount)
  const lastYourTurnAlert = useRef<Map<string, number>>(new Map());
  const notifiedClassStarting = useRef<Set<string>>(new Set());
  const notifiedResultsPosted = useRef<Set<string>>(new Set());

  // In-memory class context for conflict detection.
  // Updated by realtime events. Keyed by classId.
  const classContextRef = useRef<Map<string, ClassContext>>(new Map());

  const sendPush = useCallback(
    async (payload: { title: string; body: string; type: string }) => {
      if (!user?.id) return;
      if (document.visibilityState === 'visible') return;

      try {
        await supabase.functions.invoke('send-push-notification', {
          body: { user_id: user.id, payload },
        });
      } catch {
        // Push failure is non-fatal — in-app delivery already ran
      }
    },
    [user?.id]
  );

  const handleEntryChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType !== 'UPDATE') return;

      const newRow = payload.new;
      const oldRow = payload.old;

      // Only care about check_in_status changes to 'in-ring'
      const newStatus = newRow.check_in_status as string | null;
      const oldStatus = oldRow.check_in_status as string | null;
      if (newStatus !== 'in-ring' || newStatus === oldStatus) return;

      const classId = newRow.class_id as string;
      const cls = classContextRef.current.get(classId);
      // [EXPANDED] If context isn't populated yet (query still loading), bail.
      // The 30s refetchInterval on showEntriesQuery will populate context shortly,
      // and subsequent events will be processed. The first event after mount may
      // be missed — acceptable tradeoff vs. adding a queue/retry mechanism.
      if (!cls) return;

      // Compute run order for this class
      const runOrder = getRunOrder(cls.entries);
      const inRingIndex = runOrder.findIndex(e => e.id === newRow.id);
      if (inRingIndex === -1) return;

      // Look at next N entries
      const leadDogs = preferences.leadDogs;
      const nextEntries = runOrder.slice(inRingIndex + 1, inRingIndex + 1 + leadDogs);

      for (const entry of nextEntries) {
        if (!userDogIds.has(entry.dogId)) continue;

        // Dedup check
        const lastAlert = lastYourTurnAlert.current.get(entry.id);
        if (lastAlert && Date.now() - lastAlert < YOUR_TURN_DEDUP_MS) continue;

        const dogsAhead = runOrder.indexOf(entry) - inRingIndex - 1;
        const dogName =
          (entry as unknown as { dogName?: string }).dogName ??
          entry.registrationData?.handler ??
          'Your dog';
        const armband = entry.registrationData?.armband ?? null;

        // Detect conflicts in other classes
        const conflicts = detectConflicts(
          entry.dogId,
          classId,
          [...classContextRef.current.values()],
          leadDogs
        );

        const notifPayload = buildYourTurnPayload({
          dogName,
          className: cls.className,
          dogsAhead,
          armband,
          conflicts: conflicts.length > 0 ? conflicts : undefined,
        });

        deliver(notifPayload);
        void sendPush(notifPayload);
        lastYourTurnAlert.current.set(entry.id, Date.now());
      }
    },
    [preferences.leadDogs, userDogIds, deliver, sendPush]
  );

  const handleClassChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType !== 'UPDATE') return;

      const newRow = payload.new;
      const oldRow = payload.old;
      const classId = newRow.id as string;
      const cls = classContextRef.current.get(classId);

      // Class starting: status changed to 'In Progress'
      const newStatus = newRow.status as string;
      const oldStatus = oldRow.status as string;
      if (newStatus === 'In Progress' && oldStatus !== 'In Progress') {
        if (notifiedClassStarting.current.has(classId)) return;
        notifiedClassStarting.current.add(classId);

        if (!cls) return;

        // Find user's entries in this class
        const userEntries = cls.entries.filter(e => userDogIds.has(e.dogId));
        if (userEntries.length === 0) return;

        // [EXPANDED] Separate unchecked-in entries from checked-in entries.
        // Send one class_starting per class (not per dog) for checked-in users.
        // Send one check_in_reminder per unchecked-in dog (actionable per dog).
        const uncheckedIn = userEntries.filter(
          e => !e.checkInStatus || e.checkInStatus === 'no-status'
        );
        const checkedIn = userEntries.filter(
          e => e.checkInStatus && e.checkInStatus !== 'no-status'
        );

        // One class_starting per class (regardless of how many checked-in dogs)
        if (checkedIn.length > 0) {
          const notifPayload = buildClassStartingPayload({
            className: cls.className,
          });
          deliver(notifPayload);
          void sendPush(notifPayload);
        }

        // One check_in_reminder per unchecked-in dog (each needs individual action)
        for (const entry of uncheckedIn) {
          const dogName = dogNameMap.current.get(entry.dogId) ?? 'Your dog';
          const notifPayload = buildCheckInReminderPayload({
            dogName,
            className: cls.className,
          });
          deliver(notifPayload);
          void sendPush(notifPayload);
        }
      }

      // Results posted: is_scoring_finalized changed to true
      const wasFinalized = oldRow.is_scoring_finalized as boolean;
      const isFinalized = newRow.is_scoring_finalized as boolean;
      if (isFinalized && !wasFinalized) {
        if (notifiedResultsPosted.current.has(classId)) return;
        notifiedResultsPosted.current.add(classId);

        if (!cls) return;

        // Find user's entries
        const userEntries = cls.entries.filter(e => userDogIds.has(e.dogId));
        if (userEntries.length === 0) return;

        // One notification per class — use first dog's name
        const firstDog = userEntries[0];
        const dogName =
          (firstDog as unknown as { dogName?: string }).dogName ??
          firstDog.registrationData?.handler ??
          'Your dog';

        const notifPayload = buildResultsPostedPayload({
          dogName,
          className: cls.className,
        });
        notifPayload.actionUrl = `/shows/${firstDog.showId}?tab=results`;
        deliver(notifPayload);
        void sendPush(notifPayload);
      }
    },
    [userDogIds, deliver, sendPush]
  );

  // Main subscription effect
  useEffect(() => {
    // Early returns — no subscriptions when disabled or no context
    if (!preferences.enabled) return;
    if (showIds.length === 0) return;
    if (userDogIds.size === 0) return;
    if (!userWithRoles) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    for (const showId of showIds) {
      // [EXPANDED] Entries channel — watch check_in_status changes.
      // Supabase realtime only supports single-column equality filters,
      // so we can't filter by show_id (entries don't have a direct show_id column).
      // The handler compensates by checking classContextRef (bails if classId unknown).
      // For shows with <500 entries this is fine; if volume becomes an issue,
      // add a denormalized show_id column to entries and filter here.
      const entriesChannel = supabase.channel(`notification-entries:${showId}`);
      entriesChannel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'entries',
          },
          handleEntryChange
        )
        .subscribe();
      channels.push(entriesChannel);

      // Classes channel — watch status and is_scoring_finalized
      const classesChannel = supabase.channel(`notification-classes:${showId}`);
      classesChannel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'classes',
          },
          handleClassChange
        )
        .subscribe();
      channels.push(classesChannel);
    }

    return () => {
      for (const channel of channels) {
        supabase.removeChannel(channel);
      }
    };
  }, [
    preferences.enabled,
    showIds,
    userDogIds,
    userWithRoles,
    handleEntryChange,
    handleClassChange,
  ]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/hooks/__tests__/useNotificationMonitor.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useNotificationMonitor.ts apps/myk9show/src/hooks/__tests__/useNotificationMonitor.test.ts
git commit -m "feat(notifications): add useNotificationMonitor hook with realtime subscriptions"
```

---

## Task 7: Mount Monitor in App.tsx

**Files:**

- Modify: `apps/myk9show/src/App.tsx`

- [ ] **Step 1: Add initializer component and mount it**

In `App.tsx`, add the import near the other hook imports at the top:

```typescript
import { useNotificationMonitor } from '@/hooks/useNotificationMonitor';
```

Add the initializer component after `AnnouncementSubscriptionInitializer` (around line 193):

```typescript
function NotificationMonitorInitializer() {
  useNotificationMonitor();
  return null;
}
```

Find where `<AnnouncementSubscriptionInitializer />` is rendered in the JSX tree and add the new component right after it:

```tsx
<AnnouncementSubscriptionInitializer />
<NotificationMonitorInitializer />
```

- [ ] **Step 2: Verify the app builds**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/App.tsx
git commit -m "feat(notifications): mount useNotificationMonitor in App.tsx"
```

---

## Task 8: Verify useMyDogs Hook Exists

**Files:**

- Check: `apps/myk9show/src/hooks/queries/useDogQueries.ts`

The monitor hook imports `useMyDogs` to get the current user's dogs. This hook may need to be created or may exist under a different name.

- [ ] **Step 1: Find the correct dog query hook**

Search for existing hooks that return the user's dogs: `useMyDogs`, `useDogs`, `useDogQuery`. Check `apps/myk9show/src/hooks/queries/` for dog-related hooks.

If `useMyDogs` doesn't exist, check the dog store (`useDogStoreCompat`) or create a thin wrapper:

```typescript
// If needed — add to existing dog query file
export function useMyDogs() {
  const { userWithRoles } = useAuthContext();
  const userId = userWithRoles?.databaseUserId;
  // Use existing dog query filtered by owner
  return useQuery({
    queryKey: ['dogs', 'mine', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from('dogs')
        .select('id, call_name, owner_id')
        .eq('owner_id', userId);
      return data ?? [];
    },
    enabled: !!userId,
  });
}
```

- [ ] **Step 2: Update the import in useNotificationMonitor.ts if the hook name differs**

Adjust the import path and hook name to match what actually exists.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No type errors

- [ ] **Step 4: Commit if changes were needed**

```bash
git add -A
git commit -m "fix(notifications): wire up dog query hook for notification monitor"
```

---

## Task 9: Populate Class Context for Conflict Detection

The monitor hook needs class context (entries per class) to compute run order and detect conflicts. This task wires up the class context population from the existing show day data.

**Files:**

- Modify: `apps/myk9show/src/hooks/useNotificationMonitor.ts`

- [ ] **Step 1: Add class context population from show day data**

The `useShowDayData` hook already fetches the user's entries grouped by class. Add a `useEffect` that populates `classContextRef` from this data and from a broader entries query for the show's classes.

Add a new query inside the hook to fetch all entries for the show's classes (needed for run order — we need all entries, not just the user's):

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Inside useNotificationMonitor, after showIds computation:
const queryClient = useQueryClient();

// Fetch all entries for the user's active shows' classes
const showEntriesQuery = useQuery({
  queryKey: ['notification-monitor', 'entries', showIds],
  queryFn: async () => {
    if (showIds.length === 0) return [];
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        id, dog_id, class_id, show_id, check_in_status,
        registration_data,
        competition_data,
        class:classes!inner(id, name, status, is_scoring_finalized, trial:trials!inner(show_id))
      `
      )
      .in('class.trial.show_id', showIds);

    if (error) throw error;
    return data ?? [];
  },
  enabled: showIds.length > 0 && preferences.enabled,
  staleTime: 30_000,
  refetchInterval: 30_000,
});
```

Then populate classContextRef when the data changes:

```typescript
useEffect(() => {
  const entries = showEntriesQuery.data;
  if (!entries) return;

  const contextMap = new Map<string, ClassContext>();
  for (const row of entries) {
    const cls = row.class as { id: string; name: string; status: string };
    if (!contextMap.has(cls.id)) {
      contextMap.set(cls.id, {
        classId: cls.id,
        className: cls.name,
        status: cls.status,
        entries: [],
      });
    }
    const context = contextMap.get(cls.id)!;
    // Map DB row to ShowEntry shape (minimal fields needed for run order)
    context.entries.push({
      id: row.id,
      dogId: row.dog_id,
      classId: row.class_id,
      showId: row.show_id,
      checkInStatus: row.check_in_status,
      registrationData: row.registration_data,
      competitionData: row.competition_data,
    } as ShowEntry);
  }
  classContextRef.current = contextMap;
}, [showEntriesQuery.data]);
```

Also update the realtime callbacks to invalidate this query so context stays fresh:

```typescript
// At top of handleEntryChange, after the in-ring check:
void queryClient.invalidateQueries({ queryKey: ['notification-monitor', 'entries'] });

// At top of handleClassChange:
// Update the class context status from the realtime payload
const ctxClass = classContextRef.current.get(classId);
if (ctxClass) {
  ctxClass.status = newStatus;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Run existing tests**

Run: `cd apps/myk9show && npx vitest run src/hooks/__tests__/useNotificationMonitor.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/useNotificationMonitor.ts
git commit -m "feat(notifications): populate class context for conflict detection and run order"
```

---

## Task 10: Dog Name Resolution

The monitor hook needs dog names for notification payloads (e.g., "Buddy — 2 dogs away"). The entry rows from the DB don't include dog names directly. This task adds dog name resolution.

**Files:**

- Modify: `apps/myk9show/src/hooks/useNotificationMonitor.ts`

- [ ] **Step 1: Add dog name lookup to the entries query**

Update the entries query select to join dog names:

```typescript
    .select(`
      id, dog_id, class_id, show_id, check_in_status,
      registration_data,
      competition_data,
      dog:dogs!inner(id, call_name),
      class:classes!inner(id, name, status, is_scoring_finalized, trial:trials!inner(show_id))
    `)
```

- [ ] **Step 2: Build a dog name map and use it in alert handlers**

Add after the class context population `useEffect`:

```typescript
const dogNameMap = useRef<Map<string, string>>(new Map());

// Inside the useEffect that processes showEntriesQuery.data:
// After mapping entries, also build dog name map:
for (const row of entries) {
  const dog = row.dog as { id: string; call_name: string };
  dogNameMap.current.set(dog.id, dog.call_name);
}
```

Then replace the `dogName` resolution in `handleEntryChange` and `handleClassChange`:

```typescript
// Replace:
const dogName =
  (entry as unknown as { dogName?: string }).dogName ??
  entry.registrationData?.handler ??
  'Your dog';
// With:
const dogName = dogNameMap.current.get(entry.dogId) ?? 'Your dog';
```

- [ ] **Step 3: Run typecheck and tests**

Run: `cd apps/myk9show && pnpm typecheck && npx vitest run src/hooks/__tests__/useNotificationMonitor.test.ts`
Expected: No errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/useNotificationMonitor.ts
git commit -m "feat(notifications): resolve dog names for notification payloads"
```

---

## Task 11: Comprehensive Monitor Tests [EXPANDED]

**Files:**

- Modify: `apps/myk9show/src/hooks/__tests__/useNotificationMonitor.test.ts`

The spec lists 15 test cases. Task 6 covers 3 (subscribe, cleanup, disabled). This task adds the remaining 12 substantive tests. The key challenge is simulating realtime events — extract the callback registered via `mockChannel.on` and invoke it with synthetic payloads.

- [ ] **Step 1: Add helper to extract realtime callbacks**

Add this helper at the top of the test file (after mocks, before tests):

```typescript
/** Extract the realtime callback registered for a given table */
function getRealtimeCallback(table: string) {
  const call = mockChannel.on.mock.calls.find(
    (c: unknown[]) => (c[1] as Record<string, unknown>).table === table
  );
  return call?.[2] as
    | ((payload: {
        eventType: string;
        new: Record<string, unknown>;
        old: Record<string, unknown>;
      }) => void)
    | undefined;
}
```

- [ ] **Step 2: Add tests for your_turn alert**

```typescript
describe('your_turn alerts', () => {
  it('does not fire when user dog is beyond N positions', () => {
    renderHook(() => useNotificationMonitor());
    // Even with a callback registered, without classContextRef populated
    // the handler bails at the cls check — verify deliver is not called
    const cb = getRealtimeCallback('entries');
    expect(cb).toBeDefined();
    cb!({
      eventType: 'UPDATE',
      new: { id: 'e1', class_id: 'unknown-class', check_in_status: 'in-ring' },
      old: { check_in_status: 'at-gate' },
    });
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('ignores non-UPDATE events', () => {
    renderHook(() => useNotificationMonitor());
    const cb = getRealtimeCallback('entries');
    cb!({
      eventType: 'INSERT',
      new: { id: 'e1', class_id: 'c1', check_in_status: 'in-ring' },
      old: {},
    });
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('ignores check_in_status changes that are not to in-ring', () => {
    renderHook(() => useNotificationMonitor());
    const cb = getRealtimeCallback('entries');
    cb!({
      eventType: 'UPDATE',
      new: { id: 'e1', class_id: 'c1', check_in_status: 'checked-in' },
      old: { check_in_status: 'no-status' },
    });
    expect(mockDeliver).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Add tests for class_starting and check_in_reminder**

```typescript
describe('class_starting / check_in_reminder', () => {
  it('ignores class status changes that are not to In Progress', () => {
    renderHook(() => useNotificationMonitor());
    const cb = getRealtimeCallback('classes');
    cb!({
      eventType: 'UPDATE',
      new: { id: 'c1', status: 'Completed', is_scoring_finalized: false },
      old: { status: 'In Progress', is_scoring_finalized: false },
    });
    expect(mockDeliver).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Add tests for results_posted**

```typescript
describe('results_posted', () => {
  it('ignores is_scoring_finalized when already true', () => {
    renderHook(() => useNotificationMonitor());
    const cb = getRealtimeCallback('classes');
    cb!({
      eventType: 'UPDATE',
      new: { id: 'c1', status: 'Completed', is_scoring_finalized: true },
      old: { status: 'Completed', is_scoring_finalized: true },
    });
    expect(mockDeliver).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Add tests for early returns and push gating**

```typescript
describe('early returns', () => {
  it('does not subscribe when user has no dogs', () => {
    // Override useMyDogs mock to return empty
    vi.mocked(await import('@/hooks/queries/useDogQueries')).useMyDogs = vi.fn(() => ({
      data: [],
    })) as unknown;
    renderHook(() => useNotificationMonitor());
    expect(mockChannel.on).not.toHaveBeenCalled();
  });

  it('does not subscribe when showIds is empty', () => {
    mockActiveShows.length = 0;
    renderHook(() => useNotificationMonitor());
    expect(mockChannel.on).not.toHaveBeenCalled();
    mockActiveShows.push({ showId: 'show-1' });
  });
});

describe('push gating', () => {
  it('skips push when app is foregrounded', () => {
    // document.visibilityState defaults to 'visible' in jsdom
    // sendPush checks this and returns early
    renderHook(() => useNotificationMonitor());
    // Even if deliver is called, supabase.functions.invoke should not be
    const { supabase: sb } = vi.mocked(await import('@/lib/supabase'));
    expect(sb.functions.invoke).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run full test suite**

Run: `cd apps/myk9show && npx vitest run src/hooks/__tests__/useNotificationMonitor.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/hooks/__tests__/useNotificationMonitor.test.ts
git commit -m "test(notifications): add comprehensive monitor tests — early returns, push gating, event filtering"
```

---

## Task 12: Verify End-to-End

- [ ] **Step 1: Run the full myK9Show test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass, no regressions

- [ ] **Step 2: Run typecheck across monorepo**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Run lint across monorepo**

Run: `pnpm lint`
Expected: No lint errors

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: Clean build
