/**
 * Projects the replicated schedule, the secretary entry read and the print
 * records into one row per class for the Results tab (MYK9-1031).
 *
 * Pure on purpose: the hook only gathers, so the shape the list and the detail
 * render is tested here on the real prop shape (LESSONS `last-hop-drop`).
 *
 * The scored count and the dog list come from the same `SecretaryEntry` read the
 * class page's staff run sheet uses (`useSecretaryShowEntriesQuery`), and the
 * "expected / accounted for" rules are `tallyEntriesByClass`'s, so this tab and
 * Overview can never disagree about whether a class is finished.
 */
import {
  buildClassDisambiguatorsByGroup,
  buildFullClassLabel,
} from '@/features/_shared/classLabel';
import { isExpectedEntry } from '@/features/_shared/entryAccounting';
import { isPendingEntryStatus } from '@/features/entry-operations/classEntryBreakdown';
import { getTrialRegistry } from '@/features/registries';
import { compareClassesByProgression } from '@/features/premium/pdf/bodies/classOrder';
import type { SecretaryCockpitPaperwork } from '@/features/show-map/cockpit/secretaryCockpitTypes';
import { accountingFields, tallyEntriesByClass } from '@/pages/secretary/showDeskEntryAvailability';
import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { mapResultStatusToQualification, dbSecondsToInputFormat } from '@/utils/scoringMappings';
import { DISPLAY_LABELS } from '@/components/classes/ClassResultsTable/constants';
import {
  deriveResultsNextAction,
  deriveResultsPhase,
  type ResultsClassPhase,
  type ResultsClassState,
  type ResultsNextAction,
} from './resultsNextAction';

export interface ResultsEntryRow {
  entryId: string;
  armband: string;
  dogName: string;
  handlerName: string;
  /** `final_placement`; null for a dog that did not place. */
  placement: number | null;
  /** Short code: Q, NQ, ABS, EXC, or Pending. */
  resultLabel: string;
  qualified: boolean;
  /** Search time as M:SS.hh, or an empty string when none was recorded. */
  timeLabel: string;
  faults: number | null;
  scored: boolean;
}

export interface ResultsClassRow {
  id: string;
  trialId: string;
  trialDate: string;
  trialLabel: string;
  name: string;
  judgeName: string;
  finishedAt: string | null;
  expectedCount: number;
  scoredCount: number;
  qualifiedCount: number;
  releasedAt: string | null;
  state: ResultsClassState;
  phase: ResultsClassPhase;
  nextAction: ResultsNextAction;
  /** Results sheet and ribbon labels, as the Overview paperwork row builds them. */
  paperwork: readonly SecretaryCockpitPaperwork[];
  entries: readonly ResultsEntryRow[];
}

export interface BuildResultsClassRowsInput {
  /** This show's trials. */
  trials: readonly SyncableTrial[];
  trialClasses: Readonly<Record<string, readonly SyncableTrialClass[]>>;
  /** `classes.results_released_at` by class id (the class store). */
  releasedAtByClassId: ReadonlyMap<string, string | null | undefined>;
  entries: readonly SecretaryEntry[];
  paperworkByClassId: ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]>;
}

const RESULTS_REPORT_IDS = ['results-sheet', 'result-labels'] as const;

export function pickResultsPaperwork(
  items: readonly SecretaryCockpitPaperwork[] | undefined
): readonly SecretaryCockpitPaperwork[] {
  return (items ?? []).filter(item =>
    (RESULTS_REPORT_IDS as readonly string[]).includes(item.reportId)
  );
}

/** True only when both reports are current; null when the print history could not be read. */
export function resultsPaperworkPrinted(
  paperwork: readonly SecretaryCockpitPaperwork[]
): boolean | null {
  if (paperwork.some(item => item.state === 'unknown')) return null;
  return RESULTS_REPORT_IDS.every(reportId =>
    paperwork.some(item => item.reportId === reportId && item.state === 'current')
  );
}

function placementSort(a: ResultsEntryRow, b: ResultsEntryRow): number {
  if (a.placement !== null && b.placement !== null && a.placement !== b.placement) {
    return a.placement - b.placement;
  }
  if ((a.placement === null) !== (b.placement === null)) return a.placement === null ? 1 : -1;
  return a.armband.localeCompare(b.armband, undefined, { numeric: true });
}

