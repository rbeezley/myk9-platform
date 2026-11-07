/**
 * MYK9-1748: the combined A/B entry list lists both sections, so its header title must
 * name the pair (the class card's label), never just Section A.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { groupSectionedClasses } from '@myk9/ringside';

const getClassById = vi.fn();
const getEntriesByClass = vi.fn();
const getTrialById = vi.fn();

vi.mock('@/services/replication', () => ({
  replicatedArmbandsTable: {
    getByShow: vi.fn(async () => []),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedClassesTable: { getClassById: (id: string) => getClassById(id) },
  replicatedEntriesTable: { getEntriesByClass: (id: string) => getEntriesByClass(id) },
  replicatedTrialsTable: { getTrialById: (id: string) => getTrialById(id) },
}));

import { createAtShowDataDependencies } from './atShowDataAdapter';

const makeClass = (id: string, section: string) => ({
  id,
  element: 'Container',
  level: 'Novice',
  section,
  judgeName: 'Judge',
  classStatus: 'in_progress',
});

describe('combined entry list header title', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEntriesByClass.mockResolvedValue([]);
    getTrialById.mockResolvedValue(null);
    getClassById.mockImplementation(async (id: string) =>
      makeClass(id, id === 'class-a' ? 'A' : 'B')
    );
  });

  it('names both sections, matching the combined class card label', async () => {
    const deps = createAtShowDataDependencies();
    const { classInfo } = await deps.fetchCombinedClasses!('class-a', 'class-b', 'show-1', 'judge');
    const card = groupSectionedClasses(
      [{ ...cardClass('class-a', 'A') }, { ...cardClass('class-b', 'B') }] as never,
      'AKC'
    )[0];

    expect(classInfo?.className).toBe('Container Novice A & B');
    expect(classInfo?.className).toBe(card?.class_name);
  });

  it('keeps the single class route on its own section', async () => {
    const deps = createAtShowDataDependencies();
    const { classInfo } = await deps.fetchSingleClass!('class-a', 'show-1', 'judge');

    expect(classInfo?.className).toBe('Container Novice A');
  });
});

function cardClass(id: string, section: string) {
  return {
    id,
    element: 'Container',
    level: 'Novice',
    section,
    judge_name: 'Judge',
    entry_count: 0,
    completed_count: 0,
    dogs: [],
    is_favorite: false,
    class_status: 'in_progress',
  };
}
