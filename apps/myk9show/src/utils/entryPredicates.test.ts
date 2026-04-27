import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { isPendingEntry, isAcceptedEntry, isWaitlistEntry, isIssueEntry } from './entryPredicates';

const make = (entryStatus: EntryStatus, paymentStatus: PaymentStatus) => ({
  entryStatus,
  paymentStatus,
});

describe('isPendingEntry', () => {
  it('returns true for pending entry status', () => {
    expect(isPendingEntry(make(EntryStatus.PENDING, PaymentStatus.PENDING))).toBe(true);
  });

  it('returns true for pending entry status even when paid', () => {
    expect(isPendingEntry(make(EntryStatus.PENDING, PaymentStatus.PAID))).toBe(true);
  });

  it('returns false for accepted entry regardless of payment status', () => {
    // BUG: was returning true because of || paymentStatus === PENDING
    expect(isPendingEntry(make(EntryStatus.ACCEPTED, PaymentStatus.PENDING))).toBe(false);
  });

  it('returns false for accepted and paid entry', () => {
    expect(isPendingEntry(make(EntryStatus.ACCEPTED, PaymentStatus.PAID))).toBe(false);
  });

  it('returns false for waitlisted entry', () => {
    expect(isPendingEntry(make(EntryStatus.WAITLIST, PaymentStatus.PENDING))).toBe(false);
  });
});

describe('isAcceptedEntry', () => {
  it('returns true only when entryStatus is ACCEPTED', () => {
    expect(isAcceptedEntry(make(EntryStatus.ACCEPTED, PaymentStatus.PENDING))).toBe(true);
    expect(isAcceptedEntry(make(EntryStatus.ACCEPTED, PaymentStatus.PAID))).toBe(true);
    expect(isAcceptedEntry(make(EntryStatus.PENDING, PaymentStatus.PAID))).toBe(false);
  });
});

describe('isIssueEntry', () => {
  it('returns true for accepted entry with pending payment', () => {
    expect(isIssueEntry(make(EntryStatus.ACCEPTED, PaymentStatus.PENDING))).toBe(true);
  });

  it('returns false for accepted and paid entry', () => {
    expect(isIssueEntry(make(EntryStatus.ACCEPTED, PaymentStatus.PAID))).toBe(false);
  });

  it('returns false for pending entry (not yet accepted)', () => {
    expect(isIssueEntry(make(EntryStatus.PENDING, PaymentStatus.PENDING))).toBe(false);
  });
});

describe('isWaitlistEntry', () => {
  it('returns true only for waitlist status', () => {
    expect(isWaitlistEntry(make(EntryStatus.WAITLIST, PaymentStatus.PENDING))).toBe(true);
    expect(isWaitlistEntry(make(EntryStatus.ACCEPTED, PaymentStatus.PENDING))).toBe(false);
  });
});
