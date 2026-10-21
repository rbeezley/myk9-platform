import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { SYNC_INTERVAL_MS } from '@myk9/replication';
import { features } from '@/config/features';
import { markOnline, markShowChannel, resetSyncCadence, setCadenceRandom } from '../syncCadence';
import type { UploadSyncTarget } from '../ringsideUploadSyncTargets';
import { useSyncPassScheduler } from '../useSyncPassScheduler';

const mutableFeatures = features as { replicationSubscribedCadence: boolean };
const SLOW_MS = 240_000; // rng 0.5

type Trigger = (targets?: UploadSyncTarget[]) => Promise<void>;
let trigger: ReturnType<typeof vi.fn<Trigger>>;
let triggerRef: MutableRefObject<Trigger | undefined>;

const mount = () => renderHook(() => useSyncPassScheduler(true, triggerRef));
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  resetSyncCadence();
  mutableFeatures.replicationSubscribedCadence = true;
  setCadenceRandom(() => 0.5);
  trigger = vi.fn<Trigger>().mockResolvedValue(undefined);
  triggerRef = { current: trigger };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSyncPassScheduler cadence', () => {
  it('polls every 60 s when no channel is subscribed', () => {
    mount();
    advance(SYNC_INTERVAL_MS - 1);
    expect(trigger).not.toHaveBeenCalled();
    advance(1);
    expect(trigger).toHaveBeenCalledTimes(1);
    advance(SYNC_INTERVAL_MS);
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it('ticks at the jittered slow delay while subscribed', () => {
    markShowChannel('a', true);
    mount();
    advance(SLOW_MS - 1);
    expect(trigger).not.toHaveBeenCalled();
    advance(1);
    expect(trigger).toHaveBeenCalledTimes(1);
    advance(SLOW_MS);
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it('on a drop with 70 s elapsed since the last tick, runs at once, then every 60 s', () => {
    markShowChannel('a', true);
    mount();
    advance(70_000);
    expect(trigger).not.toHaveBeenCalled();

    act(() => markShowChannel('a', false));
    advance(0);
    expect(trigger).toHaveBeenCalledTimes(1);

    advance(SYNC_INTERVAL_MS - 1);
    expect(trigger).toHaveBeenCalledTimes(1);
    advance(1);
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it('on a drop with 20 s elapsed, falls back to 60 s measured from the last tick', () => {
    markShowChannel('a', true);
    mount();
    advance(20_000);
    act(() => markOnline(false));
    advance(39_999);
    expect(trigger).not.toHaveBeenCalled();
    advance(1);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('does not start a pass when the channel rejoins; the next tick stays slow', () => {
    mount();
    advance(10_000);
    act(() => markShowChannel('a', true));
    advance(0);
    expect(trigger).not.toHaveBeenCalled();
    advance(SLOW_MS - 10_000);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('keeps the cadence when the sync throws', () => {
    trigger.mockImplementation(() => {
      throw new Error('boom');
    });
    markShowChannel('a', true);
    mount();
    advance(SLOW_MS);
    expect(trigger).toHaveBeenCalledTimes(1);
    advance(SLOW_MS);
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it('after a backward clock step, a flip still lands within 60 s of now', () => {
    markShowChannel('a', true);
    mount();
    advance(10_000);
    vi.setSystemTime(Date.now() - 600_000);
    act(() => markShowChannel('a', false));
    advance(SYNC_INTERVAL_MS);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('stays at 60 s with the flag off', () => {
    mutableFeatures.replicationSubscribedCadence = false;
    markShowChannel('a', true);
    mount();
    advance(SYNC_INTERVAL_MS);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('arms nothing when autoSync is off and clears on unmount', () => {
    renderHook(() => useSyncPassScheduler(false, triggerRef));
    advance(SLOW_MS);
    expect(trigger).not.toHaveBeenCalled();

    const { unmount } = mount();
    unmount();
    advance(SLOW_MS);
    expect(trigger).not.toHaveBeenCalled();
  });
});

describe('useSyncPassScheduler sync requests', () => {
  it('a request carrying targets runs a scoped pass with exactly those targets', () => {
    mount();
    const targets: UploadSyncTarget[] = [{ name: 'entries', scopeId: 'show-1' }];
    act(() => {
      window.dispatchEvent(new CustomEvent('replication:sync-requested', { detail: { targets } }));
    });
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith(targets);
  });

  it('a bare request runs the full pass with no arguments', () => {
    mount();
    act(() => {
      window.dispatchEvent(new Event('replication:sync-requested'));
    });
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger.mock.calls[0]).toEqual([]);
  });

  it('a deferred request still waits for the scheduler gap and carries no targets', () => {
    mount();
    act(() => {
      window.dispatchEvent(
        new CustomEvent('replication:sync-requested', { detail: { deferred: true } })
      );
    });
    expect(trigger).not.toHaveBeenCalled();
  });
});
