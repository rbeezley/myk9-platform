/**
 * MYK9-1925: ASCA Scent Detection High in Trial, Program Rules §1.10. Each test names the
 * rule it pins.
 */
import { describe, expect, it } from 'vitest';
import { ASCA_HIT_ELEMENTS, buildAscaHighInTrial } from '../ascaHighInTrial';
import type { AscaHitClassLike } from '../ascaHighInTrial';
import type { ReportEntry } from '../types';

function cls(element: string, level: string, section: string | null = null): AscaHitClassLike {
  return { id: `${element}-${level}-${section ?? ''}`, element, level, section };
}

function run(
  dogId: string,
  element: string,
  level: string,
  overrides: Partial<ReportEntry> = {}
): ReportEntry {
  return {
    id: `${dogId}-${element}-${level}`,
    dogId,
    armband: dogId,
    runOrder: null,
    callName: dogId,
    breed: 'Australian Shepherd',
    handler: 'Alex Kim',
    registrationNumber: null,
    checkInStatus: 'checked-in',
    section: null,
    isScored: true,
    resultText: 'qualified',
    searchTimeSeconds: 30,
    totalFaults: 0,
    finalPlacement: null,
    entryStatus: 'confirmed',
    classId: `${element}-${level}-`,
    classElement: element,
    classLevel: level,
    ...overrides,
  };
}

function team(
  dogId: string,
  level: string,
  faults: number[],
  times: number[],
  elements: readonly string[] = ['Container', 'Interior']
): ReportEntry[] {
  return elements.map((element, i) =>
    run(dogId, element, level, { totalFaults: faults[i] ?? 0, searchTimeSeconds: times[i] ?? 30 })
  );
}

const novice = [cls('Container', 'Novice'), cls('Interior', 'Novice')];

