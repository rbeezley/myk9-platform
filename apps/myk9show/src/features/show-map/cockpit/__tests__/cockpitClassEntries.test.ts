import { describe, expect, it } from 'vitest';

import { buildShowMapTree } from '../../showMapTree';
import {
  classEntriesForClass,
  countClassEntries,
  runStatusDisplay,
  type SecretaryCockpitClassEntry,
} from '../cockpitClassEntries';

const show = { id: 'show-1', name: 'Show', organization: 'AKC' } as never;
const trial = { id: 'trial-1', trialDate: '2026-07-20', trialNumber: '1' } as never;
const cls = { id: 'class-1', trialId: 'trial-1', element: 'Container', level: 'Novice' } as never;

function entryRow(id: string, fields: Record<string, unknown>) {
  return { id, class_id: 'class-1', entry_status: 'confirmed', dog: { call_name: id }, ...fields };
}

describe('classEntriesForClass', () => {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes: [cls],
    entries: [
      entryRow('Third', { run_order: 3, check_in_status: 'no-status' }),
      entryRow('First', {
        run_order: 1,
        armband: '101',
        is_scored: true,
        result_status: 'qualified',
        check_in_status: 'completed',
      }),
      entryRow('Second', { run_order: 2, check_in_status: 'in-ring', armband: '102' }),
      entryRow('Fourth', { run_order: 4, check_in_status: 'pulled', entry_status: 'withdrawn' }),
      entryRow('Fifth', { run_order: 5, entry_status: 'moved' }),
    ],
    entryPreviewLimit: Number.POSITIVE_INFINITY,
  });
  const entries = classEntriesForClass('class-1', tree);

  it('lists every entry in run order, 1-based', () => {
    expect(entries.map(row => [row.position, row.dogName])).toEqual([
      [1, 'First'],
      [2, 'Second'],
      [3, 'Third'],
      [4, 'Fourth'],
      [5, 'Fifth'],
    ]);
    expect(entries[0]).toMatchObject({ armband: '101', result: 'Q' });
  });

  it.each([
    ['First', 'Scored', 'complete'],
    ['Second', 'In ring', 'active'],
    ['Third', 'Waiting', 'neutral'],
    ['Fourth', 'Pulled', 'muted'],
    ['Fifth', 'Moved', 'muted'],
  ])('maps %s to run status %s', (dog, label, kind) => {
    const row = entries.find(item => item.dogName === dog)!;
    expect(runStatusDisplay(row)).toEqual({ label, kind });
  });

  it('carries the check-in label alongside the run status', () => {
    expect(entries.find(item => item.dogName === 'Third')?.checkIn?.label).toBe('Not checked in');
  });

  it('derives the four tiles from the same rows, leaving out the moved source row', () => {
    expect(countClassEntries(entries)).toEqual({
      entered: 4,
      scored: 1,
      inRing: 1,
      stillToRun: 1,
      notCheckedIn: 1,
    });
  });

  it('returns nothing for a class the tree does not hold', () => {
    expect(classEntriesForClass('nope', tree)).toEqual([] as SecretaryCockpitClassEntry[]);
  });
});
