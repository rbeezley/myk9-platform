import { describe, expect, it, vi } from 'vitest';
import { describeAppliedFilter } from '@/components/list-toolkit';
import {
  buildEntryManagementFilterFields,
  type BuildEntryManagementFilterFieldsOptions,
} from '../entryManagementFilterFields';
import type { EntryManagementCockpitState } from '../entryManagementCockpitParams';

const BASE_STATE: EntryManagementCockpitState = {
  tab: 'registrations',
  exception: 'move-ups',
  queues: ['needs-review'],
  search: '',
  trialIds: [],
  classIds: [],
  registrationKey: null,
};

const TRIALS = [
  { id: 't1', name: 'Trial 1', date: null, trial_number: 1 },
  { id: 't2', name: 'Trial 2', date: null, trial_number: 2 },
];
const CLASSES = [
  { id: 'c1', trialId: 't1', name: 'Interior Novice B' },
  { id: 'c2', trialId: 't2', name: 'Interior Novice B' },
];

function build(overrides: Partial<BuildEntryManagementFilterFieldsOptions> = {}) {
  const fields = buildEntryManagementFilterFields({
    state: BASE_STATE,
    trials: TRIALS,
    trialsLoaded: true,
    trialClasses: CLASSES,
    classesLoaded: true,
    classTrialById: new Map([
      ['c1', 't1'],
      ['c2', 't2'],
    ]),
    counts: null,
    onScopeChange: vi.fn(),
    ...overrides,
  });
  return { trial: fields[0]!, class: fields[1]!, keys: fields.map(field => field.key) };
}

describe('buildEntryManagementFilterFields', () => {
  it('has Trial and Class as multi-selects, and no Payment status field (MYK9-906)', () => {
    const fields = build();
    expect(fields.keys).toEqual(['trial', 'class']);
    expect(fields.trial.kind).toBe('multiOptions');
    expect(fields.class.kind).toBe('multiOptions');
    expect(fields.trial.options.map(option => option.value)).toEqual(['t1', 't2']);
  });

  it('names the trial on each class when the show has more than one trial (settled rule 5)', () => {
    expect(build().class.options.map(option => option.label)).toEqual([
      'Trial 1 · Interior Novice B',
      'Trial 2 · Interior Novice B',
    ]);
    expect(build({ trials: [TRIALS[0]!] }).class.options[0]?.label).toBe('Interior Novice B');
  });

  it('routes a class pick through onScopeChange keeping the current trials', () => {
    const onScopeChange = vi.fn();
    build({ state: { ...BASE_STATE, trialIds: ['t1'] }, onScopeChange }).class.onChange(['c1']);
    expect(onScopeChange).toHaveBeenCalledWith(['t1'], ['c1']);
  });

  it('drops the classes of a trial that is no longer picked, in the same write (settled rule 4)', () => {
    const onScopeChange = vi.fn();
    const { trial } = build({
      state: { ...BASE_STATE, trialIds: ['t1', 't2'], classIds: ['c1', 'c2', 'unknown'] },
      onScopeChange,
    });

    trial.onChange(['t2']);

    // `unknown` belongs to no loaded trial, so it is kept rather than erased from a link.
    expect(onScopeChange).toHaveBeenCalledWith(['t2'], ['c2', 'unknown']);
  });

  it('keeps every class when the last trial is removed, since all classes are then offered', () => {
    const onScopeChange = vi.fn();
    build({
      state: { ...BASE_STATE, trialIds: ['t1'], classIds: ['c1'] },
      onScopeChange,
    }).trial.onChange([]);
    expect(onScopeChange).toHaveBeenCalledWith([], ['c1']);
  });

  it('shows whole-show counts, and none for trials until every class trial is known', () => {
    const fields = build({ counts: { byClass: new Map([['c1', 4]]) } });
    expect(fields.class.options.map(option => option.count)).toEqual([4, 0]);
    expect(fields.trial.options.map(option => option.count)).toEqual([undefined, undefined]);

    const withTrials = build({
      counts: { byClass: new Map(), byTrial: new Map([['t2', 7]]) },
    });
    expect(withTrials.trial.options.map(option => option.count)).toEqual([0, 7]);
  });

  it('marks a field loading so a restored link never shows raw ids (settled rule 6)', () => {
    const fields = build({
      state: { ...BASE_STATE, classIds: ['c1'] },
      trialClasses: [],
      classesLoaded: false,
    });
    expect(fields.class.loading).toBe(true);
    expect(describeAppliedFilter(fields.class)).toBeNull();
  });
});
