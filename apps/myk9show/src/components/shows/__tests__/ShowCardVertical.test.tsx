import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ShowCardVertical, ShowCardVerticalSkeleton } from '../ShowCardVertical';
import type { Show } from '@/types/show-types';

// Helper to create a minimal Show for testing
function createMockShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Spring Agility Trial',
    organization: 'AKC',
    startDate: '2026-05-09',
    endDate: '2026-05-10',
    location: 'Denver, CO',
    status: 'upcoming',
    events: ['AKC', 'Conformation', 'Obedience'],
    source: 'myK9Show',
    entryOpenDate: '2026-03-01',
    entryCloseDate: '2027-12-31',
    preEntryFee: '30',
    clubId: 'club-1',
    clubName: 'Rocky Mountain Dog Club',
    clubAddress: '123 Main St',
    clubEmail: 'info@rmdc.org',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    chairman: 'Jane Doe',
    secretary: 'John Smith',
    chiefSteward: 'Bob Wilson',
    assignedJudges: [],
    stats: [],
    trials: [
      {
        id: 't1',
        name: 'Saturday Trial',
        date: '2026-05-09',
        trialNumber: '1',
        status: 'upcoming',
      },
      { id: 't2', name: 'Sunday Trial', date: '2026-05-10', trialNumber: '2', status: 'completed' },
    ],
    ...overrides,
  };
}

describe('ShowCardVertical', () => {
  it('renders show name', () => {
    render(<ShowCardVertical show={createMockShow()} />);
    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
  });

  it('renders club name', () => {
    render(<ShowCardVertical show={createMockShow()} />);
    expect(screen.getByText('Rocky Mountain Dog Club')).toBeInTheDocument();
  });

  it('renders DateCircle with startDate month and day', () => {
    render(<ShowCardVertical show={createMockShow()} />);
    expect(screen.getByText('MAY')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('renders DateCircle multi-day badge when startDate and endDate differ', () => {
    render(<ShowCardVertical show={createMockShow()} />);
    expect(screen.getByText('2 days')).toBeInTheDocument();
  });

  it('renders location with MapPin icon area', () => {
    render(<ShowCardVertical show={createMockShow()} />);
    expect(screen.getByText('Denver, CO')).toBeInTheDocument();
    // MapPin is rendered as an SVG inside the location row
    const locationText = screen.getByText('Denver, CO');
    expect(locationText.closest('[data-testid="location-row"]')).toBeInTheDocument();
  });

  it('renders organization badge via getTypeBadge', () => {
    render(<ShowCardVertical show={createMockShow({ organization: 'AKC' })} />);
    // getTypeBadge renders org in uppercase
    expect(screen.getByText('AKC')).toBeInTheDocument();
  });

  it('renders discipline tags for events that differ from organization', () => {
    render(
      <ShowCardVertical
        show={createMockShow({ organization: 'AKC', events: ['AKC', 'Conformation', 'Obedience'] })}
      />
    );
    expect(screen.getByText('Conformation')).toBeInTheDocument();
    expect(screen.getByText('Obedience')).toBeInTheDocument();
  });

  it('does not render duplicate organization tag in discipline tags', () => {
    render(
      <ShowCardVertical
        show={createMockShow({ organization: 'AKC', events: ['AKC', 'Conformation'] })}
      />
    );
    // AKC should appear exactly once (as the org badge), not also as a discipline tag
    const akcElements = screen.getAllByText('AKC');
    expect(akcElements).toHaveLength(1);
  });

  it('renders ShowProgressBar with totalTrials and totalEntries', () => {
    render(<ShowCardVertical show={createMockShow()} totalEntries={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/entries/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/trials/)).toBeInTheDocument();
  });

  it('defaults totalEntries to 0 when not provided', () => {
    render(<ShowCardVertical show={createMockShow()} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText(/entries/)).toBeInTheDocument();
  });

  it('defaults scoredTrials to 0 when not provided', () => {
    render(<ShowCardVertical show={createMockShow()} />);
    // When scoredTrials is 0, the "X/Y scored" text is not shown
    expect(screen.queryByText(/scored/)).not.toBeInTheDocument();
  });

  it('renders scoredTrials when provided', () => {
    render(<ShowCardVertical show={createMockShow()} scoredTrials={1} />);
    expect(screen.getByText('1/2 scored')).toBeInTheDocument();
  });

  it('calls onViewDetails when card is clicked', () => {
    const onViewDetails = vi.fn();
    render(<ShowCardVertical show={createMockShow()} onViewDetails={onViewDetails} />);
    const card = screen.getByTestId('show-card-vertical');
    fireEvent.click(card);
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onViewDetails is not provided and card is clicked', () => {
    render(<ShowCardVertical show={createMockShow()} />);
    const card = screen.getByTestId('show-card-vertical');
    expect(() => fireEvent.click(card)).not.toThrow();
  });

  it('has fixed width class ~280px', () => {
    render(<ShowCardVertical show={createMockShow()} />);
    const card = screen.getByTestId('show-card-vertical');
    expect(card.className).toContain('w-[280px]');
  });

  it('renders entry status badge', () => {
    // entryCloseDate far in future → accepting
    render(
      <ShowCardVertical
        show={createMockShow({ entryOpenDate: '2026-01-01', entryCloseDate: '2027-12-31' })}
      />
    );
    expect(screen.getByText('Accepting Entries')).toBeInTheDocument();
  });

  it('handles show with empty events array without crashing', () => {
    expect(() => {
      render(<ShowCardVertical show={createMockShow({ events: [] })} />);
    }).not.toThrow();
    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
  });

  it('handles show with empty trials array without crashing', () => {
    expect(() => {
      render(<ShowCardVertical show={createMockShow({ trials: [] })} />);
    }).not.toThrow();
    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
  });

  it('computes totalTrials from show.trials length', () => {
    render(<ShowCardVertical show={createMockShow()} />);
    // show has 2 trials
    const trialsNumber = screen.getByText('2');
    expect(trialsNumber).toBeInTheDocument();
  });
});

describe('ShowCardVerticalSkeleton', () => {
  it('renders without crashing', () => {
    expect(() => {
      render(<ShowCardVerticalSkeleton />);
    }).not.toThrow();
  });

  it('has animate-pulse class', () => {
    const { container } = render(<ShowCardVerticalSkeleton />);
    const pulsingElements = container.querySelectorAll('.animate-pulse');
    expect(pulsingElements.length).toBeGreaterThan(0);
  });

  it('has fixed width ~280px', () => {
    const { container } = render(<ShowCardVerticalSkeleton />);
    const card = container.firstElementChild;
    expect(card?.className).toContain('w-[280px]');
  });
});
