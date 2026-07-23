import { describe, it, expect } from 'vitest';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry, EntryClass } from './my-entries-types';

/**
 * Builds a raw per-class-per-dog row — the shape `getUserEntries` produces
 * one of, before any grouping. `dogs` is irrelevant to the raw-row input
 * (groupEntriesByOrder derives it fresh from the top-level dog fields), so
 * it's left empty here.
 */
function makeRow(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Test Show',
    showDate: new Date('2026-09-01'),
    location: { venue: 'Test Venue', city: 'Denver', state: 'CO' },
    dogName: 'Rex',
    dogId: 'd1',
    classes: [],
    dogs: [],
    totalFee: 50,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-08-01'),
    lastUpdated: new Date('2026-08-15'),
    ...overrides,
  };
}

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'c1',
    name: 'Container Search',
    number: '101',
    fee: 25,
    status: 'entered',
    ...overrides,
  };
}

describe('groupEntriesByOrder — dog-level merge (unchanged from groupEntriesByShowAndDog)', () => {
  it('returns a single entry unchanged when there is only one class', () => {
    const row = makeRow({ classes: [makeClass()] });
    const result = groupEntriesByOrder([row]);
    expect(result).toHaveLength(1);
    expect(result[0].classes).toHaveLength(1);
    expect(result[0].dogs).toHaveLength(1);
  });

  it('merges two class rows for the same dog and registration into one card', () => {
    const classA = makeClass({ id: 'c1', name: 'Container Search', fee: 25 });
    const classB = makeClass({ id: 'c2', name: 'Exterior Search', fee: 30 });
    const rowA = makeRow({ id: 'c1', registrationId: 'r1', dogId: 'd1', classes: [classA] });
    const rowB = makeRow({ id: 'c2', registrationId: 'r1', dogId: 'd1', classes: [classB] });

    const result = groupEntriesByOrder([rowA, rowB]);

    expect(result).toHaveLength(1);
    expect(result[0].classes).toHaveLength(2);
    expect(result[0].totalFee).toBe(55);
    expect(result[0].dogs).toHaveLength(1);
  });

  it('keeps separate cards for different dogs on different registrations at the same show', () => {
    const rowA = makeRow({
      id: 'e1',
      registrationId: 'r1',
      dogId: 'd1',
      dogName: 'Rex',
      classes: [makeClass({ id: 'c1' })],
    });
    const rowB = makeRow({
      id: 'e2',
      registrationId: 'r2',
      dogId: 'd2',
      dogName: 'Ziva',
      classes: [makeClass({ id: 'c2' })],
    });

    expect(groupEntriesByOrder([rowA, rowB])).toHaveLength(2);
  });

  it('keeps separate cards for the same dog at different shows', () => {
    const rowA = makeRow({
      id: 'e1',
      registrationId: 'r1',
      dogId: 'd1',
      showId: 's1',
      classes: [makeClass({ id: 'c1' })],
    });
    const rowB = makeRow({
      id: 'e2',
      registrationId: 'r2',
      dogId: 'd1',
      showId: 's2',
      classes: [makeClass({ id: 'c2' })],
    });

    expect(groupEntriesByOrder([rowA, rowB])).toHaveLength(2);
  });

  it('returns an empty array for empty input', () => {
    expect(groupEntriesByOrder([])).toEqual([]);
  });

  it('uses the highest-priority status when merging — ACCEPTED beats PENDING seed', () => {
    const seed = makeRow({ entryStatus: EntryStatus.PENDING, classes: [makeClass({ id: 'c1' })] });
    const second = makeRow({
      entryStatus: EntryStatus.ACCEPTED,
      classes: [makeClass({ id: 'c2' })],
    });
    const result = groupEntriesByOrder([seed, second]);
    expect(result[0].entryStatus).toBe(EntryStatus.ACCEPTED);
  });

  it('keeps an armband from a later row when the seed row has none', () => {
    const seed = makeRow({ armband: undefined, classes: [makeClass({ id: 'c1' })] });
    const second = makeRow({ armband: '142', classes: [makeClass({ id: 'c2' })] });

    const result = groupEntriesByOrder([seed, second]);

    expect(result).toHaveLength(1);
    expect(result[0].armband).toBe('142');
  });
});

