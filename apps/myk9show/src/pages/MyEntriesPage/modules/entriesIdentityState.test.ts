import { describe, it, expect } from 'vitest';
import { deriveEntriesIdentityState, canClaimNoEntries } from './entriesIdentityState';

describe('deriveEntriesIdentityState', () => {
  it('is pending while auth itself is still settling', () => {
    expect(deriveEntriesIdentityState({ authLoading: true, hasUser: false, personId: null })).toBe(
      'pending-auth'
    );
    // Auth loading wins even once a user and person id are present.
    expect(deriveEntriesIdentityState({ authLoading: true, hasUser: true, personId: 'p1' })).toBe(
      'pending-auth'
    );
  });

  it('is unresolved for a signed-in user whose person id has not arrived', () => {
    // The cold-offline-boot case: roles are cached and hydrate, the `people`
    // network lookup is paused, so personId is null.
    expect(deriveEntriesIdentityState({ authLoading: false, hasUser: true, personId: null })).toBe(
      'unresolved'
    );
    expect(
      deriveEntriesIdentityState({ authLoading: false, hasUser: true, personId: undefined })
    ).toBe('unresolved');
  });

  it('never reports resolved without a user', () => {
    expect(deriveEntriesIdentityState({ authLoading: false, hasUser: false, personId: null })).toBe(
      'unresolved'
    );
    // Even a stale person id cannot resolve identity with no signed-in user.
    expect(deriveEntriesIdentityState({ authLoading: false, hasUser: false, personId: 'p1' })).toBe(
      'unresolved'
    );
  });

  it('is resolved only with a settled auth, a user, and a person id', () => {
    expect(deriveEntriesIdentityState({ authLoading: false, hasUser: true, personId: 'p1' })).toBe(
      'resolved'
    );
  });

  it('treats an empty-string person id as unresolved, not as an identity', () => {
    expect(deriveEntriesIdentityState({ authLoading: false, hasUser: true, personId: '' })).toBe(
      'unresolved'
    );
  });
});

describe('canClaimNoEntries', () => {
  const base = {
    identityState: 'resolved' as const,
    isLoading: false,
    isError: false,
    entryCount: 0,
  };

  it('permits the first-run claim only when identity is known and the load finished clean', () => {
    expect(canClaimNoEntries(base)).toBe(true);
  });

  it('refuses the claim while identity is unresolved — the cold offline boot', () => {
    // This is the bug: entries: [] with isError: false rendered "Welcome!
    // Let's get you set up" to an exhibitor with entries in IndexedDB.
    expect(canClaimNoEntries({ ...base, identityState: 'unresolved' })).toBe(false);
  });

  it('refuses the claim before auth settles', () => {
    expect(canClaimNoEntries({ ...base, identityState: 'pending-auth' })).toBe(false);
  });

  it('refuses the claim while still loading', () => {
    expect(canClaimNoEntries({ ...base, isLoading: true })).toBe(false);
  });

  it('refuses the claim when the load errored', () => {
    expect(canClaimNoEntries({ ...base, isError: true })).toBe(false);
  });

  it('refuses the claim when entries actually exist', () => {
    expect(canClaimNoEntries({ ...base, entryCount: 3 })).toBe(false);
  });
});
