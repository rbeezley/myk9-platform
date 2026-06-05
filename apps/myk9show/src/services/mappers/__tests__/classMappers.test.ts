import { describe, expect, it } from 'vitest';
import { mapDatabaseToClass, type DbClassWithRelations } from '../classMappers';

function createDbClass(status: string | null): DbClassWithRelations {
  return {
    id: 'class-1',
    trial_id: 'trial-1',
    name: 'Interior Novice A',
    status,
    start_time: null,
    class_number: '101',
    description: null,
    element: 'Interior',
    level: 'Novice',
    section: 'A',
    entry_fee: null,
    max_entries: null,
    jump_heights: null,
    display_order: null,
    results_released_at: null,
    updated_at: '2026-06-05T12:00:00.000Z',
    created_at: '2026-06-05T12:00:00.000Z',
    trial: {
      name: 'Spring Trial',
      date: '2026-06-05',
      trial_number: '1',
    },
  } as DbClassWithRelations;
}

describe('mapDatabaseToClass', () => {
  it('maps persisted in_progress class status back to In Progress', () => {
    expect(mapDatabaseToClass(createDbClass('in_progress')).status).toBe('In Progress');
  });
});
