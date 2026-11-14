import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

/** Rows shaped as the report data reads return them (see toScoresheetModel.test.ts). */
export const SHOW = {
  id: 'show-1',
  name: 'Winter Trial',
  clubName: 'Demo Scent Work Club',
  organization: 'AKC',
  startDate: '2026-12-07',
  endDate: '2026-12-07',
  assignedJudges: [],
} as unknown as Show;

export const TRIAL = {
  id: 'trial-1',
  date: '2026-12-07',
  trial_number: 1,
  registry_id: 'AKC',
  name: null,
} as unknown as DbTrial;

function judge(first: string, last: string) {
  return [{ people: { first_name: first, last_name: last } }];
}

export function classRow(id: string, overrides: Record<string, unknown>): DbClass {
  return {
    id,
    trial_id: TRIAL.id,
    element: 'Container',
    level: 'Novice',
    section: null,
    class_number: null,
    display_order: 1,
    start_time: null,
    num_hides: null,
    distraction_count: null,
    time_limit_seconds: 180,
    num_areas: 1,
    ...overrides,
  } as unknown as DbClass;
}

export function entryRow(
  id: string,
  classId: string,
  armband: number,
  runOrder: number | null
): DbEntry {
  return {
    id,
    class_id: classId,
    dog_id: `dog-${id}`,
    armband,
    run_order: runOrder,
    handler: 'Jamie Walker',
    check_in_status: 'no-status',
    dog: { call_name: `Dog ${armband}`, breed: 'Beagle' },
  } as unknown as DbEntry;
}

/**
 * Pat Donovan judges Interior (08:00) and Container (09:00); Sam Lee judges Exterior (10:00);
 * Buried has no judge; Handler Discrimination has a judge and no dogs. Rows are given out of
 * order on purpose.
 */
export const CLASSES: DbClass[] = [
  classRow('c-container', {
    element: 'Container',
    start_time: '09:00:00',
    display_order: 1,
    judge_assignments: judge('Pat', 'Donovan'),
  }),
  classRow('c-exterior', {
    element: 'Exterior',
    start_time: '10:00:00',
    display_order: 2,
    judge_assignments: judge('Sam', 'Lee'),
  }),
  classRow('c-buried', { element: 'Buried', start_time: '11:00:00', display_order: 3 }),
  classRow('c-interior', {
    element: 'Interior',
    start_time: '08:00:00',
    display_order: 4,
    time_limit_seconds: 240,
    judge_assignments: judge('Pat', 'Donovan'),
  }),
  classRow('c-empty', {
    element: 'Handler Discrimination',
    start_time: '12:00:00',
    display_order: 5,
    judge_assignments: judge('Pat', 'Donovan'),
  }),
];

export const ENTRIES: DbEntry[] = [
  entryRow('e1', 'c-container', 103, 3),
  entryRow('e2', 'c-container', 101, 1),
  entryRow('e3', 'c-container', 102, 2),
  entryRow('e4', 'c-exterior', 201, 1),
  entryRow('e5', 'c-buried', 301, 1),
  entryRow('e6', 'c-buried', 302, 2),
  entryRow('e7', 'c-interior', 402, 2),
  entryRow('e8', 'c-interior', 401, 1),
];
