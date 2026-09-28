import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it } from 'vitest';
import { JuniorPaymentNotice } from './JuniorPaymentNotice';

describe('JuniorPaymentNotice', () => {
  it('shows the amount to confirm and links to the exact unpaid entry', () => {
    render(
      <JuniorPaymentNotice
        showId="show-1"
        adultAmount={60}
        juniorFee={15}
        outcomes={[
          {
            dogId: 'dog-1',
            classId: 'class-1',
            outcome: 'created',
            entryId: 'entry-1',
            waitlistEntryId: null,
            feeCents: 0,
            feePending: true,
            capacityOverride: false,
          },
        ]}
      />
    );

    expect(screen.getByText(/Adult estimate for selected classes: \$60\.00/)).toBeInTheDocument();
    expect(screen.getByText(/junior.*\$15\.00 per class/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /record it in Entries Management/i })).toHaveAttribute(
      'href',
      '/shows/show-1/entries?queue=payment-due&entry=entry-1'
    );
  });
});
