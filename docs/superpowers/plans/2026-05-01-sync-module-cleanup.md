# Sync Module Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete two dead sync hooks, extract pure helpers from `useConflictResolution`, and add unit tests for both.

**Architecture:** Pure logic (strategy maps, entity mappers, filter) moves into a sibling `conflictResolutionUtils.ts` and is tested directly. The hook is updated to call the utils; its wiring is tested with `renderHook` + `vi.mock('@myk9/replication')`.

**Tech Stack:** Vitest, `@testing-library/react` (`renderHook`, `act`), TypeScript

---

## File Map

| Action | Path                                                                |
| ------ | ------------------------------------------------------------------- |
| Delete | `apps/myk9show/src/hooks/useOfflineSync.ts`                         |
| Delete | `apps/myk9show/src/hooks/usePredictiveSync.ts`                      |
| Delete | `apps/myk9show/src/test/hooks/usePredictiveSync.test.ts`            |
| Create | `apps/myk9show/src/hooks/conflictResolutionUtils.ts`                |
| Create | `apps/myk9show/src/hooks/__tests__/conflictResolutionUtils.test.ts` |
| Create | `apps/myk9show/src/hooks/__tests__/useConflictResolution.test.ts`   |
| Modify | `apps/myk9show/src/hooks/useConflictResolution.ts`                  |

---

## Task 1: Delete Dead Hooks

**Files:**

- Delete: `apps/myk9show/src/hooks/useOfflineSync.ts`
- Delete: `apps/myk9show/src/hooks/usePredictiveSync.ts`
- Delete: `apps/myk9show/src/test/hooks/usePredictiveSync.test.ts`

- [ ] **Step 1: Delete the three files**

```bash
rm apps/myk9show/src/hooks/useOfflineSync.ts \
   apps/myk9show/src/hooks/usePredictiveSync.ts \
   apps/myk9show/src/test/hooks/usePredictiveSync.test.ts
```

- [ ] **Step 2: Verify no callers were missed**

```bash
grep -r "useOfflineSync\|usePredictiveSync" apps/myk9show/src --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 3: Run typecheck**

```bash
cd apps/myk9show && npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: no output (or only pre-existing errors unrelated to these files).

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor(sync): delete dead useOfflineSync and usePredictiveSync hooks"
```

---

## Task 2: Create `conflictResolutionUtils.ts`

**Files:**

- Create: `apps/myk9show/src/hooks/conflictResolutionUtils.ts`

- [ ] **Step 1: Create the file**

```typescript
// apps/myk9show/src/hooks/conflictResolutionUtils.ts
import type { Conflict, ConflictStrategy } from '@myk9/replication';
import type {
  ConflictStatus,
  ResolutionStrategy,
  BaseConflict,
  BaseConflictResolution,
} from '../types/conflict-types';

// Replication status → hook status
export const STATUS_MAP: Record<string, ConflictStatus> = {
  pending: 'pending',
  resolved: 'resolved',
  ignored: 'dismissed',
};

// Replication strategy → hook strategy (for reading resolved conflicts)
export const STRATEGY_FROM_REPLICATION: Record<ConflictStrategy, ResolutionStrategy> = {
  'last-write-wins': 'newest_wins',
  'server-authoritative': 'remote_wins',
  'client-authoritative': 'local_wins',
  'field-level-merge': 'merge_automatic',
};

// Hook strategy → replication strategy (for resolveConflict writes)
export const STRATEGY_TO_REPLICATION: Record<string, ConflictStrategy> = {
  local_wins: 'client-authoritative',
  remote_wins: 'server-authoritative',
  merge_automatic: 'field-level-merge',
  merge_manual: 'field-level-merge',
  newest_wins: 'last-write-wins',
};

