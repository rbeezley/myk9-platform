import { describe, expect, it } from 'vitest';

import {
  UNASSIGNED_JUDGE,
  cockpitFilterOptions,
  filterFactsOf,
  hasActiveCockpitFilters,
  matchesCockpitClassFilters,
  parseCockpitList,
  pruneCockpitFilters,
  serializeCockpitList,
} from './cockpitClassFilters';
import { filtersUpdate } from './cockpitFocusRules';
import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import type { SecretaryCockpitClass, SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

const base = {
  classOrder: 0,
  lifecycle: 'not-started' as const,
  entryCount: 4,
  scoredCount: 0,
  actions: [],
  paperwork: [],
  entryRows: [],
  attention: [],
};

function cls(id: string, extra: Partial<SecretaryCockpitClass> = {}): SecretaryCockpitClass {
  return { ...base, id, trialId: 't1', name: id, ...extra };
}

const classes: SecretaryCockpitClass[] = [
  cls('a', {
    element: 'Container',
    level: 'Novice',
    judgeId: 'j1',
    judgeName: 'Pat Lee',
    operationalArea: { kind: 'ring', labels: ['Ring 1'] },
    lifecycle: 'in-progress',
  }),
  cls('b', {
    element: 'Interior',
    level: 'Novice',
    classOrder: 1,
    judgeId: 'j2',
    judgeName: 'Sam Roe',
    operationalArea: { kind: 'ring', labels: ['Ring 2', 'Ring 1'] },
    lifecycle: 'complete',
  }),
  cls('c', {
    element: 'Interior',
    level: 'Advanced',
    classOrder: 2,
    lifecycle: 'cancelled',
  }),
  cls('d', {
    trialId: 't2',
    classOrder: 3,
    element: 'Exterior',
    level: 'Advanced',
    judgeId: 'j3',
    judgeName: 'Al Poe',
  }),
];

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  printTrackingInUse: true,
  checklistInUse: true,
  trials: [
    { id: 't1', date: '2026-07-20', number: '1', order: 0 },
    { id: 't2', date: '2026-07-21', number: '2', order: 1 },
  ],
  classes,
};

const shown = (filters: Parameters<typeof buildSecretaryCockpitModel>[1]) =>
  buildSecretaryCockpitModel(snapshot, filters).trialGroups.flatMap(group =>
    group.classes.map(row => row.id)
  );

describe('comma-list params', () => {
  it('sorts, de-duplicates and drops empties', () => {
    expect(parseCockpitList('b,a,,b')).toEqual(['a', 'b']);
    expect(parseCockpitList(null)).toEqual([]);
    expect(serializeCockpitList([])).toBeNull();
    expect(serializeCockpitList(['b', 'a', 'a'])).toBe('a,b');
  });

  it('round-trips a value that holds a comma or a percent sign', () => {
    const values = ['Lee, Pat', '100%'];
    expect(parseCockpitList(serializeCockpitList(values))).toEqual(['100%', 'Lee, Pat']);
  });
});

describe('matchesCockpitClassFilters', () => {
  const facts = (id: string) => filterFactsOf(classes.find(item => item.id === id)!);

  it('reads the lifecycle statuses', () => {
    for (const [status, id] of [
      ['not-started', 'd'],
      ['in-progress', 'a'],
      ['complete', 'b'],
      ['cancelled', 'c'],
    ] as const) {
      expect(matchesCockpitClassFilters(facts(id), { statuses: [status] }, 0)).toBe(true);
      expect(matchesCockpitClassFilters(facts('a'), { statuses: [status] }, 0)).toBe(
        status === 'in-progress'
      );
    }
  });

  it('is OR within a group and AND across groups', () => {
    expect(matchesCockpitClassFilters(facts('a'), { levels: ['Novice', 'Master'] }, 0)).toBe(true);
    expect(
      matchesCockpitClassFilters(facts('a'), { levels: ['Novice'], elements: ['Interior'] }, 0)
    ).toBe(false);
    expect(
      matchesCockpitClassFilters(facts('b'), { levels: ['Novice'], elements: ['Interior'] }, 0)
    ).toBe(true);
    expect(matchesCockpitClassFilters(facts('a'), { statuses: ['needs-attention'] }, 2)).toBe(true);
  });

  it('matches a class with several areas on any of them, and a judgeless class as Unassigned', () => {
    expect(matchesCockpitClassFilters(facts('b'), { areas: ['Ring 2'] }, 0)).toBe(true);
    expect(matchesCockpitClassFilters(facts('b'), { areas: ['Ring 1'] }, 0)).toBe(true);
    expect(matchesCockpitClassFilters(facts('c'), { judges: [UNASSIGNED_JUDGE] }, 0)).toBe(true);
    expect(matchesCockpitClassFilters(facts('a'), { judges: [UNASSIGNED_JUDGE] }, 0)).toBe(false);
  });

  it('falls back to the judge name when there is no id', () => {
    const named = filterFactsOf(cls('n', { judgeName: 'Kim Wu' }));
    expect(matchesCockpitClassFilters(named, { judges: ['Kim Wu'] }, 0)).toBe(true);
  });
});

