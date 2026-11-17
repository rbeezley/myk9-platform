import {
  projectHandlerIdentity,
  type HandlerPersonLike,
} from '@/features/registries/handlerIdentity';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { isHeldEntry } from '@/features/dogs/identity';
import { isPendingEntryStatus } from '@/features/entry-operations/classEntryBreakdown';
import { buildPrintedLabelIndex, labelPrintStatus } from '@/lib/labels/armbandPrintIndex';

import { getCockpitReportHref } from './cockpitRoutes';
import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';
import { paperworkJudgeUnknown } from './paperworkClassJudge';
import { buildArmbandPaperworkDescriptor, derivePaperworkPrintState } from './paperworkPrintState';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

const REPORTS = [
  { id: 'check-in-sheet', label: 'Check-in sheet' },
  { id: 'scoresheet', label: 'Score sheets' },
  { id: 'results-sheet', label: 'Results' },
  { id: 'armband-labels', label: 'Armband labels' },
  { id: 'result-labels', label: 'Result labels' },
] as const;

export function buildClassPaperworkMap(input: {
  showId: string;
  classes: readonly DbClass[];
  trials: readonly { id: string; trialDate: string }[];
  entries: readonly DbEntry[];
  records: readonly ReplicatedPaperworkPrint[];
  /**
   * The SERVER sync for those records failed, so `records` reflects only what
   * this device already had. `useShowPaperworkPrints` exposes this precisely
   * because its `useQuery` reads IndexedDB and therefore succeeds even when the
   * server read did not -- its own comment calls it "the difference between
   * 'nothing is printed' and 'I could not find out'".
   *
   * Without it, check-in sheets printed an hour ago on another device render as
   * "Not confirmed printed" with a Print button, inviting a duplicate print run
   * mid-show. `SecretaryCockpitPaperwork['state']` has always declared
   * `'unknown'`, and `paperworkEvidence` already maps it -- nothing could
   * produce it.
   */
  recordsUnavailable?: boolean;
  /**
   * The class facts these rows were built from cannot be trusted (loading or a failed read), so
   * no row may offer to record a print: the stored fingerprint would describe obsolete facts.
   */
  withholdConfirmation?: boolean;
  returnTo: string;
  assignedJudges?: ReadonlyArray<ShowJudgeAssignment> | undefined;
  /** The show's `assignedJudges` have not loaded: no class has a known judge, so no verdicts. */
  judgesUnknown?: boolean;
}): ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]> {
  const result = new Map<string, SecretaryCockpitPaperwork[]>();
  const printedLabels = buildPrintedLabelIndex(input.records);
  const trialDateById = new Map(input.trials.map(trial => [trial.id, trial.trialDate] as const));
  for (const classItem of input.classes) {
    const trialId = classItem.trial_id;
    if (!trialId) continue;
    const scope = { kind: 'class' as const, showId: input.showId, trialId, classId: classItem.id };
    // The judge is a fingerprint input and is not loaded yet: no verdict and no confirmation for
    // the sheets that hash it, so a print cannot read "changed" and back as the judge loads.
    const judgeUnknown =
      input.judgesUnknown === true || paperworkJudgeUnknown(classItem, input.assignedJudges);
    const paperwork = REPORTS.flatMap((report): SecretaryCockpitPaperwork[] => {
      const classEntries = input.entries.filter(entry => entry.class_id === classItem.id);
      const descriptor =
        report.id === 'armband-labels'
          ? buildArmbandDescriptor(scope, classEntries, trialDateById.get(trialId) ?? '')
          : buildReportPaperworkDescriptor({
              reportId: report.id,
              scope,
              classes: input.classes,
              entries: input.entries,
              assignedJudges: input.assignedJudges,
            });
      const history = input.records
        .filter(record => record.reportId === report.id)
        .filter(
          record =>
            record.classId === classItem.id ||
            record.trialId === trialId ||
            record.scopeKind === 'show'
        )
        .sort((left, right) => right.printedAt.localeCompare(left.printedAt))
        .map(record => ({
          id: record.id,
          printedAt: record.printedAt,
          printedBy: record.printedByName,
          ...(record.voidedAt ? { voidedAt: record.voidedAt } : {}),
        }));
      if (report.id === 'armband-labels') {
        if (!descriptor) return [];
        const derived = derivePaperworkPrintState(input.records, descriptor);
        return [
          {
            reportId: report.id,
            label: report.label,
            state: input.recordsUnavailable ? 'unknown' : derived.state,
            ...(input.recordsUnavailable
              ? {}
              : {
                  labelsToPrint: labelsToPrint(
                    printedLabels,
                    scope,
                    classEntries,
                    trialDateById.get(trialId) ?? ''
                  ),
                }),
            printHref: getCockpitReportHref({
              reportId: report.id,
              scope,
              returnTo: input.returnTo,
            }),
            ...(input.withholdConfirmation
              ? {}
              : {
                  confirmation: {
                    scope: descriptor.scope,
                    coverage: descriptor.coverage as unknown as Record<string, unknown>,
                    fingerprint: descriptor.fingerprint,
                  },
                }),
            ...(derived.record
              ? {
                  recordId: derived.record.id,
                  printedAt: derived.record.printedAt,
                  printedBy: derived.record.printedByName,
                  coveredByScope: derived.record.coverage.scopeKind as 'show' | 'trial' | 'class',
                }
              : {}),
            history,
          },
        ];
      }
      if (!descriptor) return [];
      const derived = derivePaperworkPrintState(input.records, descriptor);
      return [
        {
          reportId: report.id,
          label: report.label,
          state: input.recordsUnavailable || judgeUnknown ? 'unknown' : derived.state,
          printHref: getCockpitReportHref({ reportId: report.id, scope, returnTo: input.returnTo }),
          ...(input.withholdConfirmation || judgeUnknown
            ? {}
            : {
                confirmation: {
                  scope: descriptor.scope,
                  coverage: descriptor.coverage as unknown as Record<string, unknown>,
                  fingerprint: descriptor.fingerprint,
                },
              }),
          ...(derived.record
            ? {
                recordId: derived.record.id,
                printedAt: derived.record.printedAt,
                printedBy: derived.record.printedByName,
                coveredByScope: derived.record.coverage.scopeKind as 'show' | 'trial' | 'class',
              }
            : {}),
          history,
        },
      ];
    });
    result.set(classItem.id, paperwork);
  }
  return result;
}

