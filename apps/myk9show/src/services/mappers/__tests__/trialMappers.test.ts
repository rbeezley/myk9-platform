import { describe, expect, it } from 'vitest';
import {
  mapDatabaseToTrial,
  mapReplicatedTrialToDbRow,
  type DbTrialWithShow,
} from '../trialMappers';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';

/**
 * Heritage / registry columns (migration 192) must survive every trial read path.
 * Phase 5a pinned `registryId`; we additionally pin `timezone`. Both ride the same
 * three mappers and silently default if dropped — a UKC/ASCA show would render AKC
 * copy, and a non-Eastern show would show 'America/New_York'.
 */

// --- cold / anon public path: PostgREST row → domain Trial -----------------
function createDbTrial(fields: {
  registry_id?: string | null;
  timezone?: string | null;
}): DbTrialWithShow {
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
    registry_id: fields.registry_id ?? null,
    timezone: fields.timezone ?? null,
    show: { id: 'show-1', name: 'Spring Trial', start_date: '2026-06-12', end_date: '2026-06-14' },
  } as unknown as DbTrialWithShow;
}

describe('mapDatabaseToTrial — registry carry (cold public path)', () => {
  it('maps snake_case registry_id → camelCase registryId', () => {
    expect(mapDatabaseToTrial(createDbTrial({ registry_id: 'UKC' })).registryId).toBe('UKC');
    expect(mapDatabaseToTrial(createDbTrial({ registry_id: 'ASCA' })).registryId).toBe('ASCA');
  });

  it('maps a null registry_id to null (selector defaults it to AKC downstream)', () => {
    expect(mapDatabaseToTrial(createDbTrial({ registry_id: null })).registryId).toBeNull();
  });
});

describe('mapDatabaseToTrial — timezone carry (cold public path)', () => {
  // Regression: this path dropped `timezone`, so getTrialTimezone(currentTrial)
  // silently fell back to 'America/New_York' and a non-Eastern trial's landing
  // page showed the wrong timezone.
  it('carries timezone through the database → domain hop', () => {
    expect(mapDatabaseToTrial(createDbTrial({ timezone: 'America/Chicago' })).timezone).toBe(
      'America/Chicago'
    );
  });

  it('maps a NULL timezone to undefined (lets getTrialTimezone apply its default)', () => {
    expect(mapDatabaseToTrial(createDbTrial({ timezone: null })).timezone).toBeUndefined();
  });
});

// --- replication fallback: replicated → snake_case DB row → domain ----------
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

describe('mapReplicatedTrialToDbRow — registry carry (replication fallback path)', () => {
  it('emits snake_case registry_id from the replicated registryId', () => {
    expect(mapReplicatedTrialToDbRow(makeReplicated({ registryId: 'UKC' })).registry_id).toBe('UKC');
    expect(mapReplicatedTrialToDbRow(makeReplicated({ registryId: 'ASCA' })).registry_id).toBe(
      'ASCA'
    );
  });

  it('round-trips the registry through the production fallback shape (DbRow → domain Trial)', () => {
    const dbRow = mapReplicatedTrialToDbRow(
      makeReplicated({ registryId: 'UKC' })
    ) as unknown as DbTrialWithShow;
    expect(mapDatabaseToTrial(dbRow).registryId).toBe('UKC');
  });
});

describe('mapReplicatedTrialToDbRow — timezone carry (replication fallback path)', () => {
  // Regression: this mapper feeds getTrialById / getTrialsByShow. It omitted
  // `timezone`, so the row reaching mapDatabaseToTrial had no timezone key and
  // getTrialTimezone fell back to 'America/New_York' on the warm service path.
  it('emits timezone on the DB row', () => {
    expect(mapReplicatedTrialToDbRow(makeReplicated({ timezone: 'America/Chicago' })).timezone).toBe(
      'America/Chicago'
    );
  });

  it('survives the full replicated → DB row → domain round-trip', () => {
    const dbRow = mapReplicatedTrialToDbRow(
      makeReplicated({ timezone: 'America/Los_Angeles' })
    ) as unknown as DbTrialWithShow;
    expect(mapDatabaseToTrial(dbRow).timezone).toBe('America/Los_Angeles');
  });

  it('maps a missing timezone to null on the DB row', () => {
    expect(mapReplicatedTrialToDbRow(makeReplicated({ timezone: undefined })).timezone).toBeNull();
  });
});
