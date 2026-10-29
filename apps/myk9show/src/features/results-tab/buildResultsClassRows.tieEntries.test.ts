import { describe, expect, it } from 'vitest';

import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { buildResultsClassRows } from './buildResultsClassRows';
import { coinFlipAction, deriveClassTies } from './coinFlipRows';

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

const completedClass = {
  id: 'class-1',
  element: 'Containers',
  level: 'Novice',
  section: '',
  judgeId: 'judge-1',
  judgeName: 'Pat Judge',
  startTime: '09:00',
  status: 'Completed',
  entries: 0,
  ...SYNC,
} as SyncableTrialClass;

function entry(id: string, fields: Record<string, unknown> = {}): SecretaryEntry {
  return {
    id,
    class_id: 'class-1',
    entry_status: 'confirmed',
    check_in_status: 'checked-in',
    is_scored: false,
    result_status: 'pending',
    armband: id,
    final_placement: null,
    search_time_seconds: null,
    total_faults: null,
    dog: { id: `dog-${id}`, name: `Dog ${id}`, call_name: null },
    handler: null,
    handler_person: null,
    ...fields,
  } as unknown as SecretaryEntry;
}

/** Two dogs tied for 1st, as the server's placement recalculation leaves them. */
const tiedFor1st = {
  is_scored: true,
  result_status: 'qualified',
  final_placement: 1,
  total_faults: 0,
  search_time_seconds: 60,
  placement_tie: 'unresolved',
};

// MYK9-1473 (Codex round 8): the server ranks every scored, qualified entry, whatever its status,
// so a dog pulled after it ran stays in its tie group. The flip must offer and send that group.
describe('tie entries for the coin flip', () => {
  it('keeps a dog pulled after it ran in its tie group, though the table leaves it out', () => {
    const [row] = buildResultsClassRows({
      trials: [trial],
      trialClasses: { 'trial-1': [completedClass] },
      releasedAtByClassId: new Map([['class-1', null]]),
      verifiedByClassId: new Map([['class-1', { at: null, by: null }]]),
      paperworkByClassId: new Map(),
      entries: [
        entry('101', tiedFor1st),
        entry('102', { ...tiedFor1st, check_in_status: 'pulled' }),
        entry('103', { entry_status: 'scratched' }),
      ],
    });

    expect(row?.entries.map(item => item.entryId)).toEqual(['101']);
    expect(row?.tieEntries.map(item => item.entryId).sort()).toEqual(['101', '102']);
    expect(row?.phase).toBe('needs-coin-flip');
    expect(coinFlipAction(row ?? null)).toBe('record');
    const [group] = deriveClassTies(row?.tieEntries ?? [], false);
    expect(group?.entries.map(item => item.entryId)).toEqual(['101', '102']);
  });

  it('still offers to change a recorded flip when every dog in it was pulled after running', () => {
    const recorded = { ...tiedFor1st, placement_tie: null, check_in_status: 'pulled' };
    const [row] = buildResultsClassRows({
      trials: [trial],
      trialClasses: { 'trial-1': [completedClass] },
      releasedAtByClassId: new Map([['class-1', null]]),
      verifiedByClassId: new Map([['class-1', { at: null, by: null }]]),
      paperworkByClassId: new Map(),
      entries: [
        entry('101', { ...recorded, placement_tiebreak: 1 }),
        entry('102', { ...recorded, final_placement: 2, placement_tiebreak: 2 }),
        entry('103', { is_scored: true, result_status: 'qualified', final_placement: 3 }),
      ],
    });

    expect(row?.entries.map(item => item.entryId)).toEqual(['103']);
    expect(coinFlipAction(row ?? null)).toBe('change');
  });

  it('offers no flip when the tied dog left the class without running', () => {
    const [row] = buildResultsClassRows({
      trials: [trial],
      trialClasses: { 'trial-1': [completedClass] },
      releasedAtByClassId: new Map([['class-1', null]]),
      verifiedByClassId: new Map([['class-1', { at: null, by: null }]]),
      paperworkByClassId: new Map(),
      entries: [
        entry('101', { ...tiedFor1st, placement_tie: null }),
        entry('102', { entry_status: 'withdrawn' }),
      ],
    });

    expect(row?.tieEntries.map(item => item.entryId)).toEqual(['101']);
    expect(coinFlipAction(row ?? null)).toBeNull();
  });
});
