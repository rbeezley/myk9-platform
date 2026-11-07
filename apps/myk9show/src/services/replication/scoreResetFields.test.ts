import { describe, expect, it } from 'vitest';
import type { CheckInStatus } from '@myk9/core';
import { scoreResetCheckInFields } from './scoreResetFields';

describe('scoreResetCheckInFields (MYK9-1737)', () => {
  it('puts a completed dog back to checked-in, so the badge and run queue stop calling it done', () => {
    expect(scoreResetCheckInFields({ checkInStatus: 'completed' })).toEqual({
      checkInStatus: 'checked-in',
      check_in_status: 'checked-in',
    });
  });

  it('reads the snake_case alias when the camel field is absent', () => {
    expect(scoreResetCheckInFields({ check_in_status: 'completed' })).toEqual({
      checkInStatus: 'checked-in',
      check_in_status: 'checked-in',
    });
  });

  it.each<CheckInStatus>(['no-status', 'checked-in', 'at-gate', 'in-ring', 'conflict', 'pulled'])(
    'leaves a %s dog untouched',
    status => {
      expect(scoreResetCheckInFields({ checkInStatus: status })).toEqual({});
    }
  );

  it('writes nothing when the entry is not in the local replica', () => {
    expect(scoreResetCheckInFields(null)).toEqual({});
  });
});
