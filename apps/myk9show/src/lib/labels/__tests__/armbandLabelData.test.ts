import {
  prepareArmbandLabelItems,
  filterEntries,
  selectArmbandLabelEntries,
} from '../armbandLabelData';
import type { ArmbandLabelEntry } from '../armbandLabelTypes';

const entries: ArmbandLabelEntry[] = [
  {
    id: '1',
    dogId: 'dog-1',
    trialId: 'trial-1',
    classId: 'class-1',
    calendarDay: '2025-06-11',
    armband: 101,
    callName: 'Storm',
    handler: 'Jane Doe',
    trialDate: '6/11/2025',
    isDayOfShow: false,
  },
  {
    id: '2',
    dogId: 'dog-2',
    trialId: 'trial-1',
    classId: 'class-1',
    calendarDay: '2025-06-11',
    armband: 102,
    callName: 'Jewels',
    handler: 'Bob Smith',
    trialDate: '6/11/2025',
    isDayOfShow: false,
  },
  {
    id: '3',
    dogId: 'dog-3',
    trialId: 'trial-2',
    classId: 'class-3',
    calendarDay: '2025-06-12',
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

describe('selectArmbandLabelEntries', () => {
  it('prints one Armband Label per Dog per Show day across eight Class entries', () => {
    const sameDogEntries: ArmbandLabelEntry[] = Array.from({ length: 8 }, (_, index) => ({
      id: `entry-${index + 1}`,
      dogId: 'dog-1',
      trialId: index < 4 ? 'trial-1' : 'trial-2',
      classId: `class-${index + 1}`,
      calendarDay: '2025-06-11',
      armband: 101,
      callName: 'Storm',
      handler: 'Jane Doe',
      trialDate: '6/11/2025',
      isDayOfShow: false,
    }));

    expect(
      selectArmbandLabelEntries(sameDogEntries, {
        kind: 'show',
        showId: 'show-1',
      })
    ).toHaveLength(1);
  });

  it('prints the same Dog once on each Show day while retaining one Show armband number', () => {
    const twoDayEntries: ArmbandLabelEntry[] = [
      {
        ...entries[0],
        id: 'day-1-a',
        dogId: 'dog-1',
        classId: 'class-1',
        calendarDay: '2025-06-11',
        trialDate: '6/11/2025',
      },
      {
        ...entries[0],
        id: 'day-1-b',
        dogId: 'dog-1',
        classId: 'class-2',
        calendarDay: '2025-06-11',
        trialDate: '6/11/2025',
      },
      {
        ...entries[0],
        id: 'day-2',
        dogId: 'dog-1',
        trialId: 'trial-3',
        classId: 'class-3',
        calendarDay: '2025-06-12',
        trialDate: '6/12/2025',
      },
    ];

    const selected = selectArmbandLabelEntries(twoDayEntries, {
      kind: 'show',
      showId: 'show-1',
    });
    expect(selected).toHaveLength(2);
    expect(selected.map(item => item.armband)).toEqual([101, 101]);
  });

  it('keeps separate Dogs handled by the same person', () => {
    const selected = selectArmbandLabelEntries(
      [
        { ...entries[0], dogId: 'dog-1', handler: 'Jane Doe' },
        { ...entries[1], dogId: 'dog-2', handler: 'Jane Doe' },
      ],
      { kind: 'show', showId: 'show-1' }
    );
    expect(selected.map(item => item.dogId)).toEqual(['dog-1', 'dog-2']);
  });

  it('narrows before deduplicating for Trial and Class scope', () => {
    const candidates: ArmbandLabelEntry[] = [
      { ...entries[0], id: 't1-c1', dogId: 'dog-1', trialId: 'trial-1', classId: 'class-1' },
      { ...entries[0], id: 't1-c2', dogId: 'dog-1', trialId: 'trial-1', classId: 'class-2' },
      { ...entries[1], id: 't1-c2-d2', dogId: 'dog-2', trialId: 'trial-1', classId: 'class-2' },
      { ...entries[2], id: 't2-c3', dogId: 'dog-3', trialId: 'trial-2', classId: 'class-3' },
    ];

    expect(
      selectArmbandLabelEntries(candidates, {
        kind: 'trial',
        showId: 'show-1',
        trialId: 'trial-1',
      }).map(item => item.dogId)
    ).toEqual(['dog-1', 'dog-2']);
    expect(
      selectArmbandLabelEntries(candidates, {
        kind: 'class',
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'class-2',
      }).map(item => item.id)
    ).toEqual(['t1-c2', 't1-c2-d2']);
  });
});
