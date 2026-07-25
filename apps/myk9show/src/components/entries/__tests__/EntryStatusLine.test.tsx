import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it } from 'vitest';
import { EntryStatusLine } from '../EntryStatusLine';

// UX walk remediation 2.B(2): one composed status line + at most one action
// hint, in the viewer's voice, shaped and colored by the UI-enum lane (NOT the derived
// kind) so the owner-approved "paid stays pending" decision is preserved.

describe('EntryStatusLine', () => {
  it('keeps a paid-but-unreviewed entry in the pending lane (not accepted)', () => {
    // Assertion-first, value-sensitive: getEntryStatusKind('paid') === 'accepted',
    // but a paid entry must stay in the shared warning/needs-review lane.
    render(<EntryStatusLine viewer="secretary" rawEntryStatus="paid" paymentStatus="paid" />);
    const icon = screen.getByText('Needs review').parentElement?.querySelector('[data-family]');
    expect(icon).toHaveAttribute('data-status', 'pending');
    expect(icon).toHaveAttribute('data-shape', 'pending');
    expect(icon).toHaveClass('text-warning');
  });

  it('routes a genuinely accepted entry through the shared in-progress grammar', () => {
    render(<EntryStatusLine viewer="secretary" rawEntryStatus="confirmed" />);
    const icon = screen.getByText('Accepted').parentElement?.querySelector('[data-family]');
    expect(icon).toHaveAttribute('data-status', 'accepted');
    expect(icon).toHaveAttribute('data-shape', 'in-progress');
    expect(icon).toHaveClass('text-info');
  });

  it('folds the refund into the line and surfaces the review-lane action hint', () => {
    render(
      <EntryStatusLine
        viewer="secretary"
        rawEntryStatus="paid"
        paymentStatus="refunded"
        refundAmount={30}
        refundedAt="2026-07-01T00:00:00Z"
      />
    );
    expect(screen.getByText('Needs review · Refunded $30')).toBeVisible();
    expect(screen.getByText('Refunded — confirm withdrawal or keep entry')).toBeVisible();
  });

  it('composes refund without a review-lane hint for a withdrawn entry', () => {
    render(<EntryStatusLine viewer="secretary" rawEntryStatus="withdrawn" refundAmount={30} />);
    expect(screen.getByText('Withdrawn · Refunded $30')).toBeVisible();
    expect(screen.queryByText('Refunded — confirm withdrawal or keep entry')).toBeNull();
  });

  it('never renders a raw/unknown enum verbatim', () => {
    render(<EntryStatusLine viewer="secretary" rawEntryStatus="some_garbage_status" />);
    expect(screen.getByText('Status unavailable')).toBeVisible();
    expect(screen.queryByText('some_garbage_status')).toBeNull();
  });
});
