import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_REMOTE_COUNT_INTERVAL_MS,
  configureRemoteCountCadence,
  getRealtimeReconnectEpoch,
  getRemoteCountCadence,
  markRealtimeReconnected,
  recordRemoteCountPass,
  resetRemoteCountCadenceForTests,
  decideRemoteCount,
  shouldCountRemoteRows,
  type ShouldCountRemoteRowsInput,
} from './remoteCountCadence';

const base: ShouldCountRemoteRowsInput = {
  lastCountedAt: 1_000_000,
  now: 1_060_000,
  intervalMs: DEFAULT_REMOTE_COUNT_INTERVAL_MS,
  countEveryPass: false,
  reconnectEpoch: 0,
  lastCountedEpoch: 0,
  previousDeltaWasFullPage: false,
};

describe('shouldCountRemoteRows (MYK9-1301)', () => {
  it('skips an ordinary pass inside the interval', () => {
    expect(shouldCountRemoteRows(base)).toBe(false);
  });
  it('counts when nothing was ever counted', () => {
    expect(shouldCountRemoteRows({ ...base, lastCountedAt: undefined })).toBe(true);
    expect(shouldCountRemoteRows({ ...base, lastCountedAt: 0 })).toBe(true);
  });
  it('counts once the interval has elapsed, not a millisecond before', () => {
    const at = base.lastCountedAt as number;
    expect(shouldCountRemoteRows({ ...base, now: at + base.intervalMs - 1 })).toBe(false);
    expect(shouldCountRemoteRows({ ...base, now: at + base.intervalMs })).toBe(true);
  });
  it('counts on the first pass after a reconnect', () => {
    expect(shouldCountRemoteRows({ ...base, reconnectEpoch: 1 })).toBe(true);
    expect(shouldCountRemoteRows({ ...base, lastCountedEpoch: undefined })).toBe(true);
  });
  it('counts after a full-page delta', () => {
    expect(shouldCountRemoteRows({ ...base, previousDeltaWasFullPage: true })).toBe(true);
  });
  it('counts every pass when the flag is off', () => {
    expect(shouldCountRemoteRows({ ...base, countEveryPass: true })).toBe(true);
  });
});

describe('remote count cadence config holder', () => {
  beforeEach(() => {
    resetRemoteCountCadenceForTests();
  });

  it('defaults to ten minutes, not every pass', () => {
    expect(getRemoteCountCadence()).toEqual({ intervalMs: 10 * 60_000, everyPass: false });
  });
  it('applies partial config and ignores an invalid interval', () => {
    configureRemoteCountCadence({ everyPass: true });
    configureRemoteCountCadence({ intervalMs: Number.NaN });
    expect(getRemoteCountCadence()).toEqual({ intervalMs: 10 * 60_000, everyPass: true });
    configureRemoteCountCadence({ intervalMs: 5000 });
    expect(getRemoteCountCadence().intervalMs).toBe(5000);
  });
  it('markRealtimeReconnected advances the epoch and reset clears it', () => {
    markRealtimeReconnected();
    markRealtimeReconnected();
    expect(getRealtimeReconnectEpoch()).toBe(2);
    resetRemoteCountCadenceForTests();
    expect(getRealtimeReconnectEpoch()).toBe(0);
  });
  it('tracks state per owner and scope', () => {
    const a = {};
    const b = {};
    const first = decideRemoteCount(a, 's1', false);
    expect(first.count).toBe(true);
    recordRemoteCountPass(a, 's1', first, 0, undefined);
    expect(decideRemoteCount(a, 's1', false).count).toBe(false);
    expect(decideRemoteCount(a, 's2', false).count).toBe(true);
    expect(decideRemoteCount(b, 's1', false).count).toBe(true);
    expect(decideRemoteCount(a, 's1', true).count).toBe(true);
    recordRemoteCountPass(a, 's1', { count: false, epoch: 0 }, 5, 5);
    expect(decideRemoteCount(a, 's1', false).count).toBe(true);
  });
});
