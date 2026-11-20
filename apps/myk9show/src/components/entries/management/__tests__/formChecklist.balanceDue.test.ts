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

describe('buildFormChecklist balance from the loaded payment record (MYK9-2155)', () => {
  it('shows the amount due when entries are not marked unpaid', () => {
    const { items, done } = buildFormChecklist(form(PaymentStatus.PAID_BY_CHECK), {
      paidDollars: 20,
      remainingDollars: 30,
    });
    const payment = items.filter(item => item.kind === 'payment');
    expect(payment).toHaveLength(1);
    expect(payment[0]).toMatchObject({ title: '$30.00 due' });
    expect(done.some(line => line.includes('paid'))).toBe(false);
  });

  it('has no unpaid count when one entry is paid and one unpaid', () => {
    const registration = groupEntriesByShowRegistration([
      entry('e1', PaymentStatus.PAID_BY_CHECK),
      entry('e2', PaymentStatus.PENDING),
    ])[0]!;
    const { items } = buildFormChecklist(registration, { paidDollars: 25, remainingDollars: 30 });
    const payment = items.find(item => item.kind === 'payment');
    expect(payment).toMatchObject({
      title: '$30.00 due',
      detail: 'The payment record shows a balance.',
    });
    expect(payment?.detail).not.toMatch(/unpaid/);
  });

  it('adds no payment item when the balance is zero', () => {
    const { items } = buildFormChecklist(form(PaymentStatus.PAID_BY_CHECK), {
      paidDollars: 50,
      remainingDollars: 0,
    });
    expect(items.filter(item => item.kind === 'payment')).toEqual([]);
  });
});
