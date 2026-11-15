/**
 * MYK9-2015: a class has started once any dog is checked in, in the ring or scored, or its
 * status says so. Rows are shaped like this device's replicated entry rows.
 */
import { describe, expect, it } from 'vitest';
import { hasClassStarted } from './showMapStatus';

const dog = (fields: Record<string, unknown>) => ({
  entry_status: 'confirmed',
  check_in_status: 'no-status',
  is_scored: false,
  result_status: 'pending',
  ...fields,
});

describe('hasClassStarted', () => {
  it('is false for a scheduled class with no dog checked in', () => {
    expect(hasClassStarted('Scheduled', [dog({}), dog({})])).toBe(false);
    expect(hasClassStarted(undefined, [])).toBe(false);
  });

  it.each([
    ['checked in', { check_in_status: 'checked-in' }],
    ['at the gate', { check_in_status: 'at-gate' }],
    ['in the ring', { check_in_status: 'in-ring' }],
    ['in the ring by flag', { is_in_ring: true }],
    ['scored', { is_scored: true, result_status: 'qualified' }],
    ['completed', { check_in_status: 'completed' }],
  ])('is true once a dog is %s', (_label, fields) => {
    expect(hasClassStarted('Scheduled', [dog({}), dog(fields)])).toBe(true);
  });

  it.each(['In Progress', 'in_progress', 'Completed'])('is true for a class status of %s', s => {
    expect(hasClassStarted(s, [])).toBe(true);
  });

  it('is false when the only checked-in dog was pulled, scratched or moved out', () => {
    expect(
      hasClassStarted('Scheduled', [
        dog({ check_in_status: 'pulled' }),
        dog({ entry_status: 'scratched', check_in_status: 'checked-in' }),
        dog({ entry_status: 'moved', check_in_status: 'checked-in' }),
      ])
    ).toBe(false);
  });
});
