/**
 * MYK9-1853: the combined A/B class reads section B's judge through the same "unset" rule as
 * section A, so a blank or legacy TBD judge reads "No Judge Assigned", never "TBD" or blank.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

function classWithJudge(id: string, section: string, judgeName: string | null) {
  return {
    id,
    element: 'Container',
    level: 'Novice',
    section,
    judgeName,
    classStatus: 'in_progress',
  };
}

describe('combined class: section B judge (MYK9-1853)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEntriesByClass.mockResolvedValue([]);
    getTrialById.mockResolvedValue(null);
  });

  it.each([[''], ['TBD'], [null]])('reads section B judge %j as No Judge Assigned', async name => {
    getClassById.mockImplementation(async (id: string) =>
      id === 'class-a' ? classWithJudge(id, 'A', 'Jane Smith') : classWithJudge(id, 'B', name)
    );
    const deps = createAtShowDataDependencies();
    const { classInfo } = await deps.fetchCombinedClasses!('class-a', 'class-b', 'show-1', 'judge');
    expect(classInfo?.judgeNameB).toBe('No Judge Assigned');
  });

  it('keeps a real section B judge name', async () => {
    getClassById.mockImplementation(async (id: string) =>
      classWithJudge(id, id === 'class-a' ? 'A' : 'B', ' Raj Patel ')
    );
    const deps = createAtShowDataDependencies();
    const { classInfo } = await deps.fetchCombinedClasses!('class-a', 'class-b', 'show-1', 'judge');
    expect(classInfo?.judgeNameB).toBe('Raj Patel');
  });
});
