/**
 * `hasEntryClassInventory` is a three-state contract and the page was the one
 * place that broke it. All eight styled landings gate on `!== false` and
 * `getEntryStatus` treats `null` as unknown — they were all faithful. The page
 * handed them a `false` that meant "I haven't looked yet".
 */
import { describe, it, expect } from 'vitest';
import { resolveEntryClassInventory } from '../ShowDetailsPage.entryInventory';

const base = {
  storeTrialCount: 0,
  effectiveTrialCount: 0,
  effectiveClassCount: 0,
  trialClassesReadStatus: 'idle' as const,
  publicClassInventoryResolved: false,
};

describe('resolveEntryClassInventory', () => {
  it('is unknown when no trials are known yet', () => {
    expect(resolveEntryClassInventory(base)).toBeNull();
  });

  describe('cold / anonymous path (no store trials)', () => {
    it('is UNKNOWN while the public class read is still in flight', () => {
      // The bug: this returned false, so the entry CTA vanished mid-load on
      // every anonymous landing — the class read is a second round trip gated
      // on the first, so the window is real and visible.
      expect(
        resolveEntryClassInventory({
          ...base,
          effectiveTrialCount: 2,
          effectiveClassCount: 0,
          publicClassInventoryResolved: false,
        })
      ).toBeNull();
    });

    it('reports absence only once the read has settled', () => {
      expect(
        resolveEntryClassInventory({
          ...base,
          effectiveTrialCount: 2,
          effectiveClassCount: 0,
          publicClassInventoryResolved: true,
        })
      ).toBe(false);
    });

    it('reports presence once classes arrive', () => {
      expect(
        resolveEntryClassInventory({
          ...base,
          effectiveTrialCount: 2,
          effectiveClassCount: 5,
          publicClassInventoryResolved: true,
        })
      ).toBe(true);
    });
  });

  describe('warm path (store has trials)', () => {
    it('is UNKNOWN until the store class load has run', () => {
      // This is what told an exhibitor "Classes Not Ready — this show has no
      // classes assigned yet, so entries are not available" for a fully
      // configured show.
      expect(
        resolveEntryClassInventory({
          ...base,
          storeTrialCount: 3,
          effectiveTrialCount: 3,
          effectiveClassCount: 0,
          trialClassesReadStatus: 'loading' as const,
        })
      ).toBeNull();
    });

    it('reports absence once the store load has completed a pass', () => {
      expect(
        resolveEntryClassInventory({
          ...base,
          storeTrialCount: 3,
          effectiveTrialCount: 3,
          effectiveClassCount: 0,
          trialClassesReadStatus: 'ready' as const,
        })
      ).toBe(false);
    });

    it('is UNKNOWN when the class read actually FAILED', () => {
      // main's loadTrialClasses now reads via getAllWithStatus(), so a failed
      // read is observable rather than arriving as an empty list (MYK9-252).
      expect(
        resolveEntryClassInventory({
          ...base,
          storeTrialCount: 3,
          effectiveTrialCount: 3,
          effectiveClassCount: 0,
          trialClassesReadStatus: 'error',
        })
      ).toBeNull();
    });

    it('does not consult the cold-path flag when the store is warm', () => {
      // The two paths are separate sources; mixing them would let a resolved
      // anon query vouch for an unread store.
      expect(
        resolveEntryClassInventory({
          ...base,
          storeTrialCount: 3,
          effectiveTrialCount: 3,
          effectiveClassCount: 0,
          trialClassesReadStatus: 'loading' as const,
          publicClassInventoryResolved: true,
        })
      ).toBeNull();
    });
  });
});
