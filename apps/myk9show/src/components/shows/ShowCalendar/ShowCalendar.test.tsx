import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowCalendar } from './ShowCalendar';
import type { Show } from '@/types/show-types';

// The details dialog navigates programmatically (`navigate(entryDogLink(...))`),
// so a link-parity check needs what useNavigate was called with rather than an
// <a href>. Keep the rest of react-router-dom real for MemoryRouter and the
// useSearchParams useEntryDogLink reads.
const navigateMock = vi.fn();
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

// The store isn't exercised here — a `shows` prop is passed directly — but
// importing the real module pulls in Supabase/replication wiring this test
// has no business booting.
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({ shows: [] }),
}));

// jsdom can't lay out react-big-calendar's real grid; render a structural
// stand-in so the view's own logic (event selection, the details dialog, the
// entry-dog link) is what's under test, matching the ShowsMapView pattern.
vi.mock('react-big-calendar', () => ({
  Calendar: ({
    events,
    onSelectEvent,
  }: {
    events: { id: string; title: string }[];
    onSelectEvent: (event: { id: string; title: string }) => void;
  }) => (
    <div data-testid="calendar-stub">
      {events.map(event => (
        <button key={event.id} type="button" onClick={() => onSelectEvent(event)}>
          {event.title}
        </button>
      ))}
    </div>
  ),
  dateFnsLocalizer: () => ({}),
}));

function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Spring Agility Trial',
    organization: 'Agility',
    startDate: '2026-04-15',
    endDate: '2026-04-17',
    location: 'Denver, CO',
    status: 'upcoming',
    events: ['Agility', 'Rally'],
    source: 'myK9Show',
    entryOpenDate: '2026-03-01',
    entryCloseDate: '2026-04-10',
    preEntryFee: '30',
    clubId: 'club-1',
    clubName: 'Rocky Mountain Agility Club',
    clubAddress: '123 Main St',
    clubEmail: 'info@rmac.org',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: [],
    stats: [],
    trials: [],
    ...overrides,
  } as Show;
}

/** Selects the calendar event, opening the details dialog. */
function openDetailsDialog(showName: string) {
  fireEvent.click(screen.getByRole('button', { name: showName }));
}

describe('ShowCalendar', () => {
  afterEach(() => {
    navigateMock.mockClear();
  });

  // MYK9-519: Find Shows' calendar view is one of three browse surfaces that
  // thread the carried dog id onward into the show link.
  it('carries an entry dog context from the browse URL into View Details', () => {
    render(<ShowCalendar shows={[makeShow({ id: 'show-1' })]} />, {
      initialRoute: '/shows?dogId=dog-1',
    });

    openDetailsDialog('Spring Agility Trial');
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));

    expect(navigateMock).toHaveBeenCalledWith('/shows/show-1?dogId=dog-1');
  });

  it('leaves View Details alone with no dog context', () => {
    render(<ShowCalendar shows={[makeShow({ id: 'show-1' })]} />);

    openDetailsDialog('Spring Agility Trial');
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));

    expect(navigateMock).toHaveBeenCalledWith('/shows/show-1');
  });
});
