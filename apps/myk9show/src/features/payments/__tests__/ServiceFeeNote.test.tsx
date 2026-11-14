/**
 * MYK9-1963: the show page's service-fee line reads the SAME rates the wizard's
 * Payment step prices its breakdown with, so the two cannot quote different fees.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ServiceFeeNote } from '../ServiceFeeNote';
import { PlatformFeeSplitLines } from '../PlatformFeeSplitLines';
import type { PlatformFeeRates } from '@/store/cartStore.helpers';

const rates = vi.hoisted(() => ({
  current: { percent: 9, flatCents: 0, minCents: 0 } as PlatformFeeRates,
}));

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRates: () => rates.current,
}));

describe('ServiceFeeNote', () => {
  it("names the show page's rate, never a typed one, and matches the Payment step's rate", () => {
    rates.current = { percent: 9, flatCents: 0, minCents: 0 };
    render(
      <>
        <ServiceFeeNote />
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
    const { container } = render(<ServiceFeeNote />);

    expect(container).toBeEmptyDOMElement();
  });
});
