import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { buildFormChecklist } from '../formChecklist';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';

const entry = (id: string, paymentStatus: PaymentStatus): EntryManagementEntry => ({
  id,
  registrationId: 'enrollment-1',
  entryNumber: id,
  armbandNumber: id.slice(-1),
  showId: 'show-1',
  dogId: `dog-${id}`,
  dogName: `Dog ${id}`,
  ownerName: 'Alice Martin',
  ownerEmail: 'alice@example.com',
  handlerName: 'Alice Martin',
  classes: [],
  totalFee: 25,
  paidAmount: 0,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus,
  submittedAt: new Date('2026-07-01T13:42:00Z'),
  lastUpdated: new Date('2026-07-01T13:42:00Z'),
});

const form = (paymentStatus: PaymentStatus) =>
  groupEntriesByShowRegistration([entry('e1', paymentStatus), entry('e2', paymentStatus)])[0]!;

describe('buildFormChecklist when the payment record is not loaded (MYK9-1968)', () => {
  it('quotes no due and offers no recording when entries are unpaid', () => {
    const { items } = buildFormChecklist(form(PaymentStatus.PENDING), {
      paidDollars: 0,
      remainingDollars: 50,
      amountUnknown: true,
    });
    expect(items.filter(item => item.kind === 'payment')).toEqual([
      {
        kind: 'payment',
        id: 'payment',
        title: 'Amount not available',
        detail:
          '2 of 2 entries unpaid. The payment record has not loaded, so what is due is not known.',
        canRecord: false,
      },
    ]);
  });

  it('says the amount is not available even when every entry is marked paid', () => {
    // Codex review of #4104: cached entries say "paid", but the missing record can still
    // carry a balance, so the checklist must not read "All set".
    const { items } = buildFormChecklist(form(PaymentStatus.PAID_BY_CASH), {
      paidDollars: 50,
      remainingDollars: 0,
      amountUnknown: true,
    });
    expect(items.filter(item => item.kind === 'payment')).toEqual([
      {
        kind: 'payment',
        id: 'payment',
        title: 'Amount not available',
        detail: 'The payment record has not loaded, so whether anything is due is not known.',
        canRecord: false,
      },
    ]);
  });

  it('says the amount is not available after every run is over', () => {
    // Codex review of #4104, round 2: a completed run has not settled its fee.
    const completed = groupEntriesByShowRegistration([
      { ...entry('e1', PaymentStatus.PAID_BY_CASH), entryStatus: EntryStatus.COMPLETED },
      { ...entry('e2', PaymentStatus.PAID_BY_CASH), entryStatus: EntryStatus.COMPLETED },
    ])[0]!;
    const { items } = buildFormChecklist(completed, {
      paidDollars: 50,
      remainingDollars: 0,
      amountUnknown: true,
    });
    expect(items.find(item => item.kind === 'payment')).toMatchObject({
      title: 'Amount not available',
      canRecord: false,
    });
  });

  it('quotes no paid figure in the done line', () => {
    const { done } = buildFormChecklist(form(PaymentStatus.PAID_BY_CASH), {
      paidDollars: 50,
      remainingDollars: 0,
      amountUnknown: true,
    });
    expect(done).toEqual(['2 accepted', 'armband 1, 2']);
  });

  it('still quotes the figures when the record loaded', () => {
    const { items } = buildFormChecklist(form(PaymentStatus.PENDING), {
      paidDollars: 30,
      remainingDollars: 20,
    });
    expect(items.find(item => item.kind === 'payment')).toMatchObject({
      title: '$20.00 due',
      canRecord: true,
    });
  });
});
