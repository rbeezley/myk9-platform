import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { mapEntryStatus, mapPaymentStatus, mapStatusToDb } from './entryManagementUtils';

describe('mapEntryStatus', () => {
  it("maps 'confirmed' to ACCEPTED", () => {
    // Regression guard: 'confirmed' is what mapStatusToDb writes to DB for ACCEPTED.
    // Without this case, accepted entries reverted to PENDING on every page reload.
    expect(mapEntryStatus('confirmed')).toBe(EntryStatus.ACCEPTED);
  });

  it("maps 'accepted' to ACCEPTED", () => {
    expect(mapEntryStatus('accepted')).toBe(EntryStatus.ACCEPTED);
  });

  it("maps 'submitted' to PENDING", () => {
    expect(mapEntryStatus('submitted')).toBe(EntryStatus.PENDING);
  });

  it("maps 'pending' to PENDING", () => {
    expect(mapEntryStatus('pending')).toBe(EntryStatus.PENDING);
  });

  it("maps 'waitlisted' to WAITLIST", () => {
    expect(mapEntryStatus('waitlisted')).toBe(EntryStatus.WAITLIST);
  });

  it("maps 'rejected' to REJECTED", () => {
    expect(mapEntryStatus('rejected')).toBe(EntryStatus.REJECTED);
  });

  it("maps 'withdrawn' to CANCELLED", () => {
    expect(mapEntryStatus('withdrawn')).toBe(EntryStatus.CANCELLED);
  });

  it("maps 'scratched' to SCRATCHED", () => {
    expect(mapEntryStatus('scratched')).toBe(EntryStatus.SCRATCHED);
  });

  it("maps 'moved' to MOVED", () => {
    expect(mapEntryStatus('moved')).toBe(EntryStatus.MOVED);
  });

  it('maps unknown strings to PENDING (safe default)', () => {
    expect(mapEntryStatus('unknown_value')).toBe(EntryStatus.PENDING);
    expect(mapEntryStatus(null)).toBe(EntryStatus.PENDING);
    expect(mapEntryStatus(undefined)).toBe(EntryStatus.PENDING);
  });
});

describe('mapStatusToDb round-trip', () => {
  it("ACCEPTED round-trips through 'confirmed'", () => {
    const dbValue = mapStatusToDb(EntryStatus.ACCEPTED);
    expect(dbValue).toBe('confirmed');
    expect(mapEntryStatus(dbValue)).toBe(EntryStatus.ACCEPTED);
  });

  it("SCRATCHED writes 'scratched' to DB and round-trips", () => {
    const dbValue = mapStatusToDb(EntryStatus.SCRATCHED);
    expect(dbValue).toBe('scratched');
    expect(mapEntryStatus(dbValue)).toBe(EntryStatus.SCRATCHED);
  });

  it("MOVED writes 'moved' to DB and round-trips", () => {
    const dbValue = mapStatusToDb(EntryStatus.MOVED);
    expect(dbValue).toBe('moved');
    expect(mapEntryStatus(dbValue)).toBe(EntryStatus.MOVED);
  });

  it("CANCELLED (Withdrawn) writes 'withdrawn' to DB and round-trips", () => {
    const dbValue = mapStatusToDb(EntryStatus.CANCELLED);
    expect(dbValue).toBe('withdrawn');
    expect(mapEntryStatus(dbValue)).toBe(EntryStatus.CANCELLED);
  });
});

describe('mapPaymentStatus', () => {
  it("maps 'paid' to PAID_ONLINE", () => {
    expect(mapPaymentStatus('paid')).toBe(PaymentStatus.PAID_ONLINE);
  });

  it("maps 'pending' to PENDING", () => {
    expect(mapPaymentStatus('pending')).toBe(PaymentStatus.PENDING);
  });

  it('maps unknown to PENDING (safe default)', () => {
    expect(mapPaymentStatus(null)).toBe(PaymentStatus.PENDING);
  });
});
