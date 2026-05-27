/**
 * Tests for mutation-utils error classification.
 *
 * Regression coverage for a real prod bug: `isRetryableError` used to call
 * `code?.startsWith(...)` against any object with a string `message`. That
 * accepted DOMException (`code` is a numeric integer), threw TypeError, and
 * — escaping the upload loop's inner catch — caused
 * `MutationManager.uploadPendingMutations` to swallow the entire batch via
 * its outer catch and return `[]` instead of recording per-mutation failures.
 */

import { describe, it, expect } from 'vitest';
import { isRetryableError, TimeoutError } from './mutation-utils';

describe('isRetryableError', () => {
  describe('Supabase-shaped errors', () => {
    it('returns true for 5xx server errors', () => {
      expect(isRetryableError({ message: 'boom', code: '500' })).toBe(true);
      expect(isRetryableError({ message: 'boom', code: '503' })).toBe(true);
    });

    it('returns true for 429 rate limit', () => {
      expect(isRetryableError({ message: 'too many', code: '429' })).toBe(true);
    });

    it('returns false for 4xx client errors (non-429)', () => {
      expect(isRetryableError({ message: 'bad request', code: '400' })).toBe(false);
      expect(isRetryableError({ message: 'forbidden', code: '403' })).toBe(false);
    });
  });

  describe('TimeoutError', () => {
    it('is always retryable', () => {
      expect(isRetryableError(new TimeoutError('op', 1000))).toBe(true);
    });
  });

  describe('Generic Error objects', () => {
    it('returns true for network/timeout messages', () => {
      expect(isRetryableError(new Error('network failure'))).toBe(true);
      expect(isRetryableError(new Error('socket hang up'))).toBe(true);
    });

    it('returns false for RLS policy rejections', () => {
      expect(isRetryableError(new Error('RLS policy blocked INSERT'))).toBe(false);
    });

    it('defaults to false for unknown error shapes', () => {
      expect(isRetryableError(new Error('something else'))).toBe(false);
      expect(isRetryableError('plain string')).toBe(false);
      expect(isRetryableError(null)).toBe(false);
    });
  });

  describe('DOMException and IndexedDB errors (regression)', () => {
    // DOMException — what idb throws for things like NotFoundError when an
    // object store is missing — has a string `message` AND a numeric `code`.
    // The previous isSupabaseError type guard accepted it and then crashed
    // inside isRetryableError because `code.startsWith` is not a function.
    //
    // The fix: tighten the type guard so a non-string `code` disqualifies an
    // error from the Supabase branch. The error should fall through to the
    // generic-Error path (and from there to the "unknown → don't retry"
    // default) without ever throwing.
    it('does not throw when error has a numeric code (DOMException shape)', () => {
      const domLike = { message: 'NotFoundError', code: 8, name: 'NotFoundError' };
      expect(() => isRetryableError(domLike)).not.toThrow();
    });

    it('returns false (not retryable) for DOMException-shaped object', () => {
      const domLike = { message: 'NotFoundError', code: 8 };
      expect(isRetryableError(domLike)).toBe(false);
    });

    it('does not throw for an actual DOMException instance when available', () => {
      // jsdom's DOMException matches the spec: numeric `code` getter.
      if (typeof DOMException === 'undefined') return;
      const dom = new DOMException('store missing', 'NotFoundError');
      expect(() => isRetryableError(dom)).not.toThrow();
    });

    it('still routes network-message DOMExceptions through the generic-Error branch', () => {
      // A DOMException whose message looks like a network failure should be
      // retryable via the generic-Error branch (instanceof Error), not the
      // Supabase branch — because its `code` is numeric.
      if (typeof DOMException === 'undefined') return;
      const dom = new DOMException('network timeout', 'TimeoutError');
      expect(isRetryableError(dom)).toBe(true);
    });
  });
});
