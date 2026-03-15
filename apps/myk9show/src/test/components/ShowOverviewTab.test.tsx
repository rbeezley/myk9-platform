import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShowOverviewTab } from '@/components/shows/tabs/ShowOverviewTab';
import type { Show } from '@/types/show-types';

// Mock child components to verify they're rendered with correct props
vi.mock('@/components/shows/overview/QuickInfoCards', () => ({
  QuickInfoCards: ({ show }: { show: Show }) => (
    <div data-testid="quick-info-cards">{show.name}</div>
  ),
}));
vi.mock('@/components/shows/overview/EntryCTA', () => ({
  EntryCTA: () => <div data-testid="entry-cta" />,
}));
vi.mock('@/components/shows/overview/ScheduleSummary', () => ({
  ScheduleSummary: () => <div data-testid="schedule-summary" />,
}));
vi.mock('@/components/shows/overview/ShowOfficials', () => ({
  ShowOfficials: ({ chairmanId }: { chairmanId?: string }) =>
    chairmanId ? <div data-testid="show-officials" /> : null,
}));
vi.mock('@/components/shows/overview/JudgesList', () => ({
  JudgesList: ({ judges }: { judges?: unknown[] }) => (
    <div data-testid="judges-list">{judges?.length ?? 0} judges</div>
  ),
}));
vi.mock('@/components/shows/overview/VenueMap', () => ({
  VenueMap: ({ location }: { location?: string }) =>
    location ? <div data-testid="venue-map" /> : null,
}));
vi.mock('@/components/shows/overview/AdditionalDetails', () => ({
  AdditionalDetails: () => <div data-testid="additional-details" />,
}));
vi.mock('@/components/shows/overview/ShareEvent', () => ({
  ShareEvent: () => <div data-testid="share-event" />,
}));
vi.mock('@/components/shows/overview/MoreFromClub', () => ({
  MoreFromClub: ({ clubId }: { clubId: string }) =>
    clubId ? <div data-testid="more-from-club" /> : null,
}));

const fullShow: Show = {
  id: 'show-1',
  name: 'Spring Agility Trial',
  organization: 'AKC',
  startDate: '2026-03-21',
  endDate: '2026-03-22',
  location: 'Olathe, KS',
  status: 'accepting_entries',
  events: [],
  source: 'myK9Show',
  entryOpenDate: '2026-01-01',
  entryCloseDate: '2026-12-31',
  preEntryFee: '$30',
  clubId: 'club-1',
  clubName: 'Jayhawk Agility Club',
  clubAddress: '',
  clubEmail: '',
  logoUrl: '',
  coverImageUrl: '',
  accentColor: '',
  chairman: 'person-1',
  secretary: 'person-2',
  chiefSteward: '',
  assignedJudges: [{ judgeId: 'j1', judgeName: 'Judge One', assignedDate: '2026-03-21' }],
  stats: [],
  trials: [],
};

describe('ShowOverviewTab', () => {
  it('renders QuickInfoCards', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('quick-info-cards')).toBeInTheDocument();
  });

  it('renders EntryCTA', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('entry-cta')).toBeInTheDocument();
  });

  it('renders ShowOfficials when chairman exists', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('show-officials')).toBeInTheDocument();
  });

  it('renders JudgesList', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('judges-list')).toBeInTheDocument();
  });

  it('renders VenueMap when location exists', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('venue-map')).toBeInTheDocument();
  });

  it('omits VenueMap when no location', () => {
    const noLocation = { ...fullShow, location: '' };
    render(<ShowOverviewTab show={noLocation} onRegister={() => {}} />);
    expect(screen.queryByTestId('venue-map')).not.toBeInTheDocument();
  });

  it('renders MoreFromClub', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('more-from-club')).toBeInTheDocument();
  });

  it('renders ShareEvent', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('share-event')).toBeInTheDocument();
  });

  it('has two-column layout on desktop', () => {
    const { container } = render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    const grid = container.querySelector(
      '.md\\:grid-cols-\\[1fr_340px\\],.md\\:grid-cols-\\[1fr\\,340px\\]'
    );
    expect(grid).toBeInTheDocument();
  });
});
