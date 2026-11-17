import { describe, expect, it } from 'vitest';

import { buildEmergencyPacketData } from '@/pages/secretary/ReportsPage/reportDataMapping';
import type { Show } from '@/types/show-types';
import type { DbClass } from '@/types/database-mappings';
import type { ShowJudgeAssignment } from '@/types/judge-types';

import { paperworkJudgeName } from './paperworkClassJudge';

// MYK9-2116: the fingerprint hashes exactly the judge name the printed sheet shows.
const pendingFirst = {
  id: 'class-1',
  trial_id: 't1',
  judge_assignments: [
    { person_id: 'p1', status: 'invited', people: { first_name: 'Ivy', last_name: 'Pending' } },
    { person_id: 'p2', status: 'confirmed', people: { first_name: 'Cal', last_name: 'Confirmed' } },
  ],
} as unknown as DbClass;
const viaAssigned = { id: 'class-2', trial_id: 't1' } as unknown as DbClass;
const none = { id: 'class-3', trial_id: 't1' } as unknown as DbClass;
const assignedJudges = [
  { judgeId: 'j9', judgeName: 'Ada Assigned', assignedClasses: ['class-2'] },
] as unknown as ShowJudgeAssignment[];

function sheetJudgeNames(classes: DbClass[]) {
  const packet = buildEmergencyPacketData({
    show: { id: 's1', name: 'Show', assignedJudges } as unknown as Show,
    trials: [],
    classes,
    entries: [],
  });
  return Object.fromEntries(packet.classes.map(item => [item.id, item.judgeName]));
}

describe('paperworkJudgeName equals the judge name the sheet prints', () => {
  const sheet = sheetJudgeNames([pendingFirst, viaAssigned, none]);

  it.each([
    ['a pending-first assignment', pendingFirst],
    ['a judge known only through assignedJudges', viaAssigned],
    ['no judge at all', none],
  ])('%s', (_name, classItem) => {
    expect(paperworkJudgeName(classItem, assignedJudges)).toBe(
      sheet[(classItem as { id: string }).id]
    );
  });
});
