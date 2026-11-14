import { isCompletedStatus, needsCascade } from '@/features/show-closeout/closeoutStatus';
import { calculateWhatIsLeft } from '@/features/show-closeout/whatIsLeft';
import type { ShowDayReconciliationEntry } from './showDayReconciliationSummary';
import type { ShowIncidentSummary } from './showIncidents';

export interface CloseoutShowSummary {
  id: string;
  status?: string | null;
}

export interface CloseoutTrialSummary {
  id: string;
  status?: string | null;
  /** Names the registry whose duties are still owed. */
  registryId?: string | null | undefined;
}

export interface CloseoutClassSummary {
  id: string;
  status?: string | null;
  entryCount?: number | null;
  scoredCount?: number | null;
  /** Entries never accepted. Not scoring work, but still unresolved at close. */
  pendingCount?: number | null;
}

export interface ResultSubmissionSummary {
  status?: string | null;
  trial_id?: string | null;
}

export interface CloseoutReadinessInput {
  classes: CloseoutClassSummary[];
  /** Absent: no registry is named, so none of its duties are listed. */
  trials?: CloseoutTrialSummary[];
  entries: ShowDayReconciliationEntry[];
  /** `null` when the incident log could not be read. */
  incidents: Pick<ShowIncidentSummary, 'reportableCount' | 'urgentCount'> | null;
  /** `null` when result submissions could not be read. */
  submissions: ResultSubmissionSummary[] | null;
}

export interface CloseoutReadiness {
  concerns: string[];
  hasConcerns: boolean;
}

export interface CloseoutCascadeTargets {
  showId: string;
  trialIds: string[];
  classIds: string[];
}

export function isShowClosedOut(status: string | null | undefined): boolean {
  return isCompletedStatus(status);
}

export function buildCloseoutReadiness(input: CloseoutReadinessInput): CloseoutReadiness {
  // The concerns are the one calculation's, so this step cannot count a show differently from
  // the screens that count the same classes (MYK9-1945).
  const left = calculateWhatIsLeft({
    classes: input.classes.map(cls => ({
      id: cls.id,
      status: cls.status,
      expectedCount: cls.entryCount == null ? null : Number(cls.entryCount),
      scoredCount: cls.scoredCount == null ? null : Number(cls.scoredCount),
      pendingCount: cls.pendingCount,
    })),
    trials: input.trials ?? [],
    entries: input.entries,
    incidents: input.incidents,
    submissions: input.submissions,
  });
  return { concerns: [...left.concerns], hasConcerns: left.concerns.length > 0 };
}

export function selectCloseoutCascadeTargets(input: {
  show: CloseoutShowSummary;
  trials: CloseoutTrialSummary[];
  classes: CloseoutClassSummary[];
}): CloseoutCascadeTargets {
  return {
    showId: input.show.id,
    trialIds: input.trials.filter(trial => needsCascade(trial.status)).map(trial => trial.id),
    classIds: input.classes.filter(cls => needsCascade(cls.status)).map(cls => cls.id),
  };
}