export function mapConflict(c: Conflict): BaseConflict<Record<string, unknown>> {
  return {
    id: c.id,
    detectedAt: c.detectedAt,
    createdAt: c.detectedAt,
    priority: 'medium',
    status: STATUS_MAP[c.status] ?? 'pending',
    conflictType: 'sync_conflict',
    entityType: c.entityType ?? 'unknown',
    entityId: c.entityId,
    localData: c.localData as Record<string, unknown>,
    remoteData: c.remoteData as Record<string, unknown>,
    baseData: c.baseData as Record<string, unknown> | undefined,
    conflictFields: [],
    lastModified: { local: c.detectedAt, remote: c.detectedAt },
    lastModifiedBy: { local: 'local', remote: 'remote' },
  };
}

export function mapResolution(c: Conflict): BaseConflictResolution<unknown> {
  return {
    conflictId: c.id,
    strategy: c.resolution
      ? (STRATEGY_FROM_REPLICATION[c.resolution.strategy] ?? 'merge_automatic')
      : 'merge_automatic',
    resolvedAt: c.resolution?.resolvedAt ?? new Date(),
    resolvedBy: c.resolution?.resolvedBy ?? 'system',
    automatic: !c.resolution || c.resolution.strategy !== 'field-level-merge',
    resolvedEntity: c.resolution?.resolvedEntity,
  };
}

