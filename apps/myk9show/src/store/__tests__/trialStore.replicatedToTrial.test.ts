import { describe, expect, it } from 'vitest';
import { replicatedToTrial } from '../trial-store-helpers';
import type { ReplicatedTrial } from '@/services/replication';

function createReplicatedTrial(timezone: string | undefined): ReplicatedTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Heritage Scent Work',
    date: '2026-07-04',
    trialNumber: '1',
    status: 'upcoming',
    trialType: 'Scent Work',
    timezone,
  };
}

describe('replicatedToTrial', () => {
  // Regression: the warm/authenticated path dropped `timezone`, so
  // currentTrial.timezone was always undefined and getTrialTimezone()
  // silently fell back to 'America/New_York' for every show.
  it('carries timezone through the replicated → domain hop', () => {
    expect(replicatedToTrial(createReplicatedTrial('America/Chicago')).timezone).toBe(
      'America/Chicago'
    );
  });

  it('maps a missing timezone to null (lets getTrialTimezone apply its default)', () => {
    expect(replicatedToTrial(createReplicatedTrial(undefined)).timezone).toBeNull();
  });
});
