import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { render } from '@/test/utils/testUtils';
import type { EnrichedShowEntry } from '@/hooks/useShowEntriesForUser';
import { MyEntriesTab } from '../MyEntriesTab';

vi.mock('@/hooks/useShowEntriesForUser', () => ({ useShowEntriesForUser: vi.fn() }));
vi.mock('@/store/entryStore', () => ({ useEntryStore: vi.fn() }));

import { useShowEntriesForUser } from '@/hooks/useShowEntriesForUser';
import { useEntryStore } from '@/store/entryStore';

function makeEntry(id: string, dogId: string, dogName: string): EnrichedShowEntry {
  return {
    entryId: id,
    classId: `class-${id}`,
    trialId: 'trial-1',
    dogId,
    dogName,
    armband: '',
    runOrder: 0,
    element: 'Container',
    level: 'Novice',
    section: 'A',
    classTitle: 'Container Novice A',
    trialDate: '2026-08-23',
    dayLabel: 'Sunday, August 23',
    trialName: 'Trial 1',
    startTime: '',
    judgeName: '',
    dogsAhead: 0,
    entryStatus: 'confirmed',
    paymentStatus: 'paid',
    hasResult: false,
  };
}

describe('MyEntriesTab schedule publication message', () => {
  beforeEach(() => {
    vi.mocked(useEntryStore).mockImplementation(
      fromAny((selector: (state: unknown) => unknown) => selector({ loadEntries: vi.fn() }))
    );
  });

  it('renders one page-level publication message across multiple dog sections', () => {
    const maggie = makeEntry('entry-1', 'dog-1', 'Maggie');
    const daisy = makeEntry('entry-2', 'dog-2', 'Daisy');
    vi.mocked(useShowEntriesForUser).mockReturnValue({
      dogGroups: [
        { dogId: 'dog-1', dogName: 'Maggie', entries: [maggie] },
        { dogId: 'dog-2', dogName: 'Daisy', entries: [daisy] },
      ],
      allEntries: [maggie, daisy],
      scheduleEntries: [maggie, daisy],
      totalClasses: 2,
      scheduleDogCount: 2,
      isLoading: false,
      isError: false,
    });

    render(<MyEntriesTab showId="show-1" />);

    expect(
      screen.getAllByText('Schedule details will appear here when the show publishes them.')
    ).toHaveLength(1);
  });
});
