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
