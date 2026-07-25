import { describe, expect, it } from 'vitest';

import { toClassEntry } from './atShowClassListAdapter';
import type { ReplicatedClass, ReplicatedEntry } from '@/services/replication';

describe('at-show Class timing projection', () => {
  it('shows the revised expectation while preserving the scheduled and actual times', () => {
    const result = toClassEntry(
      {
        id: 'class-1',
        name: 'Container Novice',
        startTime: '09:00',
        revisedExpectedStart: '2026-07-20T15:15:00.000Z',
        actual_start_time: '2026-07-20T15:18:00.000Z',
        actual_end_time: '2026-07-20T15:47:00.000Z',
        classStatus: 'in_progress',
      } satisfies ReplicatedClass,
      [] satisfies ReplicatedEntry[],
      new Set()
    );

    expect(result).toMatchObject({
      planned_start_time: '09:00',
      start_time: '2026-07-20T15:15:00.000Z',
      revised_expected_start: '2026-07-20T15:15:00.000Z',
      actual_start_time: '2026-07-20T15:18:00.000Z',
      actual_end_time: '2026-07-20T15:47:00.000Z',
      class_status: 'in_progress',
    });
  });
});
