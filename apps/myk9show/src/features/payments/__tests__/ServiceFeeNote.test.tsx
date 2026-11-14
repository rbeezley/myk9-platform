/**
 * MYK9-1963: the show page's service-fee line reads the SAME rates the wizard's
 * Payment step prices its breakdown with, so the two cannot quote different fees.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ServiceFeeNote } from '../ServiceFeeNote';
import { PlatformFeeSplitLines } from '../PlatformFeeSplitLines';
import type { PlatformFeeRates } from '@/store/cartStore.helpers';
import type { PlatformFeeRatesQuery } from '@/hooks/queries/usePlatformFeeRates';
import type { Show } from '@/types/show-types';

const rates = vi.hoisted(() => ({
  current: { percent: 9, flatCents: 0, minCents: 0 } as PlatformFeeRates,
  state: 'ready' as 'loading' | 'unavailable' | 'absent' | 'ready',
}));

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRatesQuery: (): PlatformFeeRatesQuery => ({
    rates: rates.state === 'ready' ? rates.current : null,
    state: rates.state,
  }),
}));

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const openShow = {
  id: 'show-1',
  onlineEntriesEnabled: true,
  entryOpenDate: day(-10),
  entryCloseDate: day(20),
} as Show;

describe('ServiceFeeNote', () => {
  beforeEach(() => {
    rates.state = 'ready';
  });

  it("names the show page's rate, never a typed one, and matches the Payment step's rate", () => {
    rates.current = { percent: 9, flatCents: 0, minCents: 0 };
    render(
      <>
        <ServiceFeeNote show={openShow} />
        <PlatformFeeSplitLines subtotalCents={3000} rates={rates.current} />
      </>
    );

    expect(screen.getByText(/Plus a 9% service fee when you pay online\./)).toBeInTheDocument();
    // The Payment step's breakdown line quotes the same percent for the same rates.
    expect(screen.getByText('Service fee (9%)')).toBeInTheDocument();
    // The show page's line links the same /fees page the Payment step's breakdown does.
    for (const link of screen.getAllByRole('link', { name: 'How our fees work' })) {
      expect(link).toHaveAttribute('href', '/fees');
    }
  });

  it('says nothing for a rate of zero', () => {
    rates.current = { percent: 0, flatCents: 0, minCents: 0 };
    const { container } = render(<ServiceFeeNote show={openShow} />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each(['loading', 'unavailable', 'absent'] as const)(
    'says nothing while the rates are %s, so the default is never quoted as the live rate',
    state => {
      rates.state = state;
      const { container } = render(<ServiceFeeNote show={openShow} />);

      expect(container).toBeEmptyDOMElement();
    }
  );

  it('shows the live rate once the rates are ready', () => {
    rates.current = { percent: 4, flatCents: 0, minCents: 0 };
    render(<ServiceFeeNote show={openShow} />);

    expect(screen.getByText(/Plus a 4% service fee when you pay online\./)).toBeInTheDocument();
  });

  it('says it for a show whose entries have not opened yet', () => {
    render(
      <ServiceFeeNote show={{ ...openShow, entryOpenDate: day(5), entryCloseDate: day(30) }} />
    );

    expect(screen.getByText(/service fee/)).toBeInTheDocument();
  });

  it.each([
    ['closed', { entryOpenDate: day(-30), entryCloseDate: day(-5) }],
    ['mail-in', { onlineEntriesEnabled: false }],
    ['without an entry window', { entryOpenDate: '', entryCloseDate: '' }],
  ])('says nothing for a %s show', (_label, patch) => {
    const { container } = render(<ServiceFeeNote show={{ ...openShow, ...patch } as Show} />);

    expect(container).toBeEmptyDOMElement();
  });
});
