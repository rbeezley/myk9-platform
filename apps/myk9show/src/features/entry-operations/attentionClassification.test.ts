import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  classifyClassAttention,
  classifyEntryAttention,
  classifyRawEntryAttention,
  type OperationalEntryInput,
} from './attentionClassification';

const input = (overrides: Partial<OperationalEntryInput> = {}): OperationalEntryInput => ({
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  ...overrides,
});

describe('classifyEntryAttention', () => {
  describe('a money-neutral move-up destination (MYK9-639)', () => {
    it('uses the source payment status when the source is in the same scope', () => {
      // These two surfaces read RAW rows; the mapper-level rooting never
      // touches them. A move-up destination is created `payment_status =
      // 'pending'` with the money left on the entry it points at, so
      // classifying it here could only ever produce "Payment due" in red on a
      // dog who has paid — while Entry Management, on the same pair, reports no
      // issue at all.
      const source = { id: 'source-1', entry_status: 'moved', payment_status: 'paid' };
      expect(
        classifyRawEntryAttention(
          {
            id: 'destination-1',
            entry_status: 'confirmed',
            payment_status: 'pending',
            moved_from_entry_id: source.id,
          },
          [
            source,
            {
              id: 'destination-1',
              entry_status: 'confirmed',
              payment_status: 'pending',
              moved_from_entry_id: source.id,
            },
          ]
        )
      ).toEqual([]);
    });

    it('does not claim a destination is paid when its source is unavailable', () => {
      expect(
        classifyRawEntryAttention(
          {
            id: 'destination-1',
            entry_status: 'confirmed',
            payment_status: 'pending',
            moved_from_entry_id: 'missing-source',
          },
          []
        )
      ).toEqual([]);
    });

    it('still asks the LIFECYCLE questions, which are properties of the run', () => {
      expect(
        classifyRawEntryAttention({
          entry_status: 'pending',
          payment_status: 'pending',
          moved_from_entry_id: 'source-1',
        })
      ).toEqual(['pending_review']);
    });

    it('leaves an ordinary unpaid entry flagged', () => {
      expect(
        classifyRawEntryAttention({ entry_status: 'confirmed', payment_status: 'pending' })
      ).toEqual(['payment_due']);
    });
  });
  it('classifies a pending entry as pending_review', () => {
    expect(classifyEntryAttention(input({ entryStatus: EntryStatus.PENDING }))).toEqual([
      'pending_review',
    ]);
  });

  it('keeps missing information distinct from pending review', () => {
    expect(classifyEntryAttention(input({ entryStatus: EntryStatus.MISSING_INFO }))).toEqual([
      'missing_information',
    ]);
  });

  it('classifies accepted entries with effective pending payment as payment_due', () => {
    expect(
      classifyEntryAttention(
        input({
          paymentStatus: PaymentStatus.PAID_ONLINE,
          enrollmentPaymentStatus: PaymentStatus.PENDING,
        })
      )
    ).toEqual(['payment_due']);
  });

  it('keeps a pending entry visible when its ORDER reads paid (MYK9-495)', () => {
    // `enrollments` is one row per (show, handler), reused by every later
    // submission, so its `paid` must not drop this entry off the secretary's
    // attention list.
    expect(
      classifyEntryAttention(
        input({
          paymentStatus: PaymentStatus.PENDING,
          enrollmentPaymentStatus: PaymentStatus.PAID_ONLINE,
        })
      )
    ).toEqual(['payment_due']);
  });

  it('classifies the same shape from a raw row (MYK9-495)', () => {
    expect(
      classifyRawEntryAttention({
        entry_status: 'confirmed',
        payment_status: 'pending',
        registration: { payment_status: 'paid' },
      })
    ).toEqual(['payment_due']);
  });

  it("does not re-flag a settled entry for a sibling's unpaid order", () => {
    // The order reads `pending` because ANOTHER entry under it is unpaid. This
    // entry's own money is settled, so it owes nothing.
    for (const settled of [
      PaymentStatus.WAIVED,
      PaymentStatus.REFUNDED,
      PaymentStatus.PARTIAL_REFUND,
    ]) {
      expect(
        classifyEntryAttention(
          input({ paymentStatus: settled, enrollmentPaymentStatus: PaymentStatus.PENDING })
        )
      ).toEqual([]);
    }
  });

  it('does not classify terminal entries as payment due', () => {
    expect(
      classifyEntryAttention(
        input({ entryStatus: EntryStatus.SCRATCHED, paymentStatus: PaymentStatus.PENDING })
      )
    ).toEqual([]);
    expect(
      classifyEntryAttention(
        input({ entryStatus: EntryStatus.COMPLETED, paymentStatus: PaymentStatus.PENDING })
      )
    ).toEqual([]);
  });

  it('adapts raw status values without losing missing-information semantics', () => {
    expect(classifyRawEntryAttention({ entry_status: 'missing_info' })).toEqual([
      'missing_information',
    ]);
    expect(classifyRawEntryAttention({ entry_status: 'submitted' })).toEqual(['pending_review']);
  });
});

describe('classifyClassAttention', () => {
  it('keeps reopened_after_closeout at the class level', () => {
    expect(classifyClassAttention({ reopenedAfterCloseoutAt: '2026-07-15T20:00:00Z' })).toEqual([
      'reopened_after_closeout',
    ]);
    expect(classifyClassAttention({ reopenedAfterCloseoutAt: null })).toEqual([]);
  });
});
