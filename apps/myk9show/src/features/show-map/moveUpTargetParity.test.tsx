import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getAvailableMoveUpTargets } from '@/components/entries/moveUpTargets';
import type { ClassWithCapacity } from '@/services/database/day-of-operations';
import { buildMoveUpTargets } from './buildMoveUpTargets';
import type { ShowMapClassInput } from './showMapTypes';
import { useMoveUpTargets } from './useMoveUpTargets';

// MYK9-920: Show Map and Entries Management share ONE target rule (same trial,
// same element, higher level, free seat). The capacity list below is the same
// shape `getClassesWithCapacity` returns; both surfaces consume it.

const mockGetClassesWithCapacity = vi.fn();
vi.mock('@/services/database/day-of-operations', () => ({
  getClassesWithCapacity: (...args: unknown[]) => mockGetClassesWithCapacity(...args),
}));

function makeClass(
  overrides: Partial<ShowMapClassInput> & { id: string; level: string }
): ShowMapClassInput {
  return { trialId: 'trial-1', name: overrides.id, element: 'Container', ...overrides };
}

const novice = makeClass({ id: 'novice', level: 'Novice' });
const advanced = makeClass({ id: 'advanced', level: 'Advanced' });
const fullMaster = makeClass({ id: 'master-full', level: 'Master' });
const advancedTrial2 = makeClass({ id: 'advanced-t2', level: 'Advanced', trialId: 'trial-2' });
const all = [novice, advanced, fullMaster, advancedTrial2];

const spots: Record<string, number> = { advanced: 5, 'master-full': 0, 'advanced-t2': 9 };
const withCapacity: ClassWithCapacity[] = all.map(cls => ({
  id: cls.id,
  name: cls.name,
  class_number: null,
  max_entries: null,
  trial_id: cls.trialId,
  accepted_count: 0,
  available_spots: spots[cls.id] ?? 999,
  element: cls.element ?? null,
  level: cls.level ?? null,
  section: cls.section ?? null,
}));

describe('move-up targets: Show Map vs Entries Management', () => {
  it('lists a full class as disabled, and drops a class in another trial', () => {
    const map = new Map(withCapacity.map(c => [c.id, c.available_spots]));
    expect(
      buildMoveUpTargets(all, novice.id, 'AKC', map).map(t => [t.id, t.isFull === true])
    ).toEqual([
      [advanced.id, false],
      [fullMaster.id, true],
    ]);
  });

  it('offers identical targets for the same entry, from the real capacity source', async () => {
    mockGetClassesWithCapacity.mockResolvedValue({ data: withCapacity, error: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMoveUpTargets('show-1', all, novice.id, 'AKC'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.capacityState).toBe('ready'));

    const entryManagementIds = getAvailableMoveUpTargets(withCapacity, novice.id, 'AKC').map(
      c => c.id
    );
    expect(entryManagementIds).toEqual([advanced.id]);
    // Show Map lists the full class too (disabled); its open targets match
    // Entries Management, which keeps hiding full classes.
    expect(result.current.targets.filter(t => !t.isFull).map(t => t.id)).toEqual(
      entryManagementIds
    );
    expect(result.current.targets.map(t => t.id)).toEqual([advanced.id, fullMaster.id]);
  });
});
