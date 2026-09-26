import { describe, expect, it, vi } from 'vitest';
import { RowRefetchRegistry } from './mutation-row-refetch';

function makeLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('RowRefetchRegistry (MYK9-771)', () => {
  it('returns undefined for a table that registered no refetcher', () => {
    expect(new RowRefetchRegistry(makeLogger()).request('entries', '1')).toBeUndefined();
  });

  it('joins a running re-fetch of the same row instead of starting another', async () => {
    const registry = new RowRefetchRegistry(makeLogger());
    let release!: () => void;
    const refetch = vi.fn(() => new Promise<void>(resolve => (release = resolve)));
    registry.register('entries', refetch);

    const first = registry.request('entries', '1');
    const second = registry.request('entries', '1');
    expect(second).toBe(first);
    await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    release();
    await first;

    // Settled: the next rejection starts a fresh fetch.
    const third = registry.request('entries', '1');
    expect(third).not.toBe(first);
    await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
    expect(refetch).toHaveBeenCalledWith(['1']);
    release();
    await third;
  });

  it('never rejects: a throwing refetcher is logged and the row can be asked again', async () => {
    const logger = makeLogger();
    const registry = new RowRefetchRegistry(logger);
    const refetch = vi.fn(() => {
      throw new Error('boom');
    });
    registry.register('entries', refetch);

    await expect(registry.request('entries', '1')).resolves.toBeUndefined();
    await expect(registry.request('entries', '1')).resolves.toBeUndefined();
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('unregister removes only the refetcher it registered', () => {
    const registry = new RowRefetchRegistry(makeLogger());
    const unregisterOld = registry.register(
      'entries',
      vi.fn(async () => undefined)
    );
    registry.register(
      'entries',
      vi.fn(async () => undefined)
    );

    unregisterOld();

    expect(registry.request('entries', '1')).toBeDefined();
  });
});
