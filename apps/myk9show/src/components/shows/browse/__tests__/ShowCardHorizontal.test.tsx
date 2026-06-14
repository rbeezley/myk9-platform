import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ShowCardHorizontal, ShowCardHorizontalSkeleton } from '../ShowCardHorizontal';
import type { Show } from '@/types/show-types';

// Helper to create a minimal Show for testing
function createMockShow(overrides: Partial<Show> = {}): Show {
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
    trials: [
      {
        id: 't1',
        name: 'Saturday Trial',
        date: '2026-04-15',
        trialNumber: '1',
        status: 'upcoming',
      },
      { id: 't2', name: 'Sunday Trial', date: '2026-04-16', trialNumber: '2', status: 'upcoming' },
    ],
    ...overrides,
  };
}

function renderCard(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ShowCardHorizontal', () => {
  it('renders show title, club name, and location', () => {
    renderCard(<ShowCardHorizontal show={createMockShow()} />);

    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
    expect(screen.getByText('Rocky Mountain Agility Club')).toBeInTheDocument();
    expect(screen.getByText('Denver, CO')).toBeInTheDocument();
  });

  it('renders DateCircle with correct dates', () => {
    renderCard(<ShowCardHorizontal show={createMockShow()} />);

    expect(screen.getByText('APR')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders discipline tags from show.events via getTypeBadge', () => {
    renderCard(
      <ShowCardHorizontal show={createMockShow({ events: ['Agility', 'Rally', 'Obedience'] })} />
    );

    // getTypeBadge renders in uppercase
    expect(screen.getByText('RALLY')).toBeInTheDocument();
    expect(screen.getByText('OBEDIENCE')).toBeInTheDocument();
  });

  it('renders organization badge', () => {
    renderCard(<ShowCardHorizontal show={createMockShow({ organization: 'Agility' })} />);

    expect(screen.getByText('AGILITY')).toBeInTheDocument();
  });

  it('renders entry status badge', () => {
    renderCard(
      <ShowCardHorizontal
        show={createMockShow({ entryOpenDate: '2026-01-01', entryCloseDate: '2027-12-31' })}
      />
    );

    expect(screen.getByText('Accepting Entries')).toBeInTheDocument();
  });

  it('does not advertise entry when an accepting show has trials but no classes', () => {
    renderCard(
      <ShowCardHorizontal
        show={createMockShow({
          entryOpenDate: '2026-01-01',
          entryCloseDate: '2027-12-31',
          trials: [
            {
              id: 't1',
              name: 'Saturday Trial',
              date: '2026-04-15',
              trialNumber: '1',
              status: 'upcoming',
              classes: [],
            },
          ],
        })}
      />
    );

    expect(screen.getByText('Classes Not Ready')).toBeInTheDocument();
    expect(screen.queryByText('Accepting Entries')).not.toBeInTheDocument();
  });

  it('renders a personalized submitted badge for logged-in users with open entries', () => {
    renderCard(
      <ShowCardHorizontal
        show={createMockShow({ entryOpenDate: '2026-01-01', entryCloseDate: '2027-12-31' })}
        userHasEntries
      />
    );

    expect(screen.getByText('Entry Submitted')).toBeInTheDocument();
    expect(screen.queryByText('Accepting Entries')).not.toBeInTheDocument();
  });

  it('renders the card as a named show details link', () => {
    renderCard(<ShowCardHorizontal show={createMockShow({ id: 'show-abc' })} />);

    expect(screen.getByRole('link', { name: /view spring agility trial/i })).toHaveAttribute(
      'href',
      '/shows/show-abc'
    );
  });

  it('shows checkbox when onToggleSelect provided', () => {
    renderCard(<ShowCardHorizontal show={createMockShow()} onToggleSelect={vi.fn()} />);

    expect(
      screen.getByRole('checkbox', { name: /select spring agility trial/i })
    ).toBeInTheDocument();
  });

  it('does not show checkbox when onToggleSelect is not provided', () => {
    renderCard(<ShowCardHorizontal show={createMockShow()} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('applies ring-2 when isSelected is true', () => {
    renderCard(
      <ShowCardHorizontal show={createMockShow()} isSelected={true} onToggleSelect={vi.fn()} />
    );

    expect(screen.getByTestId('show-card').className).toContain('ring-2');
  });

  it('does not apply selection ring when isSelected is false', () => {
    renderCard(<ShowCardHorizontal show={createMockShow()} isSelected={false} />);

    expect(screen.getByTestId('show-card').className).not.toContain('ring-primary/50');
  });

  it('handles show with empty events array (no crash)', () => {
    expect(() => {
      renderCard(<ShowCardHorizontal show={createMockShow({ events: [] })} />);
    }).not.toThrow();

    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
  });

  it('handles show with 0 trials', () => {
    expect(() => {
      renderCard(<ShowCardHorizontal show={createMockShow({ trials: [] })} />);
    }).not.toThrow();

    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
  });

  it('renders entry fee with currency formatting', () => {
    renderCard(<ShowCardHorizontal show={createMockShow({ preEntryFee: '30' })} />);
    expect(screen.getByText('$30.00')).toBeInTheDocument();
  });

  it('does not render fee when preEntryFee is empty', () => {
    renderCard(<ShowCardHorizontal show={createMockShow({ preEntryFee: '' })} />);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe('ShowCardHorizontalSkeleton', () => {
  it('renders without crashing', () => {
    expect(() => {
      render(<ShowCardHorizontalSkeleton />);
    }).not.toThrow();
  });

  it('has animate-pulse class', () => {
    const { container } = render(<ShowCardHorizontalSkeleton />);
    const pulsingElements = container.querySelectorAll('.animate-pulse');
    expect(pulsingElements.length).toBeGreaterThan(0);
  });
});