/**
 * The dog-day labels of this class with no current print (MYK9-2075): never printed, or printed and
 * since changed. Judged per label by the 2073 print index, so a late entry is one label, not a
 * class. A dog still pending acceptance, held, deleted, or without an armband number has no label.
 */
function labelsToPrint(
  index: ReturnType<typeof buildPrintedLabelIndex>,
  scope: Extract<import('@/lib/reports/types').ReportScope, { kind: 'class' }>,
  entries: readonly DbEntry[],
  calendarDay: string
): { notPrinted: readonly string[]; changed: readonly string[] } {
  // A held entry (awaiting a registration number) gets no label from the print
  // (useArmbandLabelData), so counting it would leave the line unprinted forever.
  const labelled = entries.filter(
    entry =>
      !entry.deleted_at &&
      !isPendingEntryStatus(entry.entry_status) &&
      !isHeldEntry(entry as Parameters<typeof isHeldEntry>[0])
  );
  const subjects =
    buildArmbandDescriptor(scope, labelled, calendarDay)?.coverage.subjectFingerprints ?? {};
  const notPrinted: string[] = [];
  const changed: string[] = [];
  for (const [key, fingerprint] of Object.entries(subjects)) {
    const status = labelPrintStatus(index, key, fingerprint);
    if (status === 'not-printed') notPrinted.push(key);
    if (status === 'changed') changed.push(key);
  }
  return { notPrinted, changed };
}

function buildArmbandDescriptor(
  scope: Extract<import('@/lib/reports/types').ReportScope, { kind: 'class' }>,
  entries: readonly DbEntry[],
  calendarDay: string
) {
  const dogs = new Map<
    string,
    {
      dogId: string;
      calendarDay: string;
      armband: number;
      callName: string;
      handlerName: string;
      classIds: string[];
      trialIds: string[];
    }
  >();
  for (const entry of entries) {
    const armband = entry.armband == null ? null : Number(entry.armband);
    if (!Number.isFinite(armband) || armband === null || !calendarDay) continue;
    const row = entry as DbEntry & Record<string, unknown>;
    const dog = row.dog as Record<string, unknown> | null;
    const dogId = entry.dog_id ?? '';
    const key = `${dogId || `armband:${armband}`}:${calendarDay}`;
    if (dogs.has(key)) continue;
    dogs.set(key, {
      dogId,
      calendarDay,
      armband,
      callName: String(dog?.call_name ?? dog?.name ?? ''),
      // The rule the label prints (useArmbandLabelData), so a recorded print matches here.
      handlerName:
        projectHandlerIdentity({
          assignedHandlerName: row.handler as string | null | undefined,
          assignedHandlerId: row.handler_id as string | null | undefined,
          assignedHandlerPerson: row.handler_person as HandlerPersonLike | null | undefined,
          ownerPerson: dog?.owner as HandlerPersonLike | null | undefined,
        }).name ?? '',
      classIds: [scope.classId],
      trialIds: [scope.trialId],
    });
  }
  if (dogs.size === 0) return null;
  return buildArmbandPaperworkDescriptor(scope, [...dogs.values()]);
}
