import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MoreFromClub,
  MORE_FROM_CLUB_RESERVED_MIN_HEIGHT_PX,
  MORE_FROM_CLUB_RESERVED_MIN_HEIGHT_MOBILE_PX,
} from '@/components/shows/overview/MoreFromClub';

// Mock React Router
vi.mock('react-router-dom', () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement('a', { href: to, ...props }, children),
}));

let mockIsLoading = false;

// Mock useShowsByClubQuery — returns shows for the requested club
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowsByClubQuery: (clubId: string) => {
    if (mockIsLoading) {
      return { data: undefined, isLoading: true };
    }
    const allShows = [
      {
        id: 'show-1',
        name: 'Spring Trial',
        clubId: 'club-1',
        startDate: '2026-04-01',
        location: 'Olathe, KS',
      },
      {
        id: 'show-2',
        name: 'Summer Trial',
        clubId: 'club-1',
        startDate: '2026-06-15',
        location: 'Olathe, KS',
      },
      {
        id: 'show-3',
        name: 'Fall Trial',
        clubId: 'club-1',
        startDate: '2026-09-20',
        location: 'Olathe, KS',
      },
      {
        id: 'show-4',
        name: 'Winter Trial',
        clubId: 'club-1',
        startDate: '2026-12-10',
        location: 'Olathe, KS',
      },
      {
        id: 'other-show',
        name: 'Other Club Show',
        clubId: 'club-2',
        startDate: '2026-05-01',
        location: 'KC, MO',
      },
    ];
    return { data: allShows.filter(s => s.clubId === clubId), isLoading: false };
  },
}));

describe('MoreFromClub', () => {
  beforeEach(() => {
    mockIsLoading = false;
  });

  it('reserves min-height while loading to prevent CLS (mobile + desktop)', () => {
    mockIsLoading = true;
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    const skeleton = screen.getByTestId('more-from-club-skeleton');
    expect(skeleton).toBeInTheDocument();
    // Responsive: mobile (default) reserves the taller stacked height, sm+
    // collapses to the single-row height. We assert both Tailwind classes
    // are present (verifying the constants haven't drifted from the class
    // names).
    expect(skeleton.className).toContain(
      `min-h-[${MORE_FROM_CLUB_RESERVED_MIN_HEIGHT_MOBILE_PX}px]`
    );
    expect(skeleton.className).toContain(
      `sm:min-h-[${MORE_FROM_CLUB_RESERVED_MIN_HEIGHT_PX}px]`
    );
  });

  it('does not render skeleton when data is loaded', () => {
    mockIsLoading = false;
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    expect(screen.queryByTestId('more-from-club-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText(/more from jayhawk ac/i)).toBeInTheDocument();
  });

  it('renders up to 3 shows from the same club', () => {
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    expect(screen.getByText('Summer Trial')).toBeInTheDocument();
    expect(screen.getByText('Fall Trial')).toBeInTheDocument();
    expect(screen.getByText('Winter Trial')).toBeInTheDocument();
  });

  it('excludes the current show', () => {
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    expect(screen.queryByText('Spring Trial')).not.toBeInTheDocument();
  });

  it('does not show shows from other clubs', () => {
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    expect(screen.queryByText('Other Club Show')).not.toBeInTheDocument();
  });

  it('returns null when no other shows from club', () => {
    const { container } = render(
      <MoreFromClub clubId="club-2" clubName="Other Club" currentShowId="other-show" />
    );
    expect(container.firstElementChild).toBeNull();
  });

  it('renders section heading with club name', () => {
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    expect(screen.getByText(/more from jayhawk ac/i)).toBeInTheDocument();
  });

  it('renders show cards as links', () => {
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('/shows/'));
  });
});
