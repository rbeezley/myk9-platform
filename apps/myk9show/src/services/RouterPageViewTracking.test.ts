import { describe, expect, it, vi } from 'vitest';
import { setupRouterPageViewTracking } from './RouterPageViewTracking';

interface FakeRouterState {
  location: {
    key: string;
  };
}

describe('setupRouterPageViewTracking', () => {
  it('tracks push and replace navigations once per location key', () => {
    let onStateChange: ((state: FakeRouterState) => void) | undefined;
    const unsubscribe = vi.fn();
    const router = {
      state: { location: { key: 'initial' } },
      subscribe: vi.fn((listener: (state: FakeRouterState) => void) => {
        onStateChange = listener;
        return unsubscribe;
      }),
    };
    const analytics = { trackPageView: vi.fn() };

    const stopTracking = setupRouterPageViewTracking(router, analytics);

    onStateChange?.({ location: { key: 'push-1' } });
    onStateChange?.({ location: { key: 'push-1' } });
    onStateChange?.({ location: { key: 'replace-1' } });

    expect(analytics.trackPageView).toHaveBeenCalledTimes(2);
    expect(router.subscribe).toHaveBeenCalledOnce();

    stopTracking();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
