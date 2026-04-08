import { prepareArmbandLabelItems, filterEntries } from '../armbandLabelData';
import type { ArmbandLabelEntry } from '../armbandLabelTypes';

const entries: ArmbandLabelEntry[] = [
  {
    id: '1',
    armband: 101,
    callName: 'Storm',
    handler: 'Jane Doe',
    trialDate: '6/11/2025',
    isDayOfShow: false,
  },
  {
    id: '2',
    armband: 102,
    callName: 'Jewels',
    handler: 'Bob Smith',
    trialDate: '6/11/2025',
    isDayOfShow: false,
  },
  {
    id: '3',
    armband: 201,
    callName: 'Crash',
    handler: 'Sue Lee',
    trialDate: '6/12/2025',
    isDayOfShow: true,
  },
];

describe('filterEntries', () => {
  it('returns early entries only', () => {
    const result = filterEntries(entries, {
      earlyEntries: true,
      dayOfShowEntries: false,
    });
    expect(result).toHaveLength(2);
    expect(result.every((e) => !e.isDayOfShow)).toBe(true);
  });

  it('returns day-of-show entries only', () => {
    const result = filterEntries(entries, {
      earlyEntries: false,
      dayOfShowEntries: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].callName).toBe('Crash');
  });

  it('returns both when both checked', () => {
    const result = filterEntries(entries, {
      earlyEntries: true,
      dayOfShowEntries: true,
    });
    expect(result).toHaveLength(3);
  });

  it('returns empty when neither checked', () => {
    const result = filterEntries(entries, {
      earlyEntries: false,
      dayOfShowEntries: false,
    });
    expect(result).toHaveLength(0);
  });

  it('filters to specific armband number', () => {
    const result = filterEntries(entries, {
      earlyEntries: true,
      dayOfShowEntries: true,
      specificArmband: 102,
    });
    expect(result).toHaveLength(1);
    expect(result[0].callName).toBe('Jewels');
  });
});

describe('prepareArmbandLabelItems', () => {
  it('sorts by armband number ascending', () => {
    const items = prepareArmbandLabelItems(entries);
    expect(items[0].armband).toBe(101);
    expect(items[1].armband).toBe(102);
    expect(items[2].armband).toBe(201);
  });
});
