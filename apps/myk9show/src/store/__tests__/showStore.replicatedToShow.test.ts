import { describe, it, expect } from 'vitest';
import { areAssignedJudgesEqual, replicatedToShow } from '../showStore';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';

// Regression guard: replicatedToShow is the mapper both loadShows() and the
// realtime subscription run replicated rows through (via mergeShowData). If it
// drops shows.is_nationals, a Nationals show reads back as undefined after
// sync/reload, showToFormData() defaults it to false, and saving any unrelated
// edit silently overwrites the DB back to Regular placement.
const baseRow: ReplicatedShow = {
  id: 'show-1',
  name: 'Test Show',
  organization: 'AKC',
  startDate: '2026-09-01',
  endDate: '2026-09-02',
};

describe('replicatedToShow — isNationals', () => {
  it('preserves isNationals = true across the replicated→Show mapping', () => {
    expect(replicatedToShow({ ...baseRow, isNationals: true }).isNationals).toBe(true);
  });

  it('preserves isNationals = false', () => {
    expect(replicatedToShow({ ...baseRow, isNationals: false }).isNationals).toBe(false);
  });

  it('defaults a missing isNationals to false (Regular)', () => {
    expect(replicatedToShow(baseRow).isNationals).toBe(false);
  });
});

describe('areAssignedJudgesEqual', () => {
  it('detects assigned class membership changes for the same judge', () => {
    expect(
      areAssignedJudgesEqual(
        [
          {
            judgeId: 'judge-1',
            judgeName: 'Pat Judge',
            assignedDate: '2026-07-03',
            assignedClasses: ['class-1'],
          },
        ],
        [
          {
            judgeId: 'judge-1',
            judgeName: 'Pat Judge',
            assignedDate: '2026-07-03',
            assignedClasses: ['class-2'],
          },
        ]
      )
    ).toBe(false);
  });

  it('treats assigned class membership as a set', () => {
    expect(
      areAssignedJudgesEqual(
        [
          {
            judgeId: 'judge-1',
            judgeName: 'Pat Judge',
            assignedDate: '2026-07-03',
            assignedClasses: ['class-1', 'class-2'],
          },
        ],
        [
          {
            judgeId: 'judge-1',
            judgeName: 'Pat Judge',
            assignedDate: '2026-07-03',
            assignedClasses: ['class-2', 'class-1'],
          },
        ]
      )
    ).toBe(true);
  });

  it('detects duplicated class ids as a membership mismatch', () => {
    expect(
      areAssignedJudgesEqual(
        [
          {
            judgeId: 'judge-1',
            judgeName: 'Pat Judge',
            assignedDate: '2026-07-03',
            assignedClasses: ['class-1', 'class-1'],
          },
        ],
        [
          {
            judgeId: 'judge-1',
            judgeName: 'Pat Judge',
            assignedDate: '2026-07-03',
            assignedClasses: ['class-1', 'class-2'],
          },
        ]
      )
    ).toBe(false);
  });
});
