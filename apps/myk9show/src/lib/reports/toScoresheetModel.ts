import type { DbClass, DbTrial } from '@/types/database-mappings';
import { buildEmergencyPacketModel } from '@/features/emergency-trial-packet/emergencyTrialPacket';
// `buildEmergencyPacketData` lives with the Reports page's other DB-row
// mappers (`reportDataMapping.ts`), not in `lib/reports` — importing it here
// is a `lib` -> `pages` dependency, backwards from the codebase's usual
// layering. Not moved in this task: it also depends on that file's private
// `mapScopedReportEntries`/`readTrialRegistryId`, so relocating it cleanly is
// a small refactor of its own, not a one-line move. Flagged for a follow-up.
import { buildEmergencyPacketData } from '@/pages/secretary/ReportsPage/reportDataMapping';
import type {
  EmergencyPacketModel,
  EmergencyPacketPage,
  EmergencyPacketPageKind,
} from '@/features/emergency-trial-packet/types';
import type { ReportDataSet } from './types';

/**
 * Maps the Reports page's `ReportDataSet` (one page per selected class) onto
 * `EmergencyPacketInput` and reuses the SAME model builder the emergency
 * trial packet uses, so the check-in sheet and scoresheet the secretary
 * prints from Reports are byte-identical to the ones in the packet — not a
 * second, drifting implementation.
 *
 * The edge function keeps its own mapper (`buildEmergencyPacketData` called
 * from `ReportsPage/index.tsx`'s emergency-packet path) — these stay separate
 * because the SOURCES differ (whole-show DB rows vs. a Reports-page
 * selection), but both funnel into the one shared `buildEmergencyPacketModel`
 * + `buildEmergencyTrialPacketPdf` pair.
 */
export function toScoresheetModel(dataset: ReportDataSet, sortOrder: string): EmergencyPacketModel {
  const trialsById = new Map<string, DbTrial>();
  const classesById = new Map<string, DbClass>();
  const entries: ReportDataSet['pages'][number]['entries'] = [];

  for (const page of dataset.pages) {
    if (!page.classData) continue; // no class context, no scoresheet page
    trialsById.set(page.trial.id, page.trial);
    classesById.set(page.classData.id, page.classData);
    entries.push(...page.entries);
  }

  const input = buildEmergencyPacketData({
    show: dataset.show,
    trials: [...trialsById.values()],
    classes: [...classesById.values()],
    entries,
  });

  const model = buildEmergencyPacketModel({ ...input, generatedAt: new Date().toISOString() });

  return sortOrder === 'armband' ? reorderPagesByArmband(model) : model;
}

/**
 * Filters a full packet model down to one page kind (check-in OR
 * score-recording) and renumbers pages sequentially, so the PDF's
 * "Page X of Y" footer counts only the pages actually rendered — the Reports
 * page shows one report at a time, never the whole packet.
 */
export function selectPacketPages(
  model: EmergencyPacketModel,
  kind: EmergencyPacketPageKind
): EmergencyPacketModel {
  const pages = model.pages
    .filter(page => page.kind === kind)
    .map((page, index) => ({ ...page, pageNumber: index + 1 }));
  return { ...model, pages };
}

const REORDERABLE_KINDS = new Set<EmergencyPacketPageKind>(['check-in', 'score-recording']);

/**
 * `buildEmergencyPacketModel` always chunks and sorts entries by run order —
 * correct for the emergency packet, which has no user-facing sort control.
 * The Reports page does (run order vs. armband), so when the secretary picks
 * "armband" this re-sorts entries WITHIN each class's already-chunked run of
 * pages of one kind, preserving the page count and sizes the builder chose.
 *
 * This does not re-partition entries ACROSS page boundaries: on a class large
 * enough to span multiple check-in (20/page) or score-recording (5/page)
 * pages, a low-armband dog assigned to a later page by run order stays on
 * that later page, just reordered within it. Getting a fully global armband
 * sort would mean duplicating the builder's private chunking constants and
 * class/title logic here — a second implementation of exactly what Task 6
 * exists to stop having. Flagged as a known limitation, not silently shipped
 * as equivalent to the old React component's full-list sort.
 */
function reorderPagesByArmband(model: EmergencyPacketModel): EmergencyPacketModel {
  const pages = [...model.pages];
  let i = 0;
  while (i < pages.length) {
    const kind = pages[i].kind;
    if (!REORDERABLE_KINDS.has(kind)) {
      i += 1;
      continue;
    }
    const groupKey = classIdentity(pages[i]);
    let j = i + 1;
    while (j < pages.length && pages[j].kind === kind && classIdentity(pages[j]) === groupKey) {
      j += 1;
    }
    const run = pages.slice(i, j);
    const combined = run.flatMap(page => page.entries).sort((a, b) => a.armband - b.armband);
    let cursor = 0;
    for (let k = 0; k < run.length; k += 1) {
      const count = run[k].entries.length;
      pages[i + k] = { ...run[k], entries: combined.slice(cursor, cursor + count) };
      cursor += count;
    }
    i = j;
  }
  return { ...model, pages };
}

function classIdentity(page: EmergencyPacketPage): string {
  const context = page.context;
  return [
    context.trialDate,
    context.trialLabel,
    context.ringLabel,
    context.classLabel,
    context.judgeName,
  ]
    .map(value => value ?? '')
    .join('|');
}
