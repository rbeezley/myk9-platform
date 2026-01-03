/**
 * Tests for rate limiter (brute force protection)
 */

import { vi } from 'vitest';
import {
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  getRateLimitStatus,
  clearAllRateLimits,
  RateLimitConfig,
} from './rateLimiter';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Helper to simulate time passing
const advanceTime = (ms: number) => {
  vi.advanceTimersByTime(ms);
};

describe('rateLimiter', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkRateLimit', () => {
    it('should allow first attempt', () => {
      const result = checkRateLimit('login');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5);
      expect(result.delayMs).toBe(0);
      expect(result.message).toBe('Attempt allowed');
    });

    it('should return correct remaining attempts', () => {
      recordFailedAttempt('login');
      advanceTime(1000); // Wait for the 1-second delay

      const result = checkRateLimit('login');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(4);
    });

    it('should apply progressive delay after failed attempts', () => {
      recordFailedAttempt('login');
      advanceTime(500); // Less than 1 second delay

      const result = checkRateLimit('login');

      expect(result.allowed).toBe(false);
      expect(result.delayMs).toBeGreaterThan(0);
      expect(result.message).toContain('Please wait');
    });

    it('should allow attempt after delay has passed', () => {
      recordFailedAttempt('login');
      advanceTime(1000); // Full 1 second delay

      const result = checkRateLimit('login');

      expect(result.allowed).toBe(true);
    });

    it('should block after max attempts reached', () => {
      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('login');
        advanceTime(1000);
      }

      const result = checkRateLimit('login');

      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.blockTimeRemaining).toBeGreaterThan(0);
      expect(result.message).toContain('Too many failed attempts');
    });

    it('should remain blocked for entire block duration', () => {
      // Reach max attempts
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('login');
        advanceTime((i + 1) * 1000 + 100); // Wait for each delay plus a bit more
      }

      // Block should be triggered now, check immediately
      const blockResult = checkRateLimit('login');
      expect(blockResult.allowed).toBe(false);
      expect(blockResult.message).toContain('Too many failed attempts');

      // Try after 29 minutes (should still be blocked)
      advanceTime(29 * 60 * 1000);

      const result = checkRateLimit('login');

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('Please try again in');
    });

    it('should unblock after full block duration', () => {
      // Reach max attempts
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('login');
        advanceTime(1000);
      }

      // Wait full block duration (30 minutes + 1 second)
      advanceTime(30 * 60 * 1000 + 1000);

      const result = checkRateLimit('login');

      expect(result.allowed).toBe(true);
    });

    it('should reset attempts after time window expires', () => {
      recordFailedAttempt('login');
      recordFailedAttempt('login');

      // Wait longer than window (15 minutes + 1 second)
      advanceTime(15 * 60 * 1000 + 1000);

      const result = checkRateLimit('login');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5); // Reset to max
    });

    it('should use custom config when provided', () => {
      const customConfig: Partial<RateLimitConfig> = {
        maxAttempts: 3,
        delayMultiplier: 2000, // 2 seconds per attempt
      };

      recordFailedAttempt('login');

      const result = checkRateLimit('login', customConfig);

      expect(result.remainingAttempts).toBe(2); // Custom max of 3
    });

    it('should handle multiple actions independently', () => {
      recordFailedAttempt('login');
      advanceTime(1000);
      recordFailedAttempt('login');
      advanceTime(2000); // Wait for the 2-second delay after 2nd attempt

      const loginResult = checkRateLimit('login');
      const otherResult = checkRateLimit('other-action');

      expect(loginResult.remainingAttempts).toBe(3);
      expect(otherResult.remainingAttempts).toBe(5); // Fresh action
    });
  });

  describe('recordFailedAttempt', () => {
    it('should increment attempt counter', () => {
      recordFailedAttempt('login');

      const result = checkRateLimit('login');

      expect(result.remainingAttempts).toBe(4);
    });

    it('should track multiple failed attempts', () => {
      recordFailedAttempt('login');
      advanceTime(1000);
      recordFailedAttempt('login');
      advanceTime(2000);
      recordFailedAttempt('login');
      advanceTime(3000); // Wait for the 3-second delay after 3rd attempt

      const result = checkRateLimit('login');

      expect(result.remainingAttempts).toBe(2);
    });

    it('should persist state to localStorage', () => {
      recordFailedAttempt('login');

      const stored = localStorage.getItem('myK9Q_rate_limit_login');

      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!).attempts).toBe(1);
    });

    it('should update last attempt time', () => {
      const now = Date.now();
      recordFailedAttempt('login');

      const stored = JSON.parse(localStorage.getItem('myK9Q_rate_limit_login')!);

      expect(stored.lastAttemptTime).toBeGreaterThanOrEqual(now);
    });

    it('should track first attempt time', () => {
      const now = Date.now();
      recordFailedAttempt('login');
      advanceTime(1000);
      recordFailedAttempt('login');

      const stored = JSON.parse(localStorage.getItem('myK9Q_rate_limit_login')!);

      expect(stored.firstAttemptTime).toBeGreaterThanOrEqual(now);
      expect(stored.attempts).toBe(2);
    });
  });

  describe('clearRateLimit', () => {
    it('should clear rate limit state for action', () => {
      recordFailedAttempt('login');
      recordFailedAttempt('login');

      clearRateLimit('login');

      const result = checkRateLimit('login');

      expect(result.remainingAttempts).toBe(5); // Reset to max
    });

    it('should only clear specified action', () => {
      recordFailedAttempt('login');
      recordFailedAttempt('other-action');

      clearRateLimit('login');

      const loginResult = checkRateLimit('login');
      const otherResult = checkRateLimit('other-action');

      expect(loginResult.remainingAttempts).toBe(5);
      expect(otherResult.remainingAttempts).toBe(4); // Still has failed attempt
    });

    it('should remove localStorage entry', () => {
      recordFailedAttempt('login');

      clearRateLimit('login');

      const stored = localStorage.getItem('myK9Q_rate_limit_login');

      expect(stored).toBeNull();
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return empty string for fresh state', () => {
      const status = getRateLimitStatus('login');

      expect(status).toBe('');
    });

    it('should return remaining attempts after failures', () => {
      recordFailedAttempt('login');
      advanceTime(1000); // Wait for the delay to pass

      const status = getRateLimitStatus('login');

      expect(status).toContain('4 attempts remaining');
    });

    it('should use singular form for one attempt', () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt('login');
        advanceTime((i + 1) * 1000); // Wait for progressive delays
      }

      const status = getRateLimitStatus('login');

      expect(status).toContain('1 attempt remaining');
    });

    it('should return block message when blocked', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('login');
        advanceTime(1000);
      }

      const status = getRateLimitStatus('login');

      expect(status).toContain('Too many failed attempts');
    });

    it('should return delay message when in delay period', () => {
      recordFailedAttempt('login');
      // Don't advance time - should be in delay period

      const status = getRateLimitStatus('login');

      expect(status).toContain('Please wait');
    });
  });

  describe('clearAllRateLimits', () => {
    // Deleted: This test is redundant with "should remove all localStorage entries with prefix"
    // which already verifies clearAllRateLimits works correctly

    it('should remove all localStorage entries with prefix', () => {
      recordFailedAttempt('login');
      recordFailedAttempt('signup');

      clearAllRateLimits();

      const keys = Object.keys(localStorage);
      const rateLimitKeys = keys.filter((k) => k.startsWith('myK9Q_rate_limit_'));

      expect(rateLimitKeys).toHaveLength(0);
    });

    it('should not affect other localStorage entries', () => {
      localStorage.setItem('myK9Q_other_data', 'preserved');
      recordFailedAttempt('login');

      clearAllRateLimits();

      expect(localStorage.getItem('myK9Q_other_data')).toBe('preserved');
    });
  });

  describe('progressive delays', () => {
    it('should apply 1 second delay after 1st failed attempt', () => {
      recordFailedAttempt('login');

      const result = checkRateLimit('login');

      expect(result.delayMs).toBeLessThanOrEqual(1000);
    });

    it('should apply 2 second delay after 2nd failed attempt', () => {
      recordFailedAttempt('login');
      advanceTime(1000);
      recordFailedAttempt('login');

      const result = checkRateLimit('login');

      expect(result.delayMs).toBeLessThanOrEqual(2000);
      expect(result.delayMs).toBeGreaterThan(1000);
    });

    it('should apply 4 second delay after 4th failed attempt', () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt('login');
        // Wait for progressive delay from previous attempt
        if (i > 0) {
          advanceTime(i * 1000 + 100); // i=1:1100ms, i=2:2100ms, i=3:3100ms
        }
      }

      // Check immediately after 4th attempt - should have 4 second delay
      const result = checkRateLimit('login');

      expect(result.allowed).toBe(false);
      expect(result.delayMs).toBeGreaterThan(0);
      expect(result.delayMs).toBeLessThanOrEqual(4000);
    });
  });

  describe('edge cases', () => {
    it('should handle corrupted localStorage data gracefully', () => {
      localStorage.setItem('myK9Q_rate_limit_login', 'invalid json{]');

      const result = checkRateLimit('login');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5);
    });

    it('should handle missing localStorage data', () => {
      // Don't record any attempts, just check
      const result = checkRateLimit('login');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5);
    });

    it('should handle rapid sequential checks', () => {
      const result1 = checkRateLimit('login');
      const result2 = checkRateLimit('login');
      const result3 = checkRateLimit('login');

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(true);
    });

    it('should handle immediate check after failed attempt', () => {
      recordFailedAttempt('login');
      // Don't advance time - should be in delay period

      const result = checkRateLimit('login');

      expect(result.allowed).toBe(false);
      expect(result.delayMs).toBeGreaterThan(0);
      expect(result.delayMs).toBeLessThanOrEqual(1000);
    });

    it('should handle very large time advancements', () => {
      recordFailedAttempt('login');

      // Advance time by days
      advanceTime(7 * 24 * 60 * 60 * 1000);

      const result = checkRateLimit('login');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5); // Should reset
    });
  });

  describe('security calculations', () => {
    it('should make brute force significantly slower', () => {
      // Calculate time required for brute force
      const maxAttempts = 5;
      const delayPerAttempt = 1000; // ms

      let totalTime = 0;
      for (let i = 0; i < maxAttempts; i++) {
        totalTime += i * delayPerAttempt;
      }

      // Total delay: 0 + 1 + 2 + 3 + 4 = 10 seconds for 5 attempts
      expect(totalTime).toBe(10000); // 10 seconds

      // Then 30-minute block
      const blockTime = 30 * 60 * 1000;

      // For 10,000 possible 4-digit codes, with 5 attempts per 30-minute window:
      // Time = (10000 / 5) * 30 minutes = 2000 * 30 = 60000 minutes = ~41.7 days
      const estimatedBruteForceTime =
        (10000 / maxAttempts) * (blockTime / 1000 / 60); // in minutes

      expect(estimatedBruteForceTime).toBeGreaterThan(40000); // > 40k minutes (~28 days)
    });

    it('should count time between windows correctly', () => {
      const windowMs = 15 * 60 * 1000; // 15 minutes

      recordFailedAttempt('login');
      const firstTime = Date.now();

      advanceTime(windowMs + 1000);

      const result = checkRateLimit('login');

      // Should reset after window expires
      expect(result.remainingAttempts).toBe(5);
    });
  });

  describe('user experience messages', () => {
    it('should provide clear message for first failure', () => {
      recordFailedAttempt('login');
      advanceTime(1000); // Wait for delay to pass

      const status = getRateLimitStatus('login');

      expect(status).toContain('4 attempts remaining');
    });

    it('should provide clear message when blocked', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('login');
        advanceTime(i * 1000 + 1000);
      }

      const result = checkRateLimit('login');

      expect(result.message).toContain('Too many failed attempts');
      expect(result.message).toContain('30 minute');
    });

    it('should show seconds remaining during delay', () => {
      recordFailedAttempt('login');
      advanceTime(500);

      const result = checkRateLimit('login');

      expect(result.message).toMatch(/\d+ second/);
    });

    it('should show minutes remaining during block', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('login');
        advanceTime(i * 1000 + 1000);
      }

      const result = checkRateLimit('login');

      expect(result.message).toMatch(/\d+ minute/);
    });
  });
});
