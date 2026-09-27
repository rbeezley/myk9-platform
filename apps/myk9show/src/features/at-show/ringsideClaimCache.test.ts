/**
 * Unit tests for the offline-reload fallback cache (MYK9-834). Pure
 * persist/read behavior against real `window.localStorage` — malformed data,
 * a mismatched show, and the null-clears-it contract.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { persistRingsideClaim, readPersistedRingsideClaim } from './ringsideClaimCache';

const STORAGE_KEY = 'myk9:ringside-claim-cache';

describe('ringsideClaimCache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null when nothing has been cached', () => {
    expect(readPersistedRingsideClaim('show-1')).toBeNull();
  });

  it('persists a claim and reads it back for the matching show', () => {
    persistRingsideClaim({ showId: 'show-1', role: 'judge' });

    expect(readPersistedRingsideClaim('show-1')).toBe('judge');
  });

  it('never returns a cached claim for a different show', () => {
    persistRingsideClaim({ showId: 'show-1', role: 'judge' });

    expect(readPersistedRingsideClaim('show-2')).toBeNull();
  });

  it('persist(null) clears the cache', () => {
    persistRingsideClaim({ showId: 'show-1', role: 'judge' });
    persistRingsideClaim(null);

    expect(readPersistedRingsideClaim('show-1')).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('overwrites a stale claim with the latest confirmed one', () => {
    persistRingsideClaim({ showId: 'show-1', role: 'steward' });
    persistRingsideClaim({ showId: 'show-1', role: 'judge' });

    expect(readPersistedRingsideClaim('show-1')).toBe('judge');
  });

  it('treats malformed JSON in storage as absent', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');

    expect(readPersistedRingsideClaim('show-1')).toBeNull();
  });

  it('rejects a role that is not a known ringside role', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ showId: 'show-1', role: 'wizard' }));

    expect(readPersistedRingsideClaim('show-1')).toBeNull();
  });

  it('treats a missing showId as absent', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ role: 'judge' }));

    expect(readPersistedRingsideClaim('show-1')).toBeNull();
  });
});
