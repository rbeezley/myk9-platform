import { describe, expect, it } from 'vitest';
import {
  mapDatabaseToClass,
  mapReplicatedClassToDbRow,
  type DbClassWithRelations,
} from '../classMappers';

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

  // Regression (P1-04 live walk, 2026-06-18): a NULL section was defaulted to 'A',
  // printing a phantom "Interior Advanced A" / "Exterior Excellent A" in the
  // exhibitor My Entries tab (only AKC Scent Work Novice is split into A/B; all
  // other levels are single-section and store NULL). It also mis-grouped run
  // order (runOrderUtils filters on section === 'A'). NULL must map to ''.
  describe('section handling', () => {
    it('keeps a real A/B section', () => {
      expect(mapDatabaseToClass({ ...createDbClass('upcoming'), section: 'A' }).section).toBe('A');
      expect(mapDatabaseToClass({ ...createDbClass('upcoming'), section: 'B' }).section).toBe('B');
    });

    it('maps a NULL section to empty string, not "A"', () => {
      const mapped = mapDatabaseToClass({
        ...createDbClass('upcoming'),
        name: 'Exterior Excellent',
        level: 'Excellent',
        element: 'Exterior',
        section: null,
      } as DbClassWithRelations);
      expect(mapped.section).toBe('');
    });
  });
});

/**
 * MYK9-198. The emergency trial packet and the Reports page read classes back
 * through this mapper on the replication-backed route — the normal
 * authenticated/offline path. It dropped every trial-day timing field, so a
 * fix that worked against a PostgREST row was a silent no-op in production.
 * Pin the fields here rather than trusting the packet's own tests, which never
 * exercise this route.
 */
describe('mapReplicatedClassToDbRow — trial-day timing', () => {
  it('carries the class time limits and area count back out', () => {
    const row = mapReplicatedClassToDbRow({
      id: 'c1',
      trialId: 't1',
      name: 'Interior Advanced',
      timeLimitSeconds: 180,
      timeLimitArea2Seconds: 120,
      timeLimitArea3Seconds: 90,
      areaCount: 3,
    } as Parameters<typeof mapReplicatedClassToDbRow>[0]);

    expect(row.time_limit_seconds).toBe(180);
    expect(row.time_limit_area2_seconds).toBe(120);
    expect(row.time_limit_area3_seconds).toBe(90);
    expect(row.num_areas).toBe(3);
  });
});
