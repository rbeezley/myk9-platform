import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { buildFormChecklist } from '../formChecklist';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';

const entry = (id: string, dogName: string): EntryManagementEntry => ({
  id,
  registrationId: 'registration-1',
  entryNumber: id,
  armbandNumber: id.slice(-1),
  showId: 'show-1',
  dogId: `dog-${id}`,
  dogName,
  ownerName: 'Alice Martin',
  ownerEmail: 'alice@example.com',
  handlerName: 'Alice Martin',
  classes: [],
  totalFee: 25,
  paidAmount: 25,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: new Date('2026-07-01T13:42:00Z'),
  lastUpdated: new Date('2026-07-01T13:42:00Z'),
  confirmationNumber: 'MYK9-1001',
});

const registration = groupEntriesByShowRegistration([
  entry('e1', 'Poppy'),
  entry('e2', 'Bean'),
])[0]!;
const money = { paidDollars: 50, remainingDollars: 0 };
const checkInItems = (ids: string[]) =>
  buildFormChecklist(registration, money, new Set(ids)).items.filter(i => i.kind === 'check-in');

describe('buildFormChecklist check-in item', () => {
  it('counts the eligible entries, singular and plural', () => {
    expect(checkInItems(['e1', 'e2'])).toMatchObject([
      { title: '2 runs to check in', entryIds: ['e1', 'e2'] },
    ]);
    expect(checkInItems(['e2'])).toMatchObject([{ title: '1 run to check in', entryIds: ['e2'] }]);
  });

  it('has no item when nothing is eligible or the form lacks the entry', () => {
    expect(checkInItems([])).toEqual([]);
    expect(checkInItems(['other-form-entry'])).toEqual([]);
    expect(buildFormChecklist(registration, money).items).toEqual([]);
  });
});