export function filterByEntityType<T extends { entityType?: string }>(
  items: T[],
  entityType: string | undefined
): T[] {
  if (entityType === undefined) return items;
  return items.filter(item => item.entityType === entityType);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/myk9show && npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: no new errors.

---

## Task 3: Write and Run Utils Tests

**Files:**

- Create: `apps/myk9show/src/hooks/__tests__/conflictResolutionUtils.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// apps/myk9show/src/hooks/__tests__/conflictResolutionUtils.test.ts
import { describe, it, expect } from 'vitest';
import {
  STATUS_MAP,
  STRATEGY_FROM_REPLICATION,
  STRATEGY_TO_REPLICATION,
  mapConflict,
  mapResolution,
  filterByEntityType,
} from '../conflictResolutionUtils';
import type { Conflict } from '@myk9/replication';

function makeConflict(overrides: Partial<Conflict> = {}): Conflict {
  return {
    id: 'c1',
    entityId: 'e1',
    entityType: 'show',
    localData: { name: 'local' },
    remoteData: { name: 'remote' },
    detectedAt: new Date('2026-01-01T00:00:00Z'),
    status: 'pending',
    ...overrides,
  };
}

describe('STATUS_MAP', () => {
  it('maps pending → pending', () => expect(STATUS_MAP['pending']).toBe('pending'));
  it('maps resolved → resolved', () => expect(STATUS_MAP['resolved']).toBe('resolved'));
  it('maps ignored → dismissed', () => expect(STATUS_MAP['ignored']).toBe('dismissed'));
});

describe('STRATEGY_FROM_REPLICATION', () => {
  it('last-write-wins → newest_wins', () =>
    expect(STRATEGY_FROM_REPLICATION['last-write-wins']).toBe('newest_wins'));
  it('server-authoritative → remote_wins', () =>
    expect(STRATEGY_FROM_REPLICATION['server-authoritative']).toBe('remote_wins'));
  it('client-authoritative → local_wins', () =>
    expect(STRATEGY_FROM_REPLICATION['client-authoritative']).toBe('local_wins'));
  it('field-level-merge → merge_automatic', () =>
    expect(STRATEGY_FROM_REPLICATION['field-level-merge']).toBe('merge_automatic'));
});

describe('STRATEGY_TO_REPLICATION', () => {
  it('local_wins → client-authoritative', () =>
    expect(STRATEGY_TO_REPLICATION['local_wins']).toBe('client-authoritative'));
  it('remote_wins → server-authoritative', () =>
    expect(STRATEGY_TO_REPLICATION['remote_wins']).toBe('server-authoritative'));
  it('merge_automatic → field-level-merge', () =>
    expect(STRATEGY_TO_REPLICATION['merge_automatic']).toBe('field-level-merge'));
  it('merge_manual → field-level-merge', () =>
    expect(STRATEGY_TO_REPLICATION['merge_manual']).toBe('field-level-merge'));
  it('newest_wins → last-write-wins', () =>
    expect(STRATEGY_TO_REPLICATION['newest_wins']).toBe('last-write-wins'));
});

describe('mapConflict', () => {
  it('maps all required fields', () => {
    const result = mapConflict(makeConflict());
    expect(result.id).toBe('c1');
    expect(result.entityId).toBe('e1');
    expect(result.entityType).toBe('show');
    expect(result.status).toBe('pending');
    expect(result.priority).toBe('medium');
    expect(result.conflictType).toBe('sync_conflict');
    expect(result.conflictFields).toEqual([]);
    expect(result.lastModifiedBy).toEqual({ local: 'local', remote: 'remote' });
  });

  it('defaults entityType to "unknown" when absent', () => {
    const result = mapConflict(makeConflict({ entityType: undefined }));
    expect(result.entityType).toBe('unknown');
  });

  it('uses dismissed for ignored status', () => {
    const result = mapConflict(makeConflict({ status: 'ignored' }));
    expect(result.status).toBe('dismissed');
  });

  it('falls back to pending for unrecognised status', () => {
    const result = mapConflict(makeConflict({ status: 'unknown_value' as never }));
    expect(result.status).toBe('pending');
  });
});

describe('mapResolution', () => {
  it('maps strategy and meta from resolution', () => {
    const resolvedAt = new Date('2026-01-02T00:00:00Z');
    const c = makeConflict({
      status: 'resolved',
      resolution: {
        strategy: 'last-write-wins',
        resolvedEntity: { id: '1' },
        resolvedAt,
        resolvedBy: 'user-abc',
      },
    });
    const result = mapResolution(c);
    expect(result.conflictId).toBe('c1');
    expect(result.strategy).toBe('newest_wins');
    expect(result.resolvedBy).toBe('user-abc');
    expect(result.resolvedAt).toBe(resolvedAt);
    expect(result.resolvedEntity).toEqual({ id: '1' });
    expect(result.automatic).toBe(true); // last-write-wins is not field-level-merge
  });

  it('returns safe defaults when resolution is absent', () => {
    const result = mapResolution(makeConflict({ resolution: undefined }));
    expect(result.strategy).toBe('merge_automatic');
    expect(result.resolvedBy).toBe('system');
    expect(result.resolvedEntity).toBeUndefined();
    expect(result.automatic).toBe(true);
  });

  it('marks automatic=false for field-level-merge', () => {
    const c = makeConflict({
      resolution: {
        strategy: 'field-level-merge',
        resolvedEntity: {},
        resolvedAt: new Date(),
      },
    });
    expect(mapResolution(c).automatic).toBe(false);
  });
});

describe('filterByEntityType', () => {
  const items = [
    { entityType: 'show', id: 1 },
    { entityType: 'dog', id: 2 },
    { entityType: 'show', id: 3 },
  ];

  it('returns all items when entityType is undefined', () => {
    expect(filterByEntityType(items, undefined)).toHaveLength(3);
  });

  it('returns only matching items', () => {
    const result = filterByEntityType(items, 'show');
    expect(result).toHaveLength(2);
    expect(result.every(i => i.entityType === 'show')).toBe(true);
  });

  it('returns empty array when nothing matches', () => {
    expect(filterByEntityType(items, 'trial')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run utils tests**

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/conflictResolutionUtils.test.ts
```

Expected: all 21 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/hooks/conflictResolutionUtils.ts \
        apps/myk9show/src/hooks/__tests__/conflictResolutionUtils.test.ts
git commit -m "feat(sync): extract conflictResolutionUtils with 21 unit tests"
```

---

## Task 4: Refactor `useConflictResolution.ts` to Use Utils

**Files:**

- Modify: `apps/myk9show/src/hooks/useConflictResolution.ts`

- [ ] **Step 1: Add the import and replace inline maps in `refreshConflicts`**

At the top of `useConflictResolution.ts`, add the import after the existing imports:

```typescript
import {
  STRATEGY_TO_REPLICATION,
  mapConflict,
  mapResolution,
  filterByEntityType,
} from './conflictResolutionUtils';
```

(`STATUS_MAP` and `STRATEGY_FROM_REPLICATION` are used internally inside `mapConflict`/`mapResolution` — the hook does not reference them directly.)

Replace the body of `refreshConflicts` (the entire `try` block, lines ~81–153) with:

```typescript
const refreshConflicts = useCallback(() => {
  try {
    const sharedConflicts = conflictManager.getPendingConflicts();
    const sharedResolutions = conflictManager.getResolutionHistory();
    const stats = conflictManager.getConflictStats();

    const filteredConflicts = filterByEntityType(sharedConflicts, options.entityType);
    const filteredResolutions = filterByEntityType(sharedResolutions, options.entityType);

    setState(prev => ({
      ...prev,
      conflicts: filteredConflicts.map(mapConflict),
      resolutions: filteredResolutions.map(mapResolution),
      stats,
      isLoading: false,
      error: null,
    }));
  } catch (error) {
    setState(prev => ({
      ...prev,
      error: error instanceof Error ? error.message : 'Failed to refresh conflicts',
      isLoading: false,
    }));
  }
}, [options.entityType]);
```

- [ ] **Step 2: Replace inline strategyMap in `resolveConflict`**

Inside `resolveConflict`, replace:

```typescript
const strategyMap: Record<string, ConflictStrategy> = {
  local_wins: 'client-authoritative',
  remote_wins: 'server-authoritative',
  merge_automatic: 'field-level-merge',
  merge_manual: 'field-level-merge',
  newest_wins: 'last-write-wins',
};

const sharedStrategy = strategyMap[strategy] || 'last-write-wins';
```

with:

```typescript
const sharedStrategy = STRATEGY_TO_REPLICATION[strategy] ?? 'last-write-wins';
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/myk9show && npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/useConflictResolution.ts
git commit -m "refactor(sync): replace inline maps with conflictResolutionUtils"
```

---

## Task 5: Write and Run Hook Tests

**Files:**

- Create: `apps/myk9show/src/hooks/__tests__/useConflictResolution.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// apps/myk9show/src/hooks/__tests__/useConflictResolution.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Capture event handlers so tests can fire them
const registeredHandlers: Map<string, (event: unknown) => void> = new Map();

const mockManager = {
  getPendingConflicts: vi.fn().mockReturnValue([]),
  getResolutionHistory: vi.fn().mockReturnValue([]),
  getConflictStats: vi.fn().mockReturnValue({ total: 0, pending: 0, resolved: 0 }),
  addEventListener: vi.fn((type: string, handler: (event: unknown) => void) => {
    registeredHandlers.set(type, handler);
  }),
  removeEventListener: vi.fn((type: string) => {
    registeredHandlers.delete(type);
  }),
  resolveConflictManually: vi.fn().mockResolvedValue(undefined),
  handleSyncConflict: vi.fn(),
};

vi.mock('@myk9/replication', () => ({ conflictManager: mockManager }));

const mockUseAuth = vi.fn().mockReturnValue({ user: { id: 'user-123' } });
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));

