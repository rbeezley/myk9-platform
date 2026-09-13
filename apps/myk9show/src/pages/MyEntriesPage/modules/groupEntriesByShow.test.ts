import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import { groupEntriesByShow, indexOrdersById } from './groupEntriesByShow';
import type { EntryClass, MyEntry } from './my-entries-types';

const NOW = new Date('2026-10-01T12:00:00Z');

/** A raw per-class-per-dog row, the shape `getUserEntries` emits. */
function makeRow(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Heartland Classic',
    showDate: new Date('2026-10-24T00:00:00'),
    showEndDate: new Date('2026-10-25T00:00:00'),
    location: { venue: 'Expo Hall', city: 'Denver', state: 'CO' },
    dogName: 'Rex',
    dogId: 'd1',
    classes: [],
    dogs: [],
    totalFee: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-09-01'),
    lastUpdated: new Date('2026-09-02'),
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
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
    ...overrides,
  };
}

function group(rows: MyEntry[]) {
  return groupEntriesByShow(groupEntriesByOrder(rows, NOW));
}

describe('groupEntriesByShow — one group per show', () => {
  it('renders a show entered through three orders exactly once, with every dog', () => {
    const rows = [
      makeRow({ id: 'e1', registrationId: 'r1', dogId: 'd1', dogName: 'Rex', armband: '10' }),
      makeRow({ id: 'e2', registrationId: 'r2', dogId: 'd2', dogName: 'Scout', armband: '11' }),
      makeRow({ id: 'e3', registrationId: 'r3', dogId: 'd3', dogName: 'Juno', armband: '12' }),
      makeRow({ id: 'e4', registrationId: 'r3', dogId: 'd4', dogName: 'Pip', armband: '13' }),
    ].map((row, index) => ({ ...row, classes: [makeClass({ id: `c${index + 1}` })] }));

    const groups = group(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0].orders).toHaveLength(3);
    expect(groups[0].dogs.map(dog => dog.dogName)).toEqual(['Rex', 'Scout', 'Juno', 'Pip']);
  });

  it('conserves the class set across the regrouping', () => {
    const rows = [
      makeRow({ id: 'e1', registrationId: 'r1', classes: [makeClass({ id: 'c1' })] }),
      makeRow({ id: 'e2', registrationId: 'r1', classes: [makeClass({ id: 'c2' })] }),
      makeRow({
        id: 'e3',
        registrationId: 'r2',
        dogId: 'd2',
        dogName: 'Scout',
        classes: [makeClass({ id: 'c3' })],
      }),
    ];

    const orders = groupEntriesByOrder(rows, NOW);
    const before = orders.flatMap(order => order.classes.map(cls => cls.id)).sort();
    const after = groupEntriesByShow(orders)
      .flatMap(showGroup => showGroup.dogs)
      .flatMap(dog => dog.classes.map(cls => cls.id))
      .sort();

    expect(after).toEqual(before);
    expect(after).toEqual(['c1', 'c2', 'c3']);
  });

  it('joins a null-registration row to its show instead of splitting it out', () => {
    const rows = [
      makeRow({ id: 'e1', registrationId: 'r1', classes: [makeClass({ id: 'c1' })] }),
      makeRow({
        id: 'e2',
        registrationId: null,
        dogId: 'd2',
        dogName: 'Scout',
        confirmationNumber: undefined,
        classes: [makeClass({ id: 'c2' })],
      }),
    ];

    const groups = group(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0].orders).toHaveLength(2);
    expect(groups[0].dogs.map(dog => dog.dogName)).toEqual(['Rex', 'Scout']);
    const scout = groups[0].dogs.find(dog => dog.dogName === 'Scout');
    expect(scout?.classes[0].registrationId).toBeNull();
  });

  it('keeps two shows apart', () => {
    const rows = [
      makeRow({ id: 'e1', classes: [makeClass({ id: 'c1' })] }),
      makeRow({
        id: 'e2',
        registrationId: 'r2',
        showId: 's2',
        showName: 'Fall Sniff',
        classes: [makeClass({ id: 'c2' })],
      }),
    ];

    expect(group(rows).map(showGroup => showGroup.showName)).toEqual([
      'Heartland Classic',
      'Fall Sniff',
    ]);
  });
});

