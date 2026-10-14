import { afterEach, describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { WhereToBe } from './WhereToBe';
import type { EnrichedShowEntry } from '@/hooks/useShowEntriesForUser';

function makeEntry(overrides: Partial<EnrichedShowEntry> = {}): EnrichedShowEntry {
  return {
    entryId: 'e1',
    classId: 'c1',
    trialId: 't1',
    dogId: 'd1',
    dogName: 'Maggie',
    armband: '101',
    queue: { kind: 'waiting-unknown' },
    element: 'Container',
    level: 'Novice',
    section: 'A',
    classTitle: 'Container Novice A',
    trialDate: '2026-05-10',
    dayLabel: 'Sunday, May 10',
    trialName: 'Trial 1',
    startTime: '9:00 AM',
    judgeName: 'Smith',
    dogsAhead: 0,
    entryStatus: 'confirmed',
    paymentStatus: 'paid',
    hasResult: false,
    ...overrides,
  };
}

const SHOW_ID = 'show-1';

// Trial timezone comes from the replicated trials read; each test sets it.
const mockTrials = vi.hoisted(() => ({ data: [] as Array<{ id: string; timezone?: string }> }));
vi.mock('@/hooks/queries/useShowTrials', () => ({
  useShowTrials: () => ({ data: mockTrials.data }),
}));

const mockPlaces = vi.hoisted(() => ({ map: new Map<string, number>() }));
vi.mock('@/hooks/queries/useMyEntryQueuePlaces', () => ({
  useMyEntryQueuePlaces: () => mockPlaces.map,
}));

describe('WhereToBe', () => {
  it('renders nothing when entries are empty', () => {
    const { container } = render(<WhereToBe entries={[]} showId={SHOW_ID} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "Where to be & when" heading', () => {
    render(<WhereToBe entries={[makeEntry()]} showId={SHOW_ID} />);
    expect(screen.getByText(/where to be/i)).toBeInTheDocument();
  });

  it('renders day label as section header', () => {
    render(<WhereToBe entries={[makeEntry()]} showId={SHOW_ID} />);
    expect(screen.getByText('Sunday, May 10')).toBeInTheDocument();
  });

  it('renders one row per entry', () => {
    const entries = [
      makeEntry({ entryId: 'e1', dogName: 'Maggie', classTitle: 'Container Novice A' }),
      makeEntry({
        entryId: 'e2',
        dogName: 'Daisy',
        classTitle: 'Interior Advanced',
        classId: 'c2',
        trialId: 't1',
      }),
    ];
    render(<WhereToBe entries={entries} showId={SHOW_ID} />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('groups entries into separate day sections', () => {
    const entries = [
      makeEntry({ entryId: 'e1', trialDate: '2026-05-10', dayLabel: 'Sunday, May 10' }),
      makeEntry({
        entryId: 'e2',
        trialDate: '2026-05-11',
        dayLabel: 'Monday, May 11',
        classId: 'c2',
      }),
    ];
    render(<WhereToBe entries={entries} showId={SHOW_ID} />);
    expect(screen.getByText('Sunday, May 10')).toBeInTheDocument();
    expect(screen.getByText('Monday, May 11')).toBeInTheDocument();
  });

  it('shows "Upcoming" chip when a future class has no result', () => {
    render(
      <WhereToBe
        entries={[
          makeEntry({
            hasResult: false,
            trialDate: '2099-05-10',
            dayLabel: 'Sunday, May 10',
          }),
        ]}
        showId={SHOW_ID}
      />
    );
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });

  it('uses the canonical pending-review label for an entry awaiting review', () => {
    render(
      <WhereToBe
        entries={[makeEntry({ entryStatus: 'submitted', trialDate: '2099-05-10' })]}
        showId={SHOW_ID}
      />
    );

    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.queryByText('Not accepted')).not.toBeInTheDocument();
  });

  it('shows a pending-results chip when a past class has no result', () => {
    render(
      <WhereToBe
        entries={[
          makeEntry({
            hasResult: false,
            checkInStatus: 'completed',
            trialDate: '2020-05-10',
            dayLabel: 'Sunday, May 10',
          }),
        ]}
        showId={SHOW_ID}
      />
    );

    expect(screen.getByText('Awaiting results')).toBeInTheDocument();
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
  });

  it('shows Q chip with time when entry is qualified', () => {
    const entry = makeEntry({
      hasResult: true,
      result: { qualified: true, time: '00:38.2' },
    });
    render(<WhereToBe entries={[entry]} showId={SHOW_ID} />);
    expect(screen.getByText(/Q · 00:38\.2/)).toBeInTheDocument();
  });

  it('shows NQ chip when entry is not qualified', () => {
    const entry = makeEntry({
      hasResult: true,
      result: { qualified: false },
    });
    render(<WhereToBe entries={[entry]} showId={SHOW_ID} />);
    expect(screen.getByText('NQ')).toBeInTheDocument();
  });

  // MYK9-263/MYK9-805: the run schedule must label an unreleased result
  // preliminary, the same as My Shows — this is the one result that can still
  // change.
  it('labels an unreleased qualifying result preliminary', () => {
    const entry = makeEntry({
      hasResult: true,
      result: { qualified: true, time: '00:52.40', isPreliminary: true },
    });
    render(<WhereToBe entries={[entry]} showId={SHOW_ID} />);
    expect(screen.getByText(/Q · 00:52\.40 · preliminary/)).toBeInTheDocument();
  });

  it('says nothing about "preliminary" once the result is released', () => {
    const entry = makeEntry({
      hasResult: true,
      result: { qualified: true, time: '00:52.40', isPreliminary: false },
    });
    render(<WhereToBe entries={[entry]} showId={SHOW_ID} />);
    expect(screen.getByText('Q · 00:52.40')).toBeInTheDocument();
    expect(screen.queryByText(/preliminary/)).not.toBeInTheDocument();
  });

  it('shows the fault count on a qualified result with faults', () => {
    const entry = makeEntry({
      hasResult: true,
      result: { qualified: true, time: '00:38.2', faults: 2 },
    });
    render(<WhereToBe entries={[entry]} showId={SHOW_ID} />);
    expect(screen.getByText(/2 faults/)).toBeInTheDocument();
  });

  it('uses the singular for one fault', () => {
    const entry = makeEntry({
      hasResult: true,
      result: { qualified: true, time: '00:38.2', faults: 1 },
    });
    render(<WhereToBe entries={[entry]} showId={SHOW_ID} />);
    expect(screen.getByText(/1 fault(?!s)/)).toBeInTheDocument();
  });

  it('hides zero or withheld faults', () => {
    render(
      <WhereToBe
        entries={[
          makeEntry({
            entryId: 'e1',
            hasResult: true,
            result: { qualified: true, time: '00:38.2', faults: 0 },
          }),
          makeEntry({
            entryId: 'e2',
            classId: 'c2',
            hasResult: true,
            result: { qualified: true, time: '00:40.0' },
          }),
        ]}
        showId={SHOW_ID}
      />
    );
    expect(screen.queryByText(/fault/)).not.toBeInTheDocument();
  });

  it('links to the correct class detail URL', () => {
    render(<WhereToBe entries={[makeEntry()]} showId={SHOW_ID} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/shows/show-1/trials/t1/classes/c1');
  });

  it('shows start time in each row', () => {
    render(<WhereToBe entries={[makeEntry({ startTime: '10:30 AM' })]} showId={SHOW_ID} />);
    expect(screen.getByText('10:30 AM')).toBeInTheDocument();
  });

  it('without a server count, shows "Waiting" and check-in state, never a stored run number', () => {
    render(
      <WhereToBe
        entries={[makeEntry({ queue: { kind: 'waiting-unknown' }, checkInStatus: 'checked-in' })]}
        showId={SHOW_ID}
      />
    );
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('Checked-in')).toBeInTheDocument();
    expect(screen.queryByText(/run position|\bup\b/i)).not.toBeInTheDocument();
  });

  it("shows each dog's state when it has no place in line", () => {
    render(
      <WhereToBe
        entries={[
          makeEntry({ entryId: 'a', queue: { kind: 'in-ring' } }),
          makeEntry({ entryId: 'b', queue: { kind: 'done' } }),
          makeEntry({ entryId: 'c', queue: { kind: 'pulled' } }),
        ]}
        showId={SHOW_ID}
      />
    );
    expect(screen.getByText('In ring')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Pulled')).toBeInTheDocument();
  });

  it('labels an unset order as not set yet without inferring it from armband', () => {
    render(
      <WhereToBe
        entries={[makeEntry({ queue: null, armband: '202', checkInStatus: 'completed' })]}
        showId={SHOW_ID}
      />
    );
    expect(screen.getByText('Order not set yet')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText(/\bup\b/)).not.toBeInTheDocument();
  });

  it('shows armband in the leading column', () => {
    render(<WhereToBe entries={[makeEntry({ armband: '104' })]} showId={SHOW_ID} />);
    expect(screen.getByLabelText('Armband 104')).toHaveTextContent('104');
  });

  it('collapses missing row details into one honest schedule message', () => {
    render(
      <WhereToBe
        entries={[
          makeEntry({ entryId: 'e1', armband: '', startTime: '', judgeName: '' }),
          makeEntry({ entryId: 'e2', classId: 'c2', armband: '', startTime: '', judgeName: '' }),
        ]}
        showId={SHOW_ID}
      />
    );
    expect(
      screen.getAllByText('Schedule details will appear here when the show publishes them.')
    ).toHaveLength(1);
    expect(screen.queryByText('Time pending')).not.toBeInTheDocument();
    expect(screen.queryByText('Armband pending')).not.toBeInTheDocument();
  });

  it('excludes withdrawn, moved source, and scratched rows from the runnable schedule', () => {
    const entries = [
      makeEntry({ entryId: 'live', dogName: 'Maggie', entryStatus: 'confirmed' }),
      makeEntry({ entryId: 'withdrawn', dogName: 'Ranger', entryStatus: 'withdrawn' }),
      makeEntry({ entryId: 'moved', dogName: 'Daisy', entryStatus: 'moved' }),
      makeEntry({ entryId: 'scratched', dogName: 'Scout', entryStatus: 'scratched' }),
    ];

    render(<WhereToBe entries={entries} showId={SHOW_ID} />);

    expect(screen.getByText('Maggie')).toBeInTheDocument();
    expect(screen.queryByText('Ranger')).not.toBeInTheDocument();
    expect(screen.queryByText('Daisy')).not.toBeInTheDocument();
    expect(screen.queryByText('Scout')).not.toBeInTheDocument();
  });

  // MYK9-1109: a day that has passed without the dog running reads "not run"
  // (the My Entries word), never a queue position or "Next up".
  describe('past trial days that never ran', () => {
    afterEach(() => {
      vi.useRealTimers();
      mockTrials.data = [];
    });

    const pin = (iso: string) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(iso));
    };

    it('reads "not run" on a past day, with no queue position and no "Not checked in"', () => {
      pin('2026-10-09T15:00:00Z');
      mockTrials.data = [{ id: 't1', timezone: 'America/Chicago' }];
      render(
        <WhereToBe
          entries={[
            makeEntry({
              queue: { kind: 'waiting-unknown' },
              checkInStatus: 'no-status',
              trialDate: '2026-10-08',
              dayLabel: 'Thursday, Oct 8',
            }),
          ]}
          showId={SHOW_ID}
        />
      );
      expect(screen.getByText('Not run')).toBeInTheDocument();
      // A dog that never ran is not waiting on a result either.
      expect(screen.queryByText('Awaiting results')).not.toBeInTheDocument();
      expect(screen.queryByText(/next up|^waiting$/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Not checked in')).not.toBeInTheDocument();
      expect(screen.getByRole('link').getAttribute('aria-label')).not.toMatch(
        /next up|not checked in/i
      );
    });

    it("keeps today's entry on its queue position and check-in state", () => {
      pin('2026-10-09T15:00:00Z');
      render(
        <WhereToBe
          entries={[
            makeEntry({
              queue: { kind: 'waiting-unknown' },
              checkInStatus: 'no-status',
              trialDate: '2026-10-09',
              dayLabel: 'Friday, Oct 9',
            }),
          ]}
          showId={SHOW_ID}
        />
      );
      expect(screen.getByText('Waiting')).toBeInTheDocument();
      expect(screen.getByText('Not checked in')).toBeInTheDocument();
      expect(screen.queryByText('Not run')).not.toBeInTheDocument();
    });

    it("makes no past claim while the trial's timezone is unresolved", () => {
      pin('2026-10-09T15:00:00Z');
      mockTrials.data = [];
      render(
        <WhereToBe
          entries={[
            makeEntry({
              queue: { kind: 'waiting-unknown' },
              checkInStatus: 'no-status',
              trialDate: '2026-10-08',
              dayLabel: 'Thursday, Oct 8',
            }),
          ]}
          showId={SHOW_ID}
        />
      );
      expect(screen.queryByText('Not run')).not.toBeInTheDocument();
    });

    it('resolves an invalid stored zone safely instead of breaking the schedule', () => {
      pin('2026-10-09T15:00:00Z');
      mockTrials.data = [{ id: 't1', timezone: 'America/Nowhere' }];
      render(
        <WhereToBe
          entries={[
            makeEntry({
              queue: { kind: 'waiting-unknown' },
              checkInStatus: 'no-status',
              trialDate: '2026-10-08',
              dayLabel: 'Thursday, Oct 8',
            }),
          ]}
          showId={SHOW_ID}
        />
      );
      expect(screen.getByText('Not run')).toBeInTheDocument();
    });

    it("reckons the day in the trial's timezone, not the device's", () => {
      // 03:00Z on Oct 9 is still the evening of Oct 8 in Los Angeles.
      pin('2026-10-09T03:00:00Z');
      mockTrials.data = [{ id: 't1', timezone: 'America/Los_Angeles' }];
      render(
        <WhereToBe
          entries={[
            makeEntry({
              queue: { kind: 'waiting-unknown' },
              checkInStatus: 'no-status',
              trialDate: '2026-10-08',
              dayLabel: 'Thursday, Oct 8',
            }),
          ]}
          showId={SHOW_ID}
        />
      );
      expect(screen.getByText('Waiting')).toBeInTheDocument();
      expect(screen.queryByText('Not run')).not.toBeInTheDocument();
    });

    it('leaves a scored past row on its result', () => {
      pin('2026-10-09T15:00:00Z');
      render(
        <WhereToBe
          entries={[
            makeEntry({
              queue: { kind: 'done' },
              checkInStatus: 'completed',
              hasResult: true,
              result: { qualified: true, time: '00:38.2' },
              trialDate: '2026-10-08',
              dayLabel: 'Thursday, Oct 8',
            }),
          ]}
          showId={SHOW_ID}
        />
      );
      expect(screen.getByText(/Q · 00:38\.2/)).toBeInTheDocument();
      expect(screen.queryByText('Not run')).not.toBeInTheDocument();
    });
  });

  // MYK9-1173: "Next up" is a claim about right now. A dog that is run 1 on
  // every day of a multi-day show is next up only on today's row.
  describe('future trial days', () => {
    afterEach(() => {
      vi.useRealTimers();
      mockTrials.data = [];
      mockPlaces.map = new Map();
    });

    const days = [
      { id: 'e-today', trialDate: '2026-10-14', dayLabel: 'Wednesday, Oct 14' },
      { id: 'e-thu', trialDate: '2026-10-15', dayLabel: 'Thursday, Oct 15' },
      { id: 'e-fri', trialDate: '2026-10-16', dayLabel: 'Friday, Oct 16' },
    ];

    it('says "Next up" only on today and makes no claim on future days', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
      mockTrials.data = [{ id: 't1', timezone: 'America/Chicago' }];
      mockPlaces.map = new Map(days.map(d => [d.id, 1]));
      render(
        <WhereToBe
          entries={days.map(d =>
            makeEntry({
              entryId: d.id,
              classId: `c-${d.id}`,
              queue: { kind: 'waiting-unknown' },
              checkInStatus: 'no-status',
              trialDate: d.trialDate,
              dayLabel: d.dayLabel,
            })
          )}
          showId={SHOW_ID}
        />
      );
      expect(screen.getAllByText(/next up/i)).toHaveLength(1);
      expect(screen.queryByText('Check in on the day')).not.toBeInTheDocument();
      // Today keeps its check-in state; future rows make no check-in claim.
      expect(screen.getAllByText('Not checked in')).toHaveLength(1);
      const links = screen.getAllByRole('link');
      expect(links[0].getAttribute('aria-label')).toMatch(/next up/i);
      expect(links[1].getAttribute('aria-label')).not.toMatch(/next up|not checked in/i);
    });

    it('keeps a future row that already has a real check-in state', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
      mockTrials.data = [{ id: 't1', timezone: 'America/Chicago' }];
      render(
        <WhereToBe
          entries={[
            makeEntry({
              queue: { kind: 'waiting-unknown' },
              checkInStatus: 'checked-in',
              trialDate: '2026-10-15',
              dayLabel: 'Thursday, Oct 15',
            }),
          ]}
          showId={SHOW_ID}
        />
      );
      expect(screen.queryByText('Check in on the day')).not.toBeInTheDocument();
    });

    it('reckons "future" in the trial timezone, not the device UTC day', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      // 02:00 UTC Oct 15 is still Oct 14 in Chicago: Oct 15 is a future day.
      vi.setSystemTime(new Date('2026-10-15T02:00:00Z'));
      mockTrials.data = [{ id: 't1', timezone: 'America/Chicago' }];
      render(
        <WhereToBe
          entries={[
            makeEntry({
              queue: { kind: 'waiting-unknown' },
              checkInStatus: 'no-status',
              trialDate: '2026-10-15',
              dayLabel: 'Thursday, Oct 15',
            }),
          ]}
          showId={SHOW_ID}
        />
      );
      expect(screen.queryByText(/next up/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Not checked in')).not.toBeInTheDocument();
    });
  });
});
