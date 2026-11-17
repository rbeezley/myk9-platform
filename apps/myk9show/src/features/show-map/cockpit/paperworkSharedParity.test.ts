import { describe, expect, it } from 'vitest';
import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReportScope } from '@/lib/reports/types';
import { buildSheetDescriptorFromRows } from '../../../../../../supabase/functions/_shared/paperwork/rowDescriptors.ts';
import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';

const classes = [
  {
    id: 'class-1',
    trial_id: 'trial-1',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'in_progress',
    judge_assignments: [
      {
        person_id: 'p1',
        status: 'confirmed',
        people: { first_name: 'Judge', last_name: 'One' },
      },
    ],
    time_limit_seconds: '180.5',
    num_areas: 1,
    num_hides: 2,
  },
  { id: 'class-2', trial_id: 'trial-2', element: 'Interior', level: 'Excellent', section: null },
] as unknown as DbClass[];
const sharedClasses = classes.map(classItem => ({
  ...classItem,
  judgeName: classItem.id === 'class-1' ? 'Judge One' : null,
}));
const entries = [
  {
    id: 'e1',
    class_id: 'class-1',
    dog_id: 'd1',
    armband: '101',
    run_order: 2,
    check_in_status: 'checked-in',
    entry_status: 'confirmed',
  },
  {
    id: 'e2',
    class_id: 'class-1',
    dog_id: 'd2',
    armband: 102,
    run_order: 1,
    check_in_status: null,
    entry_status: 'withdrawn',
  },
  {
    id: 'e3',
    class_id: 'class-2',
    dog_id: 'd3',
    armband: null,
    run_order: null,
    check_in_status: 'no-show',
    entry_status: null,
  },
] as unknown as DbEntry[];

const scopes: ReportScope[] = [
  { kind: 'class', showId: 's1', trialId: 'trial-1', classId: 'class-1' },
  { kind: 'trial', showId: 's1', trialId: 'trial-2' },
  { kind: 'show', showId: 's1' },
];

// Fingerprints recorded from the pre-extraction app code (MYK9-2086), so a drift in either
// path breaks here before it breaks a stored print. MYK9-2116 re-pinned every one that hashes a
// class subject: the check-in sheet gained class subjects (judge), and an absent judge or hides
// now hashes as null. scoresheet/class is unchanged: its class carries a judge and hides.
const PINNED: Record<string, string> = {
  'check-in-sheet/class': 'fnv1a64:356c9acf8f53410d',
  'check-in-sheet/trial': 'fnv1a64:79d5d628331a756c',
  'check-in-sheet/show': 'fnv1a64:0ae6d05c8f9fb71c',
  'scoresheet/class': 'fnv1a64:aa00e904808e0eb8',
  'scoresheet/trial': 'fnv1a64:c5c0806c053b9460',
  'scoresheet/show': 'fnv1a64:19cc19aec031cb5b',
};

describe('app and shared paperwork descriptors agree', () => {
  for (const reportId of ['check-in-sheet', 'scoresheet']) {
    for (const scope of scopes) {
      it(`${reportId} / ${scope.kind}`, () => {
        const app = buildReportPaperworkDescriptor({ reportId, scope, classes, entries });
        const shared = buildSheetDescriptorFromRows({
          reportId,
          scope,
          classes: sharedClasses,
          entries,
        });
        expect(app).toEqual(shared);
        expect(app?.fingerprint).toBe(PINNED[`${reportId}/${scope.kind}`]);
      });
    }
  }
});
