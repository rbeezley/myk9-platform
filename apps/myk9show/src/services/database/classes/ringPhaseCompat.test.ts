import { beforeEach, describe, expect, it } from 'vitest';
import { CLASS_AUTHENTICATED_COLUMN_SELECT } from './reads';
import {
  RING_PHASE_RECHECK_MS,
  isRingPhaseKnownMissing,
  resetRingPhaseSchemaCache,
  withRingPhaseFallback,
  withoutRingPhaseColumns,
  withoutRingPhaseKeys,
} from './ringPhaseCompat';

const missing = { code: '42703', message: 'column classes.ring_phase does not exist' };

describe('ringPhaseCompat (MYK9-1527)', () => {
  beforeEach(() => {
    resetRingPhaseSchemaCache();
  });

  it('drops only the pair from the authenticated select', () => {
    const stripped = withoutRingPhaseColumns(`${CLASS_AUTHENTICATED_COLUMN_SELECT}, embed(id)`);
    expect(stripped).not.toContain('ring_phase');
    expect(stripped).toContain('results_verified_by');
    expect(stripped).toContain(', embed(id)');
  });

  it('retries once without the pair on 42703 and remembers the answer', async () => {
    const omits: boolean[] = [];
    const run = async (omit: boolean) => {
      omits.push(omit);
      return omit ? { data: [{ id: 'c1' }], error: null } : { data: null, error: missing };
    };
    expect((await withRingPhaseFallback(run)).data).toEqual([{ id: 'c1' }]);
    expect(omits).toEqual([false, true]);
    expect(isRingPhaseKnownMissing()).toBe(true);

    await withRingPhaseFallback(run);
    expect(omits).toEqual([false, true, true]);
  });

  it('does not retry an error that names another column', async () => {
    let calls = 0;
    const result = await withRingPhaseFallback(async () => {
      calls += 1;
      return {
        data: null,
        error: { code: '42703', message: 'column classes.nope does not exist' },
      };
    });
    expect(calls).toBe(1);
    expect(result.error).toBeTruthy();
    expect(isRingPhaseKnownMissing()).toBe(false);
  });

  describe('the latch expires', () => {
    let clock = 0;
    beforeEach(() => {
      clock = 1_000;
      resetRingPhaseSchemaCache(() => clock);
    });

    const rejecting = (omits: boolean[]) => async (omit: boolean) => {
      omits.push(omit);
      return omit ? { data: [], error: null } : { data: null, error: missing };
    };

    it('omits the pair within the window, then asks for it again after it', async () => {
      const omits: boolean[] = [];
      const run = rejecting(omits);
      await withRingPhaseFallback(run);
      clock += RING_PHASE_RECHECK_MS - 1;
      expect(isRingPhaseKnownMissing()).toBe(true);
      await withRingPhaseFallback(run);
      expect(omits).toEqual([false, true, true]);

      clock += 1;
      expect(isRingPhaseKnownMissing()).toBe(false);
      await withRingPhaseFallback(run);
      expect(omits.slice(3)).toEqual([false, true]);
    });

    it('clears for good once the server has the columns', async () => {
      const omits: boolean[] = [];
      await withRingPhaseFallback(rejecting(omits));
      clock += RING_PHASE_RECHECK_MS;
      const ok = async (omit: boolean) => {
        omits.push(omit);
        return { data: [], error: null };
      };
      await withRingPhaseFallback(ok);
      expect(isRingPhaseKnownMissing()).toBe(false);
      await withRingPhaseFallback(ok);
      expect(omits.slice(2)).toEqual([false, false]);
    });

    it('re-latches once per window when the server still lacks the columns, never in a loop', async () => {
      const omits: boolean[] = [];
      const run = rejecting(omits);
      await withRingPhaseFallback(run);
      clock += RING_PHASE_RECHECK_MS;
      await withRingPhaseFallback(run);
      expect(isRingPhaseKnownMissing()).toBe(true);
      await withRingPhaseFallback(run);
      await withRingPhaseFallback(run);
      expect(omits).toEqual([false, true, false, true, true, true]);
    });
  });

  it('drops only the pair from a write body', () => {
    expect(withoutRingPhaseKeys({ name: 'A', ring_phase: 'break', ring_phase_time: 't' })).toEqual({
      name: 'A',
    });
  });
});
