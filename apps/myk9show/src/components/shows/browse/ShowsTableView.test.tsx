import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import { ShowsTableView } from './ShowsTableView';
import { formatShowsTableDateRange, splitShowLocation } from './ShowsTableView.helpers';

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone) {
    process.env.TZ = originalTimezone;
  } else {
    delete process.env.TZ;
  }
});

describe('formatShowsTableDateRange', () => {
  it('formats date-only ranges without UTC day drift', () => {
    process.env.TZ = 'America/Chicago';

    expect(formatShowsTableDateRange('2026-08-01', '2026-08-03')).toBe('Aug 1–3, 2026');
  });
});

describe('splitShowLocation', () => {
  it('splits venue from locality at the first comma', () => {
    expect(splitShowLocation('300 Load Fixture Way, Tulsa, OK 74101')).toEqual({
      venue: '300 Load Fixture Way',
      locality: 'Tulsa, OK 74101',
    });
  });

  it('treats a comma-less location as all venue, and blanks as empty', () => {
    expect(splitShowLocation('Camp Loughridge')).toEqual({
      venue: 'Camp Loughridge',
      locality: '',
    });
    expect(splitShowLocation('')).toEqual({ venue: '', locality: '' });
    expect(splitShowLocation(undefined)).toEqual({ venue: '', locality: '' });
  });
});

function makeEnhancedShow(overrides: Partial<EnhancedShow> = {}): EnhancedShow {
  return {
    id: 'show-1',
    name: 'Heartland Scent Work Classic',
    organization: 'AKC',
    startDate: '2099-10-20',
    endDate: '2099-10-22',
    location: '4145 E 21st St, Tulsa, OK 74114',
    status: 'published',
    events: ['Scent Work'],
    source: 'myK9Show',
    entryOpenDate: '2000-01-01',
    entryCloseDate: '2099-10-06',
    preEntryFee: '28',
    clubId: 'club-1',
    clubName: 'Heartland Scent Work Club',
    relationship: ['all'],
    userCanManage: false,
    userIsJudging: false,
    userHasEntries: false,
    ...overrides,
  } as EnhancedShow;
}

describe('ShowsTableView columns (MYK9-427)', () => {
  it('shows five columns by default — Organization and Status stay in the Columns menu', () => {
    localStorage.removeItem('datatable-cols-showsBrowse');
    render(
      <MemoryRouter>
        <ShowsTableView shows={[makeEnhancedShow()]} />
      </MemoryRouter>
    );

    const headers = screen.getAllByRole('columnheader').map(h => h.textContent?.trim());
    expect(headers).toEqual(['Show', 'Dates', 'Location', 'Entries', 'Host Club']);
    expect(headers).not.toContain('Organization');
    expect(headers).not.toContain('Status');
  });

  it('wraps the location onto a venue line and a locality line', () => {
    localStorage.removeItem('datatable-cols-showsBrowse');
    render(
      <MemoryRouter>
        <ShowsTableView shows={[makeEnhancedShow()]} />
      </MemoryRouter>
    );

    const row = screen.getByText('Heartland Scent Work Classic').closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('4145 E 21st St');
    expect(row).toHaveTextContent('Tulsa, OK 74114');
    // Organization now rides in the Show subline, not its own column.
    expect(row).toHaveTextContent('AKC · Scent Work');
    expect(row).toHaveTextContent(/accepting entries|entries open/i);
  });
});
