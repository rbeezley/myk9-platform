import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createSyncPassScheduler, UNTARGETED_PASS_MIN_GAP_MS } from '../syncPassScheduler';

const GAP = UNTARGETED_PASS_MIN_GAP_MS;

describe('createSyncPassScheduler', () => {
  let run: Mock<() => void>;
  let visible: boolean;

  const make = () => createSyncPassScheduler({ run, canRun: () => visible });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    run = vi.fn<() => void>();
    visible = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('spaces untargeted passes at least 15s apart', () => {
    expect(GAP).toBeGreaterThanOrEqual(15_000);
    const scheduler = make();
    scheduler.requestUntargeted();
    expect(run).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    scheduler.requestUntargeted();
    expect(run).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(GAP - 5_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('coalesces a burst of untargeted requests into one trailing pass', () => {
    const scheduler = make();
    scheduler.requestUntargeted();
    scheduler.requestUntargeted();
    scheduler.requestUntargeted();
    scheduler.requestUntargeted();
    vi.advanceTimersByTime(GAP * 3);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('measures the gap from a pass an explicit request started', () => {
    const scheduler = make();
    scheduler.notePassStarted();
    vi.advanceTimersByTime(3_000);
    scheduler.requestUntargeted();
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(GAP - 3_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('re-spaces a pending pass when an explicit pass starts after it was scheduled', () => {
    const scheduler = make();
    scheduler.notePassStarted();
    vi.advanceTimersByTime(10_000);
    scheduler.requestUntargeted(); // due at +15s
    vi.advanceTimersByTime(4_000);
    scheduler.notePassStarted(); // explicit pass at +14s
    vi.advanceTimersByTime(1_000); // old schedule fires at +15s
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(GAP - 1_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not run an untargeted request while hidden', () => {
    visible = false;
    const scheduler = make();
    scheduler.requestUntargeted();
    vi.advanceTimersByTime(GAP * 4);
    expect(run).not.toHaveBeenCalled();
  });

  it('drops a pending pass that comes due while hidden, then catches up on visible', () => {
    const scheduler = make();
    scheduler.notePassStarted();
    scheduler.requestUntargeted();
    visible = false;
    vi.advanceTimersByTime(GAP);
    expect(run).not.toHaveBeenCalled();

    visible = true;
    scheduler.requestUntargeted();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a deferred request never starts a pass at once, but is not dropped', () => {
    const scheduler = make();
    scheduler.requestDeferred();
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(GAP - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('collapses repeated deferred requests (a flapping channel) into one pass', () => {
    const scheduler = make();
    for (let i = 0; i < 5; i++) {
      scheduler.requestDeferred();
      vi.advanceTimersByTime(1_000);
    }
    vi.advanceTimersByTime(GAP * 2);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('dispose cancels a pending pass', () => {
    const scheduler = make();
    scheduler.requestDeferred();
    scheduler.dispose();
    vi.advanceTimersByTime(GAP * 2);
    expect(run).not.toHaveBeenCalled();
  });
});
