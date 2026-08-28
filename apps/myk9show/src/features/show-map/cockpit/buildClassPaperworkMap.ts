import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { getCockpitReportHref } from './cockpitRoutes';
import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';
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
  returnTo: string;
}): ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]> {
  const result = new Map<string, SecretaryCockpitPaperwork[]>();
  const trialDateById = new Map(input.trials.map(trial => [trial.id, trial.trialDate] as const));
  for (const classItem of input.classes) {
    const trialId = classItem.trial_id;
    if (!trialId) continue;
    const scope = { kind: 'class' as const, showId: input.showId, trialId, classId: classItem.id };
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
            printHref: getCockpitReportHref({
              reportId: report.id,
              scope,
              returnTo: input.returnTo,
            }),
            confirmation: {
              scope: descriptor.scope,
              coverage: descriptor.coverage as unknown as Record<string, unknown>,
              fingerprint: descriptor.fingerprint,
            },
            ...(derived.record
              ? {
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
          state: input.recordsUnavailable ? 'unknown' : derived.state,
          printHref: getCockpitReportHref({ reportId: report.id, scope, returnTo: input.returnTo }),
          confirmation: {
            scope: descriptor.scope,
            coverage: descriptor.coverage as unknown as Record<string, unknown>,
            fingerprint: descriptor.fingerprint,
          },
          ...(derived.record
            ? {
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
    const handler = row.handler_person as Record<string, unknown> | null;
    const owner = dog?.owner as Record<string, unknown> | null;
    const dogId = entry.dog_id ?? '';
    const key = `${dogId || `armband:${armband}`}:${calendarDay}`;
    if (dogs.has(key)) continue;
    const handlerSource = handler ?? owner;
    dogs.set(key, {
      dogId,
      calendarDay,
      armband,
      callName: String(dog?.call_name ?? dog?.name ?? ''),
      handlerName: handlerSource
        ? `${handlerSource.first_name ?? ''} ${handlerSource.last_name ?? ''}`.trim()
        : String(row.handler ?? ''),
      classIds: [scope.classId],
      trialIds: [scope.trialId],
    });
  }
  if (dogs.size === 0) return null;
  return buildArmbandPaperworkDescriptor(scope, [...dogs.values()]);
}
