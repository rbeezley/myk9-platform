import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnrollmentCard } from '../EnrollmentCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';

vi.mock('@/components/entries/EmailStatusIcon', () => ({ EmailStatusIcon: () => null }));

function entry(id: string, dogName: string, cls: Partial<EntryClass>): EntryManagementEntry {
  return {
    id,
    registrationId: 'reg-1',
    entryNumber: id,
    showId: 'show-1',
    dogId: dogName,
    dogName,
    ownerName: 'Jane Exhibitor',
    ownerEmail: 'jane@test.com',
    handlerName: 'Casey Handler',
    classes: [{ id, name: `class ${id}`, number: '1', fee: 10, status: 'entered', ...cls }],
    totalFee: 10,
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
  } as EntryManagementEntry;
}

function group(entries: EntryManagementEntry[]): EnrollmentGroup & { exhibitorName: string } {
  return {
    groupKey: 'g',
    enrollmentId: 'enroll-1',
    confirmationNumber: null,
    handlerName: 'Casey Handler',
    exhibitorName: 'Jane Exhibitor',
    paymentStatus: PaymentStatus.PENDING,
    totalAmount: 100,
    totalAmountUnit: 'dollars',
    paidAmount: 0,
    paymentReference: null,
    paymentMethod: null,
    rawPaymentStatus: null,
    refundAmount: null,
    refundNotes: null,
    refundedAt: null,
    entries,
  } as unknown as EnrollmentGroup & { exhibitorName: string };
}

const props = {
  onStatusChange: vi.fn(),
  onCheckInStatusChange: vi.fn(),
  onOpenArmbandDialog: vi.fn(),
  onEntryRemoved: vi.fn(),
  onBulkStatusChange: vi.fn(),
  paymentLedger: {
    record: vi.fn().mockResolvedValue(true),
    markPaidOnline: vi.fn().mockResolvedValue(true),
    todayInShowZone: '2026-09-17',
  },
};

describe('EnrollmentCard ordering and labels (MYK9-1592)', () => {
  it("lists a dog's entries by trial date, trial number, element, level; unknowns last", () => {
    const entries = [
      entry('e-unknown', 'Willow', { trialDate: '2026-10-30', trialNumber: '1' }),
      entry('e-nov5', 'Willow', {
        trialDate: '2026-11-05',
        trialNumber: 'Trial 7',
        element: 'Container',
        level: 'Novice',
      }),
      entry('e-t10', 'Willow', {
        trialDate: '2026-11-03',
        trialNumber: '10',
        element: 'Container',
        level: 'Novice',
      }),
      entry('e-buried', 'Willow', {
        trialDate: '2026-10-30',
        trialNumber: 'Trial 1',
        element: 'Buried',
        level: 'Novice',
      }),
      entry('e-int-adv', 'Willow', {
        trialDate: '2026-10-30',
        trialNumber: 'Trial 1',
        element: 'Interior',
        level: 'Advanced',
      }),
      entry('e-int-nov', 'Willow', {
        trialDate: '2026-10-30',
        trialNumber: 'Trial 1',
        element: 'Interior',
        level: 'Novice',
      }),
      entry('e-t5', 'Willow', {
        trialDate: '2026-11-03',
        trialNumber: 'Trial 5',
        element: 'Container',
        level: 'Novice',
      }),
      entry('e-nodate', 'Willow', { element: 'Container', level: 'Novice' }),
    ];
    render(<EnrollmentCard {...props} group={group(entries)} />);

    const text = document.body.textContent ?? '';
    const order = entries.map(e => text.indexOf(`class ${e.id}:`));
    expect(order.every(i => i >= 0)).toBe(true);
    const ranked = entries
      .map((e, i) => ({ id: e.id, at: order[i]! }))
      .sort((a, b) => a.at - b.at)
      .map(x => x.id);
    expect(ranked).toEqual([
      'e-int-nov',
      'e-int-adv',
      'e-buried',
      'e-unknown',
      'e-t5',
      'e-t10',
      'e-nov5',
      'e-nodate',
    ]);
  });

  it('orders a UKC show: Vehicle after Exterior, Superior before Master before Elite', () => {
    const at = { trialDate: '2026-10-30', trialNumber: '1' };
    const entries = [
      entry('u-elite', 'Willow', { ...at, element: 'Container', level: 'Elite' }),
      entry('u-master', 'Willow', { ...at, element: 'Container', level: 'Master' }),
      entry('u-vehicle', 'Willow', { ...at, element: 'Vehicle', level: 'Novice' }),
      entry('u-superior', 'Willow', { ...at, element: 'Container', level: 'Superior' }),
      entry('u-exterior', 'Willow', { ...at, element: 'Exterior', level: 'Novice' }),
    ];
    render(<EnrollmentCard {...props} group={group(entries)} />);

    const text = document.body.textContent ?? '';
    const ranked = entries
      .map(e => ({ id: e.id, at: text.indexOf(`class ${e.id}:`) }))
      .sort((a, b) => a.at - b.at)
      .map(x => x.id);
    expect(ranked).toEqual(['u-superior', 'u-master', 'u-elite', 'u-exterior', 'u-vehicle']);
  });

  it('names the exhibitor under Entries and Payment, and the handler stays on the entry line', () => {
    render(
      <EnrollmentCard
        {...props}
        group={group([entry('e1', 'Willow', { trialDate: '2026-10-30' })])}
      />
    );
    const entriesHeading = screen.getByRole('heading', { name: 'Entries' });
    const paymentHeading = screen.getByRole('heading', { name: 'Payment' });
    expect(entriesHeading.nextElementSibling?.textContent).toContain('Jane Exhibitor');
    expect(paymentHeading.nextElementSibling?.textContent).toContain('Jane Exhibitor');
    expect(entriesHeading.nextElementSibling?.textContent).not.toContain('Casey Handler');
    expect(paymentHeading.nextElementSibling?.textContent).not.toContain('Casey Handler');
    expect(screen.getByText('Handler: Casey Handler')).toBeTruthy();
  });
});
