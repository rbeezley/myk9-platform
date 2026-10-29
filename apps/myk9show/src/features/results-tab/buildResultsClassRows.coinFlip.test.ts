import { describe, expect, it } from 'vitest';

import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { buildResultsClassRows } from './buildResultsClassRows';

const SYNC = {
  _version: 1,
  _lastModified: new Date(0),
  _lastModifiedBy: '',
  _syncStatus: 'synced',
} as const;

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Fall Trial',
  trialDate: '2026-10-10',
  trialNumber: '1',
  status: 'Scheduled',
  ...SYNC,
} as SyncableTrial;

const entry = (id: string, fields: Record<string, unknown> = {}): SecretaryEntry =>
  ({
    id,
    class_id: 'class-1',
    entry_status: 'confirmed',
    check_in_status: 'checked-in',
    is_scored: true,
    result_status: 'qualified',
    armband: id,
    final_placement: 1,
    search_time_seconds: 40,
    total_faults: 0,
    results_line: `${id}|line`,
    dog: { id: `dog-${id}`, name: `Dog ${id}`, call_name: null },
    handler: null,
    handler_person: null,
    ...fields,
  }) as unknown as SecretaryEntry;

const build = (status: string, entries: SecretaryEntry[]) =>
  buildResultsClassRows({
    trials: [trial],
    trialClasses: {
      'trial-1': [
        {
          id: 'class-1',
          element: 'Containers',
          level: 'Novice',
          section: '',
          judgeId: 'judge-1',
          judgeName: 'Pat Judge',
          startTime: '09:00',
          status,
          entries: 0,
          ...SYNC,
        } as SyncableTrialClass,
      ],
    },
    releasedAtByClassId: new Map([['class-1', null]]),
    verifiedByClassId: new Map([['class-1', { at: null, by: null }]]),
    paperworkByClassId: new Map(),
    entries,
  })[0]!;

describe('buildResultsClassRows coin flip (replicated tie state)', () => {
  it('asks for the coin flip while a replicated entry carries an unresolved tie', () => {
    const row = build('Completed', [
      entry('1', { placement_tie: 'unresolved' }),
      entry('2', { placement_tie: 'unresolved', final_placement: 2 }),
    ]);
    expect(row).toMatchObject({
      phase: 'needs-coin-flip',
      nextAction: { kind: 'coin-flip' },
    });
    expect(row.entries.map(e => e.placementTie)).toEqual(['unresolved', 'unresolved']);
  });

  it('goes back to Check scores once the marker is gone (a recorded flip or a corrected score)', () => {
    expect(build('Completed', [entry('1'), entry('2', { final_placement: 2 })])).toMatchObject({
      phase: 'needs-checking',
      nextAction: { kind: 'verify' },
    });
  });

  it('does not ask for the flip of a shared tie below 4th, or of a class not saved as completed', () => {
    expect(
      build('Completed', [entry('1', { placement_tie: 'shared', final_placement: 5 })]).phase
    ).toBe('needs-checking');
    expect(build('Running', [entry('1', { placement_tie: 'unresolved' })]).phase).not.toBe(
      'needs-coin-flip'
    );
  });

  it('carries the ranking inputs the tie groups are derived from', () => {
    const row = build('Completed', [
      entry('1', { placement_tie: 'unresolved', points_earned: 90, total_faults: 2 }),
    ]);
    expect(row.entries[0]).toMatchObject({ pointsEarned: 90, faults: 2, timeSeconds: 40 });
  });
});