describe('groupEntriesByOrder — one card per online order (D1)', () => {
  it('merges a multi-dog single registration into one card listing every dog', () => {
    const rexRow = makeRow({
      id: 'e-rex',
      registrationId: 'reg-1',
      dogId: 'd1',
      dogName: 'Rex',
      armband: '101',
      classes: [makeClass({ id: 'c-rex', fee: 25 })],
    });
    const zivaRow = makeRow({
      id: 'e-ziva',
      registrationId: 'reg-1',
      dogId: 'd2',
      dogName: 'Ziva',
      armband: '102',
      classes: [makeClass({ id: 'c-ziva', fee: 30 })],
    });

    const result = groupEntriesByOrder([rexRow, zivaRow]);

    expect(result).toHaveLength(1);
    expect(result[0].dogs).toHaveLength(2);
    expect(result[0].dogs.map(d => d.dogName)).toEqual(['Rex', 'Ziva']);
    expect(result[0].dogs.map(d => d.armband)).toEqual(['101', '102']);
  });

  it('conserves total class count across the merge — nothing lost or duplicated', () => {
    const rexRow = makeRow({
      id: 'e-rex',
      registrationId: 'reg-1',
      dogId: 'd1',
      classes: [makeClass({ id: 'c-rex-1' }), makeClass({ id: 'c-rex-2' })],
    });
    const zivaRow = makeRow({
      id: 'e-ziva',
      registrationId: 'reg-1',
      dogId: 'd2',
      classes: [makeClass({ id: 'c-ziva-1' })],
    });

    const result = groupEntriesByOrder([rexRow, zivaRow]);

    expect(result).toHaveLength(1);
    expect(result[0].classes).toHaveLength(3);
    expect(result[0].classes.map(c => c.id).sort()).toEqual(
      ['c-rex-1', 'c-rex-2', 'c-ziva-1'].sort()
    );
  });

  it('renders one card per dog for entries with a null registrationId (secretary/mail-in fallback)', () => {
    const rexRow = makeRow({
      id: 'e-rex',
      registrationId: null,
      dogId: 'd1',
      dogName: 'Rex',
      classes: [makeClass({ id: 'c-rex' })],
    });
    const zivaRow = makeRow({
      id: 'e-ziva',
      registrationId: null,
      dogId: 'd2',
      dogName: 'Ziva',
      classes: [makeClass({ id: 'c-ziva' })],
    });

    const result = groupEntriesByOrder([rexRow, zivaRow]);

    expect(result).toHaveLength(2);
    expect(result.map(e => e.dogName).sort()).toEqual(['Rex', 'Ziva']);
  });

  it('still merges multiple classes for the same dog when registrationId is null (show+dog fallback)', () => {
    const rowA = makeRow({
      id: 'e-rex-1',
      registrationId: null,
      dogId: 'd1',
      classes: [makeClass({ id: 'c1' })],
    });
    const rowB = makeRow({
      id: 'e-rex-2',
      registrationId: null,
      dogId: 'd1',
      classes: [makeClass({ id: 'c2' })],
    });

    const result = groupEntriesByOrder([rowA, rowB]);

    expect(result).toHaveLength(1);
    expect(result[0].classes).toHaveLength(2);
  });

  it('a null-registration dog never merges into a real registration order sharing the same show', () => {
    const onlineRow = makeRow({
      id: 'e-online',
      registrationId: 'reg-1',
      dogId: 'd1',
      classes: [makeClass({ id: 'c-online' })],
    });
    const mailInRow = makeRow({
      id: 'e-mailin',
      registrationId: null,
      dogId: 'd2',
      classes: [makeClass({ id: 'c-mailin' })],
    });

    const result = groupEntriesByOrder([onlineRow, mailInRow]);

    expect(result).toHaveLength(2);
  });

  it('derives order-level payment status/total from the order (paid-fee sum across dogs)', () => {
    const rexRow = makeRow({
      id: 'e-rex',
      registrationId: 'reg-1',
      dogId: 'd1',
      paymentStatus: PaymentStatus.PAID_ONLINE,
      classes: [makeClass({ id: 'c-rex', fee: 40 })],
    });
    const zivaRow = makeRow({
      id: 'e-ziva',
      registrationId: 'reg-1',
      dogId: 'd2',
      paymentStatus: PaymentStatus.PAID_ONLINE,
      classes: [makeClass({ id: 'c-ziva', fee: 35 })],
    });

    const result = groupEntriesByOrder([rexRow, zivaRow]);

    expect(result[0].paymentStatus).toBe(PaymentStatus.PAID_ONLINE);
    expect(result[0].totalFee).toBe(75);
  });

  it('order entryStatus is dominant across every dog on the order, not just the seed dog', () => {
    const rexRow = makeRow({
      id: 'e-rex',
      registrationId: 'reg-1',
      dogId: 'd1',
      dogName: 'Rex',
      entryStatus: EntryStatus.PENDING,
      classes: [makeClass({ id: 'c-rex' })],
    });
    const zivaRow = makeRow({
      id: 'e-ziva',
      registrationId: 'reg-1',
      dogId: 'd2',
      dogName: 'Ziva',
      entryStatus: EntryStatus.ACCEPTED,
      classes: [makeClass({ id: 'c-ziva' })],
    });

    const result = groupEntriesByOrder([rexRow, zivaRow]);

    expect(result[0].entryStatus).toBe(EntryStatus.ACCEPTED);
    // Each dog keeps its own status for per-dog rendering.
    expect(result[0].dogs.find(d => d.dogName === 'Rex')?.entryStatus).toBe(EntryStatus.PENDING);
    expect(result[0].dogs.find(d => d.dogName === 'Ziva')?.entryStatus).toBe(EntryStatus.ACCEPTED);
  });
});
