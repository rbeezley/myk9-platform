import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isPushSupported,
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