describe('cockpitFilterOptions', () => {
  it('lists each group from the snapshot, judges scoped to the selected day', () => {
    const all = cockpitFilterOptions(snapshot, []);
    expect(all.judges.map(option => option.label)).toEqual([
      'Al Poe',
      'Pat Lee',
      'Sam Roe',
      'Unassigned',
    ]);
    expect(all.areas.map(option => option.value)).toEqual(['Ring 1', 'Ring 2']);
    expect(all.elements.map(option => option.value)).toEqual(['Container', 'Interior', 'Exterior']);
    expect(all.levels.map(option => option.value)).toEqual(['Novice', 'Advanced']);
    const day2 = cockpitFilterOptions(snapshot, ['2026-07-21']);
    expect(day2.judges).toEqual([]);
  });

  it('hides a group that would offer fewer than two options', () => {
    const one = { ...snapshot, classes: [classes[0]!, { ...classes[0]!, id: 'a2' }] };
    expect(cockpitFilterOptions(one, [])).toEqual({
      judges: [],
      areas: [],
      elements: [],
      levels: [],
    });
  });

  it('offers Unassigned only when a class has no judge', () => {
    const judged = { ...snapshot, classes: classes.filter(item => item.judgeId) };
    expect(cockpitFilterOptions(judged, []).judges.map(option => option.value)).toEqual([
      'j3',
      'j1',
      'j2',
    ]);
  });
});

describe('pruneCockpitFilters', () => {
  it('drops ticks the show does not offer and keeps the rest', () => {
    const state = { judges: ['j1', 'gone'], areas: ['Ring 9'], levels: ['Novice'] };
    expect(pruneCockpitFilters(snapshot, state)).toEqual({
      judges: ['j1'],
      areas: [],
      levels: ['Novice'],
    });
  });

  it('returns the same object when nothing changes', () => {
    const state = { levels: ['Novice'] };
    expect(pruneCockpitFilters(snapshot, state)).toBe(state);
  });
});

describe('the schedule and its counts share one predicate', () => {
  it('filters rows by each group', () => {
    expect(shown({ statuses: ['complete', 'cancelled'] })).toEqual(['b', 'c']);
    expect(shown({ judges: ['j1', 'j3'] })).toEqual(['a', 'd']);
    expect(shown({ areas: ['Ring 2'] })).toEqual(['b']);
    expect(shown({ elements: ['Interior'] })).toEqual(['b', 'c']);
    expect(shown({ levels: ['Advanced'] })).toEqual(['c', 'd']);
    expect(shown({ elements: ['Interior'], levels: ['Advanced'] })).toEqual(['c']);
    expect(shown({})).toEqual(['a', 'b', 'c', 'd']);
  });

  it('counts each option as the rows the schedule shows for it', () => {
    const model = buildSecretaryCockpitModel(snapshot, {});
    const options = cockpitFilterOptions(snapshot, model.day.days);
    for (const [group, key] of [
      ['judges', 'judges'],
      ['areas', 'areas'],
      ['elements', 'elements'],
      ['levels', 'levels'],
    ] as const) {
      for (const option of options[group]) {
        const count = model.daySchedule.filter(row =>
          matchesCockpitClassFilters(row.filterFacts, { [key]: [option.value] }, row.attentionCount)
        ).length;
        expect(count).toBe(shown({ [key]: [option.value] }).length);
      }
    }
  });

  it('keeps an empty trial listed only while nothing is filtered', () => {
    expect(hasActiveCockpitFilters({})).toBe(false);
    expect(hasActiveCockpitFilters({ levels: [] })).toBe(false);
    expect(hasActiveCockpitFilters({ areas: ['Ring 1'] })).toBe(true);
    const trials = (filters: Parameters<typeof shown>[0]) =>
      buildSecretaryCockpitModel(snapshot, filters).trialGroups.map(group => group.trialId);
    expect(trials({})).toEqual(['t1', 't2']);
    expect(trials({ areas: ['Ring 1'] })).toEqual(['t1']);
  });
});

describe('filtersUpdate with any group', () => {
  const model = buildSecretaryCockpitModel(snapshot, { focusedClassId: 'a' });

  it('lets the picked class go when a judge, area, element or level change hides it', () => {
    for (const update of [
      { judges: ['j2'] },
      { areas: ['Ring 2'] },
      { elements: ['Interior'] },
      { levels: ['Advanced'] },
    ]) {
      expect(filtersUpdate(model, 'a', {}, update)).toEqual({
        ...update,
        focusedClassId: undefined,
        anchor: undefined,
      });
    }
  });

  it('weighs the update against the filters already ticked', () => {
    expect(
      filtersUpdate(model, 'a', { levels: ['Advanced'] }, { elements: ['Container'] })
    ).toEqual({
      elements: ['Container'],
      focusedClassId: undefined,
      anchor: undefined,
    });
    expect(filtersUpdate(model, 'a', { levels: ['Novice'] }, { elements: ['Container'] })).toEqual({
      elements: ['Container'],
    });
  });
});