describe('groupEntriesByShow — dog merge and order identity', () => {
  it('merges one dog across two orders into a single card carrying both order ids', () => {
    const rows = [
      makeRow({
        id: 'e1',
        registrationId: 'r1',
        confirmationNumber: 'AAA',
        classes: [makeClass({ id: 'c1', name: 'Containers' })],
      }),
      makeRow({
        id: 'e2',
        registrationId: 'r2',
        confirmationNumber: 'BBB',
        classes: [makeClass({ id: 'c2', name: 'Buried' })],
      }),
    ];

    const [showGroup] = group(rows);

    expect(showGroup.dogs).toHaveLength(1);
    const dog = showGroup.dogs[0];
    expect(dog.classes.map(cls => cls.name)).toEqual(['Containers', 'Buried']);
    expect(dog.orderIds).toEqual(['e1', 'e2']);
    expect(dog.classes.map(cls => cls.confirmationNumber)).toEqual(['AAA', 'BBB']);
    expect(dog.classes.map(cls => cls.registrationId)).toEqual(['r1', 'r2']);
    expect(dog.classes.map(cls => cls.orderId)).toEqual(['e1', 'e2']);
  });

  it('keeps distinct trial numbers for two trials on the same day', () => {
    const trialDate = new Date('2026-10-24T00:00:00');
    const rows = [
      makeRow({
        id: 'e1',
        classes: [makeClass({ id: 'c1', trialDate, trialNumber: '1' })],
      }),
      makeRow({
        id: 'e2',
        classes: [makeClass({ id: 'c2', trialDate, trialNumber: '2' })],
      }),
    ];

    const [showGroup] = group(rows);
    const rowsOut = showGroup.dogs[0].classes;

    expect(rowsOut.map(cls => cls.trialNumber)).toEqual(['1', '2']);
    expect(rowsOut.every(cls => cls.trialDate?.getTime() === trialDate.getTime())).toBe(true);
  });

  it('folds the dominant status when a dog appears on two orders', () => {
    const rows = [
      makeRow({
        id: 'e1',
        registrationId: 'r1',
        entryStatus: EntryStatus.PENDING,
        classes: [makeClass({ id: 'c1', entryStatus: EntryStatus.PENDING })],
      }),
      makeRow({
        id: 'e2',
        registrationId: 'r2',
        entryStatus: EntryStatus.ACCEPTED,
        classes: [makeClass({ id: 'c2', entryStatus: EntryStatus.ACCEPTED })],
      }),
    ];

    expect(group(rows)[0].dogs[0].entryStatus).toBe(EntryStatus.ACCEPTED);
  });
});

describe('groupEntriesByShow — dog ordering', () => {
  it('orders by armband numerically and puts unassigned dogs last by name', () => {
    const rows = [
      makeRow({ id: 'e1', dogId: 'd1', dogName: 'Rex', armband: '10' }),
      makeRow({ id: 'e2', dogId: 'd2', dogName: 'Zeke' }),
      makeRow({ id: 'e3', dogId: 'd3', dogName: 'Scout', armband: '9' }),
      makeRow({ id: 'e4', dogId: 'd4', dogName: 'Ada' }),
    ].map((row, index) => ({
      ...row,
      registrationId: `r${index + 1}`,
      classes: [makeClass({ id: `c${index + 1}` })],
    }));

    expect(group(rows)[0].dogs.map(dog => dog.dogName)).toEqual(['Scout', 'Rex', 'Ada', 'Zeke']);
  });
});

describe('groupEntriesByShow — show facts', () => {
  it('takes the earliest entry close date across the orders and keeps the cancelled marker', () => {
    const rows = [
      makeRow({
        id: 'e1',
        registrationId: 'r1',
        entryCloseDate: new Date('2026-10-15T00:00:00'),
        classes: [makeClass({ id: 'c1' })],
      }),
      makeRow({
        id: 'e2',
        registrationId: 'r2',
        isShowCancelled: true,
        entryCloseDate: new Date('2026-10-10T00:00:00'),
        classes: [makeClass({ id: 'c2' })],
      }),
    ];

    const [showGroup] = group(rows);

    expect(showGroup.entryCloseDate?.getDate()).toBe(10);
    expect(showGroup.isShowCancelled).toBe(true);
  });

  it('indexes the group orders by id', () => {
    const rows = [
      makeRow({ id: 'e1', registrationId: 'r1', classes: [makeClass({ id: 'c1' })] }),
      makeRow({
        id: 'e2',
        registrationId: 'r2',
        dogId: 'd2',
        dogName: 'Scout',
        classes: [makeClass({ id: 'c2' })],
      }),
    ];

    const byId = indexOrdersById(group(rows)[0]);

    expect(Object.keys(byId).sort()).toEqual(['e1', 'e2']);
    expect(byId['e1'].registrationId).toBe('r1');
  });
});

describe('groupEntriesByShow — partial replication (Codex, PR #2198)', () => {
  it('merges a degraded order (no showId yet) into the resolved group for the same show', () => {
    const groups = group([
      makeRow({ id: 'e1', registrationId: 'r1', showId: 's1', classes: [makeClass({ id: 'c1' })] }),
      makeRow({
        id: 'e2',
        registrationId: 'r2',
        showId: '',
        dogId: 'd2',
        dogName: 'Bo',
        classes: [makeClass({ id: 'c2' })],
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].showId).toBe('s1');
    expect(groups[0].dogs.map(dog => dog.dogName)).toEqual(['Bo', 'Rex']);
  });

  it('adopts a degraded group when the resolved order arrives second, keeping order', () => {
    const groups = group([
      makeRow({ id: 'e1', registrationId: 'r1', showId: '', classes: [makeClass({ id: 'c1' })] }),
      makeRow({
        id: 'e3',
        registrationId: 'r3',
        showId: 's2',
        showName: 'Other Trial',
        dogId: 'd3',
        dogName: 'Cy',
        classes: [makeClass({ id: 'c3' })],
      }),
      makeRow({
        id: 'e2',
        registrationId: 'r2',
        showId: 's1',
        dogId: 'd2',
        dogName: 'Bo',
        classes: [makeClass({ id: 'c2' })],
      }),
    ]);

    expect(groups.map(g => g.showId)).toEqual(['s1', 's2']);
    expect(groups[0].key).toBe('s1');
    expect(groups[0].orders).toHaveLength(2);
  });
});
