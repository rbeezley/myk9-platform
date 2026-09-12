import type { ClassData } from '@/components/classes/types/classTypes';
import type { SportClassRuleRow } from '@/types/sport-template-types';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { classDataToReplicatedClass } from './classDataToReplicatedClass';

/** The two replication writes a wizard class needs; injectable for tests. */
export interface WizardClassWriters {
  createClass: (cls: ReplicatedClass) => Promise<unknown>;
  assignClassJudge: (showId: string, classId: string, judgeId: string) => Promise<void>;
}

const defaultWriters: WizardClassWriters = {
  createClass: cls => replicatedClassesTable.createClass(cls),
  assignClassJudge: (showId, classId, judgeId) =>
    upsertClassJudgeAssignment(showId, classId, judgeId),
};

/**
 * Create the wizard's classes through replication, each with its class-level
 * judge assignment.
 *
 * This is the offline and edit-mode path (the online create path goes through
 * `create_show_with_children`, which writes class-level judge_assignments
 * itself). Until MYK9-479 this path stored the picked judge only as the class's
 * `judgeName` string: nothing wrote a `judge_assignments` row for the class, so
 * the selection never reached the server and showed as TBD everywhere but the
 * device that made it. Now that `classes.judge_name` is gone the assignment row
 * is the only judge a class has, so it is written here, keyed by the same id
 * `classDataToReplicatedClass` gives the class.
 */
export async function createWizardClasses(
  showId: string,
  classes: readonly ClassData[],
  ruleMap: ReadonlyMap<string, SportClassRuleRow>,
  writers: WizardClassWriters = defaultWriters
): Promise<void> {
  await Promise.all(
    classes.map(async classData => {
      const rule = classData.templateId
        ? ruleMap.get(`${classData.templateId}|${classData.element ?? ''}|${classData.level ?? ''}`)
        : undefined;
      const replicated = classDataToReplicatedClass(classData, rule);
      await writers.createClass(replicated);
      if (classData.judgeId) {
        await writers.assignClassJudge(showId, replicated.id, classData.judgeId);
      }
    })
  );
}
