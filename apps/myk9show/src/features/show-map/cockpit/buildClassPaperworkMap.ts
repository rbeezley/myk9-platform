import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { getCockpitReportHref } from './cockpitRoutes';
import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';
import { derivePaperworkPrintState } from './paperworkPrintState';
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
  entries: readonly DbEntry[];
  records: readonly ReplicatedPaperworkPrint[];
  returnTo: string;
}): ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]> {
  const result = new Map<string, SecretaryCockpitPaperwork[]>();
  for (const classItem of input.classes) {
    const trialId = classItem.trial_id;
    if (!trialId) continue;
    const scope = { kind: 'class' as const, showId: input.showId, trialId, classId: classItem.id };
    const paperwork = REPORTS.flatMap((report): SecretaryCockpitPaperwork[] => {
      const classEntries = input.entries.filter(entry => entry.class_id === classItem.id);
      const descriptor = buildReportPaperworkDescriptor({
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
        if (classEntries.length === 0) return [];
        const latest = input.records
          .filter(record => report.id === record.reportId && !record.voidedAt)
          .filter(
            record =>
              record.classId === classItem.id ||
              record.trialId === trialId ||
              record.scopeKind === 'show'
          )
          .sort((left, right) => right.printedAt.localeCompare(left.printedAt))[0];
        return [
          {
            reportId: report.id,
            label: report.label,
            // Armband coverage is Dog/day rather than Entry. Until this adapter
            // has the joined Dog facts used by the report, preserve the audit
            // timestamp but do not claim the labels are current.
            state: latest ? ('unknown' as const) : ('unconfirmed' as const),
            printHref: getCockpitReportHref({
              reportId: report.id,
              scope,
              returnTo: input.returnTo,
            }),
            ...(latest
              ? {
                  printedAt: latest.printedAt,
                  printedBy: latest.printedByName,
                  coveredByScope: latest.scopeKind,
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
          state: derived.state,
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
