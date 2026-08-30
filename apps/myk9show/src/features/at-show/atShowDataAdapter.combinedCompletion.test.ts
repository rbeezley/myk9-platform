/**
 * Combined Novice A/B completion gating (MYK9-260).
 *
 * A and B run together but are scored and released SEPARATELY, so A finishing
 * first is the normal case, not an edge case. The combined view builds its
 * single `classInfo` from class A -- which was fine while the combined page had
 * no completion view at all, and stopped being fine the moment the collapse
 * gave it one: A's `isScoringFinalized` / `resultsReleasedAt` would celebrate
 * the whole ring and publish a combined podium over entries from a section
 * still being judged.
 *
 * Found by Codex on the collapse PR, after I had claimed in the commit message
 * that "readiness derives from the entries" -- it does not; it derives from
 * these two class flags, and the composite celebration key I added was
 * necessary but nowhere near sufficient.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getClassById = vi.fn();
const getEntriesByClass = vi.fn();
const getTrialById = vi.fn();

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById: (id: string) => getClassById(id) },
  replicatedEntriesTable: { getEntriesByClass: (id: string) => getEntriesByClass(id) },
  replicatedTrialsTable: { getTrialById: (id: string) => getTrialById(id) },
}));

import { createAtShowDataDependencies } from './atShowDataAdapter';

function makeClass(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    element: 'Container',
    level: 'Novice',
    section: id === 'class-a' ? 'A' : 'B',
    judgeName: 'Judge',
    classStatus: 'in_progress',
    ...over,
  };
}

async function fetchCombined(a: Record<string, unknown>, b: Record<string, unknown>) {
  getClassById.mockImplementation(async (id: string) =>
    id === 'class-a' ? makeClass('class-a', a) : makeClass('class-b', b)
  );
  const deps = createAtShowDataDependencies();
  // The adapter ignores licenseKey/role for the combined read; they are part
  // of the ringside dependency signature.
  return deps.fetchCombinedClasses!('class-a', 'class-b', 'show-1', 'judge');
}

describe('fetchCombinedClasses — completion is a property of the PAIR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEntriesByClass.mockResolvedValue([]);
    getTrialById.mockResolvedValue(null);
  });

  it('does not report the ring finalized when only section A is', async () => {
    const { classInfo } = await fetchCombined(
      { isScoringFinalized: true, resultsReleasedAt: '2026-08-30T12:00:00Z' },
      { isScoringFinalized: false, resultsReleasedAt: null }
    );

    expect(classInfo?.isScoringFinalized).toBe(false);
    expect(classInfo?.resultsReleasedAt).toBeNull();
  });

  it('does not report results released when only section B is', async () => {
    const { classInfo } = await fetchCombined(
      { isScoringFinalized: true, resultsReleasedAt: null },
      { isScoringFinalized: true, resultsReleasedAt: '2026-08-30T12:00:00Z' }
    );

    // Both finalized, but A has not been released -- the pair is not complete.
    expect(classInfo?.isScoringFinalized).toBe(true);
    expect(classInfo?.resultsReleasedAt).toBeNull();
  });

  it('reports the LATER release stamp once both sections are done', async () => {
    // The pair became complete when the SECOND section was released, not the
    // first -- a combined "finished at" that predates half its own results
    // would misdate the ring.
    const { classInfo } = await fetchCombined(
      { isScoringFinalized: true, resultsReleasedAt: '2026-08-30T12:00:00Z' },
      { isScoringFinalized: true, resultsReleasedAt: '2026-08-30T14:30:00Z' }
    );

    expect(classInfo?.isScoringFinalized).toBe(true);
    expect(classInfo?.resultsReleasedAt).toBe('2026-08-30T14:30:00Z');
  });
});
