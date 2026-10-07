import { describe, expect, it } from 'vitest';
import {
  describeAppliedFilter,
  isFieldActive,
  keepOfferedValues,
  toggleListValue,
} from '../filterFieldState';
import type { ListMenuFilterField, ListMultiOptionsFilterField } from '../types';

const classField = (values: string[]): ListMultiOptionsFilterField => ({
  kind: 'multiOptions',
  key: 'class',
  label: 'Class',
  values,
  onChange: () => undefined,
  options: [
    { value: 'c1', label: 'Interior Novice B' },
    { value: 'c2', label: 'Exterior Excellent' },
    { value: 'c3', label: 'Containers Advanced' },
  ],
});

describe('isFieldActive for a multi-select field', () => {
  it('is inactive with no values and active with one or more', () => {
    expect(isFieldActive(classField([]))).toBe(false);
    expect(isFieldActive(classField(['c1']))).toBe(true);
    expect(isFieldActive(classField(['c1', 'c2']))).toBe(true);
  });
});

describe('toggleListValue', () => {
  it('adds a value at the end and removes one that is already there', () => {
    expect(toggleListValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleListValue(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleListValue([], 'a')).toEqual(['a']);
  });

  it('does not change the list it is given', () => {
    const before = ['a'];
    toggleListValue(before, 'b');
    expect(before).toEqual(['a']);
  });
});

describe('keepOfferedValues', () => {
  it('drops values the field no longer offers, keeping order', () => {
    const { options } = classField([]);
    expect(keepOfferedValues(['c2', 'gone', 'c1'], options)).toEqual(['c2', 'c1']);
  });
});

describe('describeAppliedFilter', () => {
  it('is null when the field narrows nothing', () => {
    expect(describeAppliedFilter(classField([]))).toBeNull();
  });

  it('lists several values in the order the field offers them, not the order picked', () => {
    expect(describeAppliedFilter(classField(['c2', 'c1']))).toBe(
      'Class: Interior Novice B, Exterior Excellent'
    );
  });

  it('shows a value the field no longer offers as it is, after the known ones', () => {
    expect(describeAppliedFilter(classField(['old-id', 'c3']))).toBe(
      'Class: Containers Advanced, old-id'
    );
  });

  it('says nothing rather than a blank, a doubled value or an empty label', () => {
    expect(describeAppliedFilter(classField(['']))).toBeNull();
    expect(describeAppliedFilter(classField(['x', 'x']))).toBe('Class: x');
    const unlabelled: ListMultiOptionsFilterField = {
      ...classField(['c1', 'c2']),
      options: [
        { value: 'c1', label: '' },
        { value: 'c2', label: 'Exterior Excellent' },
      ],
    };
    expect(describeAppliedFilter(unlabelled)).toBe('Class: Exterior Excellent');
    expect(describeAppliedFilter({ ...unlabelled, values: ['c1'] })).toBeNull();
  });

  it('reads a single-select field by its option label, or raw when stale', () => {
    const single = (value: string): ListMenuFilterField => ({
      kind: 'options',
      key: 'trial',
      label: 'Trial',
      value,
      onChange: () => undefined,
      options: [{ value: 't1', label: 'Trial 1 · Nov 9' }],
    });
    expect(describeAppliedFilter(single('t1'))).toBe('Trial: Trial 1 · Nov 9');
    expect(describeAppliedFilter(single('t9'))).toBe('Trial: t9');
  });

  it('reads a date range, and is null when it is open on both ends', () => {
    const range = (start: Date | null, end: Date | null): ListMenuFilterField => ({
      kind: 'dateRange',
      key: 'created',
      label: 'Created',
      value: { start, end },
      onChange: () => undefined,
    });
    expect(describeAppliedFilter(range(null, null))).toBeNull();
    expect(describeAppliedFilter(range(new Date(2026, 10, 9), null))).toMatch(
      /^Created: after Nov 9, 2026$/
    );
  });
});
