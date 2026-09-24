import { describe, it, expect } from 'vitest';
import {
  deriveEntriesIdentityState,
  canClaimNoEntries,
  getMyEntriesPresentation,
} from './entriesIdentityState';

describe('getMyEntriesPresentation', () => {
  it('keeps known rows visible while the profile refresh is unresolved', () => {
    expect(
      getMyEntriesPresentation({
        identityState: 'unresolved',
        readState: 'unconfirmed',
        entryCount: 2,
        isLoading: false,
      })
    ).toBe('known-rows');
  });

  it('does not turn an unresolved empty read into an account claim', () => {
    expect(
      getMyEntriesPresentation({
        identityState: 'unresolved',
        readState: 'identity-unresolved',
        entryCount: 0,
        isLoading: false,
      })
    ).toBe('identity-pending');
  });

  it('uses a calm unconfirmed notice for an empty unconfirmed read', () => {
    expect(
      getMyEntriesPresentation({
        identityState: 'resolved',
        readState: 'unconfirmed',
        entryCount: 0,
        isLoading: false,
      })
    ).toBe('unconfirmed-empty');
  });

  it('keeps a confirmed missing profile distinct from an unresolved identity', () => {
    expect(
      getMyEntriesPresentation({
        identityState: 'missing',
        readState: 'identity-missing',
        entryCount: 0,
        isLoading: false,
      })
    ).toBe('identity-missing');
    expect(
      getMyEntriesPresentation({
        identityState: 'unresolved',
        readState: 'read-pending',
        entryCount: 0,
        isLoading: true,
      })
    ).toBe('identity-pending');
  });

  it('allows the first-run state only after a confirmed empty read', () => {
    expect(
      getMyEntriesPresentation({
        identityState: 'resolved',
        readState: 'confirmed',
        entryCount: 0,
        isLoading: false,
      })
    ).toBe('confirmed-empty');
  });

  it('keeps an empty confirmed read pending while auth is settling', () => {
    expect(
      getMyEntriesPresentation({
        identityState: 'pending-auth',
        readState: 'confirmed',
        entryCount: 0,
        isLoading: false,
      })
    ).toBe('identity-pending');
  });

  it('keeps a cached identity pending until the authoritative profile resolves', () => {
    expect(
      getMyEntriesPresentation({
        identityState: 'unresolved',
        readState: 'confirmed',
        entryCount: 0,
        isLoading: false,
      })
    ).toBe('identity-pending');
  });
});

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

  it('records an authoritative missing profile separately from unresolved identity', () => {
    expect(
      deriveEntriesIdentityState({
        authLoading: false,
        hasUser: true,
        personId: null,
        personIdentityState: 'missing',
      })
    ).toBe('missing');
    expect(
      deriveEntriesIdentityState({
        authLoading: false,
        hasUser: true,
        personId: null,
        personIdentityState: 'unresolved',
      })
    ).toBe('unresolved');
  });

  it('keeps cached-read identity unresolved for presentation until profile resolution', () => {
    expect(
      deriveEntriesIdentityState({
        authLoading: false,
        hasUser: true,
        personId: 'person-cached',
        personIdentityState: 'unresolved',
      })
    ).toBe('unresolved');
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
