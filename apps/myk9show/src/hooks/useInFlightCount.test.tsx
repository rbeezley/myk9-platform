import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useInFlightCount } from './useInFlightCount';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useInFlightCount', () => {
  it('stays above 0 until both overlapping writes settle, newer first', async () => {
    const older = deferred();
    const newer = deferred();
    const queue = [older, newer];
    const { result } = renderHook(() => useInFlightCount(() => queue.shift()!.promise));

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = result.current.track();
      p2 = result.current.track();
    });
    expect(result.current.inFlight).toBe(2);

    await act(async () => {
      newer.resolve();
      await p2;
    });
    expect(result.current.inFlight).toBe(1);

    await act(async () => {
      older.resolve();
      await p1;
    });
    expect(result.current.inFlight).toBe(0);
  });

  it('decrements when a write rejects', async () => {
    const { result } = renderHook(() => useInFlightCount(() => Promise.reject(new Error('x'))));
    await act(async () => {
      await result.current.track().catch(() => {});
    });
    expect(result.current.inFlight).toBe(0);
  });
});
