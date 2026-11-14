import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { QuickInfoCards } from '../QuickInfoCards';
import type { Show } from '@/types/show-types';

const feeQuery = vi.hoisted(() => ({ state: 'ready' as 'loading' | 'unavailable' | 'ready' }));

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRatesQuery: () => ({
    rates: feeQuery.state === 'ready' ? { percent: 7, flatCents: 0, minCents: 0 } : null,
    state: feeQuery.state,
  }),
}));

const isoDay = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const baseShow: Partial<Show> = {
  startDate: '2026-05-01T08:00:00Z',
  endDate: '2026-05-02T17:00:00Z',
  entryCloseDate: '2026-04-15T23:59:00Z',
  preEntryFee: '$15.00',
  dayOfShowFee: '$20.00',
  location: 'Dogtown Park',
  clubName: 'Happy Paws Club',
  onlineEntriesEnabled: true,
};

describe('QuickInfoCards — payment methods', () => {
  it('promotes entries close instead of repeating show date and host club', () => {
    render(<QuickInfoCards show={baseShow as Show} />);
    expect(screen.getByText('Entries Close')).toBeInTheDocument();
    expect(screen.getByText('Apr 15')).toBeInTheDocument();
    expect(screen.queryByText('Date')).not.toBeInTheDocument();
    expect(screen.queryByText('Host Club')).not.toBeInTheDocument();
  });

  // MYK9-979: card payment exists only with online entries on.
  it('renders the Card badge for a show with online entries on', () => {
    render(<QuickInfoCards show={baseShow as Show} />);
    expect(screen.getByText('Card')).toBeInTheDocument();
  });

  it.each([false, undefined])(
    'renders no Card badge when online entries are %s (mail-in or not known yet)',
    onlineEntriesEnabled => {
      render(<QuickInfoCards show={{ ...baseShow, onlineEntriesEnabled } as Show} />);
      expect(screen.queryByText('Card')).not.toBeInTheDocument();
    }
  );

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

// MYK9-1963: the card service fee is said beside the entry fee, from the same
// rates the Payment step prices with, and only when online entries are on.
describe('QuickInfoCards — service fee line', () => {
  const openShow = { ...baseShow, entryOpenDate: isoDay(-10), entryCloseDate: isoDay(20) } as Show;

  beforeEach(() => {
    feeQuery.state = 'ready';
  });

  it('says the service fee, with a link to how fees work, when online entries are on', () => {
    render(<QuickInfoCards show={openShow} />);
    expect(screen.getByText(/Plus a 7% service fee when you pay online\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How our fees work' })).toHaveAttribute(
      'href',
      '/fees'
    );
  });

  it.each([false, undefined])('says nothing about a fee when online entries are %s', enabled => {
    render(<QuickInfoCards show={{ ...openShow, onlineEntriesEnabled: enabled } as Show} />);
    expect(screen.queryByText(/service fee/i)).not.toBeInTheDocument();
  });

  it.each(['loading', 'unavailable'] as const)(
    'says nothing about a fee while the rates are %s',
    state => {
      feeQuery.state = state;
      render(<QuickInfoCards show={openShow} />);
      expect(screen.queryByText(/service fee/i)).not.toBeInTheDocument();
    }
  );

  it('says nothing about a fee once the entry window has closed', () => {
    render(
      <QuickInfoCards
        show={{ ...openShow, entryOpenDate: isoDay(-30), entryCloseDate: isoDay(-5) } as Show}
      />
    );
    expect(screen.queryByText(/service fee/i)).not.toBeInTheDocument();
  });

  it('says nothing about a fee in the secretary view of the show', () => {
    render(<QuickInfoCards show={openShow} canManageShow entryCount={3} />);
    expect(screen.queryByText(/service fee/i)).not.toBeInTheDocument();
  });
});
