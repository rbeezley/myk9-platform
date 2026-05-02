import type { SyncableClassData } from '@/store/classStore';
import type { CreatedClass } from '@/types/template.types';
import { Organization, TrialType } from '@/types/template.types';

function parseEstimatedJudgingTime(raw: string | undefined): number {
  if (!raw) return 30;
  const parts = raw.split(':').map(Number);
  if (parts.length === 2 && parts.every(n => Number.isFinite(n))) {
    return parts[0] * 60 + parts[1];
  }
  const asNumber = Number(raw);
  return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : 30;
}

function parseClassOrder(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Adapt a Supabase-backed `SyncableClassData` row into the `CreatedClass`
 * shape consumed by `RunOrderBoard`, `ClassScheduleView`, and friends.
 *
 * The DB does not store template field structures, personnel objects, or a
 * runOrder integer — class ordering is encoded in `start_time`. We synthesize
 * sensible defaults so the run-order UI can render real classes from the DB
 * without each consumer learning the DB shape.
 *
 * INTENT: `organization` and `trialType` default to AKC / Scent Work because
 * the run-order UI today only displays them as informational labels and we
 * have no per-trial source for them on the class row. If a consumer ever
 * branches on these values (e.g. a non-AKC org with different rules) plumb
 * them through from the trial row instead.
 *
 * Pure: no React, no fetches; safe to unit-test.
 */
export function mapClassToCreatedClass(cls: SyncableClassData, index: number): CreatedClass {
  const estimatedMinutes = parseEstimatedJudgingTime(cls.estimatedJudgingTime);

  return {
    id: cls.id,
    templateId: cls.templateId ?? '',
    templateVersion: '1.0.0',
    trialId: cls.trialId,
    organization: Organization.AKC,
    trialType: TrialType.SCENT_WORK,
    element: cls.element ?? '',
    level: cls.level,
    section: cls.section,
    className: cls.className ?? cls.element ?? 'Unnamed Class',
    classNumber: cls.classNumber ?? '',
    status: cls.status,
    runOrder:
      cls.displayOrder != null
        ? Math.round(cls.displayOrder / 10)
        : parseClassOrder(cls.classOrder) || index + 1,
    fieldValues: {
      estimatedJudgingTime: estimatedMinutes,
    },
    personnel: {
      judgeId: cls.judgeId,
      judgeName: cls.judge,
      stewards: {
        gate: cls.gateSteward,
        table: cls.tableSteward,
        timer: cls.timerSteward,
        ring: [cls.ringSteward1, cls.ringSteward2, cls.ringSteward3].filter((s): s is string =>
          Boolean(s)
        ),
      },
    },
    entries: {
      maxEntries: cls.maxEntries ?? 0,
      currentEntries: 0,
      waitlistEntries: 0,
    },
    createdBy: 'system',
    createdAt: new Date(),
  };
}

export function mapClassesToCreatedClasses(classes: SyncableClassData[]): CreatedClass[] {
  const sorted = [...classes].sort(
    (a, b) =>
      (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER)
  );
  return sorted.map((cls, i) => mapClassToCreatedClass(cls, i));
}
