import { describe, it, expect } from 'vitest';
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
    runOrder: 1,
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
    hasResult: false,
    ...overrides,
  };
}

const SHOW_ID = 'show-1';

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
      makeEntry({ entryId: 'e2', dogName: 'Daisy', classTitle: 'Interior Advanced', classId: 'c2', trialId: 't1' }),
    ];
    render(<WhereToBe entries={entries} showId={SHOW_ID} />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('groups entries into separate day sections', () => {
    const entries = [
      makeEntry({ entryId: 'e1', trialDate: '2026-05-10', dayLabel: 'Sunday, May 10' }),
      makeEntry({ entryId: 'e2', trialDate: '2026-05-11', dayLabel: 'Monday, May 11', classId: 'c2' }),
    ];
    render(<WhereToBe entries={entries} showId={SHOW_ID} />);
    expect(screen.getByText('Sunday, May 10')).toBeInTheDocument();
    expect(screen.getByText('Monday, May 11')).toBeInTheDocument();
  });

  it('shows "Upcoming" chip when no result', () => {
    render(<WhereToBe entries={[makeEntry({ hasResult: false })]} showId={SHOW_ID} />);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
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

  it('links to the correct class detail URL', () => {
    render(<WhereToBe entries={[makeEntry()]} showId={SHOW_ID} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/shows/show-1/trials/t1/classes/c1');
  });

  it('shows start time in each row', () => {
    render(<WhereToBe entries={[makeEntry({ startTime: '10:30 AM' })]} showId={SHOW_ID} />);
    expect(screen.getByText('10:30 AM')).toBeInTheDocument();
  });

  it('shows dash when startTime is empty', () => {
    render(<WhereToBe entries={[makeEntry({ startTime: '' })]} showId={SHOW_ID} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
