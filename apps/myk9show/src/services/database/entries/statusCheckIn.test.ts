import { describe, expect, it } from 'vitest';
import { buildReplicatedEntryStatusUpdate } from './secretary';
import { resolveCheckInStatusForTransition } from './statusCheckIn';

describe('buildReplicatedEntryStatusUpdate check-in (MYK9-1384)', () => {
  it('clears pulled when a scratched entry is confirmed (camel and snake keys)', () => {
    expect(
      buildReplicatedEntryStatusUpdate('confirmed', undefined, undefined, {
        previousEntryStatus: 'scratched',
      })
    ).toMatchObject({ checkInStatus: 'no-status', check_in_status: 'no-status' });
  });

  it('restores the captured prior check-in when supplied', () => {
    expect(
      buildReplicatedEntryStatusUpdate('confirmed', undefined, undefined, {
        previousEntryStatus: 'scratched',
        priorCheckInStatus: 'checked-in',
      })
    ).toMatchObject({ checkInStatus: 'checked-in', check_in_status: 'checked-in' });
  });

  it('writes no check-in key for a plain confirm from a non-scratched status', () => {
    for (const previousEntryStatus of ['submitted', 'confirmed', undefined] as const) {
      const update = buildReplicatedEntryStatusUpdate('confirmed', undefined, undefined, {
        previousEntryStatus,
        priorCheckInStatus: 'checked-in',
      });
      expect(update).not.toHaveProperty('check_in_status');
      expect(update).not.toHaveProperty('checkInStatus');
    }
    expect(buildReplicatedEntryStatusUpdate('confirmed')).not.toHaveProperty('check_in_status');
  });

  it('still writes pulled on a Pull', () => {
    expect(buildReplicatedEntryStatusUpdate('scratched')).toMatchObject({
      check_in_status: 'pulled',
    });
  });

  it('restores the captured check-in when a Pull of a withdrawn entry is undone', () => {
    expect(
      resolveCheckInStatusForTransition('withdrawn', {
        previousEntryStatus: 'scratched',
        priorCheckInStatus: 'no-status',
      })
    ).toBe('no-status');
  });

  it('does not touch check-in when a scratched entry is withdrawn', () => {
    expect(
      resolveCheckInStatusForTransition('withdrawn', { previousEntryStatus: 'scratched' })
    ).toBe(undefined);
  });
});

describe('check_in_status_before_pull (MYK9-1396)', () => {
  it('no status change ever puts the column in a write payload (the trigger owns it)', () => {
    const contexts = [
      undefined,
      {
        previousEntryStatus: 'scratched' as const,
        storedCheckInStatusBeforePull: 'checked-in' as const,
      },
      { previousEntryStatus: 'scratched' as const, priorCheckInStatus: 'at-gate' as const },
    ];
    for (const status of ['scratched', 'confirmed', 'withdrawn'] as const) {
      for (const context of contexts) {
        const update = buildReplicatedEntryStatusUpdate(status, undefined, undefined, context);
        expect(update).not.toHaveProperty('check_in_status_before_pull');
        expect(update).not.toHaveProperty('checkInStatusBeforePull');
      }
    }
  });

  it('a plain Accept restores the stored prior', () => {
    expect(
      buildReplicatedEntryStatusUpdate('confirmed', undefined, undefined, {
        previousEntryStatus: 'scratched',
        storedCheckInStatusBeforePull: 'checked-in',
      })
    ).toMatchObject({ check_in_status: 'checked-in', checkInStatus: 'checked-in' });
  });

  it('the in-memory Undo prior still wins over the stored one', () => {
    expect(
      resolveCheckInStatusForTransition('confirmed', {
        previousEntryStatus: 'scratched',
        priorCheckInStatus: 'at-gate',
        storedCheckInStatusBeforePull: 'checked-in',
      })
    ).toBe('at-gate');
  });

  it('falls back to no-status with neither prior', () => {
    expect(
      resolveCheckInStatusForTransition('confirmed', {
        previousEntryStatus: 'scratched',
        storedCheckInStatusBeforePull: null,
      })
    ).toBe('no-status');
  });

  it('leaves check-in alone when the Pull becomes a Withdraw', () => {
    expect(
      resolveCheckInStatusForTransition('withdrawn', {
        previousEntryStatus: 'scratched',
        storedCheckInStatusBeforePull: 'checked-in',
      })
    ).toBe(undefined);
  });
});
