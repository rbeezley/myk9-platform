import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ShowCardHorizontal, ShowCardHorizontalSkeleton } from '../ShowCardHorizontal';
import type { Show } from '@/types/show-types';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ShowCardHorizontal', () => {
  it('renders show title, club name, and location', () => {
    render(<ShowCardHorizontal show={createMockShow()} />);

    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
    expect(screen.getByText('Rocky Mountain Agility Club')).toBeInTheDocument();
    expect(screen.getByText('Denver, CO')).toBeInTheDocument();
  });

  it('renders DateCircle with correct dates', () => {
    render(<ShowCardHorizontal show={createMockShow()} />);

    expect(screen.getByText('APR')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders discipline tags from show.events via getTypeBadge', () => {
    render(
      <ShowCardHorizontal show={createMockShow({ events: ['Agility', 'Rally', 'Obedience'] })} />
    );

    // getTypeBadge renders in uppercase
    expect(screen.getByText('RALLY')).toBeInTheDocument();
    expect(screen.getByText('OBEDIENCE')).toBeInTheDocument();
  });

  it('renders organization badge', () => {
    render(<ShowCardHorizontal show={createMockShow({ organization: 'Agility' })} />);

    expect(screen.getByText('AGILITY')).toBeInTheDocument();
  });

  it('renders entry status badge', () => {
    render(
      <ShowCardHorizontal
        show={createMockShow({ entryOpenDate: '2026-01-01', entryCloseDate: '2027-12-31' })}
      />
    );

    expect(screen.getByText('Accepting Entries')).toBeInTheDocument();
  });

  it('click navigates to /shows/{id}', () => {
    render(<ShowCardHorizontal show={createMockShow({ id: 'show-abc' })} />);

    const card = screen.getByTestId('show-card');
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/shows/show-abc');
  });

  it('shows checkbox when onToggleSelect provided', () => {
    render(<ShowCardHorizontal show={createMockShow()} onToggleSelect={vi.fn()} />);

    expect(
      screen.getByRole('checkbox', { name: /select spring agility trial/i })
    ).toBeInTheDocument();
  });

  it('does not show checkbox when onToggleSelect is not provided', () => {
    render(<ShowCardHorizontal show={createMockShow()} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('applies ring-2 when isSelected is true', () => {
    render(
      <ShowCardHorizontal show={createMockShow()} isSelected={true} onToggleSelect={vi.fn()} />
    );

    expect(screen.getByTestId('show-card').className).toContain('ring-2');
  });

  it('does not apply ring-2 when isSelected is false', () => {
    render(<ShowCardHorizontal show={createMockShow()} isSelected={false} />);

    expect(screen.getByTestId('show-card').className).not.toContain('ring-2');
  });

  it('handles show with empty events array (no crash)', () => {
    expect(() => {
      render(<ShowCardHorizontal show={createMockShow({ events: [] })} />);
    }).not.toThrow();

    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
  });

  it('handles show with 0 trials', () => {
    expect(() => {
      render(<ShowCardHorizontal show={createMockShow({ trials: [] })} />);
    }).not.toThrow();

    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
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
