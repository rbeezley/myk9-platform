/**
 * MYK9-724 F52: the class page showed ENTRY FEE $30.00 on a show charging the
 * day-of fee. `classes.entry_fee` is a copy of the show's pre-entry fee (live:
 * every class on every show carries the show's `pre_entry_fee`), so the header
 * must price the class the way registration does, through `getShowEntryFee`.
 *
 * The show is built from a `shows` row through `mapDatabaseToShow`, so the
 * fees arrive as the strings the app really holds ("30", "35").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassCompactHeader } from '../ClassCompactHeader';
import { mapDatabaseToShow } from '@/services/mappers/showMappers';
import { useTrialStore } from '@/store/trialStore';
import type { ClassData } from '../types/classTypes';

const SHOW_ID = 'show-1';

const show = mapDatabaseToShow({
  id: SHOW_ID,
  name: 'ZZ Walk',
  organization: 'UKC',
  pre_entry_fee: 30,
  day_of_show_fee: 35,
  start_date: '2026-09-17T00:00:00+00:00',
  end_date: '2026-09-17T00:00:00+00:00',
  entry_open_date: '2026-08-01T00:00:00+00:00',
  entry_close_date: '2026-09-10T00:00:00+00:00',
} as never);

const classData: ClassData = {
  id: 'class-1',
  trialId: 'trial-1',
  trial: 'Trial 1',
  trialDate: '2026-09-17',
  trialNumber: '1',
  classOrder: '1',
  status: 'In Progress',
  judge: 'Judge Judy',
  className: 'Interior Novice A',
  element: 'Interior',
  level: 'Novice',
  section: 'A',
  // What the classes row carries: the pre-entry fee.
  entryFee: 30,
};

function renderHeader(now: string) {
  vi.setSystemTime(new Date(now));
  render(<ClassCompactHeader classData={classData} parentShow={show} />);
}

function entryFeeText(): string | null | undefined {
  return screen.getByText('Entry Fee').nextElementSibling?.textContent;
}

describe('ClassCompactHeader entry fee', () => {
  let savedTrials: ReturnType<typeof useTrialStore.getState>['trials'];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    savedTrials = useTrialStore.getState().trials;
    // A trial for this show, so the entry-window timezone is known.
    useTrialStore.setState({
      trials: [
        {
          id: 'trial-1',
          showId: SHOW_ID,
          name: 'Trial 1',
          trialDate: '2026-09-17',
          timezone: 'America/Chicago',
        },
      ],
    } as never);
  });

  afterEach(() => {
    useTrialStore.setState({ trials: savedTrials });
    vi.useRealTimers();
  });

  it('shows the day-of fee on the day of the show', () => {
    renderHeader('2026-09-17T15:00:00Z');
    expect(entryFeeText()).toBe('$35.00');
  });

  it('shows the pre-entry fee while pre-entries are open', () => {
    renderHeader('2026-09-01T15:00:00Z');
    expect(entryFeeText()).toBe('$30.00');
  });
});
