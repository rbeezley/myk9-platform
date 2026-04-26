import { describe, it, expect } from 'vitest';
import type { SyncableClassData } from '@/store/classStore';
import { mapClassToCreatedClass, mapClassesToCreatedClasses } from './mapClassToCreatedClass';

function makeClass(overrides: Partial<SyncableClassData> = {}): SyncableClassData {
  return {
    id: 'class-1',
    trialId: 'trial-1',
    trial: 'Trial 1',
    trialDate: '2026-06-13',
    trialNumber: '1',
    classOrder: '1',
    status: 'Scheduled',
    judge: 'TBD',
    judgeId: '',
    className: 'Interior Novice A',
    classNumber: 'INA',
    element: 'Interior',
    level: 'Novice',
    section: 'A',
    entryFee: 25,
    maxEntries: 40,
    requiresJumpHeight: false,
    hidesUsed: '',
    distractionsUsed: '',
    itemsUsed: '',
    timeLimit1: '3:00',
    timeLimit2: '',
    timeLimit3: '',
    photoUrl: '',
    customFields: {},
    results_released_at: null,
    _version: 1,
    _lastModified: new Date('2026-04-26'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
    ...overrides,
  };
}

describe('mapClassToCreatedClass', () => {
  it('maps a basic synced class into CreatedClass shape', () => {
    const created = mapClassToCreatedClass(makeClass(), 0);
    expect(created.id).toBe('class-1');
    expect(created.trialId).toBe('trial-1');
    expect(created.className).toBe('Interior Novice A');
    expect(created.element).toBe('Interior');
    expect(created.runOrder).toBe(1);
    expect(created.entries.maxEntries).toBe(40);
    expect(created.status).toBe('Scheduled');
  });

  it('falls back to index+1 when classOrder is non-numeric', () => {
    const created = mapClassToCreatedClass(makeClass({ classOrder: 'TBD' }), 4);
    expect(created.runOrder).toBe(5);
  });

  it('parses HH:MM estimated judging time into minutes', () => {
    const created = mapClassToCreatedClass(makeClass({ estimatedJudgingTime: '0:45' }), 0);
    expect(created.fieldValues.estimatedJudgingTime).toBe(45);
  });

  it('defaults estimated judging time to 30 minutes when missing', () => {
    const created = mapClassToCreatedClass(makeClass(), 0);
    expect(created.fieldValues.estimatedJudgingTime).toBe(30);
  });

  it('packs ring stewards into an array, dropping empty slots', () => {
    const created = mapClassToCreatedClass(
      makeClass({
        ringSteward1: 'person-a',
        ringSteward2: undefined,
        ringSteward3: 'person-c',
      }),
      0
    );
    expect(created.personnel.stewards.ring).toEqual(['person-a', 'person-c']);
  });

  it('promotes the joined judge name into personnel.judgeName', () => {
    const created = mapClassToCreatedClass(
      makeClass({ judgeId: 'judge-1', judge: 'Liz Beezley' }),
      0
    );
    expect(created.personnel.judgeId).toBe('judge-1');
    expect(created.personnel.judgeName).toBe('Liz Beezley');
  });

  it('preserves a SyncableClassData status value verbatim', () => {
    const created = mapClassToCreatedClass(makeClass({ status: 'In Progress' }), 0);
    expect(created.status).toBe('In Progress');
  });

  it('falls back className to element when className missing', () => {
    const created = mapClassToCreatedClass(
      makeClass({ className: undefined, element: 'Container' }),
      0
    );
    expect(created.className).toBe('Container');
  });
});

describe('mapClassesToCreatedClasses', () => {
  it('preserves array order and indexes runOrder per item', () => {
    const result = mapClassesToCreatedClasses([
      makeClass({ id: 'a', classOrder: 'TBD' }),
      makeClass({ id: 'b', classOrder: 'TBD' }),
      makeClass({ id: 'c', classOrder: '7' }),
    ]);
    expect(result.map(c => c.id)).toEqual(['a', 'b', 'c']);
    expect(result.map(c => c.runOrder)).toEqual([1, 2, 7]);
  });
});
