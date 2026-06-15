import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  getContextualStatusMessage,
  getEntryStatusBadge,
  getPaymentStatusBadge,
  normalizeCheckInStatus,
} from './myEntriesUtils';

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
});
