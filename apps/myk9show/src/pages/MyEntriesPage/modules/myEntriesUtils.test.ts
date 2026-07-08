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
    { entryStatus: EntryStatus.COMPLETED, paymentStatus: PaymentStatus.PAID_ONLINE, token: 'text-success' },
    { entryStatus: EntryStatus.ACCEPTED, paymentStatus: PaymentStatus.PAID_ONLINE, token: 'text-success' },
    { entryStatus: EntryStatus.REJECTED, paymentStatus: PaymentStatus.PENDING, token: 'text-destructive' },
    { entryStatus: EntryStatus.PENDING, paymentStatus: PaymentStatus.PENDING, token: 'text-warning' },
    { entryStatus: EntryStatus.WAITLIST, paymentStatus: PaymentStatus.PAID_ONLINE, token: 'text-primary' },
  ];

  it.each(cases)(
    'renders $token for $entryStatus and never a hardcoded hex',
    ({ entryStatus, paymentStatus, token }) => {
      const { container } = render(
        React.createElement(React.Fragment, null, getStatusIcon(entryStatus, paymentStatus))
      );
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('class') ?? '').toContain(token);
      expect(svg?.getAttribute('class') ?? '').not.toMatch(/text-\[#/);
    }
  );
});
