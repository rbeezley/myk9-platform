import { describe, expect, it } from 'vitest';
import {
  mapDatabaseToTrial,
  mapReplicatedTrialToDbRow,
  type DbTrialWithShow,
} from '../trialMappers';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';

function createDbTrial(timezone: string | null): DbTrialWithShow {
  return {
    id: 'trial-1',
    show_id: 'show-1',
    name: 'Heritage Scent Work',
    date: '2026-07-04',
    trial_number: '1',
    status: 'upcoming',
    planned_start_time: null,
    actual_start_time: null,
    actual_end_time: null,
    event_number: null,
    category: null,
    display_order: null,
    trial_type: 'Scent Work',
    image_url: null,
    timezone,
    show: {
      id: 'show-1',
      name: 'Heritage Show',
      start_date: '2026-07-04',
      end_date: '2026-07-05',
    },
  } as DbTrialWithShow;
}

describe('mapDatabaseToTrial', () => {
  // Regression: the cold/anon public-landing path dropped `timezone`, so
  // getTrialTimezone(currentTrial) silently fell back to 'America/New_York'
  // and a non-Eastern trial's landing page showed the wrong timezone.
  it('carries timezone through the database → domain hop', () => {
    expect(mapDatabaseToTrial(createDbTrial('America/Chicago')).timezone).toBe('America/Chicago');
  });

  it('maps a NULL timezone to undefined (lets getTrialTimezone apply its default)', () => {
    expect(mapDatabaseToTrial(createDbTrial(null)).timezone).toBeUndefined();
  });
});

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

describe('mapReplicatedTrialToDbRow', () => {
  // Regression: this mapper feeds getTrialById / getTrialsByShow. It omitted
  // `timezone`, so the row reaching mapDatabaseToTrial had no timezone key and
  // getTrialTimezone fell back to 'America/New_York' on the warm service path.
  it('emits timezone on the DB row', () => {
    const row = mapReplicatedTrialToDbRow(createReplicatedTrial('America/Chicago'));
    expect(row.timezone).toBe('America/Chicago');
  });

  it('survives the full replicated → DB row → domain round-trip', () => {
    const row = mapReplicatedTrialToDbRow(createReplicatedTrial('America/Los_Angeles'));
    const trial = mapDatabaseToTrial(row as unknown as DbTrialWithShow);
    expect(trial.timezone).toBe('America/Los_Angeles');
  });

  it('maps a missing timezone to null on the DB row', () => {
    const row = mapReplicatedTrialToDbRow(createReplicatedTrial(undefined));
    expect(row.timezone).toBeNull();
  });
});
