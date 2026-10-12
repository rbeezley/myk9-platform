import { describe, expect, it } from 'vitest';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';
import { detectPlaceRingConflicts } from './placeRingConflicts';

function row(overrides: Partial<AtShowEntryDetail> & { entryId: string }): AtShowEntryDetail {
  return {
    classId: 'c1',
    dogName: 'Juni',
    armband: '1',
    checkInStatus: 'checked-in',
    className: 'Container Novice',
    expectedStartLabel: null,
    isRevisedStart: false,
    hasRunOrder: true,
    isScored: false,
    resultStatus: null,
    resultTimeSeconds: null,
    resultFaults: null,
    isPreliminary: false,
    selfCheckinState: 'allowed',
    trialLabel: null,
    classStatus: 'in_progress',
    ...overrides,
  };
}

const juni = row({ entryId: 'juni' });
const rex = row({ entryId: 'rex', dogName: 'Rex', classId: 'c2', className: 'Interior Excellent' });

describe('detectPlaceRingConflicts', () => {
  it('flags two running classes when both server places are within the lead window', () => {
    const result = detectPlaceRingConflicts(
      [juni, rex],
      new Map([
        ['juni', 1],
        ['rex', 3],
      ]),
      2
    );
    expect(result.get('juni')).toBe('Rex 2 away in Interior Excellent');
    expect(result.get('rex')).toBe('Juni next in Container Novice');
  });

  it('does not flag a dog the server says is 30th, however few rows this account holds', () => {
    const result = detectPlaceRingConflicts(
      [juni, rex],
      new Map([
        ['juni', 1],
        ['rex', 30],
      ]),
      2
    );
    expect(result.size).toBe(0);
  });

  it('puts the edge at place leadDogs + 1, like dogsAhead <= leadDogs', () => {
    const places = (rexPlace: number) =>
      new Map([
        ['juni', 1],
        ['rex', rexPlace],
      ]);
    expect(detectPlaceRingConflicts([juni, rex], places(3), 2).size).toBe(2);
    expect(detectPlaceRingConflicts([juni, rex], places(4), 2).size).toBe(0);
  });

  it('needs different classes, both running', () => {
    const sameClass = row({ entryId: 'rex', dogName: 'Rex' });
    const places = new Map([
      ['juni', 1],
      ['rex', 2],
    ]);
    expect(detectPlaceRingConflicts([juni, sameClass], places, 2).size).toBe(0);
    const waiting = { ...rex, classStatus: 'upcoming' };
    expect(detectPlaceRingConflicts([juni, waiting], places, 2).size).toBe(0);
  });

  it('says nothing without confirmed places', () => {
    expect(detectPlaceRingConflicts([juni, rex], undefined, 2).size).toBe(0);
    expect(detectPlaceRingConflicts([juni, rex], new Map(), 2).size).toBe(0);
  });

  describe('a dog in the ring', () => {
    const inRing = { ...juni, checkInStatus: 'in-ring' as const };

    it('counts with a near dog at another running class, and is worded as in the ring', () => {
      const result = detectPlaceRingConflicts([inRing, rex], new Map([['rex', 2]]), 2);
      expect(result.get('rex')).toBe('Juni in the ring in Container Novice');
      expect(result.get('juni')).toBe('Rex 1 away in Interior Excellent');
    });

    it('does not count when the other dog is 30th', () => {
      expect(detectPlaceRingConflicts([inRing, rex], new Map([['rex', 30]]), 2).size).toBe(0);
    });

    it('is fact even offline, but alone it is no conflict', () => {
      expect(detectPlaceRingConflicts([inRing, rex], undefined, 2).size).toBe(0);
      expect(detectPlaceRingConflicts([inRing], undefined, 2).size).toBe(0);
    });

    it('needs its class to be running', () => {
      const idle = { ...inRing, classStatus: 'upcoming' };
      expect(detectPlaceRingConflicts([idle, rex], new Map([['rex', 1]]), 2).size).toBe(0);
    });
  });
});
