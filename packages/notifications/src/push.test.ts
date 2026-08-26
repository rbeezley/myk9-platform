import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isPushSupported,
  lookupExistingSubscription,
  SERVICE_WORKER_READY_TIMEOUT_MS,
  requestPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
} from './push';

const mockSubscription = {
  endpoint: 'https://push.example.com/sub/123',
  toJSON: () => ({
    endpoint: 'https://push.example.com/sub/123',
    keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
  }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};

const mockPushManager = {
  getSubscription: vi.fn().mockResolvedValue(null),
  subscribe: vi.fn().mockResolvedValue(mockSubscription),
};

const mockRegistration = {
  pushManager: mockPushManager,
};

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks does NOT drain a queued mockResolvedValueOnce, so reset and
  // restore the defaults explicitly — otherwise an unconsumed queue entry leaks
  // into whichever test runs next under CI's --sequence.shuffle.
  mockPushManager.getSubscription.mockReset().mockResolvedValue(null);
  mockPushManager.subscribe.mockReset().mockResolvedValue(mockSubscription);
  mockSubscription.unsubscribe.mockReset().mockResolvedValue(true);
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  });
  vi.stubGlobal('navigator', {
    serviceWorker: {
      ready: Promise.resolve(mockRegistration),
    },
  });
});

describe('isPushSupported', () => {
  it('returns true when all APIs are available', () => {
    expect(isPushSupported()).toBe(true);
  });

  it('returns false when serviceWorker is missing', () => {
    vi.stubGlobal('navigator', {});
    expect(isPushSupported()).toBe(false);
  });
});

describe('requestPushPermission', () => {
  it('returns granted when user allows', async () => {
    const result = await requestPushPermission();
    expect(result).toBe('granted');
  });

  it('returns current permission if already decided', async () => {
    vi.stubGlobal('Notification', { permission: 'denied' });
    const result = await requestPushPermission();
    expect(result).toBe('denied');
  });
});

describe('subscribeToPush', () => {
  it('subscribes with VAPID key and returns subscription data', async () => {
    const result = await subscribeToPush('test-vapid-key');

    expect(mockPushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      })
    );
    expect(result).toEqual({
      endpoint: 'https://push.example.com/sub/123',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    });
  });

  it('returns existing subscription if already subscribed', async () => {
    mockPushManager.getSubscription.mockResolvedValueOnce(mockSubscription);

    const result = await subscribeToPush('test-vapid-key');

    expect(mockPushManager.subscribe).not.toHaveBeenCalled();
    expect(result).toEqual({
      endpoint: 'https://push.example.com/sub/123',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    });
  });
});

describe('unsubscribeFromPush', () => {
  it('unsubscribes existing subscription', async () => {
    mockPushManager.getSubscription.mockResolvedValueOnce(mockSubscription);

    const result = await unsubscribeFromPush();

    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('returns false when no subscription exists', async () => {
    const result = await unsubscribeFromPush();
    expect(result).toBe(false);
  });
});

describe('lookupExistingSubscription', () => {
  // The three statuses must stay distinguishable: an opt-out that treats
  // "could not ask" as "nothing to remove" leaves the server subscription live.
  it('reports subscribed with the subscription data', async () => {
    mockPushManager.getSubscription.mockResolvedValueOnce(mockSubscription);

    await expect(lookupExistingSubscription()).resolves.toEqual({
      status: 'subscribed',
      subscription: {
        endpoint: 'https://push.example.com/sub/123',
        keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
      },
    });
  });

  it('reports none when the browser confirms there is no subscription', async () => {
    await expect(lookupExistingSubscription()).resolves.toEqual({ status: 'none' });
  });

  it('reports unavailable — not none — when serviceWorker is absent', async () => {
    vi.stubGlobal('navigator', {});
    await expect(lookupExistingSubscription()).resolves.toEqual({ status: 'unavailable' });
  });

  it('reports unavailable — not none — when .ready never settles', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('navigator', { serviceWorker: { ready: new Promise(() => {}) } });

      const pending = lookupExistingSubscription();
      await vi.advanceTimersByTimeAsync(SERVICE_WORKER_READY_TIMEOUT_MS);

      await expect(pending).resolves.toEqual({ status: 'unavailable' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('service worker availability', () => {
  // A device that cannot query its push subscription must report "no
  // subscription" rather than throwing or hanging: the ringside heartbeat's
  // push-independent revocation check (J1.3) only runs on a null endpoint, and
  // both of these shapes used to strand it before that branch.
  it('getExistingSubscription returns null when serviceWorker is absent', async () => {
    vi.stubGlobal('navigator', {});
    await expect(getExistingSubscription()).resolves.toBeNull();
  });

  it('unsubscribeFromPush returns false when serviceWorker is absent', async () => {
    vi.stubGlobal('navigator', {});
    await expect(unsubscribeFromPush()).resolves.toBe(false);
  });

  it('getExistingSubscription returns null when Notification is unavailable', async () => {
    vi.stubGlobal('Notification', undefined);

    await expect(getExistingSubscription()).resolves.toBeNull();
    // The not-called assertion is what makes this non-vacuous: the default mock
    // also resolves null, so only the isPushSupported() guard can short-circuit.
    expect(mockPushManager.getSubscription).not.toHaveBeenCalled();
  });

  it('getExistingSubscription returns null when .ready never settles', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('navigator', { serviceWorker: { ready: new Promise(() => {}) } });

      const pending = getExistingSubscription();
      await vi.advanceTimersByTimeAsync(SERVICE_WORKER_READY_TIMEOUT_MS);

      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('unsubscribeFromPush returns false when .ready never settles', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('navigator', { serviceWorker: { ready: new Promise(() => {}) } });

      const pending = unsubscribeFromPush();
      await vi.advanceTimersByTimeAsync(SERVICE_WORKER_READY_TIMEOUT_MS);

      await expect(pending).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('getExistingSubscription returns null when .ready rejects', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.reject(new Error('registration failed')) },
    });
    await expect(getExistingSubscription()).resolves.toBeNull();
  });
});

describe('getExistingSubscription', () => {
  it('returns null when no subscription exists', async () => {
    const result = await getExistingSubscription();
    expect(result).toBeNull();
  });

  it('returns subscription data when one exists', async () => {
    mockPushManager.getSubscription.mockResolvedValueOnce(mockSubscription);

    const result = await getExistingSubscription();
    expect(result).toEqual({
      endpoint: 'https://push.example.com/sub/123',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    });
  });
});
