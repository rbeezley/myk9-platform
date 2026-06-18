import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  mapEntryStatus,
  mapPaymentStatus,
  mapStatusToDb,
  mapClassEntryStatus,
  getEntryStatusClasses,
} from './entryManagementUtils';

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

  it("maps 'completed' to COMPLETED (scored entries are NOT pending)", () => {
    // Regression guard for the Entry Management Pending over-count (audit F2):
    // scored entries with released placements were falling through to PENDING.
    expect(mapEntryStatus('completed')).toBe(EntryStatus.COMPLETED);
  });

  it("maps 'move-up-requested' to MOVE_UP_REQUESTED (NOT pending)", () => {
    // Move-up approval is a separate queue; it must not inflate the
    // accept/reject Pending count.
    expect(mapEntryStatus('move-up-requested')).toBe(EntryStatus.MOVE_UP_REQUESTED);
  });

  it('maps unknown strings to PENDING (safe default)', () => {
    expect(mapEntryStatus('unknown_value')).toBe(EntryStatus.PENDING);
    expect(mapEntryStatus(null)).toBe(EntryStatus.PENDING);
    expect(mapEntryStatus(undefined)).toBe(EntryStatus.PENDING);
  });

  it("keeps 'paid' and 'promotion-expired' in the secretary PENDING lane (owner decision)", () => {
    // Regression pin for docs/plan-ia-entry-status-surfaces.md Phase B: routing
    // through the canonical classifier must NOT move these out of "needs review".
    expect(mapEntryStatus('paid')).toBe(EntryStatus.PENDING);
    expect(mapEntryStatus('promotion-expired')).toBe(EntryStatus.PENDING);
  });
});

describe('mapClassEntryStatus — participation chip via the shared classifier', () => {
  it('maps removed/terminal states to their chip', () => {
    expect(mapClassEntryStatus('withdrawn')).toBe('scratched');
    expect(mapClassEntryStatus('scratched')).toBe('scratched');
    expect(mapClassEntryStatus('moved')).toBe('moved');
    expect(mapClassEntryStatus('absent')).toBe('absent');
    expect(mapClassEntryStatus('not_accepted')).toBe('absent');
  });

  it('reads live / pending states as an entered chip', () => {
    expect(mapClassEntryStatus('confirmed')).toBe('entered');
    expect(mapClassEntryStatus('accepted')).toBe('entered');
    expect(mapClassEntryStatus('pending')).toBe('entered');
    expect(mapClassEntryStatus('paid')).toBe('entered');
    expect(mapClassEntryStatus(null)).toBe('entered');
  });
});

describe('getEntryStatusClasses — colour via the shared classifier KIND', () => {
  it('tints accepted / pending / withdrawn / waitlist consistently', () => {
    expect(getEntryStatusClasses('confirmed')).toContain('text-success');
    expect(getEntryStatusClasses('accepted')).toContain('text-success');
    expect(getEntryStatusClasses('submitted')).toContain('text-warning');
    expect(getEntryStatusClasses('withdrawn')).toContain('text-destructive');
    expect(getEntryStatusClasses('waitlisted')).toContain('text-info');
  });

  it('uses the neutral chip for terminal/uncoloured statuses', () => {
    // COMPLETED / SCRATCHED / MOVED / REJECTED project to the gray default.
    expect(getEntryStatusClasses('completed')).toContain('text-gray-700');
    expect(getEntryStatusClasses('scratched')).toContain('text-gray-700');
    expect(getEntryStatusClasses('moved')).toContain('text-gray-700');
  });

  it('treats null / no-status as PENDING (warning), matching the stats bucket', () => {
    // mapEntryStatus(null) is the safe PENDING default — the same bucket the
    // needs-review stat counts — so the colour is warning, not a misleading
    // neutral gray that would imply "nothing to do".
    expect(getEntryStatusClasses(null)).toContain('text-warning');
    expect(getEntryStatusClasses('no-status')).toContain('text-warning');
  });

  it("colours 'paid'/'promotion-expired' as PENDING (warning), matching the bucket — not success", () => {
    // Regression pin (PR #829 review): these color via the owner-aware UI
    // projection, NOT getEntryStatusKind. getEntryStatusKind('paid') is
    // 'accepted', which would tint success/green while the stats count the
    // entry pending — the exact label-vs-status divergence this PR removes.
    expect(getEntryStatusClasses('paid')).toContain('text-warning');
    expect(getEntryStatusClasses('paid')).not.toContain('text-success');
    expect(getEntryStatusClasses('promotion-expired')).toContain('text-warning');
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

  it("COMPLETED writes 'completed' to DB and round-trips", () => {
    const dbValue = mapStatusToDb(EntryStatus.COMPLETED);
    expect(dbValue).toBe('completed');
    expect(mapEntryStatus(dbValue)).toBe(EntryStatus.COMPLETED);
  });

  it("MOVE_UP_REQUESTED writes 'move-up-requested' to DB and round-trips", () => {
    const dbValue = mapStatusToDb(EntryStatus.MOVE_UP_REQUESTED);
    expect(dbValue).toBe('move-up-requested');
    expect(mapEntryStatus(dbValue)).toBe(EntryStatus.MOVE_UP_REQUESTED);
  });
});

describe('mapPaymentStatus', () => {
  it("maps 'paid' to PAID_ONLINE", () => {
    expect(mapPaymentStatus('paid')).toBe(PaymentStatus.PAID_ONLINE);
  });

  it("maps 'pending' to PENDING", () => {
    expect(mapPaymentStatus('pending')).toBe(PaymentStatus.PENDING);
  });

  it("maps 'refunded' and 'partial_refund' to refund statuses", () => {
    expect(mapPaymentStatus('refunded')).toBe(PaymentStatus.REFUNDED);
    expect(mapPaymentStatus('partial_refund')).toBe(PaymentStatus.PARTIAL_REFUND);
  });

  it('maps unknown to PENDING (safe default)', () => {
    expect(mapPaymentStatus(null)).toBe(PaymentStatus.PENDING);
  });
});
