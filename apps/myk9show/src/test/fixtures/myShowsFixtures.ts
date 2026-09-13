/**
 * Raw My Shows rows for the dog-first list's render tests (MYK9-482).
 *
 * Fixtures are built as RAW per-dog-per-class rows and pushed through the real
 * `groupEntriesByOrder` → `groupEntriesByShow` pipeline, so a test can never
 * assert against a hand-shaped group the production grouping would not have
 * produced.
 */

import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { groupEntriesByOrder } from '@/pages/MyEntriesPage/modules/groupEntriesByOrder';
import type { EntryClass, MyEntry } from '@/pages/MyEntriesPage/modules/my-entries-types';

/** The instant every fixture is reckoned against: Saturday 24 Oct 2026, midday Central. */
export const NOW = new Date('2026-10-24T17:00:00Z');

const TRIAL_TZ = 'America/Chicago';

/** Local midnight, the shape `parseShowDate` produces for a DATE column. */
export function day(iso: string): Date {
  const [year, month, date] = iso.split('-').map(Number);
  return new Date(year, month - 1, date);
}

export function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'c1',
    classId: 'class-1',
    name: 'Container Novice A',
    number: '',
    fee: 25,
    status: 'entered',
    entryStatus: EntryStatus.ACCEPTED,
    trialDate: day('2026-10-24'),
    trialNumber: '1',
    trialTimezone: TRIAL_TZ,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
    ...overrides,
  };
}

export function makeRow(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 'e1',
    registrationId: 'r1',
    showId: 'show-heartland',
    showName: 'Heartland Scent Work Classic',
    showDate: day('2026-10-24'),
    showEndDate: day('2026-10-25'),
    location: { venue: 'Expo Hall', city: 'Tulsa', state: 'Oklahoma' },
    dogName: 'Rex',
    dogId: 'dog-rex',
    classes: [],
    dogs: [],
    totalFee: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_BY_CHECK,
    confirmationNumber: 'HSC-1001',
    entryCloseDate: day('2026-11-24'),
    submittedAt: new Date('2026-09-01T00:00:00Z'),
    lastUpdated: new Date('2026-09-02T00:00:00Z'),
    ...overrides,
  };
}

/** The order cards the page's filters hand the list. */
export function toOrders(rows: MyEntry[], now: Date = NOW): MyEntry[] {
  return groupEntriesByOrder(rows, now);
}

/**
 * Heartland: four dogs across three orders, two trials on the same Saturday,
 * one dog in the ring, one at the gate, one with a conflict, one part-scored
 * with a partial refund. Every order is settled, so no money strip renders.
 */
export function heartlandRows(): MyEntry[] {
  return [
    // Juni — in the ring, trial 1.
    makeRow({
      id: 'e-juni',
      registrationId: 'r1',
      dogId: 'dog-juni',
      dogName: 'Juni',
      armband: '102',
      classes: [
        makeClass({
          id: 'c-juni-1',
          classId: 'class-ext-exc',
          name: 'Exterior Excellent',
          // Carries a class number, so the "no #12 suffix on the row" guard
          // has something it could actually have rendered.
          number: '12',
          checkInStatus: 'in-ring',
        }),
      ],
    }),
    // Willow — at the gate in trial 1, scored in trial 2.
    makeRow({
      id: 'e-willow',
      registrationId: 'r1',
      dogId: 'dog-willow',
      dogName: 'Willow',
      armband: '100',
      classes: [
        makeClass({
          id: 'c-willow-1',
          classId: 'class-int-adv',
          name: 'Interior Advanced',
          checkInStatus: 'at-gate',
        }),
        makeClass({
          id: 'c-willow-2',
          classId: 'class-con-nov',
          name: 'Container Novice A',
          trialNumber: '2',
          isScored: true,
          resultStatus: 'qualified',
          finalPlacement: 1,
          resultsReleasedAt: '2026-10-24T15:00:00Z',
          searchTimeSeconds: 38.5,
        }),
      ],
    }),
    // Scout — nothing set yet: one class today, one tomorrow.
    makeRow({
      id: 'e-scout',
      registrationId: 'r2',
      dogId: 'dog-scout',
      dogName: 'Scout',
      armband: '101',
      confirmationNumber: 'HSC-1002',
      classes: [
        makeClass({ id: 'c-scout-1', classId: 'class-con-nov-2', name: 'Container Novice A' }),
        makeClass({
          id: 'c-scout-2',
          classId: 'class-int-nov',
          name: 'Interior Novice B',
          trialNumber: '3',
          trialDate: day('2026-10-25'),
        }),
      ],
    }),
    // Ranger — one preliminary result, one conflict, and a partial refund.
    makeRow({
      id: 'e-ranger',
      registrationId: 'r3',
      dogId: 'dog-ranger',
      dogName: 'Ranger',
      armband: '107',
      confirmationNumber: 'HSC-1003',
      paymentStatus: PaymentStatus.PARTIAL_REFUND,
      refundAmount: 15,
      refundedAt: day('2026-10-08'),
      classes: [
        makeClass({
          id: 'c-ranger-1',
          classId: 'class-int-adv-prelim',
          name: 'Interior Advanced Preliminary',
          paymentStatus: PaymentStatus.PARTIAL_REFUND,
          isScored: true,
          resultStatus: 'qualified',
          searchTimeSeconds: 56.8,
          totalFaults: 2,
        }),
        makeClass({
          id: 'c-ranger-2',
          classId: 'class-ext-exc-2',
          name: 'Exterior Excellent',
          trialNumber: '2',
          paymentStatus: PaymentStatus.PARTIAL_REFUND,
          checkInStatus: 'conflict',
        }),
      ],
    }),
  ];
}
