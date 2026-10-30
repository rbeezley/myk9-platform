import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshApp } from './refreshApp';

function stubServiceWorker(registration: unknown) {
  const listeners: Record<string, () => void> = {};
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn((type: string, fn: () => void) => {
        listeners[type] = fn;
      }),
    },
  });
  return listeners;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('refreshApp', () => {
  it('reloads straight away when no service worker is waiting', async () => {
    stubServiceWorker({ waiting: null });
    const reload = vi.fn();
    await refreshApp(reload);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('posts SKIP_WAITING and reloads once, on controllerchange', async () => {
    const postMessage = vi.fn();
    const listeners = stubServiceWorker({ waiting: { postMessage } });
    const reload = vi.fn();
    await refreshApp(reload);
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    listeners.controllerchange();
    listeners.controllerchange();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads after the fallback if the swap never signals', async () => {
    vi.useFakeTimers();
    stubServiceWorker({ waiting: { postMessage: vi.fn() } });
    const reload = vi.fn();
    await refreshApp(reload);
    vi.advanceTimersByTime(3000);
    expect(reload).toHaveBeenCalledOnce();
  });
});
