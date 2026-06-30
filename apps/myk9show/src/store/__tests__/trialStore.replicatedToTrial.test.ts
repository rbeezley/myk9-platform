import { describe, expect, it } from 'vitest';
import { replicatedToTrial, mergeTrialData } from '../trial-store-helpers';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';

/**
 * The warm / authenticated landing path maps replicated trial rows (IndexedDB) into the
 * domain Trial via `replicatedToTrial`. Phase 5a depends on `registryId` surviving that hop
 * so the styled landing reads the trial's sanctioning body. Pins the carry on both the direct
 * map and the merge-with-existing variant the store actually calls.
 */
function makeReplicated(registryId: string | undefined): ReplicatedTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Trial I',
    date: '2026-06-12',
    trialNumber: 'I',
    status: 'Upcoming',
    displayOrder: 1,
    registryId,
  };
}

describe('replicatedToTrial — registry carry (warm path)', () => {
  it('carries registryId from the replicated row onto the domain Trial', () => {
    expect(replicatedToTrial(makeReplicated('UKC')).registryId).toBe('UKC');
    expect(replicatedToTrial(makeReplicated('ASCA')).registryId).toBe('ASCA');
  });

  it('defaults a missing registryId to null (selector resolves AKC downstream)', () => {
    expect(replicatedToTrial(makeReplicated(undefined)).registryId).toBeNull();
  });

  it('preserves registryId through mergeTrialData with an existing local trial', () => {
    const base = replicatedToTrial(makeReplicated('ASCA'));
    const merged = mergeTrialData(makeReplicated('ASCA'), { ...base, showName: 'Local Show' });
    expect(merged.registryId).toBe('ASCA');
    expect(merged.showName).toBe('Local Show');
  });
});
