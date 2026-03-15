import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import type { Show } from '@/types/show-types';

const baseShow = {
  startDate: '2026-03-21',
  endDate: '2026-03-21',
  preEntryFee: '$30',
  location: 'Olathe, KS',
  clubName: 'Jayhawk Agility Club',
  entryCloseDate: '2099-03-15',
} as Show;

describe('QuickInfoCards', () => {
  it('renders all 4 info items', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Entry Fee')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Host Club')).toBeInTheDocument();
  });

  it('displays single-day date format', () => {
    render(<QuickInfoCards show={baseShow} />);
    // Should show a formatted single date (not a range)
    expect(screen.getByText(/Mar.*21.*2026/)).toBeInTheDocument();
  });

  it('displays multi-day date range', () => {
    const multiDay = { ...baseShow, endDate: '2026-03-22' };
    render(<QuickInfoCards show={multiDay as Show} />);
    expect(screen.getByText(/Mar.*21.*–.*Mar.*22/i)).toBeInTheDocument();
  });

  it('displays entry fee', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('$30')).toBeInTheDocument();
  });

  it('displays location', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('Olathe, KS')).toBeInTheDocument();
  });

  it('displays club name', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('Jayhawk Agility Club')).toBeInTheDocument();
  });

  it('shows entry close date as secondary text when entries are open', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText(/entries close/i)).toBeInTheDocument();
  });
});
