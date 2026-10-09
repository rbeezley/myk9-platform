import { describe, expect, it } from 'vitest';
import { buildHighCombinedDivision } from '../highCombinedDivision';
import type { ReportEntry } from '../types';
import type { HighInTrialClassLike } from '../highInTrial';

const elements = ['Container', 'Interior', 'Handler Discrimination'];
const classes = elements.map(element => ({ id: element, element, level: 'Novice' }));

function team(dogId: string, faults = 0, time = 30): ReportEntry[] {
  return elements.map(element => ({
    id: `${dogId}-${element}`,
    dogId,
    armband: dogId,
    runOrder: null,
    callName: dogId,
    breed: 'Border Collie',
    handler: 'Alex Kim',
    registrationNumber: 'SW123',
    checkInStatus: 'checked-in',
    section: null,
    isScored: true,
    resultText: 'qualified',
    searchTimeSeconds: time,
    totalFaults: faults,
    finalPlacement: null,
    entryStatus: 'confirmed',
    classId: element,
    classElement: element,
    classLevel: 'Novice',
  }));
}
function build(entries: ReportEntry[], offered: HighInTrialClassLike[] = classes) {
  return buildHighCombinedDivision({ entries, classes: offered });
}

describe('AKC Chapter 6 §§9–10 High Combined Division', () => {
  it('ranks real-shaped teams by summed faults then time, including HD', () => {
    const slower = team('winner', 0, 30);
    const fasterFaulted = team('faulted', 1, 10);
    const model = build([...fasterFaulted, ...team('runner-up', 0, 40), ...slower]);
    expect(model.levels[0]?.teams.map(t => t.key)).toEqual([
      'dog:winner',
      'dog:runner-up',
      'dog:faulted',
    ]);
    expect(model.levels[0]?.teams[0]).toMatchObject({
      totalFaults: 0,
      totalTimeSeconds: 90,
      rank: 1,
    });
    expect(model.levels[0]?.elements).toEqual(elements);
    expect(model.levels[0]?.isFinal).toBe(true);
  });
  it('surfaces an exact top tie for a human coin flip, never picks a winner', () => {
    const level = build([...team('a'), ...team('b')]).levels[0];
    expect(level?.needsCoinFlip).toBe(true);
    expect(level?.teams.map(t => [t.rank, t.tiedCount])).toEqual([
      [1, 2],
      [1, 2],
    ]);
  });
  it('requires HD at the same level and every available odor class', () => {
    const missing = team('missing').filter(e => e.classElement !== 'Handler Discrimination');
    expect(build(missing).levels[0]?.teams).toEqual([]);
    expect(
      build([...missing, { ...team('missing')[2]!, classLevel: 'Advanced' }]).levels[0]?.teams
    ).toEqual([]);
  });
  it.each(['Container', 'Handler Discrimination'])('rejects a team that NQs %s', element => {
    const entries = team('a').map(e =>
      e.classElement === element ? { ...e, resultText: 'nq' } : e
    );
    expect(build(entries).levels[0]?.teams).toEqual([]);
  });
  it('keeps unscored Q text provisional and excludes it from eligibility', () => {
    const entries = team('a').map(e =>
      e.classElement === 'Handler Discrimination' ? { ...e, isScored: false } : e
    );
    const level = build(entries).levels[0];
    expect(level).toMatchObject({ isFinal: false, pendingCount: 1, teams: [] });
  });
  it('holds complete contenders provisional while another relevant result is pending', () => {
    const pending = { ...team('b')[2]!, isScored: false, resultText: 'pending' };
    expect(build([...team('a'), pending]).levels[0]).toMatchObject({
      isFinal: false,
      pendingCount: 1,
    });
  });
  it('does not coerce missing faults or time to zero or invent a tie', () => {
    const entries = [...team('a'), ...team('b')].map(e => ({
      ...e,
      totalFaults: null,
      searchTimeSeconds: null,
    }));
    expect(build(entries).levels[0]).toMatchObject({
      isFinal: false,
      incompleteScoreCount: 2,
      needsCoinFlip: false,
    });
    expect(build(entries).levels[0]?.teams[0]?.totalFaults).toBeNull();
  });
  it('uses limited offerings and ignores a cancelled odor class and its stale result', () => {
    const offered = [
      ...classes,
      { id: 'Exterior', element: 'Exterior', level: 'Novice', status: 'cancelled' },
    ];
    const stale = {
      ...team('a')[0]!,
      classId: 'Exterior',
      classElement: 'Exterior',
      isScored: false,
      resultText: 'pending',
    };
    expect(build([...team('a'), stale], offered).levels[0]).toMatchObject({
      isFinal: true,
      elements,
    });
  });
  it('confers no HCD without live HD or without HIT eligibility', () => {
    expect(
      build(
        team('a'),
        classes.map(c =>
          c.element === 'Handler Discrimination' ? { ...c, status: 'cancelled' } : c
        )
      ).levels
    ).toEqual([]);
    expect(
      build(
        team('a'),
        classes.filter(c => c.element !== 'Handler Discrimination')
      ).levels
    ).toEqual([]);
    expect(
      build(
        team('a'),
        classes.filter(c => c.element !== 'Interior')
      ).levels
    ).toEqual([]);
  });
  it('ignores unknown and Detective levels or elements', () => {
    const unknown = classes.map(c => ({ ...c, level: 'Unknown' }));
    expect(
      build(
        team('a').map(e => ({ ...e, classLevel: 'Unknown' })),
        unknown
      ).levels
    ).toEqual([]);
    expect(
      build(team('a'), [...classes, { id: 'd', element: 'Detective', level: 'Novice' }]).levels[0]
        ?.elements
    ).toEqual(elements);
  });
  it('excludes nonparticipating entries, even stale qualifying or pending rows', () => {
    const entries = team('a').map(e => ({ ...e, entryStatus: 'scratched', isScored: false }));
    expect(build(entries).levels[0]).toMatchObject({ isFinal: true, pendingCount: 0, teams: [] });
  });
});

it('applies limited HCD offerings at Advanced when HIT is offered at Novice', () => {
  const advancedClasses = classes
    .filter(c => c.element !== 'Interior')
    .map(c => ({ ...c, id: `advanced-${c.id}`, level: 'Advanced' }));
  const entries = team('a')
    .filter(e => e.classElement !== 'Interior')
    .map(e => ({ ...e, classId: `advanced-${e.classId}`, classLevel: 'Advanced' }));
  const model = build(entries, [
    ...classes.filter(c => c.element !== 'Handler Discrimination'),
    ...advancedClasses,
  ]);
  expect(model.levels.map(l => l.level)).toEqual(['Advanced']);
  expect(model.levels[0]).toMatchObject({
    elements: ['Container', 'Handler Discrimination'],
    isFinal: true,
  });
  expect(model.levels[0]?.teams[0]).toMatchObject({
    key: 'dog:a',
    totalFaults: 0,
    totalTimeSeconds: 60,
  });
});

it.each([null, '', 'pending'])(
  'holds an inconsistent scored row with missing result %s provisional',
  resultText => {
    const entries = team('a').map(e =>
      e.classElement === 'Handler Discrimination' ? { ...e, resultText } : e
    );
    expect(build(entries).levels[0]).toMatchObject({ isFinal: false, pendingCount: 1, teams: [] });
  }
);