describe('ASCA §1.10 High in Trial', () => {
  it('counts only ASCA elements: no Handler Discrimination, no Buried', () => {
    expect([...ASCA_HIT_ELEMENTS]).toEqual(['Container', 'Interior', 'Exterior', 'Vehicle']);
    const model = buildAscaHighInTrial({
      classes: [...novice, cls('Handler Discrimination', 'Novice'), cls('Buried', 'Novice')],
      entries: team('a', 'Novice', [0, 0], [10, 20]),
    });
    expect(model.levels[0]?.elements).toEqual(['Container', 'Interior']);
  });

  it('§1.10.2 one level: one winner, ranked by summed faults then summed time', () => {
    const model = buildAscaHighInTrial({
      classes: novice,
      entries: [
        ...team('slow', 'Novice', [0, 0], [30, 40]),
        ...team('fast', 'Novice', [0, 0], [10, 20]),
        ...team('faulted', 'Novice', [1, 0], [1, 1]),
      ],
    });
    expect(model.levels).toHaveLength(1);
    expect(model.levels[0]?.teams.map(t => [t.key, t.rank])).toEqual([
      ['dog:fast', 1],
      ['dog:slow', 2],
      ['dog:faulted', 3],
    ]);
    expect(model.levels[0]?.teams[0]).toMatchObject({ totalFaults: 0, totalTimeSeconds: 30 });
    expect(model.levels[0]?.needsCoinFlip).toBe(false);
  });

  it('§1.10.2 two levels: one winner each, in progression order', () => {
    const model = buildAscaHighInTrial({
      classes: [...novice, cls('Container', 'Advanced'), cls('Exterior', 'Advanced')],
      entries: [
        ...team('n1', 'Novice', [0, 0], [10, 10]),
        ...team('n2', 'Novice', [0, 0], [20, 20]),
        ...team('a1', 'Advanced', [0, 0], [50, 50], ['Container', 'Exterior']),
      ],
    });
    expect(model.levels.map(l => l.level)).toEqual(['Novice', 'Advanced']);
    expect(model.levels.map(l => l.teams[0]?.key)).toEqual(['dog:n1', 'dog:a1']);
  });

  it('§1.10.4 a team entered in more than one level is excluded and named', () => {
    const model = buildAscaHighInTrial({
      classes: [...novice, cls('Container', 'Open'), cls('Interior', 'Open')],
      entries: [
        ...team('both', 'Novice', [0, 0], [1, 1]),
        run('both', 'Container', 'Open'),
        ...team('plain', 'Novice', [0, 0], [50, 50]),
      ],
    });
    const novices = model.levels.find(l => l.level === 'Novice');
    expect(novices?.teams.map(t => t.key)).toEqual(['dog:plain']);
    expect(model.ineligible).toEqual([
      expect.objectContaining({
        key: 'dog:both',
        reason: 'multiple-levels',
        levels: ['Novice', 'Open'],
      }),
    ]);
  });

  it('§1.10.3 a fault tie is broken by total time', () => {
    const model = buildAscaHighInTrial({
      classes: novice,
      entries: [
        ...team('slower', 'Novice', [1, 1], [10, 30]),
        ...team('quicker', 'Novice', [2, 0], [10, 20]),
      ],
    });
    expect(model.levels[0]?.teams.map(t => [t.key, t.totalFaults, t.rank])).toEqual([
      ['dog:quicker', 2, 1],
      ['dog:slower', 2, 2],
    ]);
    expect(model.levels[0]?.needsCoinFlip).toBe(false);
  });

  it('§1.10.3 a tie on faults and time is surfaced for a coin flip, never resolved', () => {
    const model = buildAscaHighInTrial({
      classes: novice,
      entries: [...team('a', 'Novice', [0, 1], [10, 20]), ...team('b', 'Novice', [1, 0], [20, 10])],
    });
    expect(model.levels[0]?.needsCoinFlip).toBe(true);
    expect(model.levels[0]?.teams.map(t => [t.rank, t.tiedCount])).toEqual([
      [1, 2],
      [1, 2],
    ]);
  });

  it('§1.10.3 a team that missed one element is not eligible', () => {
    const model = buildAscaHighInTrial({
      classes: novice,
      entries: [
        run('missed', 'Container', 'Novice'),
        run('missed', 'Interior', 'Novice', { resultText: 'NQ' }),
        ...team('full', 'Novice', [3, 3], [90, 90]),
      ],
    });
    expect(model.levels[0]?.teams.map(t => t.key)).toEqual(['dog:full']);
    expect(model.ineligible).toEqual([]);
  });

  it('§1.10.3 a level that ran one element has no High in Trial', () => {
    const model = buildAscaHighInTrial({
      classes: [cls('Container', 'Novice')],
      entries: [run('a', 'Container', 'Novice')],
    });
    expect(model.levels).toEqual([]);
    expect(model.exclusions).toContainEqual({
      element: 'Container',
      level: 'Novice',
      reason: 'single-element-level',
    });
  });

  it('§1.10.5 a Level C team is ineligible and Level C is not an element of the level', () => {
    const levelC = cls('Container', 'Novice', 'C');
    const model = buildAscaHighInTrial({
      classes: [...novice, levelC],
      entries: [
        ...team('base', 'Novice', [0, 0], [30, 30]),
        run('cdog', 'Container', 'Novice', { classId: levelC.id, classSection: 'C' }),
        run('cdog', 'Interior', 'Novice', { totalFaults: 0, searchTimeSeconds: 1 }),
      ],
    });
    expect(model.levels[0]?.teams.map(t => t.key)).toEqual(['dog:base']);
    expect(model.ineligible).toEqual([
      expect.objectContaining({ key: 'dog:cdog', reason: 'level-c' }),
    ]);
  });

  it('a withdrawn entry in a second level does not make a team ineligible', () => {
    const model = buildAscaHighInTrial({
      classes: [...novice, cls('Container', 'Open')],
      entries: [
        ...team('a', 'Novice', [0, 0], [10, 10]),
        run('a', 'Container', 'Open', { entryStatus: 'withdrawn' }),
      ],
    });
    expect(model.ineligible).toEqual([]);
    expect(model.levels[0]?.teams.map(t => t.key)).toEqual(['dog:a']);
  });
});
