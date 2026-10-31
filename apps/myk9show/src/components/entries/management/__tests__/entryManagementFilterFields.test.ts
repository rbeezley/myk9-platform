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
  queues: ['all'],
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

const QUEUE_COUNTS = { 'needs-review': 4, 'missing-information': 1, 'payment-due': 3, all: 9 };

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
    queueCounts: QUEUE_COUNTS,
    onQueuesChange: vi.fn(),
    ...overrides,
  });
  return {
    status: fields[0]!,
    trial: fields[1]!,
    class: fields[2]!,
    keys: fields.map(field => field.key),
  };
}

describe('buildEntryManagementFilterFields', () => {
  it('has Status, Trial and Class as multi-selects', () => {
    const fields = build();
    expect(fields.keys).toEqual(['status', 'trial', 'class']);
    expect(fields.status.kind).toBe('multiOptions');
    expect(fields.trial.kind).toBe('multiOptions');
    expect(fields.class.kind).toBe('multiOptions');
    expect(fields.trial.options.map(option => option.value)).toEqual(['t1', 't2']);
  });

  it('offers the three queues with their counts, and All is no filter rather than a choice', () => {
    const { status } = build();
    expect(status.options).toEqual([
      { value: 'needs-review', label: 'Needs review', count: 4 },
      { value: 'missing-information', label: 'Missing info', count: 1 },
      { value: 'payment-due', label: 'Payment due', count: 3 },
    ]);
    expect(status.values).toEqual([]);
    expect(describeAppliedFilter(status)).toBeNull();
  });

  it('reads the picked queues as the status, and hands the picks back as a union', () => {
    const onQueuesChange = vi.fn();
    const { status } = build({
      state: { ...BASE_STATE, queues: ['needs-review', 'payment-due'] },
      onQueuesChange,
    });
    expect(status.values).toEqual(['needs-review', 'payment-due']);
    expect(describeAppliedFilter(status)).toBe('Status: Needs review, Payment due');
    status.onChange(['needs-review', 'payment-due', 'missing-information']);
    expect(onQueuesChange).toHaveBeenCalledWith([
      'needs-review',
      'payment-due',
      'missing-information',
    ]);
    status.onChange([]);
    expect(onQueuesChange).toHaveBeenLastCalledWith([]);
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
