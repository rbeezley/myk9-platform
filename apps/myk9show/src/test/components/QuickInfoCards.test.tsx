import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import type { Show } from '@/types/show-types';

const baseShow = {
  startDate: '2026-03-21',
  endDate: '2026-03-21',
  preEntryFee: '30',
  location: 'Olathe, KS',
  clubName: 'Jayhawk Agility Club',
  entryCloseDate: '2099-03-15',
} as Show;

describe('QuickInfoCards', () => {
  it('renders all 4 info items', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('Entries Close')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Entry Fee')).toBeInTheDocument();
    expect(screen.getByText('Payment Methods')).toBeInTheDocument();
  });

  it('displays entry close date', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('Mar 15')).toBeInTheDocument();
  });

  it('displays TBD when entry close date is missing', () => {
    const showWithoutCloseDate = { ...baseShow, entryCloseDate: '' };
    render(<QuickInfoCards show={showWithoutCloseDate as Show} />);
    expect(screen.getByText('TBD')).toBeInTheDocument();
  });

  it('displays entry fee', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('$30.00')).toBeInTheDocument();
  });

  it('displays location', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('Olathe, KS')).toBeInTheDocument();
  });

  it('displays default card payment method', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('Card')).toBeInTheDocument();
  });

  it('displays optional cash and check payment methods', () => {
    const showWithOfflinePayments = {
      ...baseShow,
      acceptCashPayments: true,
      acceptCheckPayments: true,
    };
    render(<QuickInfoCards show={showWithOfflinePayments as Show} />);
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('Check')).toBeInTheDocument();
  });

  it('hides optional cash and check payment methods by default', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.queryByText('Cash')).not.toBeInTheDocument();
    expect(screen.queryByText('Check')).not.toBeInTheDocument();
  });
});
