import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNC_INTERVAL_MS } from '@myk9/replication';
import { features } from '@/config/features';
import {
  SLOW_POLL_MAX_MS,
  SLOW_POLL_MIN_MS,
  clearShowChannel,
  holdFastPoll,
  markOnline,
  markShowChannel,
  nextPollDelayMs,
  registerShowChannelMount,
  onCadenceChange,
  resetSyncCadence,
  setCadenceRandom,
} from '../syncCadence';

const mutableFeatures = features as { replicationSubscribedCadence: boolean };

beforeEach(() => {
  resetSyncCadence();
  mutableFeatures.replicationSubscribedCadence = true;
});

describe('nextPollDelayMs', () => {
  it('is 60 s with no subscribed show', () => {
    expect(nextPollDelayMs()).toBe(SYNC_INTERVAL_MS);
  });

  it('is 3-5 min with one subscribed show while online, jittered by the injected rng', () => {
    markShowChannel('a', true);
    setCadenceRandom(() => 0);
    expect(nextPollDelayMs()).toBe(SLOW_POLL_MIN_MS);
    setCadenceRandom(() => 0.999999);
    expect(nextPollDelayMs()).toBeLessThanOrEqual(SLOW_POLL_MAX_MS);
    expect(nextPollDelayMs()).toBeGreaterThan(SLOW_POLL_MAX_MS - 1_000);
    setCadenceRandom(() => 0.5);
    expect(nextPollDelayMs()).toBe(240_000);
  });

  it('is 60 s when offline, even with a subscribed show', () => {
    markShowChannel('a', true);
    markOnline(false);
    expect(nextPollDelayMs()).toBe(SYNC_INTERVAL_MS);
    markOnline(true);
    expect(nextPollDelayMs()).toBeGreaterThanOrEqual(SLOW_POLL_MIN_MS);
  });

  it('is 60 s with the flag off', () => {
    mutableFeatures.replicationSubscribedCadence = false;
    markShowChannel('a', true);
    expect(nextPollDelayMs()).toBe(SYNC_INTERVAL_MS);
  });

  it('two mounts of one show: clearing one stays slow, clearing both is fast', () => {
    const first = registerShowChannelMount('a');
    const second = registerShowChannelMount('a');
    expect(first).not.toBe(second);
    markShowChannel(first, true);
    markShowChannel(second, true);
    clearShowChannel(first);
    expect(nextPollDelayMs()).toBeGreaterThanOrEqual(SLOW_POLL_MIN_MS);
    clearShowChannel(second);
    expect(nextPollDelayMs()).toBe(SYNC_INTERVAL_MS);
  });

  it('stays slow while any of two shows is subscribed and returns to 60 s when both drop', () => {
    markShowChannel('a', true);
    markShowChannel('b', true);
    markShowChannel('a', false);
    expect(nextPollDelayMs()).toBeGreaterThanOrEqual(SLOW_POLL_MIN_MS);
    clearShowChannel('b');
    expect(nextPollDelayMs()).toBe(SYNC_INTERVAL_MS);
  });
});

describe('onCadenceChange', () => {
  it('fires only when the cadence flips, and stops after unsubscribe', () => {
    const listener = vi.fn();
    const stop = onCadenceChange(listener);

    markShowChannel('a', true);
    expect(listener).toHaveBeenCalledTimes(1);
    markShowChannel('b', true);
    markShowChannel('a', false);
    expect(listener).toHaveBeenCalledTimes(1);
    markOnline(false);
    expect(listener).toHaveBeenCalledTimes(2);
    markOnline(false);
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    markOnline(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('holdFastPoll', () => {
  it('keeps the 60 s poll while held, even with a subscribed show, and releases once', () => {
    markShowChannel('a', true);
    const release = holdFastPoll();
    expect(nextPollDelayMs()).toBe(SYNC_INTERVAL_MS);

    release();
    release();
    expect(nextPollDelayMs()).toBeGreaterThanOrEqual(SLOW_POLL_MIN_MS);
  });

  it('notifies cadence listeners when the hold flips the poll', () => {
    markShowChannel('a', true);
    const listener = vi.fn();
    onCadenceChange(listener);
    const release = holdFastPoll();
    expect(listener).toHaveBeenCalledTimes(1);
    release();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
