import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  formatTrialLabel,
  getContextualStatusMessage,
  getEntryStatusBadge,
  getPaymentStatusBadge,
  getStatusIcon,
  normalizeCheckInStatus,
} from './myEntriesUtils';

describe('getEntryStatusBadge — preserved status kind', () => {
  it('names the secretary for a genuinely submitted and unreviewed entry', () => {
    render(
      React.createElement(
        React.Fragment,
        null,
        getEntryStatusBadge(EntryStatus.PENDING, { statusKind: 'pending' })
      )
    );

    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

  it.each(['accepted', 'not_accepted'] as const)(
    'keeps the secretary wording for the %s review-lane override',
    statusKind => {
      render(
        React.createElement(
          React.Fragment,
          null,
          getEntryStatusBadge(EntryStatus.PENDING, { statusKind })
        )
      );

      expect(screen.getByText('Pending review')).toBeInTheDocument();
    }
  );

  it.each([
    ['in_ring', 'In Ring'],
    ['absent', 'Absent'],
    ['unknown', 'Status unavailable'],
  ] as const)('does not call a %s entry pending', (statusKind, label) => {
    render(
      React.createElement(
        React.Fragment,
        null,
        getEntryStatusBadge(EntryStatus.PENDING, { statusKind })
      )
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
  });

  it('keeps past pending entries distinct from the active approval queue', () => {
    render(
      React.createElement(
        React.Fragment,
        null,
        getEntryStatusBadge(EntryStatus.PENDING, { statusKind: 'pending', isPastShow: true })
      )
    );

    expect(screen.getByText('Review incomplete')).toBeInTheDocument();
    expect(screen.queryByText(/secretary approval/i)).not.toBeInTheDocument();
  });

  it('renders a completed kind as scored even when the legacy status is accepted', () => {
    const { container } = render(
      React.createElement(
        React.Fragment,
        null,
        getEntryStatusBadge(EntryStatus.ACCEPTED, { statusKind: 'completed' }),
        getStatusIcon(EntryStatus.ACCEPTED, PaymentStatus.PAID_ONLINE, 'completed')
      )
    );

    expect(screen.getByText('Scored')).toBeInTheDocument();
    expect(
      container.querySelector('[data-family="entry"][data-status="completed"]')
    ).toBeInTheDocument();
  });

  it('labels a part-scored order "Partially scored" over the remaining status', () => {
    // The caller passes the dominant status of the classes still to RUN, so the
    // icon describes the remaining work; only the label mentions the results in.
    const { container } = render(
      React.createElement(
        React.Fragment,
        null,
        getEntryStatusBadge(EntryStatus.ACCEPTED, {
          statusKind: 'accepted',
          partiallyScored: true,
        })
      )
    );

    expect(screen.getByText('Partially scored')).toBeInTheDocument();
    expect(screen.queryByText('Scored')).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-family="entry"][data-status="accepted"]')
    ).toBeInTheDocument();
  });

  it('leaves a fully scored order reading "Scored"', () => {
    render(
      React.createElement(
        React.Fragment,
        null,
        getEntryStatusBadge(EntryStatus.COMPLETED, {
          statusKind: 'completed',
          partiallyScored: false,
        })
      )
    );

    expect(screen.getByText('Scored')).toBeInTheDocument();
  });

  it('uses the canonical exhibitor label for a genuinely declined entry', () => {
    render(
      React.createElement(
        React.Fragment,
        null,
        getEntryStatusBadge(EntryStatus.REJECTED, { statusKind: 'not_accepted' })
      )
    );

    expect(screen.getByText('Declined')).toBeInTheDocument();
    expect(screen.queryByText('Not accepted')).not.toBeInTheDocument();
  });
});

describe('formatTrialLabel', () => {
  it('prefixes a bare numeric trial number', () => {
    expect(formatTrialLabel('2')).toBe('Trial 2');
  });

  it('does not stutter when the value is already a trial label', () => {
    expect(formatTrialLabel('Saturday Trial')).toBe('Saturday Trial');
  });

  it('does not stutter on a differently-cased "trial" in the label', () => {
    expect(formatTrialLabel('AM TRIAL')).toBe('AM TRIAL');
  });
});

describe('normalizeCheckInStatus', () => {
  it('passes through a real check-in status', () => {
    expect(normalizeCheckInStatus('checked-in')).toBe('checked-in');
    expect(normalizeCheckInStatus('at-gate')).toBe('at-gate');
  });

  it('maps null/undefined/empty and the "no-status" default to undefined (not checked in)', () => {
    expect(normalizeCheckInStatus(null)).toBeUndefined();
    expect(normalizeCheckInStatus(undefined)).toBeUndefined();
    expect(normalizeCheckInStatus('')).toBeUndefined();
    expect(normalizeCheckInStatus('no-status')).toBeUndefined();
  });
});

describe('My Entries terminal status display', () => {
  const baseEntry = {
    showDate: new Date('2026-07-01T00:00:00Z'),
    submittedAt: new Date('2026-05-01T00:00:00Z'),
    lastUpdated: new Date('2026-06-01T00:00:00Z'),
  };

  const dateHelpers = {
    formatDistanceToNow: () => '13 days ago',
    format: () => 'May 1',
    isToday: () => false,
    isTomorrow: () => false,
    differenceInDays: () => 17,
  };

  it('describes withdrawn refunded entries as terminal, not upcoming', () => {
    const message = getContextualStatusMessage(
      {
        ...baseEntry,
        entryStatus: EntryStatus.CANCELLED,
        paymentStatus: PaymentStatus.REFUNDED,
      },
      dateHelpers.formatDistanceToNow,
      dateHelpers.format,
      dateHelpers.isToday,
      dateHelpers.isTomorrow,
      dateHelpers.differenceInDays
    );

    expect(message.message).toMatch(/Withdrawn/i);
    expect(message.message).toMatch(/refunded/i);
    expect(message.message).not.toMatch(/Upcoming|Show in/i);
  });

  it('gives a declined exhibitor a concrete next step', () => {
    const message = getContextualStatusMessage(
      {
        ...baseEntry,
        entryStatus: EntryStatus.REJECTED,
        entryStatusKind: 'not_accepted',
        paymentStatus: PaymentStatus.PENDING,
      },
      dateHelpers.formatDistanceToNow,
      dateHelpers.format,
      dateHelpers.isToday,
      dateHelpers.isTomorrow,
      dateHelpers.differenceInDays
    );

    expect(message.message).toBe('Contact the show secretary for next steps');
  });

  it('labels a show-cancelled entry distinctly while preserving refund state', () => {
    const message = getContextualStatusMessage(
      {
        ...baseEntry,
        entryStatus: EntryStatus.CANCELLED,
        paymentStatus: PaymentStatus.REFUNDED,
        isShowCancelled: true,
      },
      dateHelpers.formatDistanceToNow,
      dateHelpers.format,
      dateHelpers.isToday,
      dateHelpers.isTomorrow,
      dateHelpers.differenceInDays
    );

    expect(message.message).toBe('Show cancelled - refunded');
  });

  it('labels a show-cancelled entry as Cancelled instead of generic Withdrawn', () => {
    render(
      React.createElement(
        React.Fragment,
        null,
        getEntryStatusBadge(EntryStatus.CANCELLED, { isShowCancelled: true })
      )
    );

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByText('Withdrawn')).not.toBeInTheDocument();
  });

  it('describes partial refunds distinctly from full refunds', () => {
    const message = getContextualStatusMessage(
      {
        ...baseEntry,
        entryStatus: EntryStatus.CANCELLED,
        paymentStatus: PaymentStatus.PARTIAL_REFUND,
      },
      dateHelpers.formatDistanceToNow,
      dateHelpers.format,
      dateHelpers.isToday,
      dateHelpers.isTomorrow,
      dateHelpers.differenceInDays
    );

    expect(message.message).toMatch(/Withdrawn/i);
    expect(message.message).toMatch(/partial refund/i);
  });

  it('labels withdrawn entries and full versus partial refunds clearly', () => {
    const { rerender } = render(
      React.createElement(React.Fragment, null, getEntryStatusBadge(EntryStatus.CANCELLED))
    );
    expect(screen.getByText('Withdrawn')).toBeInTheDocument();

    rerender(
      React.createElement(React.Fragment, null, getPaymentStatusBadge(PaymentStatus.REFUNDED))
    );
    expect(screen.getByText(/^Refunded$/i)).toBeInTheDocument();

    rerender(
      React.createElement(React.Fragment, null, getPaymentStatusBadge(PaymentStatus.PARTIAL_REFUND))
    );
    expect(screen.getByText(/Partial refund/i)).toBeInTheDocument();
  });

  it('labels scored and move-up-requested entries instead of falling through to Unknown', () => {
    // Regression guard: COMPLETED / MOVE_UP_REQUESTED reach My Entries via the
    // shared mapEntryStatus and must render meaningful badges (audit F2 follow-up).
    const { rerender } = render(
      React.createElement(React.Fragment, null, getEntryStatusBadge(EntryStatus.COMPLETED))
    );
    expect(screen.getByText('Scored')).toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();

    rerender(
      React.createElement(React.Fragment, null, getEntryStatusBadge(EntryStatus.MOVE_UP_REQUESTED))
    );
    expect(screen.getByText('Move-Up Requested')).toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
  });

  it('describes a completed kind as scored even when the legacy status is accepted', () => {
    const message = getContextualStatusMessage(
      {
        ...baseEntry,
        entryStatus: EntryStatus.ACCEPTED,
        entryStatusKind: 'completed',
        paymentStatus: PaymentStatus.PAID_ONLINE,
      },
      dateHelpers.formatDistanceToNow,
      dateHelpers.format,
      dateHelpers.isToday,
      dateHelpers.isTomorrow,
      dateHelpers.differenceInDays
    );

    expect(message).toEqual({ message: 'Scored', className: 'text-success' });
  });
});

