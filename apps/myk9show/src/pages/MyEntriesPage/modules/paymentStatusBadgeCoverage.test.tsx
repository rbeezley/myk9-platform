/**
 * Enumeration guard for the payment-status badges.
 *
 * `PaymentStatus.WAIVED` shipped with no case in either badge switch on the
 * exhibitor path, so a confirmed $0.00 entry read "Accepted · Unknown"
 * (MYK9-385). The members are read off the enum itself — a hand-written list
 * would have to be edited by the same person who forgot the case, which is
 * precisely the failure this guards against.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@/test/utils/testUtils';
import { PaymentStatus } from '@/types/show-registration-types';
import { getPaymentStatusBadge as getMyEntriesPaymentBadge } from './myEntriesUtils';
import { getPaymentStatusBadge as getManagementPaymentBadge } from '@/utils/entryManagementUtils';

const ALL_STATUSES = Object.values(PaymentStatus);

const RENDERERS: Array<[string, (status: PaymentStatus) => React.ReactNode]> = [
  ['MyEntriesPage/modules/myEntriesUtils', getMyEntriesPaymentBadge],
  ['utils/entryManagementUtils', getManagementPaymentBadge],
];

describe('payment status badge coverage', () => {
  it('enumerates every PaymentStatus member', () => {
    // Sanity check on the enumeration itself: an empty or one-member list would
    // make every assertion below vacuous.
    expect(ALL_STATUSES.length).toBeGreaterThanOrEqual(7);
    expect(ALL_STATUSES).toContain(PaymentStatus.WAIVED);
  });

  describe.each(RENDERERS)('%s', (_name, renderBadge) => {
    it.each(ALL_STATUSES)('names the state for %s instead of falling through', status => {
      const { container } = render(React.createElement(React.Fragment, null, renderBadge(status)));

      const text = container.textContent?.trim() ?? '';
      expect(text).not.toBe('');
      expect(text.toLowerCase()).not.toContain('unknown');
    });
  });

  it('badges a waived fee by name on the exhibitor card', () => {
    render(
      React.createElement(React.Fragment, null, getMyEntriesPaymentBadge(PaymentStatus.WAIVED))
    );

    expect(screen.getByText('Fee waived')).toBeInTheDocument();
  });
});
