import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClassRowActions } from '../useClassRowActions';
import type { SetupClassSnapshot } from '../setupClassSnapshot';

// The show home's Edit class (MYK9-956) resolves the class before its panel mounts. These were
// guarded by the Classes tab's row-menu tests until that menu went (MYK9-1337); the resolver's
// own replica and hydration paths are covered by setupClassSnapshot.test.ts.

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

const resolveSetupClass = vi.hoisted(() => vi.fn());
vi.mock('../setupClassSnapshot', () => ({ resolveSetupClass }));

const snapshot = (id: string) => ({ id }) as unknown as SetupClassSnapshot;

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useClassRowActions', () => {
  beforeEach(() => {
    toastError.mockReset();
    resolveSetupClass.mockReset();
  });

  it('opens the editor on the resolved snapshot and unlocks', async () => {
    resolveSetupClass.mockResolvedValue(snapshot('c1'));
    const { result } = renderHook(() => useClassRowActions());

    await act(() => result.current.openClassAction({ id: 'c1', trialId: 't1' }));

    expect(resolveSetupClass).toHaveBeenCalledWith('c1', 't1');
    expect(result.current.pendingAction).toEqual({
      classSnapshot: snapshot('c1'),
      trialId: 't1',
      requestId: 1,
    });
    expect(result.current.hydratingClassId).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a class that cannot be found says so, opens nothing and unlocks', async () => {
    resolveSetupClass.mockResolvedValue(null);
    const { result } = renderHook(() => useClassRowActions());

    await act(() => result.current.openClassAction({ id: 'c1', trialId: 't1' }));

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/couldn't load this class/i));
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.hydratingClassId).toBeNull();
  });

  it('a resolve that throws is the same error, not a silent no-op, and unlocks', async () => {
    resolveSetupClass.mockRejectedValue(new Error('IndexedDB read failed'));
    const { result } = renderHook(() => useClassRowActions());

    await act(() => result.current.openClassAction({ id: 'c1', trialId: 't1' }));

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/couldn't load this class/i));
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.hydratingClassId).toBeNull();
  });

  it('holds the class as hydrating while it resolves', async () => {
    const slow = deferred<SetupClassSnapshot>();
    resolveSetupClass.mockReturnValue(slow.promise);
    const { result } = renderHook(() => useClassRowActions());

    let opening: Promise<void> = Promise.resolve();
    act(() => {
      opening = result.current.openClassAction({ id: 'c1', trialId: 't1' });
    });
    expect(result.current.hydratingClassId).toBe('c1');
    expect(result.current.pendingAction).toBeNull();

    await act(async () => {
      slow.resolve(snapshot('c1'));
      await opening;
    });
    expect(result.current.hydratingClassId).toBeNull();
    expect(result.current.pendingAction?.classSnapshot).toEqual(snapshot('c1'));
  });

  it('only the latest request opens: a slow earlier one never replaces it', async () => {
    const first = deferred<SetupClassSnapshot>();
    const second = deferred<SetupClassSnapshot>();
    resolveSetupClass.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useClassRowActions());

    let openFirst: Promise<void> = Promise.resolve();
    let openSecond: Promise<void> = Promise.resolve();
    act(() => {
      openFirst = result.current.openClassAction({ id: 'c1', trialId: 't1' });
    });
    act(() => {
      openSecond = result.current.openClassAction({ id: 'c2', trialId: 't1' });
    });
    expect(result.current.hydratingClassId).toBe('c2');

    await act(async () => {
      second.resolve(snapshot('c2'));
      await openSecond;
    });
    await act(async () => {
      first.resolve(snapshot('c1'));
      await openFirst;
    });

    expect(result.current.pendingAction).toEqual({
      classSnapshot: snapshot('c2'),
      trialId: 't1',
      requestId: 2,
    });
    expect(result.current.hydratingClassId).toBeNull();
  });

  it('a stale request that fails stays silent and does not unlock the newer one', async () => {
    const first = deferred<SetupClassSnapshot | null>();
    const second = deferred<SetupClassSnapshot>();
    resolveSetupClass.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useClassRowActions());

    let openFirst: Promise<void> = Promise.resolve();
    act(() => {
      openFirst = result.current.openClassAction({ id: 'c1', trialId: 't1' });
    });
    act(() => {
      void result.current.openClassAction({ id: 'c2', trialId: 't1' });
    });

    await act(async () => {
      first.resolve(null);
      await openFirst;
    });

    expect(toastError).not.toHaveBeenCalled();
    expect(result.current.hydratingClassId).toBe('c2');
  });
});
