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

    /**
     * Pre-cliff documentation of the overlap that WILL exist whenever
     * @supabase/supabase-js is upgraded past 2.102.0. As of 2026-05-28 the
     * monorepo pins @supabase/supabase-js to exactly 2.93.3 via a
     * pnpm.overrides block in the root package.json (added on 2026-05-23
     * in PR #302, silently neutralizing every subsequent Dependabot bump).
     * Dependabot PR #403 proposes caret moves to ^2.106.2 but does not
     * touch the override, so its pnpm-lock.yaml diff has zero changes to
     * Supabase resolution. The library does NOT currently retry internally.
     * This test pins our `isRetryableError` behavior against the future
     * library behavior so the eventual override-removal PR cannot land
     * without re-reading the audit's Flag A.
     *
     * Upstream: https://github.com/supabase/supabase-js/pull/2072
     * Audit:    docs/plan-h1-supabase-audit-2026-05-28.md (Flag A)
     *
     * After 2.102.0 lands, postgrest-js retries with exp backoff (1s/2s/4s, cap 30s):
     *  - HTTP 520 (Cloudflare timeout) — all methods
     *  - HTTP 503 with PGRST002 (PostgREST schema-cache reload) — all methods
     *  - Network errors — idempotent methods only (GET/HEAD/OPTIONS)
     *
     * For MutationManager (which only handles POST/PATCH/DELETE), the actual
     * overlap is just 520 and 503-PGRST002. Total worst case becomes
     * library_3 + app_3 = ~7 attempts over ~30s, which is acceptable.
     *
     * If anyone narrows isRetryableError to skip library-covered codes,
     * this test fails and forces re-reading the audit (Flag A) before proceeding.
     */
    it('classifies library-retried transient codes (520, 503/PGRST002) as retryable [overlap with postgrest-js#2072]', () => {
      // Cloudflare timeout — library retries; our queue layer also retries.
      expect(isRetryableError({ message: 'Cloudflare 520', code: '520' })).toBe(true);
      // PostgREST schema cache reload — library retries; our queue layer also retries.
      expect(isRetryableError({ message: 'schema reload', code: '503', details: 'PGRST002' })).toBe(
        true
      );
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

    it('keeps ambiguous unauthorized and forbidden messages retryable without a structured code', () => {
      expect(isRetryableError(new Error('Unauthorized gateway response'))).toBe(true);
      expect(isRetryableError(new Error('Forbidden while refreshing the session'))).toBe(true);
    });

    // FAIL-OPEN (audit H2): a score must never be discarded because an ambiguous
    // error was pattern-missed. Anything not affirmatively permanent retries.
    it('defaults to TRUE (retryable) for unknown/ambiguous error shapes', () => {
      expect(isRetryableError(new Error('something else'))).toBe(true);
      expect(isRetryableError('plain string')).toBe(true);
      expect(isRetryableError(null)).toBe(true);
    });

    it('still dead-letters affirmatively-permanent errors', () => {
      expect(isRetryableError(new Error('permission denied for table entries'))).toBe(false);
      expect(isRetryableError(new Error('new row violates check constraint'))).toBe(false);
      expect(isRetryableError({ message: 'nope', code: '23505' })).toBe(false); // unique violation
      expect(isRetryableError({ message: 'denied', code: '42501' })).toBe(false); // RLS
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
    // generic-Error path without ever throwing. Under the fail-open default
    // (audit H2), an unrecognized DOMException is now retryable rather than
    // silently dead-lettered.
    it('does not throw when error has a numeric code (DOMException shape)', () => {
      const domLike = { message: 'NotFoundError', code: 8, name: 'NotFoundError' };
      expect(() => isRetryableError(domLike)).not.toThrow();
    });

    it('returns TRUE (fail-open retry) for an ambiguous DOMException-shaped object', () => {
      const domLike = { message: 'NotFoundError', code: 8 };
      expect(isRetryableError(domLike)).toBe(true);
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
