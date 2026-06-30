import { describe, expect, it } from 'vitest';
import { mapDatabaseToTrial, type DbTrialWithShow } from '../trialMappers';

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
