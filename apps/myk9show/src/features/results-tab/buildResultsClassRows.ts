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
import { classifyClassWrapUpStatus } from '@/features/show-map/showMapStatus';
import { SHOW_MAP_WRAP_UP_STATUS } from '@/features/show-map/showMapTypes';
import { classifyJudgeDays } from '@/features/show-map/judgeDayStatus';
import { judgeSignOffWording } from '@/features/show-map/judgeSignOff';
import type { ShowMapClassInput, ShowMapEntryInput } from '@/features/show-map/showMapTypes';
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
  /** The judge's end-of-day sign-off (`classes.judge_signed_off_at`); null = not yet. */
  judgeSignedOffAt: string | null;
  /** The registry's wording for that sign-off (initials or signature). */
  registryId: string;
  judgeId: string;
  /** The judge's day (`judgeDayKey`): the classes one judge judges on one date share it. */
  judgeDayKey: string;
  /** Scoring is over for this class (or it never runs): it does not hold its judge's day open. */
  runFinished: boolean;
  /**
   * The class belongs in the judge's sign-off: Overview's own wrap-up rule
   * (`classifyClassWrapUpStatus`) says it needs, awaits or has the sign-off, or it is still
   * running and so holds its judge's day open. Cancelled classes, known-empty classes and classes
   * with nothing to sign (every entry pulled or scratched) are not.
   */
  takesJudgeSignOff: boolean;
  /** The server can record the sign-off on it: it takes one and its stored status is Completed. */
  signOffRecordable: boolean;
  /** Finished and takes the sign-off, but not stored Completed: the server refuses until it is. */
  signOffNeedsCompletion: boolean;
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
    tally: ReturnType<typeof tallies.get>;
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
      const paperwork = classPaperwork(input, cls.id, trial.id);
      drafts.push({
        cls,
        trial,
        registryId,
        tally,
        state: {
          classStatus: cls.status,
          expectedCount: tally?.total ?? 0,
          scoredCount: tally?.scored ?? 0,
          // `undefined` (no row in the read) is unknown, not unreleased: it never offers Release.
          releasedAt: input.releasedAtByClassId.get(cls.id),
          paperworkPrinted: paperworkAvailable ? resultsPaperworkPrinted(paperwork) : null,
          judgeSignedOffAt: cls.judgeSignedOffAt ?? null,
        },
      });
    }
  }

  // The judge initials once, at the END of their day, which can span trials. Whether a day is
  // still open is NOT derived here: it is the Overview's own rule (`classifyJudgeDays`), fed the
  // same counts and entries the Show Desk feeds it, so the two surfaces cannot disagree.
  const allEntriesByClass = new Map<string, ShowMapEntryInput[]>();
  for (const entry of input.entries) {
    if (!entry.class_id) continue;
    const list = allEntriesByClass.get(entry.class_id) ?? [];
    list.push(entry as unknown as ShowMapEntryInput);
    allEntriesByClass.set(entry.class_id, list);
  }
  const classInputs = new Map(
    drafts.map(({ cls, trial, tally }) => {
      const classInput: ShowMapClassInput = {
        id: cls.id,
        trialId: trial.id,
        name: cls.name ?? '',
        judgeName: cls.judgeName,
        judgeId: cls.judgeId,
        judgeSignedOffAt: cls.judgeSignedOffAt ?? null,
        status: cls.status,
        entryCount: tally?.total ?? 0,
        scoredCount: tally?.scored ?? 0,
        runListCount: tally?.runList ?? 0,
      };
      return [cls.id, classInput] as const;
    })
  );
  const judgeDays = classifyJudgeDays(
    [...classInputs.values()],
    allEntriesByClass,
    new Map(input.trials.map(trial => [trial.id, trial.trialDate] as const))
  );

  return drafts.map(({ cls, trial, registryId, state: baseState }) => {
    const identity = {
      name: cls.name ?? '',
      element: cls.element,
      level: cls.level,
      section: cls.section,
    };
    const day = judgeDays.byClassId.get(cls.id);
    const state: ResultsClassState = {
      ...baseState,
      judgeDayOpen: day ? judgeDays.openDayKeys.has(day.dayKey) : false,
    };
    const derivedPhase = deriveResultsPhase(state);
    const wording = judgeSignOffWording(registryId);
    const paperwork = classPaperwork(input, cls.id, trial.id);
    const classEntries = (entriesByClass.get(cls.id) ?? []).map(toEntryRow).sort(placementSort);
    const runFinished = day?.finished ?? false;
    // Who takes a sign-off is Overview's wrap-up rule, not a filter of Results' own: a Completed
    // class whose entries are all absent still needs initials there, so it does here.
    const wrapUp = classifyClassWrapUpStatus(
      classInputs.get(cls.id)!,
      allEntriesByClass.get(cls.id) ?? [],
      { registryId, judgeDayOpen: state.judgeDayOpen === true }
    )?.value;
    const takesJudgeSignOff =
      derivedPhase !== 'cancelled' &&
      (!runFinished ||
        wrapUp === SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE ||
        wrapUp === SHOW_MAP_WRAP_UP_STATUS.JUDGE_SIGN_OFF_AT_END_OF_DAY ||
        wrapUp === SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE);
    // A class with nothing to release or print (every entry absent: no expected dog) can still
    // owe the judge's sign-off, so that duty is read from the sign-off state, not the dog count:
    // it asks for initials once the judge's day is over and reads Done once signed.
    const signOffOnly = derivedPhase === 'no-dogs' && takesJudgeSignOff && runFinished;
    const phase: ResultsClassPhase = signOffOnly
      ? state.judgeSignedOffAt === null && state.judgeDayOpen !== true
        ? 'needs-initials'
        : 'done'
      : derivedPhase;
    const nextAction: ResultsNextAction = signOffOnly
      ? phase === 'needs-initials'
        ? { kind: 'initials', label: wording.nextActionLabel }
        : { kind: 'none', label: 'Done' }
      : deriveResultsNextAction(state);
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
      judgeSignedOffAt: state.judgeSignedOffAt ?? null,
      registryId,
      judgeId: cls.judgeId ?? '',
      judgeDayKey: day?.dayKey ?? `class:${cls.id}`,
      runFinished,
      takesJudgeSignOff,
      signOffRecordable: runFinished && takesJudgeSignOff && isCompletedStatus(cls.status),
      signOffNeedsCompletion: runFinished && takesJudgeSignOff && !isCompletedStatus(cls.status),
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
