import { describe, it, expect } from 'vitest';
import { areAssignedJudgesEqual, replicatedToShow } from '../showStore';
import { composePremiumVenue } from '@/features/premium/premiumVenue';
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

describe('replicatedToShow — confirmationMessage (MYK9-2114)', () => {
  it('carries the note to exhibitors onto the Show', () => {
    expect(
      replicatedToShow({ ...baseRow, confirmationMessage: 'Park in the north lot.' })
        .confirmationMessage
    ).toBe('Park in the north lot.');
  });

  it('leaves it unset when the show has none', () => {
    expect(replicatedToShow({ ...baseRow, confirmationMessage: null }).confirmationMessage).toBe(
      undefined
    );
  });
});

describe('replicatedToShow: venue columns (MYK9-2245)', () => {
  it('carries the street address so the premium checklist sees the composed venue', () => {
    const show = replicatedToShow({
      ...baseRow,
      location: '',
      venueName: 'Elks Lodge',
      address: '12 Main St',
      city: 'Denver',
      state: 'CO',
      zipCode: '80202',
    });
    expect(show).toMatchObject({
      venueName: 'Elks Lodge',
      address: '12 Main St',
      city: 'Denver',
      state: 'CO',
      zipCode: '80202',
    });
    expect(composePremiumVenue({ venue: show.location, ...show })).toBe(
      'Elks Lodge, 12 Main St, Denver, CO 80202'
    );
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

describe('replicatedToShow — juniorHandlerFee', () => {
  it('carries the fee as a string and reads an unset fee as undefined', () => {
    expect(replicatedToShow({ ...baseRow, juniorHandlerFee: 15 }).juniorHandlerFee).toBe('15');
    expect(replicatedToShow({ ...baseRow, juniorHandlerFee: null }).juniorHandlerFee).toBe(
      undefined
    );
    expect(replicatedToShow(baseRow).juniorHandlerFee).toBe(undefined);
  });
});
