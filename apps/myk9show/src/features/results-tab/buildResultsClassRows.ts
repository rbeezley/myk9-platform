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
import { judgeDayKey, openJudgeDayKeys } from '@/features/show-map/judgeDay';
import { judgeSignOffWording } from '@/features/show-map/judgeSignOff';
import { compareClassesByProgression } from '@/features/premium/pdf/bodies/classOrder';
import type { SecretaryCockpitPaperwork } from '@/features/show-map/cockpit/secretaryCockpitTypes';
import { accountingFields, tallyEntriesByClass } from '@/pages/secretary/showDeskEntryAvailability';
import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { mapResultStatusToQualification, dbSecondsToInputFormat } from '@/utils/scoringMappings';
import { DISPLAY_LABELS } from '@/components/classes/ClassResultsTable/constants';
import { CLASS_STATUS, LEGACY_STATUS_MAP } from '@myk9/core';
import {
  deriveResultsNextAction,
  deriveResultsPhase,
  RESULTS_PHASE_LABEL,
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
  /** When the paper check was recorded and by whom (auth uid); null = not checked. */
  verifiedAt: string | null;
  verifiedBy: string | null;
  /** A score change of this class is still waiting to sync: no check can be saved until it has. */
  scoresUnsynced: boolean;
  /** The judge's end-of-day sign-off (`classes.judge_signed_off_at`); null = not yet. */
  judgeSignedOffAt: string | null;
  /** The registry's wording for that sign-off (initials or signature). */
  judgeSignOff: { nextActionLabel: string; needsLabel: string; undoLabel: string };
  registryId: string;
  judgeId: string;
  /** The judge's day (`judgeDayKey`): the classes one judge judges on one date share it. */
  judgeDayKey: string;
  /** Scoring is over for this class (or it never runs): it does not hold its judge's day open. */
  runFinished: boolean;
  /** The server can record the judge's sign-off on it: its stored status is Completed. */
  signOffRecordable: boolean;
  state: ResultsClassState;
  phase: ResultsClassPhase;
  /** The phase's label, in the registry's wording where it differs (initials or signature). */
  phaseLabel: string;
  nextAction: ResultsNextAction;
  /** Results sheet and ribbon labels, as the Overview paperwork row builds them. */
  paperwork: readonly SecretaryCockpitPaperwork[];
  /** False when print status could not be read; the UI says so rather than hiding the buttons. */
  paperworkAvailable: boolean;
  entries: readonly ResultsEntryRow[];
}

export interface BuildResultsClassRowsInput {
  /** This show's trials. */
  trials: readonly SyncableTrial[];
  trialClasses: Readonly<Record<string, readonly SyncableTrialClass[]>>;
  /** `classes.results_released_at` by class id (the class store). */
  releasedAtByClassId: ReadonlyMap<string, string | null | undefined>;
  /**
   * The paper check by class id (`classes.results_verified_at` / `_by`, after the local
   * unsynced-score rule in `useResultsTabData`). A class with no entry is not tracked here and never
   * waits on it.
   */
  verifiedByClassId?: ReadonlyMap<
    string,
    { at: string | null; by: string | null; scoresUnsynced?: boolean }
  >;
  entries: readonly SecretaryEntry[];
  paperworkByClassId: ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]>;
  /**
   * The class rows or the print confirmations could not be read, so `paperworkByClassId` is not
   * evidence of anything: rows report no print state and say so.
   */
  paperworkAvailable?: boolean;
  /**
   * Where a report prints for one class. Used only while print status is unreadable: the print
   * actions never depend on knowing the status, so they are still offered, state unknown.
   */
  printHrefFor?: (classId: string, trialId: string, reportId: string) => string;
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

const RESULTS_REPORT_LABELS = { 'results-sheet': 'Results', 'result-labels': 'Result labels' };

function withUnknownPrintActions(
  mapped: readonly SecretaryCockpitPaperwork[],
  classId: string,
  trialId: string,
  printHrefFor: BuildResultsClassRowsInput['printHrefFor']
): readonly SecretaryCockpitPaperwork[] {
  return RESULTS_REPORT_IDS.flatMap((reportId): SecretaryCockpitPaperwork[] => {
    const existing = mapped.find(item => item.reportId === reportId);
    if (existing) return [{ ...existing, state: 'unknown' }];
    if (!printHrefFor) return [];
    return [
      {
        reportId,
        label: RESULTS_REPORT_LABELS[reportId],
        state: 'unknown',
        printHref: printHrefFor(classId, trialId, reportId),
      },
    ];
  });
}

function placementSort(a: ResultsEntryRow, b: ResultsEntryRow): number {
  if (a.placement !== null && b.placement !== null && a.placement !== b.placement) {
    return a.placement - b.placement;
  }
  if ((a.placement === null) !== (b.placement === null)) return a.placement === null ? 1 : -1;
  return a.armband.localeCompare(b.armband, undefined, { numeric: true });
}

