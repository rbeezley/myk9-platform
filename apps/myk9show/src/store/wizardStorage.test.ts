import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { createDebouncedPersistStorage, WIZARD_PERSIST_DEBOUNCE_MS } from './wizardStorage';

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

type Draft = { name: string };
const NAME = 'wizard-test';
const value = (name: string): StorageValue<Draft> => ({ state: { name }, version: 1 });

function makeInner() {
  const inner: PersistStorage<Draft> & {
    setItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
    getItem: ReturnType<typeof vi.fn>;
  } = {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  };
  return inner;
}

describe('createDebouncedPersistStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid setItem calls into one write of the last value', () => {
    const inner = makeInner();
    const storage = createDebouncedPersistStorage(inner);

    for (const text of ['S', 'Sp', 'Spr', 'Spri', 'Spring']) {
      void storage.setItem(NAME, value(text));
      vi.advanceTimersByTime(WIZARD_PERSIST_DEBOUNCE_MS - 50);
    }
    expect(inner.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WIZARD_PERSIST_DEBOUNCE_MS);
    expect(inner.setItem).toHaveBeenCalledTimes(1);
    expect(inner.setItem).toHaveBeenCalledWith(NAME, value('Spring'));
  });

  it('writes again for a burst after the window elapsed', () => {
    const inner = makeInner();
    const storage = createDebouncedPersistStorage(inner);
    void storage.setItem(NAME, value('a'));
    vi.advanceTimersByTime(WIZARD_PERSIST_DEBOUNCE_MS);
    void storage.setItem(NAME, value('b'));
    vi.advanceTimersByTime(WIZARD_PERSIST_DEBOUNCE_MS);
    expect(inner.setItem.mock.calls.map(call => call[1])).toEqual([value('a'), value('b')]);
  });

  it('flush writes pending state immediately and cancels the timer', async () => {
    const inner = makeInner();
    const storage = createDebouncedPersistStorage(inner);
    void storage.setItem(NAME, value('draft'));
    await storage.flush();
    expect(inner.setItem).toHaveBeenCalledTimes(1);
    expect(inner.setItem).toHaveBeenCalledWith(NAME, value('draft'));

    vi.advanceTimersByTime(WIZARD_PERSIST_DEBOUNCE_MS * 2);
    expect(inner.setItem).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending does not write', async () => {
    const inner = makeInner();
    await createDebouncedPersistStorage(inner).flush();
    expect(inner.setItem).not.toHaveBeenCalled();
  });

  it('flushes pending state on pagehide, beforeunload and when the tab is hidden', () => {
    const inner = makeInner();
    const storage = createDebouncedPersistStorage(inner);

    void storage.setItem(NAME, value('one'));
    window.dispatchEvent(new Event('pagehide'));
    expect(inner.setItem).toHaveBeenLastCalledWith(NAME, value('one'));

    void storage.setItem(NAME, value('two'));
    window.dispatchEvent(new Event('beforeunload'));
    expect(inner.setItem).toHaveBeenLastCalledWith(NAME, value('two'));

    void storage.setItem(NAME, value('three'));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockRestore();
    expect(inner.setItem).toHaveBeenLastCalledWith(NAME, value('three'));
    expect(inner.setItem).toHaveBeenCalledTimes(3);
  });

  it('getItem returns the pending value before it is written, else passes through', async () => {
    const inner = makeInner();
    inner.getItem.mockResolvedValue(value('stored'));
    const storage = createDebouncedPersistStorage(inner);

    expect(await storage.getItem(NAME)).toEqual(value('stored'));
    void storage.setItem(NAME, value('pending'));
    expect(storage.getItem(NAME)).toEqual(value('pending'));
    expect(inner.getItem).toHaveBeenCalledTimes(1);
  });

  it('removeItem drops the pending value so it cannot resurrect the draft', async () => {
    const inner = makeInner();
    const storage = createDebouncedPersistStorage(inner);
    void storage.setItem(NAME, value('draft'));
    await storage.removeItem(NAME);
    vi.advanceTimersByTime(WIZARD_PERSIST_DEBOUNCE_MS * 2);
    await storage.flush();
    expect(inner.removeItem).toHaveBeenCalledWith(NAME);
    expect(inner.setItem).not.toHaveBeenCalled();
  });

  it('a rejected write does not surface as an unhandled rejection', async () => {
    const inner = makeInner();
    inner.setItem.mockRejectedValue(new Error('idb down'));
    const storage = createDebouncedPersistStorage(inner);
    void storage.setItem(NAME, value('draft'));
    await expect(storage.flush()).resolves.toBeUndefined();
  });
});