beforeEach(() => {
  vi.clearAllMocks();
  registeredHandlers.clear();
  mockManager.getPendingConflicts.mockReturnValue([]);
  mockManager.getResolutionHistory.mockReturnValue([]);
  mockManager.getConflictStats.mockReturnValue({ total: 0, pending: 0, resolved: 0 });
  mockManager.resolveConflictManually.mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({ user: { id: 'user-123' } });
});

// Minimal Conflict shape for test fixtures
function makeReplicationConflict(id: string, entityType = 'show') {
  return {
    id,
    entityId: `entity-${id}`,
    entityType,
    localData: {},
    remoteData: {},
    detectedAt: new Date('2026-01-01T00:00:00Z'),
    status: 'pending' as const,
  };
}

import { useConflictResolution } from '../useConflictResolution';

describe('useConflictResolution', () => {
  it('calls getPendingConflicts, getResolutionHistory, getConflictStats on mount', () => {
    renderHook(() => useConflictResolution());
    expect(mockManager.getPendingConflicts).toHaveBeenCalled();
    expect(mockManager.getResolutionHistory).toHaveBeenCalled();
    expect(mockManager.getConflictStats).toHaveBeenCalled();
  });

  it('filters conflicts by entityType when option is provided', () => {
    mockManager.getPendingConflicts.mockReturnValue([
      makeReplicationConflict('c1', 'show'),
      makeReplicationConflict('c2', 'dog'),
    ]);
    const { result } = renderHook(() => useConflictResolution({ entityType: 'show' }));
    expect(result.current.conflicts).toHaveLength(1);
    expect(result.current.conflicts[0].entityType).toBe('show');
  });

  it('adds a notification when conflict_detected fires with enableNotifications: true', () => {
    const { result } = renderHook(() => useConflictResolution({ enableNotifications: true }));

    act(() => {
      registeredHandlers.get('conflict_detected')?.({
        conflictId: 'c1',
        entityType: 'show',
        entityId: 'e1',
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe('notification-c1');
    expect(result.current.notifications[0].type).toBe('warning');
  });

  it('does not add a notification when enableNotifications is false', () => {
    const { result } = renderHook(() => useConflictResolution({ enableNotifications: false }));

    act(() => {
      registeredHandlers.get('conflict_detected')?.({
        conflictId: 'c2',
        entityType: 'show',
        entityId: 'e1',
      });
    });

    expect(result.current.notifications).toHaveLength(0);
  });

  it('calls removeEventListener for all 4 event types on unmount', () => {
    const { unmount } = renderHook(() => useConflictResolution());
    unmount();
    expect(mockManager.removeEventListener).toHaveBeenCalledTimes(4);
  });

  it('dismissNotification removes the correct notification and leaves others', () => {
    const { result } = renderHook(() => useConflictResolution({ enableNotifications: true }));

    act(() => {
      registeredHandlers.get('conflict_detected')?.({
        conflictId: 'c1',
        entityType: 'show',
        entityId: 'e1',
      });
      registeredHandlers.get('conflict_detected')?.({
        conflictId: 'c2',
        entityType: 'dog',
        entityId: 'e2',
      });
    });
    expect(result.current.notifications).toHaveLength(2);

    act(() => result.current.dismissNotification('c1'));

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe('notification-c2');
  });

  it('clearNotifications removes all notifications', () => {
    const { result } = renderHook(() => useConflictResolution({ enableNotifications: true }));

    act(() => {
      registeredHandlers.get('conflict_detected')?.({
        conflictId: 'c1',
        entityType: 'show',
        entityId: 'e1',
      });
    });

    act(() => result.current.clearNotifications());
    expect(result.current.notifications).toHaveLength(0);
  });

  it('resolveConflict calls resolveConflictManually with the correct ConflictStrategy', async () => {
    const { result } = renderHook(() => useConflictResolution());

    await act(async () => {
      await result.current.resolveConflict('c1', 'local_wins');
    });

    expect(mockManager.resolveConflictManually).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        strategy: 'client-authoritative',
        userId: 'user-123',
      })
    );
  });

  it('resolveConflict throws before calling manager when user is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useConflictResolution());

    await expect(
      act(async () => {
        await result.current.resolveConflict('c1', 'local_wins');
      })
    ).rejects.toThrow('User must be authenticated');

    expect(mockManager.resolveConflictManually).not.toHaveBeenCalled();
  });

  it('sets error state when getPendingConflicts throws', () => {
    mockManager.getPendingConflicts.mockImplementation(() => {
      throw new Error('DB error');
    });
    const { result } = renderHook(() => useConflictResolution());
    expect(result.current.error).toBe('DB error');
    expect(result.current.isLoading).toBe(false);
  });
});
```

- [ ] **Step 2: Run hook tests**

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/useConflictResolution.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 3: Run full test suite to confirm no regressions**

```bash
cd apps/myk9show && npx vitest run 2>&1 | tail -20
```

Expected: pre-existing failures only (known hanging tests); no new failures.

- [ ] **Step 4: Final typecheck**

```bash
cd apps/myk9show && npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/__tests__/useConflictResolution.test.ts
git commit -m "test(sync): add 10 hook tests for useConflictResolution"
```
