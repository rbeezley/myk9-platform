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
