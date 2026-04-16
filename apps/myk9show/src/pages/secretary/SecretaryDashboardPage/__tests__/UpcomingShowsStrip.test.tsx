import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UpcomingShowsStrip } from '../UpcomingShowsStrip';

const makeShow = (overrides: Record<string, unknown> = {}) => ({
  id: 'show-1',
  name: 'Summer Classic',
  startDate: new Date(Date.now() + 18 * 86400000).toISOString(),
  entryCloseDate: null as string | null,
  volunteerGapCount: 0,
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

  it('shows volunteer gap badge when gaps exist', () => {
    const shows = [
      makeShow({ id: 'show-1', volunteerGapCount: 2 }),
      makeShow({
        id: 'show-2',
        name: 'Show B',
        startDate: new Date(Date.now() + 40 * 86400000).toISOString(),
      }),
    ];
    render(<UpcomingShowsStrip shows={shows} />);
    expect(screen.getByText(/2 volunteer slots open/i)).toBeInTheDocument();
  });
});
