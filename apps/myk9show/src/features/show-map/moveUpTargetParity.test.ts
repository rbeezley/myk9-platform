import { describe, expect, it } from 'vitest';
import { getAvailableMoveUpTargets } from '@/components/entries/moveUpTargets';
import type { ClassWithCapacity } from '@/services/database/day-of-operations';
import { buildMoveUpTargets } from './buildMoveUpTargets';
import type { ShowMapClassInput } from './showMapTypes';

// MYK9-920: Show Map and Entries Management share ONE target rule (same trial,
// same element, higher level, free seat).

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

const spots = new Map([
  [advanced.id, 5],
  [fullMaster.id, 0],
  [advancedTrial2.id, 9],
]);

describe('move-up targets: Show Map vs Entries Management', () => {
  it('drops a full class and a class in another trial', () => {
    const targets = buildMoveUpTargets(all, novice.id, 'AKC', spots);
    expect(targets.map(t => t.id)).toEqual([advanced.id]);
  });

  it('offers identical targets for the same entry', () => {
    const withCapacity: ClassWithCapacity[] = all.map(cls => ({
      id: cls.id,
      name: cls.name,
      class_number: null,
      max_entries: null,
      trial_id: cls.trialId,
      accepted_count: 0,
      available_spots: spots.get(cls.id) ?? 999,
      element: cls.element ?? null,
      level: cls.level ?? null,
      section: cls.section ?? null,
    }));

    const showMapIds = buildMoveUpTargets(all, novice.id, 'AKC', spots).map(t => t.id);
    const entryManagementIds = getAvailableMoveUpTargets(withCapacity, novice.id, 'AKC').map(
      c => c.id
    );

    expect(entryManagementIds).toEqual([advanced.id]);
    expect(showMapIds).toEqual(entryManagementIds);
  });
});
