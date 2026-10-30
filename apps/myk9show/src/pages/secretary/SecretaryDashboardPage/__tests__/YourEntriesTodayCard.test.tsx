import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { withFixtureKind } from '@/test/fixtures/entryClassKind';
import { groupEntriesByOrder } from '@/pages/MyEntriesPage/modules/groupEntriesByOrder';
import type { MyEntry } from '@/pages/MyEntriesPage/modules/my-entries-types';
import { YourEntriesTodayCard } from '../YourEntriesTodayCard';

const mocks = vi.hoisted(() => ({
  entries: [] as MyEntry[],
  refreshEntries: vi.fn(async () => {}),
}));

vi.mock('@/pages/MyEntriesPage/modules/useMyEntriesData', () => ({
  useMyEntriesData: () => ({ entries: mocks.entries, refreshEntries: mocks.refreshEntries }),
}));
vi.mock('@/hooks/queries/useSelfCheckinEnabled', () => ({
  useSelfCheckinMap: () => ({}),
}));

function entryToday(trialDate: Date): MyEntry {
  return {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Heartland Classic',
    showDate: trialDate,
    showEndDate: trialDate,
    location: { venue: 'Expo Hall', city: 'Denver', state: 'CO' },
    dogName: 'Rex',
    dogId: 'd1',
    classes: [
      withFixtureKind({
        id: 'c1',
        classId: 'class-1',
        name: 'Container Search',
        number: '101',
        fee: 25,
        status: 'entered',
        paymentStatus: PaymentStatus.PAID_ONLINE,
        paymentMethod: 'online',
        trialDate,
        trialTimezone: 'America/New_York',
      }),
    ],
    dogs: [],
    totalFee: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-09-01'),
    lastUpdated: new Date('2026-09-02'),
  };
}

describe('YourEntriesTodayCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T16:00:00Z'));
    mocks.entries = [];
  });

  it('renders nothing with no entry today', () => {
    mocks.entries = groupEntriesByOrder([entryToday(new Date(2026, 9, 25))]);
    render(<YourEntriesTodayCard />);
    expect(screen.queryByText('Your entries today')).toBeNull();
  });

  it('links to My Shows with My Shows status text and no check-in control', () => {
    mocks.entries = groupEntriesByOrder([entryToday(new Date(2026, 9, 24))]);
    render(<YourEntriesTodayCard />);
    expect(screen.getByText('Your entries today')).toBeTruthy();
    expect(screen.getByText('Rex')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/exhibitor/entries');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
