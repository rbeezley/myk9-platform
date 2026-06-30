import { describe, expect, it } from 'vitest';
import { replicatedToTrial, mergeTrialData } from '../trial-store-helpers';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';

/**
 * The warm / authenticated landing path maps replicated trial rows (IndexedDB) into the
 * domain Trial via `replicatedToTrial`. Heritage / registry columns (migration 192) must
 * survive that hop: Phase 5a pinned `registryId` (sanctioning body), and we additionally
 * pin `timezone` — both default silently (AKC copy / America/New_York) if dropped.
 */
function makeReplicated(fields: {
  registryId?: string | undefined;
  timezone?: string | undefined;
}): ReplicatedTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Trial I',
    date: '2026-06-12',
    trialNumber: 'I',
    status: 'Upcoming',
    displayOrder: 1,
    registryId: fields.registryId,
    timezone: fields.timezone,
  };
}

describe('replicatedToTrial — registry carry (warm path)', () => {
  it('carries registryId from the replicated row onto the domain Trial', () => {
    expect(replicatedToTrial(makeReplicated({ registryId: 'UKC' })).registryId).toBe('UKC');
    expect(replicatedToTrial(makeReplicated({ registryId: 'ASCA' })).registryId).toBe('ASCA');
  });

  it('defaults a missing registryId to null (selector resolves AKC downstream)', () => {
    expect(replicatedToTrial(makeReplicated({})).registryId).toBeNull();
  });

  it('preserves registryId through mergeTrialData with an existing local trial', () => {
    const base = replicatedToTrial(makeReplicated({ registryId: 'ASCA' }));
    const merged = mergeTrialData(makeReplicated({ registryId: 'ASCA' }), {
      ...base,
      showName: 'Local Show',
    });
    expect(merged.registryId).toBe('ASCA');
    expect(merged.showName).toBe('Local Show');
  });
});

describe('replicatedToTrial — timezone carry (warm path)', () => {
  // Regression: the warm path dropped `timezone`, so currentTrial.timezone was
  // always undefined and getTrialTimezone() silently fell back to 'America/New_York'.
  it('carries timezone through the replicated → domain hop', () => {
    expect(replicatedToTrial(makeReplicated({ timezone: 'America/Chicago' })).timezone).toBe(
      'America/Chicago'
    );
  });

  it('maps a missing timezone to null (lets getTrialTimezone apply its default)', () => {
    expect(replicatedToTrial(makeReplicated({})).timezone).toBeNull();
  });
});