describe('getStatusIcon theming', () => {
  // Regression guard: status icons must use semantic theme tokens so they
  // recolor correctly in dark mode. Hardcoded iOS-palette hex (text-[#34C759]
  // etc.) bypassed the AA-tuned --success/--warning/--destructive tokens.
  const cases: Array<{
    entryStatus: EntryStatus;
    paymentStatus: PaymentStatus;
    token: string;
  }> = [
    {
      entryStatus: EntryStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      token: 'text-success',
    },
    {
      entryStatus: EntryStatus.ACCEPTED,
      paymentStatus: PaymentStatus.PENDING,
      token: 'text-warning',
    },
    {
      entryStatus: EntryStatus.ACCEPTED,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      token: 'text-info',
    },
    {
      entryStatus: EntryStatus.REJECTED,
      paymentStatus: PaymentStatus.PENDING,
      token: 'text-destructive',
    },
    {
      entryStatus: EntryStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      token: 'text-warning',
    },
    {
      entryStatus: EntryStatus.WAITLIST,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      token: 'text-warning',
    },
  ];

  it.each(cases)(
    'renders $token for $entryStatus and never a hardcoded hex',
    ({ entryStatus, paymentStatus, token }) => {
      const { container } = render(
        React.createElement(React.Fragment, null, getStatusIcon(entryStatus, paymentStatus))
      );
      const statusIcon = container.querySelector('[data-family="entry"]');
      expect(statusIcon).not.toBeNull();
      expect(statusIcon?.getAttribute('class') ?? '').toContain(token);
      expect(statusIcon?.getAttribute('class') ?? '').not.toMatch(/text-\[#/);
    }
  );
});
