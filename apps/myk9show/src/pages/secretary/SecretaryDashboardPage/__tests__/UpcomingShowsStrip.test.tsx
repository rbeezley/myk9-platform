import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UpcomingShowsStrip } from '../UpcomingShowsStrip';

const makeShow = (overrides: Record<string, unknown> = {}) => ({
  id: 'show-1',
  name: 'Summer Classic',
  startDate: new Date(Date.now() + 18 * 86400000).toISOString(),
  entryCloseDate: null as string | null,
  ...overrides,
});

describe('UpcomingShowsStrip', () => {
  it('renders nothing when fewer than 2 shows', () => {
    const { container } = render(<UpcomingShowsStrip shows={[makeShow()]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a card per show', () => {
    const shows = [
      makeShow({ id: 'show-1', name: 'Summer Classic' }),
      makeShow({
        id: 'show-2',
        name: 'Fall Invitational',
        startDate: new Date(Date.now() + 45 * 86400000).toISOString(),
      }),
    ];
    render(<UpcomingShowsStrip shows={shows} />);
    expect(screen.getByText('Summer Classic')).toBeInTheDocument();
    expect(screen.getByText('Fall Invitational')).toBeInTheDocument();
  });

  it('shows deadline alert when entry closes within 7 days', () => {
    const shows = [
      makeShow({ id: 'show-1', entryCloseDate: new Date(Date.now() + 3 * 86400000).toISOString() }),
      makeShow({
        id: 'show-2',
        name: 'Show B',
        startDate: new Date(Date.now() + 40 * 86400000).toISOString(),
      }),
    ];
    render(<UpcomingShowsStrip shows={shows} />);
    expect(screen.getByText(/entry closes in \d+ days/i)).toBeInTheDocument();
  });

  it('does not show deadline alert when entry closes more than 7 days away', () => {
    const shows = [
      makeShow({
        id: 'show-1',
        entryCloseDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      }),
      makeShow({
        id: 'show-2',
        name: 'Show B',
        startDate: new Date(Date.now() + 40 * 86400000).toISOString(),
      }),
    ];
    render(<UpcomingShowsStrip shows={shows} />);
    expect(screen.queryByText(/entry closes in/i)).not.toBeInTheDocument();
  });
});
