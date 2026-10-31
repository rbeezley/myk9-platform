import { describe, expect, it } from 'vitest';
import {
  detectStaleClass,
  STALE_CLASS_IDLE_MS,
  type StaleClassFields,
  type StaleEntryFields,
} from './detectStaleClass';

const NOW = Date.parse('2026-10-31T15:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const scored: StaleClassFields = {
  id: 'novice-containers',
  name: 'Container Novice B',
  level: 'Novice',
  judgeId: 'judge-1',
  classStatus: 'in_progress',
};
const stale: StaleClassFields = {
  id: 'excellent-buried',
  name: 'Buried Excellent A',
  level: 'Excellent',
  judgeId: 'judge-1',
  classStatus: 'in_progress',
};

const scoredEntry = (id: string, completedMinutesAgo: number): StaleEntryFields => ({
  id,
  isScored: true,
  resultStatus: 'qualified',
  scoringCompletedAt: minutesAgo(completedMinutesAgo),
});
const unscoredEntry = (id: string): StaleEntryFields => ({ id, isScored: false });

function detect(
  overrides: { cls?: Partial<StaleClassFields>; entries?: StaleEntryFields[]; now?: number } = {}
) {
  const cls = { ...stale, ...overrides.cls };
  const entries = overrides.entries ?? [
    scoredEntry('a', 30),
    unscoredEntry('b'),
    unscoredEntry('c'),
  ];
  return detectStaleClass({
    scoredClass: scored,
    classes: [scored, cls],
    entriesByClassId: new Map([[cls.id, entries]]),
    nowMs: overrides.now ?? NOW,
  });
}

describe('detectStaleClass', () => {
  it('triggers: same judge, different level, in progress, idle past 15 minutes, unscored dogs', () => {
    expect(detect()).toEqual({
      classId: 'excellent-buried',
      className: 'Buried Excellent A',
      unscoredEntryIds: ['b', 'c'],
      lastResultAtMs: NOW - 30 * 60_000,
    });
  });

  it('never triggers for a same-level move (Novice Buried to Novice Containers)', () => {
    expect(detect({ cls: { level: 'Novice', name: 'Buried Novice A' } })).toBeNull();
    expect(detect({ cls: { level: ' novice ' } })).toBeNull();
  });

  it('does not trigger for another judge, or when the judge is unknown', () => {
    expect(detect({ cls: { judgeId: 'judge-2' } })).toBeNull();
    expect(detect({ cls: { judgeId: undefined } })).toBeNull();
  });

  it('does not trigger unless the class is in progress', () => {
    for (const classStatus of ['upcoming', 'completed', 'setup', undefined]) {
      expect(detect({ cls: { classStatus } })).toBeNull();
    }
  });

  it('needs the last result strictly older than 15 minutes', () => {
    const at = (minutes: number) =>
      detect({ entries: [scoredEntry('a', minutes), unscoredEntry('b')] });
    expect(at(14)).toBeNull();
    expect(at(STALE_CLASS_IDLE_MS / 60_000)).toBeNull();
    expect(at(16)).not.toBeNull();
  });

  it('does not trigger for a class that has no result yet', () => {
    expect(detect({ entries: [unscoredEntry('a'), unscoredEntry('b')] })).toBeNull();
  });

  it('does not trigger when every expected dog is accounted for', () => {
    expect(detect({ entries: [scoredEntry('a', 30), scoredEntry('b', 20)] })).toBeNull();
  });

  it('leaves scratched, absent, pulled and deleted dogs out of the unscored list', () => {
    const result = detect({
      entries: [
        scoredEntry('a', 30),
        unscoredEntry('b'),
        { id: 'scratched', entryStatus: 'scratched' },
        { id: 'absent', resultStatus: 'absent' },
        { id: 'pulled', checkInStatus: 'pulled' },
        { id: 'deleted', deletedAt: minutesAgo(100) },
      ],
    });
    expect(result?.unscoredEntryIds).toEqual(['b']);
  });

  it('picks the class idle longest when several qualify', () => {
    const older: StaleClassFields = { ...stale, id: 'older', name: 'Older', level: 'Master' };
    const result = detectStaleClass({
      scoredClass: scored,
      classes: [scored, stale, older],
      entriesByClassId: new Map([
        [stale.id, [scoredEntry('a', 20), unscoredEntry('b')]],
        [older.id, [scoredEntry('c', 50), unscoredEntry('d')]],
      ]),
      nowMs: NOW,
    });
    expect(result?.classId).toBe('older');
  });

  it('skips excluded (snoozed) classes before choosing the oldest', () => {
    const older: StaleClassFields = { ...stale, id: 'older', name: 'Older', level: 'Master' };
    const input = {
      scoredClass: scored,
      classes: [scored, stale, older],
      entriesByClassId: new Map([
        [stale.id, [scoredEntry('a', 20), unscoredEntry('b')]],
        [older.id, [scoredEntry('c', 50), unscoredEntry('d')]],
      ]),
      nowMs: NOW,
    };
    expect(detectStaleClass({ ...input, excludeClassIds: new Set(['older']) })?.classId).toBe(
      'excellent-buried'
    );
  });

  it('leaves a dog in the ring out of the dogs to mark, as the server does', () => {
    const hit = detect({
      entries: [
        scoredEntry('a', 40),
        unscoredEntry('b'),
        { ...unscoredEntry('c'), isInRing: true },
      ],
    });
    expect(hit?.unscoredEntryIds).toEqual(['b']);
  });
});
