/**
 * MYK9-205 — the three reasons a show is absent must not collapse into one.
 *
 * These are asserted on the pure derivation rather than only through the
 * boundary, because the distinction that matters ("unreachable" vs "genuinely
 * missing") is a claim we make to a judge standing at a ring, and it should be
 * impossible to change it accidentally.
 */

import { describe, it, expect } from 'vitest';
import {
  ShowUnreachableError,
  classifyRefreshFailure,
  isShowUnreachableError,
  missingShowCopy,
  resolveMissingShowReason,
  shouldOfferPriming,
} from './missingShowState';

describe('resolveMissingShowReason', () => {
  it('calls a verified server miss what it is', () => {
    expect(resolveMissingShowReason({ verifiedOnline: true, isOnline: true })).toBe('not-found');
  });

  it('does not claim a show is missing when the device is simply offline', () => {
    expect(resolveMissingShowReason({ verifiedOnline: false, isOnline: false })).toBe(
      'uncached-offline'
    );
  });

  it('leaves an unverifiable online miss as not-found rather than inventing a network story', () => {
    // The anonymous/passcode path cannot sync the show table at all, so we
    // have no evidence of connectivity either way.
    expect(resolveMissingShowReason({ verifiedOnline: false, isOnline: true })).toBe('not-found');
  });
});

describe('missingShowCopy', () => {
  it('only says "Show not found" for a verified miss', () => {
    expect(missingShowCopy('not-found').title).toBe('Show not found');
    expect(missingShowCopy('uncached-offline').title).toBe("This show isn't saved on this device");
    expect(missingShowCopy('unreachable').title).toBe("This show isn't saved on this device");
  });

  it('keeps the network-neutral arm free of any connectivity claim', () => {
    const description = missingShowCopy('refresh-failed').description;
    expect(missingShowCopy('refresh-failed').title).toBe("This show isn't saved on this device");
    // "prepare for offline use" is the name of a feature, not a diagnosis.
    // What must be absent is any claim about WHY it failed.
    expect(description).not.toMatch(/wi-fi|check your connection|no internet|you are offline/i);
  });

  it('explains that a connected-but-useless network is the likely cause', () => {
    // The whole point of the `unreachable` arm: navigator.onLine is true and
    // lying, so telling the user to "check your connection" reads as nonsense.
    expect(missingShowCopy('unreachable').description).toMatch(/venue wi-fi/i);
    expect(missingShowCopy('unreachable').description).toMatch(/couldn't reach the server/i);
  });
});

describe('shouldOfferPriming', () => {
  it('offers priming to staff on a device that is merely uncached', () => {
    for (const reason of ['uncached-offline', 'unreachable', 'refresh-failed'] as const) {
      expect(shouldOfferPriming({ reason, isStaff: true, hasShowId: true })).toBe(true);
    }
  });

  it('never offers priming for a show the server says does not exist', () => {
    expect(shouldOfferPriming({ reason: 'not-found', isStaff: true, hasShowId: true })).toBe(false);
  });

  it('withholds priming from non-staff and from a missing show id', () => {
    expect(shouldOfferPriming({ reason: 'unreachable', isStaff: false, hasShowId: true })).toBe(
      false
    );
    expect(shouldOfferPriming({ reason: 'unreachable', isStaff: true, hasShowId: false })).toBe(
      false
    );
  });
});

describe('classifyRefreshFailure', () => {
  it('blames the network only for browser fetch failures', () => {
    for (const message of [
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource',
    ]) {
      expect(classifyRefreshFailure(message)).toBe('unreachable');
      expect(classifyRefreshFailure(new Error(message))).toBe('unreachable');
    }
  });

  it('does not blame venue Wi-Fi for a local storage failure', () => {
    // syncReplicatedTable funnels IndexedDB write errors into the same
    // `{ success: false }` shape as a dead uplink. Telling someone with a full
    // disk to go find better signal is a wrong diagnosis, not a vague one.
    expect(classifyRefreshFailure('QuotaExceededError: storage is full')).toBe('refresh-failed');
    expect(classifyRefreshFailure('permission denied for table shows')).toBe('refresh-failed');
  });

  it('falls back to the network-neutral reason when there is no cause at all', () => {
    expect(classifyRefreshFailure(undefined)).toBe('refresh-failed');
    expect(classifyRefreshFailure(null)).toBe('refresh-failed');
    expect(classifyRefreshFailure({ weird: true })).toBe('refresh-failed');
  });
});

describe('isShowUnreachableError', () => {
  it('recognises the error it is paired with, and carries the cause', () => {
    const cause = new Error('fetch failed');
    const error = new ShowUnreachableError(cause);
    expect(isShowUnreachableError(error)).toBe(true);
    expect(error.reason).toBe(cause);
  });

  it('recognises a structurally identical object across a bundle boundary', () => {
    // `instanceof` is the thing most likely to break silently here, so the
    // marker field is the contract, not the class identity.
    expect(isShowUnreachableError({ isShowUnreachable: true })).toBe(true);
  });

  it('does not swallow unrelated failures', () => {
    expect(isShowUnreachableError(new Error('indexeddb exploded'))).toBe(false);
    expect(isShowUnreachableError(null)).toBe(false);
    expect(isShowUnreachableError(undefined)).toBe(false);
    expect(isShowUnreachableError('offline')).toBe(false);
  });
});
