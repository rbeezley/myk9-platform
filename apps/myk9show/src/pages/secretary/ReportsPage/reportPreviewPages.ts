/**
 * Pure selection helpers for ReportPreview, split out so the component stays
 * under the 500-line ceiling the code-quality ratchet enforces.
 */
import type { ReportDefinition } from '@/lib/reports/types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { RenderingMode } from './reportRenderingMode';

export interface PageData {
  trial: DbTrial;
  classData: DbClass;
  entries: DbEntry[];
}

export function buildPages(
  trialId: string,
  classId: string,
  trials: DbTrial[] | null | undefined,
  classes: DbClass[] | null | undefined,
  entries: DbEntry[] | null | undefined
): PageData[] {
  if (!trials || !classes || !entries) return [];

  const isAll = trialId === 'all' || classId === 'all';

  // Pre-index entries by class_id for O(1) lookups
  const entriesByClass = new Map<string, DbEntry[]>();
  for (const e of entries) {
    const key = e.class_id ?? '';
    if (!entriesByClass.has(key)) entriesByClass.set(key, []);
    entriesByClass.get(key)!.push(e);
  }

  if (isAll) {
    const pages: PageData[] = [];
    for (const trial of trials) {
      const trialClasses = classes.filter(c => c.trial_id === trial.id);
      for (const classData of trialClasses) {
        const classEntries = entriesByClass.get(classData.id) ?? [];
        pages.push({ trial, classData, entries: classEntries });
      }
    }
    return pages;
  }

  const trial = trials.find(t => t.id === trialId);
  const classData = classes.find(c => c.id === classId);
  if (!trial || !classData) return [];

  const classEntries = entriesByClass.get(classId) ?? [];
  return [{ trial, classData, entries: classEntries }];
}

/** Whether the current selection holds any entry, per the report's rendering mode. */
export function selectionHasEntries({
  renderingMode,
  report,
  trialId,
  classId,
  trials,
  classes,
  entries,
  pages,
}: {
  renderingMode: RenderingMode;
  report: ReportDefinition | undefined;
  trialId: string;
  classId: string;
  trials: DbTrial[] | null | undefined;
  classes: DbClass[] | null | undefined;
  entries: DbEntry[] | null | undefined;
  pages: PageData[];
}): boolean {
  if (renderingMode === 'show') {
    const targetIds = trialId === 'all' ? (trials ?? []).map(t => t.id) : [trialId];
    const shouldFilterClass = report?.scopes.includes('class') && classId !== 'all';
    const classIds = new Set(
      (classes ?? [])
        .filter(
          c => targetIds.includes(c.trial_id ?? '') && (!shouldFilterClass || c.id === classId)
        )
        .map(c => c.id)
    );
    return (entries ?? []).some(e => classIds.has(e.class_id ?? ''));
  }
  if (renderingMode === 'trial') {
    const targetTrials =
      trialId === 'all' ? (trials ?? []) : (trials ?? []).filter(t => t.id === trialId);
    const classIds = new Set(
      (classes ?? []).filter(c => targetTrials.some(t => t.id === c.trial_id)).map(c => c.id)
    );
    return (entries ?? []).some(e => classIds.has(e.class_id ?? ''));
  }
  return pages.some(p => p.entries.length > 0);
}
