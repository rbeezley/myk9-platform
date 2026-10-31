import { act, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { withFixtureKind } from '@/test/fixtures/entryClassKind';
import { groupEntriesByOrder } from '@/pages/MyEntriesPage/modules/groupEntriesByOrder';
import { groupEntriesByShow } from '@/pages/MyEntriesPage/modules/groupEntriesByShow';
import { buildDayCheckInContext } from '@/pages/MyEntriesPage/modules/dayCheckIn';
import { MyShowClassRow } from '@/pages/MyEntriesPage/modules/MyShowClassRow';
import type { EntryClass, MyEntry } from '@/pages/MyEntriesPage/modules/my-entries-types';
import { YourEntriesTodayCard } from '../YourEntriesTodayCard';

const mocks = vi.hoisted(() => ({
  entries: [] as MyEntry[],
  refreshEntries: vi.fn(async () => {}),
  readState: 'confirmed' as string,
  identityState: 'resolved' as string,
  isError: false,
  isLoading: false,
  selfCheckin: {} as Record<string, boolean>,
  settingState: {} as Record<string, string>,
  settingIds: [] as string[][],
}));

// Only the data SOURCES are doubled; the presentation decision, the row
// display function and the day gate are the real ones.
vi.mock('@/pages/MyEntriesPage/modules/useMyEntriesData', () => ({
  useMyEntriesData: () => ({
    entries: mocks.entries,
    readState: mocks.readState,
    identityState: mocks.identityState,
    isLoading: mocks.isLoading,
    isError: mocks.isError,
    refreshEntries: mocks.refreshEntries,
  }),
}));
vi.mock('@/hooks/queries/useSelfCheckinEnabled', () => ({
  useSelfCheckinMap: (ids: string[]) => {
    mocks.settingIds.push(ids);
    return mocks.selfCheckin;
  },
  useSelfCheckinStateMap: () => mocks.settingState,
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

const TODAY = new Date(2026, 9, 24);

function entryWith(overrides: Partial<EntryClass> = {}, entry: Partial<MyEntry> = {}): MyEntry {
  const base = entryToday(TODAY);
  return {
    ...base,
    ...entry,
    classes: [{ ...base.classes[0]!, ...overrides }],
  };
}

function setEntries(entry: MyEntry) {
  mocks.entries = groupEntriesByOrder([entry]);
}

/** The status text My Shows' own row renders for the first class of the entries. */
function myShowsRowState(): string {
  const group = groupEntriesByShow(mocks.entries)[0]!;
  const cls = group.dogs[0]!.classes[0]!;
  const ctx = buildDayCheckInContext(group, new Date(), mocks.selfCheckin);
  const { container } = render(
    <MyShowClassRow
      cls={cls}
      dogName="Rex"
      order={ctx.ordersById[cls.orderId]}
      checkInContext={ctx}
      showTrialNumber={false}
      showId="s1"
      seenResultReleaseKeys={new Set()}
      onCheckInClass={() => {}}
      onOpenCheckIn={() => {}}
      onLeaveClass={() => {}}
    />
  );
  return container.querySelector('.myk9-entries-class-state')!.textContent ?? '';
}

describe('YourEntriesTodayCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-24T16:00:00Z'));
    mocks.entries = [];
    mocks.readState = 'confirmed';
    mocks.identityState = 'resolved';
    mocks.isError = false;
    mocks.isLoading = false;
    mocks.selfCheckin = {};
    mocks.settingState = {};
    mocks.settingIds = [];
  });

  it('known-rows with nothing today renders nothing', () => {
    mocks.entries = groupEntriesByOrder([entryToday(new Date(2026, 9, 25))]);
    const { container } = render(<YourEntriesTodayCard />);
    expect(container.querySelector('section')).toBeNull();
  });

  it('links to My Shows with a status and no check-in control', () => {
    setEntries(entryWith());
    render(<YourEntriesTodayCard />);
    expect(screen.getByText('Your entries today')).toBeTruthy();
    expect(screen.getByText('Rex')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/exhibitor/entries');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('confirmed-empty and identity-missing render nothing', () => {
    const { container, rerender } = render(<YourEntriesTodayCard />);
    expect(container.querySelector('section')).toBeNull();
    mocks.identityState = 'missing';
    rerender(<YourEntriesTodayCard />);
    expect(container.querySelector('section')).toBeNull();
  });

  it('identity-pending renders the link with a 44px target', () => {
    mocks.identityState = 'unresolved';
    render(<YourEntriesTodayCard />);
    const link = screen.getByRole('link', { name: /couldn't check today's entries/i });
    expect(link.getAttribute('href')).toBe('/exhibitor/entries');
    expect(link.className).toContain('min-h-11');
  });

  it.each([
    ['loading', { isLoading: true, identityState: 'unresolved', readState: 'identity-unresolved' }],
    [
      'auth pending',
      { isLoading: false, identityState: 'pending-auth', readState: 'read-pending' },
    ],
    ['read pending', { isLoading: false, identityState: 'resolved', readState: 'read-pending' }],
  ])('says nothing while the read is still in progress (%s)', (_name, st) => {
    mocks.isLoading = st.isLoading;
    mocks.identityState = st.identityState;
    mocks.readState = st.readState;
    const { container } = render(<YourEntriesTodayCard />);
    expect(container.querySelector('section')).toBeNull();
  });

  // Finding 3: a failed or unconfirmed read must not hide the card.
  it.each(['unconfirmed', 'error'])('links to My Shows on an empty %s read', state => {
    mocks.readState = state;
    render(<YourEntriesTodayCard />);
    expect(screen.getByRole('link', { name: /couldn't check today's entries/i })).toBeTruthy();
  });

  // Finding 6: identity-unresolved is not a confirmed empty list.
  it('treats readState identity-unresolved as unknown, not as nothing today', () => {
    mocks.readState = 'identity-unresolved';
    render(<YourEntriesTodayCard />);
    expect(screen.getByRole('link', { name: /couldn't check today's entries/i })).toBeTruthy();
  });

  it.each(['unconfirmed', 'error'])(
    'links to My Shows when saved entries are all for other days and the read is %s',
    state => {
      mocks.readState = state;
      mocks.entries = groupEntriesByOrder([entryToday(new Date(2026, 9, 25))]);
      render(<YourEntriesTodayCard />);
      expect(screen.getByRole('link', { name: /couldn't check today's entries/i })).toBeTruthy();
    }
  );

  it('links to My Shows when a class has no trial date yet and nothing else is today', () => {
    setEntries(entryWith({ trialDate: undefined }));
    render(<YourEntriesTodayCard />);
    expect(screen.getByRole('link', { name: /couldn't check today's entries/i })).toBeTruthy();
  });

  it('warns that the list may be incomplete when an undated class sits beside known rows', () => {
    const today = entryWith();
    const undated = entryWith(
      { id: 'c9', classId: 'class-9', trialDate: undefined },
      { id: 'e9', registrationId: 'r9', dogName: 'Pip' }
    );
    mocks.entries = groupEntriesByOrder([today, undated]);
    render(<YourEntriesTodayCard />);
    expect(screen.getByText('Rex')).toBeTruthy();
    expect(screen.getByText(/Some entries may be missing/)).toBeTruthy();
  });

  it('keeps the saved-entries note when rows exist but the read is unconfirmed', () => {
    mocks.readState = 'unconfirmed';
    setEntries(entryWith());
    render(<YourEntriesTodayCard />);
    expect(screen.getByText('Rex')).toBeTruthy();
    expect(screen.getByText(/couldn't confirm them/)).toBeTruthy();
  });

  // Finding 4: the day must not freeze across midnight.
  it('moves to the next day while left open', () => {
    setEntries(entryWith());
    render(<YourEntriesTodayCard />);
    expect(screen.getByText('Rex')).toBeTruthy();
    act(() => {
      vi.setSystemTime(new Date('2026-10-25T16:00:00Z'));
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.queryByText('Rex')).toBeNull();
  });

  it('keeps the settings class-id list referentially stable across the tick', () => {
    setEntries(entryWith());
    render(<YourEntriesTodayCard />);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    const distinct = new Set(mocks.settingIds);
    expect(distinct.size).toBe(1);
    expect([...distinct][0]).toEqual(['class-1']);
  });

  // Finding 1: the past-show gate is My Shows' context builder, not the device day.
  it('uses My Shows context: a past show offers no "Check in"', () => {
    // The show's last trial day was yesterday in the trial's zone.
    setEntries(
      entryWith(
        { trialDate: new Date(2026, 9, 23) },
        { showDate: new Date(2026, 9, 22), showEndDate: new Date(2026, 9, 23) }
      )
    );
    render(<YourEntriesTodayCard />);
    expect(screen.queryByText('Check in')).toBeNull();
  });

  // Findings 2 and 5: the card renders My Shows' own word, never its own.
  describe.each([
    ['excused', { resultStatus: 'excused' }, {}],
    ['withdrawn', { resultStatus: 'withdrawn' }, {}],
    ['absent', { resultStatus: 'absent' }, {}],
    ['checked in', { checkInStatus: 'checked-in' }, {}],
    ['an open check-in', {}, {}],
    [
      'a pending entry',
      {},
      { entryStatus: EntryStatus.PENDING, paymentStatus: PaymentStatus.PENDING },
    ],
  ] as const)('parity with My Shows: %s', (_name, classOverrides, entryOverrides) => {
    it('says what the My Shows row says', () => {
      setEntries(entryWith({ ...classOverrides }, { ...entryOverrides }));
      const card = render(<YourEntriesTodayCard />);
      const cardLine = card.container.querySelector('li')!;
      const status = cardLine.lastElementChild!.textContent!;
      card.unmount();
      expect(status).not.toBe('');
      const rowState = myShowsRowState();
      // A word on the card is either My Shows' word, or its neutral fallback.
      if (status !== 'See My Shows') expect(rowState).toContain(status);
      if (status === 'See My Shows') expect(rowState).not.toMatch(/Check in\b/);
    });
  });

  it('parity: self check-in disabled reads the same as My Shows, never "Check in"', () => {
    setEntries(entryWith());
    mocks.selfCheckin = { 'class-1': false };
    mocks.settingState = { 'class-1': 'not-allowed' };
    const card = render(<YourEntriesTodayCard />);
    const status = card.container.querySelector('li')!.lastElementChild!.textContent!;
    card.unmount();
    expect(status).not.toBe('Check in');
    expect(myShowsRowState()).toContain(status);
  });

  it('does not spoil an unopened result: a scored class reads neutral, not Q', () => {
    setEntries(entryWith({ isScored: true, resultStatus: 'qualified' }));
    render(<YourEntriesTodayCard />);
    expect(screen.getByText('Result in')).toBeTruthy();
    expect(screen.queryByText('Q')).toBeNull();
  });

  it('tells same-named classes in different shows apart', () => {
    const a = entryWith({}, { id: 'e1', showName: 'Heartland Classic' });
    const b = entryWith(
      { id: 'c2', classId: 'class-2' },
      { id: 'e2', showId: 's2', showName: 'Prairie Open', registrationId: 'r2' }
    );
    mocks.entries = groupEntriesByOrder([a, b]);
    render(<YourEntriesTodayCard />);
    expect(screen.getByText('Heartland Classic')).toBeTruthy();
    expect(screen.getByText('Prairie Open')).toBeTruthy();
  });

  // Finding 7: never "Check in" while the class's setting is still loading.
  it('says "See My Shows" while the self-check-in setting is unknown', () => {
    setEntries(entryWith());
    mocks.settingState = { 'class-1': 'unknown' };
    render(<YourEntriesTodayCard />);
    const line = screen.getByRole('listitem');
    expect(within(line).getByText('See My Shows')).toBeTruthy();
    expect(screen.queryByText('Check in')).toBeNull();
  });
});