function toEntryRow(entry: SecretaryEntry): ResultsEntryRow {
  // The canonical resolver's answer (entered text, else the assigned person, else the owner),
  // already projected on the secretary read; nothing is re-derived from the raw handler fields.
  const identity = entry.handler_identity;
  const handlerName = identity && identity.source !== 'unknown' ? (identity.name ?? '') : '';
  const qualification = mapResultStatusToQualification(entry.result_status);
  return {
    entryId: entry.id,
    armband: entry.armband ?? '',
    dogName: entry.dog?.call_name || entry.dog?.name || 'Unknown dog',
    handlerName,
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

function judgeDayInput(cls: SyncableTrialClass, trial: SyncableTrial) {
  return {
    id: cls.id,
    trialDate: trial.trialDate,
    judgeId: cls.judgeId,
    judgeName: cls.judgeName,
  };
}

function isCompletedStatus(raw: string | null | undefined): boolean {
  return (raw ? (LEGACY_STATUS_MAP[raw] ?? raw) : null) === CLASS_STATUS.COMPLETED;
}

export function buildResultsClassRows(input: BuildResultsClassRowsInput): ResultsClassRow[] {
  const paperworkAvailable = input.paperworkAvailable ?? true;
  const classPaperwork = (
    source: BuildResultsClassRowsInput,
    classId: string,
    trialId: string
  ): readonly SecretaryCockpitPaperwork[] => {
    const mapped = pickResultsPaperwork(source.paperworkByClassId.get(classId));
    return paperworkAvailable
      ? mapped
      : withUnknownPrintActions(mapped, classId, trialId, source.printHrefFor);
  };
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
  interface Draft {
    cls: SyncableTrialClass;
    trial: SyncableTrial;
    registryId: string;
    state: ResultsClassState;
    judgeDay: ReturnType<typeof judgeDayInput>;
    finished: boolean;
  }
  const drafts: Draft[] = [];
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
      const tally = tallies.get(cls.id);
      const verified = input.verifiedByClassId?.get(cls.id);
      const paperwork = classPaperwork(input, cls.id, trial.id);
      const state: ResultsClassState = {
        classStatus: cls.status,
        expectedCount: tally?.total ?? 0,
        scoredCount: tally?.scored ?? 0,
        // `undefined` (no row in the read) is unknown, not unreleased: it never offers Release.
        releasedAt: input.releasedAtByClassId.get(cls.id),
        paperworkPrinted: paperworkAvailable ? resultsPaperworkPrinted(paperwork) : null,
        ...(verified ? { verifiedAt: verified.at } : {}),
        judgeSignedOffAt: cls.judgeSignedOffAt ?? null,
      };
      const phase = deriveResultsPhase(state);
      drafts.push({
        cls,
        trial,
        registryId,
        state,
        judgeDay: judgeDayInput(cls, trial),
        finished: phase !== 'not-started' && phase !== 'in-ring',
      });
    }
  }

  // The judge initials once, at the END of their day, which can span trials, so whether a judge
  // still has a class to run is decided across the whole show (the Overview rule, MYK9-1030).
  const openDays = openJudgeDayKeys(
    drafts.map(draft => ({ ...draft.judgeDay, finished: draft.finished }))
  );

  return drafts.map(({ cls, trial, registryId, state: baseState, judgeDay, finished }) => {
    const identity = {
      name: cls.name ?? '',
      element: cls.element,
      level: cls.level,
      section: cls.section,
    };
    const dayKey = judgeDayKey(judgeDay);
    const state: ResultsClassState = { ...baseState, judgeDayOpen: openDays.has(dayKey) };
    const phase = deriveResultsPhase(state);
    const nextAction = deriveResultsNextAction(state);
    const wording = judgeSignOffWording(registryId);
    const paperwork = classPaperwork(input, cls.id, trial.id);
    const classEntries = (entriesByClass.get(cls.id) ?? []).map(toEntryRow).sort(placementSort);
    const verified = input.verifiedByClassId?.get(cls.id);
    return {
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
      releasedAt: state.releasedAt ?? null,
      verifiedAt: verified?.at ?? null,
      verifiedBy: verified?.by ?? null,
      scoresUnsynced: verified?.scoresUnsynced ?? false,
      judgeSignedOffAt: state.judgeSignedOffAt ?? null,
      judgeSignOff: {
        nextActionLabel: wording.nextActionLabel,
        needsLabel: wording.needsStatusLabel,
        undoLabel: wording.undoActionLabel,
      },
      registryId,
      judgeId: cls.judgeId ?? '',
      judgeDayKey: dayKey,
      runFinished: finished,
      signOffRecordable: finished && isCompletedStatus(cls.status),
      state,
      phase,
      phaseLabel:
        phase === 'needs-initials' ? wording.needsStatusLabel : RESULTS_PHASE_LABEL[phase],
      nextAction:
        phase === 'needs-initials' ? { ...nextAction, label: wording.nextActionLabel } : nextAction,
      paperwork,
      paperworkAvailable,
      entries: classEntries,
    };
  });
}
