import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  classifyEntryAttention,
  matchesOperationalAttentionFilter,
} from './attentionClassification';

function makeEntry(
  id: string,
  classId: string,
  entryStatus: EntryStatus,
  paymentStatus: PaymentStatus,
  enrollmentPaymentStatus?: PaymentStatus
): EntryManagementEntry {
  return {
    id,
    registrationId: `registration-${id}`,
    entryNumber: id,
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName: id,
    ownerName: 'Owner',
    ownerEmail: 'owner@example.com',
    handlerName: 'Handler',
    classes: [
      {
        id: `entry-class-${id}`,
        classId,
        name: 'Novice A',
        number: '1',
        fee: 25,
        status: 'entered',
      },
    ],
    totalFee: 25,
    paidAmount: 0,
    entryStatus,
    paymentStatus,
    ...(enrollmentPaymentStatus !== undefined ? { enrollmentPaymentStatus } : {}),
    submittedAt: new Date('2026-07-15T12:00:00Z'),
    lastUpdated: new Date('2026-07-15T12:00:00Z'),
  };
}

describe('attention count-to-filter agreement', () => {
  it('counts each visible multi-class entry once and excludes terminal entries', () => {
    const entries = [
      makeEntry('pending', 'class-1', EntryStatus.PENDING, PaymentStatus.PENDING),
      makeEntry('missing', 'class-1', EntryStatus.MISSING_INFO, PaymentStatus.PENDING),
      makeEntry(
        'unpaid',
        'class-1',
        EntryStatus.ACCEPTED,
        PaymentStatus.PAID_ONLINE,
        PaymentStatus.PENDING
      ),
      makeEntry('terminal', 'class-1', EntryStatus.SCRATCHED, PaymentStatus.PENDING),
      makeEntry(
        'same-enrollment-other-class',
        'class-2',
        EntryStatus.ACCEPTED,
        PaymentStatus.PENDING
      ),
    ];
    const classEntries = entries.filter(entry =>
      entry.classes.some(entryClass => entryClass.classId === 'class-1')
    );

    const counts = {
      pending_review: classEntries.filter(entry =>
        classifyEntryAttention(entry).includes('pending_review')
      ).length,
      missing_information: classEntries.filter(entry =>
        classifyEntryAttention(entry).includes('missing_information')
      ).length,
      payment_due: classEntries.filter(entry =>
        classifyEntryAttention({
          entryStatus: entry.entryStatus,
          paymentStatus: entry.paymentStatus,
          enrollmentPaymentStatus: entry.enrollmentPaymentStatus,
        }).includes('payment_due')
      ).length,
    };

    expect(counts).toEqual({ pending_review: 1, missing_information: 1, payment_due: 1 });
    expect(
      classEntries.filter(entry =>
        matchesOperationalAttentionFilter(
          {
            entryStatus: entry.entryStatus,
            paymentStatus: entry.paymentStatus,
            enrollmentPaymentStatus: entry.enrollmentPaymentStatus,
          },
          'pending'
        )
      )
    ).toHaveLength(counts.pending_review);
    expect(
      classEntries.filter(entry =>
        matchesOperationalAttentionFilter(
          {
            entryStatus: entry.entryStatus,
            paymentStatus: entry.paymentStatus,
            enrollmentPaymentStatus: entry.enrollmentPaymentStatus,
          },
          'missing_information'
        )
      )
    ).toHaveLength(counts.missing_information);
    expect(
      classEntries.filter(
        entry =>
          matchesOperationalAttentionFilter(
            {
              entryStatus: entry.entryStatus,
              paymentStatus: entry.paymentStatus,
              enrollmentPaymentStatus: entry.enrollmentPaymentStatus,
            },
            'accepted'
          ) && (entry.enrollmentPaymentStatus ?? entry.paymentStatus) === PaymentStatus.PENDING
      )
    ).toHaveLength(counts.payment_due);
  });
});
