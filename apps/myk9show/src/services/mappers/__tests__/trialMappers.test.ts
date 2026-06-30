import { describe, expect, it } from 'vitest';
import {
  mapDatabaseToTrial,
  mapReplicatedTrialToDbRow,
  type DbTrialWithShow,
} from '../trialMappers';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';

/**
 * The cold / anon public landing path maps trial rows straight from PostgREST via
 * `mapDatabaseToTrial`. Phase 5a depends on `registry_id` surviving that hop as the
 * camelCase `registryId` — otherwise a guest viewing a UKC/ASCA show's public landing
 * would silently get AKC copy. These tests pin the carry.
 */
function createDbTrial(registry_id: string | null): DbTrialWithShow {
  return {
    id: 'trial-1',
    show_id: 'show-1',
    name: 'Trial I',
    date: '2026-06-12',
    trial_number: 'I',
    status: 'Upcoming',
    display_order: 1,
    trial_type: 'Scent Work',
    category: null,
    event_number: null,
    planned_start_time: null,
    actual_start_time: null,
    actual_end_time: null,
    image_url: null,
    registry_id,
    show: { id: 'show-1', name: 'Spring Trial', start_date: '2026-06-12', end_date: '2026-06-14' },
  } as unknown as DbTrialWithShow;
}

describe('mapDatabaseToTrial — registry carry (cold public path)', () => {
  it('maps snake_case registry_id → camelCase registryId', () => {
    expect(mapDatabaseToTrial(createDbTrial('UKC')).registryId).toBe('UKC');
    expect(mapDatabaseToTrial(createDbTrial('ASCA')).registryId).toBe('ASCA');
  });

  it('maps a null registry_id to null (selector defaults it to AKC downstream)', () => {
    expect(mapDatabaseToTrial(createDbTrial(null)).registryId).toBeNull();
  });
});

/**
 * The replication fallback (getTrialById/getTrialsByShow) builds a snake_case row via
 * mapReplicatedTrialToDbRow, then consumers remap it with mapDatabaseToTrial. If the
 * snake_case row drops registry_id, a UKC/ASCA trial silently renders AKC copy on the
 * fallback path. Pin the carry and the full round-trip.
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

describe('mapReplicatedTrialToDbRow — registry carry (replication fallback path)', () => {
  it('emits snake_case registry_id from the replicated registryId', () => {
    expect(mapReplicatedTrialToDbRow(makeReplicated('UKC')).registry_id).toBe('UKC');
    expect(mapReplicatedTrialToDbRow(makeReplicated('ASCA')).registry_id).toBe('ASCA');
  });

  it('round-trips the registry through the production fallback shape (DbRow → domain Trial)', () => {
    const dbRow = mapReplicatedTrialToDbRow(makeReplicated('UKC')) as unknown as DbTrialWithShow;
    expect(mapDatabaseToTrial(dbRow).registryId).toBe('UKC');
  });
});
