import { describe, expect, it } from 'vitest';
import { payoutsKnownOff } from '../cardPausedCopy';

describe('payoutsKnownOff (MYK9-2166)', () => {
  it('is true only for a settled, successful, online answer of not ready', () => {
    expect(payoutsKnownOff({ isSuccess: true, data: false, fetchStatus: 'idle' }, true)).toBe(true);
  });

  it('is false while the answer is being refetched, even with a cached false', () => {
    expect(payoutsKnownOff({ isSuccess: true, data: false, fetchStatus: 'fetching' }, true)).toBe(
      false
    );
  });

  it('is false on an offline device, even when nothing is fetching', () => {
    expect(payoutsKnownOff({ isSuccess: true, data: false, fetchStatus: 'idle' }, false)).toBe(
      false
    );
  });

  it('is false when the query paused, errored, is unread, or says ready', () => {
    expect(payoutsKnownOff({ isSuccess: true, data: false, fetchStatus: 'paused' }, true)).toBe(
      false
    );
    expect(payoutsKnownOff({ isSuccess: false, data: false, fetchStatus: 'idle' }, true)).toBe(
      false
    );
    expect(payoutsKnownOff({ isSuccess: false, data: undefined, fetchStatus: 'idle' }, true)).toBe(
      false
    );
    expect(payoutsKnownOff({ isSuccess: true, data: true, fetchStatus: 'idle' }, true)).toBe(false);
  });

  it('is false when the fetch status is not known', () => {
    expect(payoutsKnownOff({ isSuccess: true, data: false }, true)).toBe(false);
  });
});
