import { afterEach, describe, expect, it, vi } from 'vitest';
import { endOnOffline } from './endOnOffline';

const never = () => new Promise<never>(() => {});

describe('endOnOffline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves with the promise result and removes its listener', async () => {
    const removed = vi.spyOn(window, 'removeEventListener');
    await expect(endOnOffline(Promise.resolve('rows'), 'offline')).resolves.toBe('rows');
    expect(removed).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('rejects with the promise error and removes its listener', async () => {
    const removed = vi.spyOn(window, 'removeEventListener');
    await expect(endOnOffline(Promise.reject(new Error('boom')), 'offline')).rejects.toThrow(
      'boom'
    );
    expect(removed).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('resolves with the offline value at once when already offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const add = vi.spyOn(window, 'addEventListener');
    await expect(endOnOffline(never(), 'offline')).resolves.toBe('offline');
    expect(add).not.toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('resolves with the offline value when the offline event fires, and cleans up', async () => {
    const removed = vi.spyOn(window, 'removeEventListener');
    const waiting = endOnOffline(never(), 'offline');
    window.dispatchEvent(new Event('offline'));
    await expect(waiting).resolves.toBe('offline');
    expect(removed).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('keeps a late rejection of the abandoned promise from going unhandled', async () => {
    let fail: (error: Error) => void = () => {};
    const slow = new Promise<never>((_, reject) => {
      fail = reject;
    });
    const waiting = endOnOffline(slow, 'offline');
    window.dispatchEvent(new Event('offline'));
    await waiting;
    fail(new Error('late'));
    await Promise.resolve();
  });
});
