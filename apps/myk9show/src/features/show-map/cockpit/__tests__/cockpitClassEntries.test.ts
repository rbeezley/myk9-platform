import { describe, expect, it } from 'vitest';

import { buildShowMapTree } from '../../showMapTree';
import {
  classEntriesForClass,
  countClassEntries,
  hiddenEntryCount,
  runStatusDisplay,
} from '../cockpitClassEntries';

const show = { id: 'show-1', name: 'Show', organization: 'AKC' } as never;
const trial = { id: 'trial-1', trialDate: '2026-07-20', trialNumber: '1' } as never;
const cls = { id: 'class-1', trialId: 'trial-1', element: 'Container', level: 'Novice' } as never;

function entryRow(id: string, fields: Record<string, unknown>) {
  return { id, class_id: 'class-1', entry_status: 'confirmed', dog: { call_name: id }, ...fields };
}

function rowsFor(entries: ReturnType<typeof entryRow>[], entryPreviewLimit?: number) {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes: [cls],
    entries,
    entryPreviewLimit: entryPreviewLimit ?? Number.POSITIVE_INFINITY,
  });
  return { tree, rows: classEntriesForClass('class-1', tree) };
}

interface Case {
  name: string;
  fields: Record<string, unknown>;
  listed: boolean;
  /** Counted as entered (the class's entryCount set). */
  counted: boolean;
  state?: string;
  result?: string | null;
}

// Every entry_status the code can write, crossed with the check-in and result axes that matter.
const CASES: Case[] = [
  { name: 'confirmed, no check-in', fields: {}, listed: true, counted: true, state: 'waiting' },
  {
    name: 'accepted, checked in',
    fields: { entry_status: 'accepted', check_in_status: 'checked-in' },
    listed: true,
    counted: true,
    state: 'waiting',
  },
  {
    name: 'in the ring',
    fields: { check_in_status: 'in-ring' },
    listed: true,
    counted: true,
    state: 'in-ring',
  },
  {
    name: 'scored qualified',
    fields: { is_scored: true, result_status: 'qualified' },
    listed: true,
    counted: true,
    state: 'scored',
    result: 'Q',
  },
  {
    name: 'scored non_qualifying reads NQ',
    fields: { is_scored: true, result_status: 'non_qualifying' },
    listed: true,
    counted: true,
    state: 'scored',
    result: 'NQ',
  },
  {
    name: 'absent result without a score',
    fields: { result_status: 'absent' },
    listed: true,
    counted: true,
    state: 'scored',
    result: 'ABS',
  },
  {
    name: 'unscored pending result shows nothing',
    fields: { result_status: 'pending' },
    listed: true,
    counted: true,
    state: 'waiting',
    result: null,
  },
  {
    name: 'pulled shows no stale result',
    fields: { check_in_status: 'pulled', is_scored: true, result_status: 'qualified' },
    listed: true,
    counted: false,
    state: 'pulled',
    result: null,
  },
  {
    name: 'scratched',
    fields: { entry_status: 'scratched' },
    listed: true,
    counted: false,
    state: 'pulled',
  },
  {
    name: 'withdrawn',
    fields: { entry_status: 'withdrawn', result_status: 'qualified' },
    listed: true,
    counted: false,
    state: 'withdrawn',
    result: null,
  },
  { name: 'absent status', fields: { entry_status: 'absent' }, listed: true, counted: false },
  { name: 'moved', fields: { entry_status: 'moved' }, listed: false, counted: false },
  { name: 'rejected', fields: { entry_status: 'not_accepted' }, listed: false, counted: false },
  { name: 'pending', fields: { entry_status: 'pending' }, listed: false, counted: false },
  { name: 'submitted', fields: { entry_status: 'submitted' }, listed: false, counted: false },
  { name: 'draft', fields: { entry_status: 'draft' }, listed: false, counted: false },
  { name: 'paid (stays pending)', fields: { entry_status: 'paid' }, listed: false, counted: false },
  {
    name: 'deleted',
    fields: { deleted_at: '2026-07-01T00:00:00Z' },
    listed: false,
    counted: false,
  },
];

describe('classEntriesForClass', () => {
  it.each(CASES)('$name', ({ fields, listed, counted, state, result }) => {
    const { rows } = rowsFor([entryRow('Dog', fields)]);
    expect(rows).toHaveLength(listed ? 1 : 0);
    expect(countClassEntries(rows).entered).toBe(counted ? 1 : 0);
    if (!listed) return;
    expect(rows[0]!.counted).toBe(counted);
    if (state) expect(rows[0]!.state).toBe(state);
    if (result !== undefined) expect(rows[0]!.result).toBe(result);
  });

  it('counts scored, in the ring, still to run and not checked in over the expected set only', () => {
    const { rows } = rowsFor([
      entryRow('Scored', { is_scored: true, result_status: 'qualified' }),
      entryRow('Ring', { check_in_status: 'in-ring' }),
      entryRow('Here', { check_in_status: 'checked-in' }),
      entryRow('Gone', { check_in_status: 'no-status' }),
      entryRow('Pulled', { check_in_status: 'pulled' }),
      entryRow('Out', { entry_status: 'withdrawn', check_in_status: 'no-status' }),
      entryRow('Waiting', { entry_status: 'pending', check_in_status: 'no-status' }),
      entryRow('Rejected', { entry_status: 'not_accepted', check_in_status: 'no-status' }),
    ]);
    expect(countClassEntries(rows)).toEqual({
      entered: 4,
      scored: 1,
      inRing: 1,
      stillToRun: 2,
      notCheckedIn: 1,
    });
  });

  it('orders by run order and numbers only the dogs still in line, skipping a withdrawn dog ahead', () => {
    const { rows } = rowsFor([
      entryRow('Third', { run_order: 4 }),
      entryRow('Withdrawn', { run_order: 1, entry_status: 'withdrawn' }),
      entryRow('Scored', { run_order: 2, is_scored: true, result_status: 'qualified' }),
      entryRow('Second', { run_order: 3 }),
      entryRow('Ring', { run_order: 5, check_in_status: 'in-ring' }),
    ]);
    expect(rows.map(row => [row.dogName, row.place])).toEqual([
      ['Withdrawn', null],
      ['Scored', null],
      ['Second', 1],
      ['Third', 2],
      ['Ring', null],
    ]);
  });

  it('labels each state for the table', () => {
    const { rows } = rowsFor([
      entryRow('A', { is_scored: true }),
      entryRow('B', { check_in_status: 'in-ring' }),
      entryRow('C', {}),
      entryRow('D', { check_in_status: 'pulled' }),
      entryRow('E', { entry_status: 'withdrawn' }),
    ]);
    expect(rows.map(row => runStatusDisplay(row).label)).toEqual([
      'Scored',
      'In ring',
      'Waiting',
      'Pulled',
      'Withdrawn',
    ]);
  });

  it('says how many entries a capped tree left out instead of looking complete', () => {
    const entries = Array.from({ length: 5 }, (_, i) => entryRow(`Dog${i}`, { run_order: i + 1 }));
    const capped = rowsFor(entries, 3);
    expect(capped.rows).toHaveLength(3);
    expect(hiddenEntryCount('class-1', capped.tree)).toBe(2);
    expect(hiddenEntryCount('class-1', rowsFor(entries).tree)).toBe(0);
  });

  it('returns nothing for a class the tree does not hold', () => {
    const { tree } = rowsFor([]);
    expect(classEntriesForClass('nope', tree)).toEqual([]);
    expect(hiddenEntryCount('nope', tree)).toBe(0);
  });
});
