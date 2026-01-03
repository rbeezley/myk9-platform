/**
 * Unit Tests for Cache Helper Utilities
 */

import {
  isCacheValid,
  getCacheAge,
  getRemainingTTL,
  createCacheEntry,
  filterKeysByPattern,
  secondsToMs,
  msToSeconds,
  createCacheKey,
  parseCacheKey,
  shouldRefresh,
  type CachedData
} from './cacheHelpers';

describe('isCacheValid', () => {
  test('should return true for fresh cache', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: Date.now() - 5000, // 5 seconds ago
      ttl: 60 // 60 seconds TTL
    };
    expect(isCacheValid(cached)).toBe(true);
  });

  test('should return false for expired cache', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: Date.now() - 65000, // 65 seconds ago
      ttl: 60 // 60 seconds TTL
    };
    expect(isCacheValid(cached)).toBe(false);
  });

  test('should return true for cache at exact TTL boundary', () => {
    const now = Date.now();
    const cached: CachedData<any> = {
      data: {},
      timestamp: now - 60000, // exactly 60 seconds ago
      ttl: 60
    };
    // Use fixed currentTime to avoid timing race condition
    expect(isCacheValid(cached, now)).toBe(true);
  });

  test('should accept custom currentTime parameter', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: 1000000,
      ttl: 60
    };
    // 55 seconds after timestamp
    expect(isCacheValid(cached, 1055000)).toBe(true);
    // 65 seconds after timestamp
    expect(isCacheValid(cached, 1065000)).toBe(false);
  });
});

describe('getCacheAge', () => {
  test('should return age in seconds', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: Date.now() - 30000, // 30 seconds ago
      ttl: 60
    };
    const age = getCacheAge(cached);
    expect(age).toBeGreaterThanOrEqual(29.9);
    expect(age).toBeLessThan(31);
  });

  test('should return 0 for cache created now', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: Date.now(),
      ttl: 60
    };
    const age = getCacheAge(cached);
    expect(age).toBeLessThan(0.1);
  });

  test('should accept custom currentTime parameter', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: 1000000,
      ttl: 60
    };
    expect(getCacheAge(cached, 1045000)).toBe(45);
  });
});

describe('getRemainingTTL', () => {
  test('should return remaining TTL in seconds', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: Date.now() - 20000, // 20 seconds ago
      ttl: 60
    };
    const remaining = getRemainingTTL(cached);
    expect(remaining).toBeGreaterThanOrEqual(39.9);
    expect(remaining).toBeLessThan(41);
  });

  test('should return 0 for expired cache', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: Date.now() - 70000, // 70 seconds ago
      ttl: 60
    };
    expect(getRemainingTTL(cached)).toBe(0);
  });

  test('should accept custom currentTime parameter', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: 1000000,
      ttl: 60
    };
    expect(getRemainingTTL(cached, 1040000)).toBe(20);
    expect(getRemainingTTL(cached, 1070000)).toBe(0);
  });
});

describe('createCacheEntry', () => {
  test('should create cache entry with current timestamp', () => {
    const data = { foo: 'bar' };
    const entry = createCacheEntry(data, 60);

    expect(entry.data).toEqual(data);
    expect(entry.ttl).toBe(60);
    expect(entry.timestamp).toBeGreaterThan(Date.now() - 100);
    expect(entry.timestamp).toBeLessThanOrEqual(Date.now());
  });

  test('should create cache entry with custom timestamp', () => {
    const data = { foo: 'bar' };
    const entry = createCacheEntry(data, 60, 1234567890);

    expect(entry.data).toEqual(data);
    expect(entry.ttl).toBe(60);
    expect(entry.timestamp).toBe(1234567890);
  });

  test('should preserve data type', () => {
    const stringData = 'test';
    const numberData = 42;
    const objectData = { a: 1, b: 2 };
    const arrayData = [1, 2, 3];

    expect(createCacheEntry(stringData, 60).data).toBe(stringData);
    expect(createCacheEntry(numberData, 60).data).toBe(numberData);
    expect(createCacheEntry(objectData, 60).data).toEqual(objectData);
    expect(createCacheEntry(arrayData, 60).data).toEqual(arrayData);
  });
});

describe('filterKeysByPattern', () => {
  const keys = ['user:123', 'user:456', 'post:789', 'comment:101', 'user:789:profile'];

  test('should filter by string pattern', () => {
    expect(filterKeysByPattern(keys, 'user')).toEqual([
      'user:123',
      'user:456',
      'user:789:profile'
    ]);
    expect(filterKeysByPattern(keys, 'post')).toEqual(['post:789']);
  });

  test('should filter by regex pattern', () => {
    expect(filterKeysByPattern(keys, /^user:/)).toEqual([
      'user:123',
      'user:456',
      'user:789:profile'
    ]);
    expect(filterKeysByPattern(keys, /:\d{3}$/)).toEqual([
      'user:123',
      'user:456',
      'post:789',
      'comment:101'
    ]);
  });

  test('should return empty array for no matches', () => {
    expect(filterKeysByPattern(keys, 'nomatch')).toEqual([]);
    expect(filterKeysByPattern(keys, /^xyz/)).toEqual([]);
  });

  test('should work with Set', () => {
    const keySet = new Set(keys);
    expect(filterKeysByPattern(keySet, 'user')).toEqual([
      'user:123',
      'user:456',
      'user:789:profile'
    ]);
  });

  test('should work with empty iterable', () => {
    expect(filterKeysByPattern([], 'user')).toEqual([]);
    expect(filterKeysByPattern(new Set(), /user/)).toEqual([]);
  });
});

