import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QuickInfoCards } from '../QuickInfoCards';
import type { Show } from '@/types/show-types';

const baseShow: Partial<Show> = {
  startDate: '2026-05-01T08:00:00Z',
  endDate: '2026-05-02T17:00:00Z',
  entryCloseDate: '2026-04-15T23:59:00Z',
  preEntryFee: '$15.00',
  dayOfShowFee: '$20.00',
  location: 'Dogtown Park',
  clubName: 'Happy Paws Club',
};

describe('QuickInfoCards — payment methods', () => {
  it('promotes entries close instead of repeating show date and host club', () => {
    render(<QuickInfoCards show={baseShow as Show} />);
    expect(screen.getByText('Entries Close')).toBeInTheDocument();
    expect(screen.getByText('Apr 15')).toBeInTheDocument();
    expect(screen.queryByText('Date')).not.toBeInTheDocument();
    expect(screen.queryByText('Host Club')).not.toBeInTheDocument();
  });

  it('always renders Card badge', () => {
    render(<QuickInfoCards show={baseShow as Show} />);
    expect(screen.getByText('Card')).toBeInTheDocument();
  });

  it('does not render Check badge when acceptCheckPayments is false', () => {
    render(<QuickInfoCards show={{ ...baseShow, acceptCheckPayments: false } as Show} />);
    expect(screen.queryByText('Check')).not.toBeInTheDocument();
  });

  it('renders Check badge when acceptCheckPayments is true', () => {
    render(<QuickInfoCards show={{ ...baseShow, acceptCheckPayments: true } as Show} />);
    expect(screen.getByText('Check')).toBeInTheDocument();
  });

  it('does not render Cash badge when acceptCashPayments is false', () => {
    render(<QuickInfoCards show={{ ...baseShow, acceptCashPayments: false } as Show} />);
    expect(screen.queryByText('Cash')).not.toBeInTheDocument();
  });

  it('renders Cash badge when acceptCashPayments is true', () => {
    render(<QuickInfoCards show={{ ...baseShow, acceptCashPayments: true } as Show} />);
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });

  it('renders Card, Check, and Cash when both flags are true', () => {
    render(
      <QuickInfoCards
        show={{ ...baseShow, acceptCheckPayments: true, acceptCashPayments: true } as Show}
      />
    );
    expect(screen.getByText('Card')).toBeInTheDocument();
    expect(screen.getByText('Check')).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });

  it('renders the Payment Methods label', () => {
    render(<QuickInfoCards show={baseShow as Show} />);
    expect(screen.getByText('Payment Methods')).toBeInTheDocument();
  });
});