function toEntryRow(entry: SecretaryEntry): ResultsEntryRow {
  const person = entry.handler_person;
  const personName = person ? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() : '';
  const qualification = mapResultStatusToQualification(entry.result_status);
  return {
    entryId: entry.id,
    armband: entry.armband ?? '',
    dogName: entry.dog?.call_name || entry.dog?.name || 'Unknown dog',
    handlerName: personName || entry.handler || '',
    placement: entry.final_placement ?? null,
    resultLabel: qualification ? (DISPLAY_LABELS[qualification] ?? qualification) : 'Pending',
    qualified: entry.result_status === 'qualified',
    timeLabel: entry.search_time_seconds ? dbSecondsToInputFormat(entry.search_time_seconds) : '',
    faults: entry.total_faults ?? null,
    scored: entry.is_scored === true,
  };
}

function trialLabelOf(trial: SyncableTrial): string {
  const number = trial.trialNumber ? `Trial ${trial.trialNumber}` : '';
  return trial.name?.trim() || number || 'Trial';
}

export function buildResultsClassRows(input: BuildResultsClassRowsInput): ResultsClassRow[] {
  const tallies = tallyEntriesByClass(input.entries);
  const entriesByClass = new Map<string, SecretaryEntry[]>();
  for (const entry of input.entries) {
    if (!entry.class_id) continue;
    // The same rows `tallyEntriesByClass` counts toward `expectedCount`: not pulled, withdrawn,
    // moved or absent, and not still waiting on an accept decision.
    if (!isExpectedEntry(accountingFields(entry)) || isPendingEntryStatus(entry.entry_status))
      continue;
    const list = entriesByClass.get(entry.class_id) ?? [];
    list.push(entry);
    entriesByClass.set(entry.class_id, list);
  }

  const identities = input.trials.flatMap(trial =>
    (input.trialClasses[trial.id] ?? []).map(cls => ({
      name: cls.name ?? '',
      element: cls.element,
      level: cls.level,
      section: cls.section,
      trialId: trial.id,
    }))
  );
  const disambiguatorFor = buildClassDisambiguatorsByGroup(identities, item => item.trialId);

  const trialsInOrder = [...input.trials].sort(
    (a, b) =>
      (a.trialDate || '').localeCompare(b.trialDate || '') ||
      (a.order ?? '').localeCompare(b.order ?? '', undefined, { numeric: true })
  );
  const rows: ResultsClassRow[] = [];
  for (const trial of trialsInOrder) {
    const registryId = getTrialRegistry(trial).id;
    const classes = [...(input.trialClasses[trial.id] ?? [])].sort(
      (a, b) =>
        (a.startTime || '').localeCompare(b.startTime || '') ||
        compareClassesByProgression(
          { element: a.element ?? '', level: a.level ?? '', section: a.section || null },
          { element: b.element ?? '', level: b.level ?? '', section: b.section || null },
          registryId
        )
    );
    for (const cls of classes) {
      const identity = {
        name: cls.name ?? '',
        element: cls.element,
        level: cls.level,
        section: cls.section,
      };
      const tally = tallies.get(cls.id);
      const releasedAt = input.releasedAtByClassId.get(cls.id) ?? null;
      const paperwork = pickResultsPaperwork(input.paperworkByClassId.get(cls.id));
      const classEntries = (entriesByClass.get(cls.id) ?? []).map(toEntryRow).sort(placementSort);
      const state: ResultsClassState = {
        classStatus: cls.status,
        expectedCount: tally?.total ?? 0,
        scoredCount: tally?.scored ?? 0,
        releasedAt,
        paperworkPrinted: resultsPaperworkPrinted(paperwork),
      };
      rows.push({
        id: cls.id,
        trialId: trial.id,
        trialDate: trial.trialDate || '',
        trialLabel: trialLabelOf(trial),
        name: buildFullClassLabel(identity, disambiguatorFor(trial.id)(identity), cls.name),
        judgeName: cls.judgeName ?? '',
        finishedAt: cls.actualFinishTime ?? null,
        expectedCount: state.expectedCount,
        scoredCount: state.scoredCount,
        qualifiedCount: classEntries.filter(entry => entry.qualified).length,
        releasedAt,
        state,
        phase: deriveResultsPhase(state),
        nextAction: deriveResultsNextAction(state),
        paperwork,
        entries: classEntries,
      });
    }
  }
  return rows;
}