describe('secondsToMs', () => {
  test('should convert seconds to milliseconds', () => {
    expect(secondsToMs(1)).toBe(1000);
    expect(secondsToMs(60)).toBe(60000);
    expect(secondsToMs(0.5)).toBe(500);
    expect(secondsToMs(0)).toBe(0);
  });
});

describe('msToSeconds', () => {
  test('should convert milliseconds to seconds', () => {
    expect(msToSeconds(1000)).toBe(1);
    expect(msToSeconds(60000)).toBe(60);
    expect(msToSeconds(500)).toBe(0.5);
    expect(msToSeconds(0)).toBe(0);
  });
});

describe('createCacheKey', () => {
  test('should create key from single part', () => {
    expect(createCacheKey('users')).toBe('users');
  });

  test('should create key from multiple parts', () => {
    expect(createCacheKey('users', 123)).toBe('users:123');
    expect(createCacheKey('entries', 456, 'scores')).toBe('entries:456:scores');
  });

  test('should handle mixed string and number parts', () => {
    expect(createCacheKey('user', 'profile', 123)).toBe('user:profile:123');
  });

  test('should handle empty parts gracefully', () => {
    expect(createCacheKey()).toBe('');
  });
});

describe('parseCacheKey', () => {
  test('should parse key with default separator', () => {
    expect(parseCacheKey('users:123')).toEqual(['users', '123']);
    expect(parseCacheKey('entries:456:scores')).toEqual(['entries', '456', 'scores']);
  });

  test('should parse key with custom separator', () => {
    expect(parseCacheKey('users-123', '-')).toEqual(['users', '123']);
    expect(parseCacheKey('users/123/profile', '/')).toEqual(['users', '123', 'profile']);
  });

  test('should handle key with no separator', () => {
    expect(parseCacheKey('users')).toEqual(['users']);
  });

  test('should handle empty key', () => {
    expect(parseCacheKey('')).toEqual(['']);
  });
});

describe('shouldRefresh', () => {
  test('should return false for fresh cache (>10% TTL remaining)', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: Date.now() - 10000, // 10 seconds ago
      ttl: 60 // 50 seconds remaining = 83% of TTL
    };
    expect(shouldRefresh(cached)).toBe(false);
  });

  test('should return true when <10% TTL remains', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: Date.now() - 56000, // 56 seconds ago
      ttl: 60 // 4 seconds remaining = 6.7% of TTL
    };
    expect(shouldRefresh(cached)).toBe(true);
  });

  test('should return true for expired cache', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: Date.now() - 70000, // 70 seconds ago
      ttl: 60
    };
    expect(shouldRefresh(cached)).toBe(true);
  });

  test('should return true at exactly 10% threshold', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: 1000000,
      ttl: 60
    };
    // At 54 seconds (6 seconds remaining = exactly 10%)
    expect(shouldRefresh(cached, 1054000)).toBe(true);
  });

  test('should accept custom currentTime parameter', () => {
    const cached: CachedData<any> = {
      data: {},
      timestamp: 1000000,
      ttl: 60
    };
    // 50 seconds elapsed (10 remaining = 16.7%)
    expect(shouldRefresh(cached, 1050000)).toBe(false);
    // 55 seconds elapsed (5 remaining = 8.3%)
    expect(shouldRefresh(cached, 1055000)).toBe(true);
  });
});

describe('Integration: Cache lifecycle', () => {
  test('should manage cache entry through complete lifecycle', () => {
    // Create entry
    const data = { userId: 123, name: 'Test User' };
    const entry = createCacheEntry(data, 60);

    // Verify fresh entry is valid
    expect(isCacheValid(entry)).toBe(true);
    expect(shouldRefresh(entry)).toBe(false);

    // Simulate time passing (50 seconds)
    const futureTime = entry.timestamp + 50000;
    expect(isCacheValid(entry, futureTime)).toBe(true);
    expect(getCacheAge(entry, futureTime)).toBe(50);
    expect(getRemainingTTL(entry, futureTime)).toBe(10);
    expect(shouldRefresh(entry, futureTime)).toBe(false);

    // Simulate time passing (56 seconds - should refresh)
    const nearExpiryTime = entry.timestamp + 56000;
    expect(isCacheValid(entry, nearExpiryTime)).toBe(true);
    expect(shouldRefresh(entry, nearExpiryTime)).toBe(true);

    // Simulate time passing (65 seconds - expired)
    const expiredTime = entry.timestamp + 65000;
    expect(isCacheValid(entry, expiredTime)).toBe(false);
    expect(getRemainingTTL(entry, expiredTime)).toBe(0);
  });

  test('should manage multiple cache keys with filtering', () => {
    const keys = [
      createCacheKey('user', 123),
      createCacheKey('user', 456),
      createCacheKey('post', 789)
    ];

    const userKeys = filterKeysByPattern(keys, /^user:/);
    expect(userKeys).toHaveLength(2);

    userKeys.forEach(key => {
      const parts = parseCacheKey(key);
      expect(parts[0]).toBe('user');
      expect(parts).toHaveLength(2);
    });
  });
});
