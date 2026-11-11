import { getTrialRegistry } from '@/features/registries';
import { resolveClassSection } from '@/services/entryDisplay/entryDisplaySelectors';
import { classesMissingJudge } from '@/utils/classJudgeDisplay';
import type { ShowJudgeAssignment } from '@/types/judge-types';

/**
 * The official AKC forms (MYK9-1854). Each prints a judge's name on paper that goes to AKC, so
 * none of them may print while a class in it has no judge: the Judge's Report and Trial
 * Chairman Report (PDF and on-screen replica), the Trial Secretary Report, the Judge's
 * Certification Report (and its AKC Scent Work Certification Page PDF), and the AKC Marked
 * Catalog (the Result Catalog on an AKC show). Everything else, including the club catalogs,
 * the judge's schedule and judge entry counts, prints "Judge to be announced" instead.
 */
const AKC_OFFICIAL_JUDGE_FORMS: ReadonlySet<string> = new Set([
  'akc-judge-report',
  'trial-chairman-report',
  'trial-secretary-report',
  'judges-certification',
  'result-catalog',
]);

/** The Result Catalog is only the AKC Marked Catalog when every class in it is an AKC class. */
const AKC_ONLY_WHEN_WHOLE_SELECTION_IS_AKC = 'result-catalog';

interface GateTrial {
  id: string;
  registry_id?: string | null;
  trial_number?: string | number | null;
}

interface GateClass {
  id: string;
  trial_id?: string | null;
  element?: string | null;
  level?: string | null;
  section?: string | null;
  status?: string | null;
  judge?: string | null;
  judge_assignments?: unknown;
}

function isAkcTrial(trial: GateTrial | undefined): boolean {
  return getTrialRegistry(trial).id === 'AKC';
}

function classLabel(cls: GateClass): string {
  return [cls.element, cls.level, resolveClassSection(cls.section)].filter(Boolean).join(' ');
}

const isCancelledClass = (cls: GateClass): boolean =>
  (cls.status ?? '').toLowerCase() === 'cancelled';

/**
 * The trial-level forms print only the trial's judge, which skips unset classes. So a cancelled
 * class with no judge does not reach the form, unless no class in its trial has a judge at all
 * (then the trial's judge itself is unset).
 */
function trialFormClassesMissingJudge(
  classes: ReadonlyArray<GateClass>,
  judges: ReadonlyArray<ShowJudgeAssignment>
): GateClass[] {
  const unset = new Set(classesMissingJudge(classes, judges));
  const trialHasJudge = new Set(
    classes.filter(cls => !unset.has(cls)).map(cls => cls.trial_id ?? '')
  );
  return classes.filter(
    cls => unset.has(cls) && (!isCancelledClass(cls) || !trialHasJudge.has(cls.trial_id ?? ''))
  );
}

/**
 * One plain sentence naming the classes that still need a judge before this official form can
 * print, or null when the form may print (or is not an official AKC form).
 */
export function officialFormJudgeBlock(
  reportType: string,
  show: { assignedJudges?: ReadonlyArray<ShowJudgeAssignment> | undefined } | null | undefined,
  allTrials: ReadonlyArray<GateTrial> | null | undefined,
  allClasses: ReadonlyArray<GateClass> | null | undefined,
  trialId: string,
  classId: string
): string | null {
  if (!AKC_OFFICIAL_JUDGE_FORMS.has(reportType)) return null;

  const trials = allTrials ?? [];
  const scopedTrials = trialId === 'all' ? trials : trials.filter(t => t.id === trialId);
  const scopedTrialIds = new Set(scopedTrials.map(t => t.id));
  const scoped = (allClasses ?? []).filter(
    cls => scopedTrialIds.has(cls.trial_id ?? '') && (classId === 'all' || cls.id === classId)
  );
  const trialById = new Map(scopedTrials.map(t => [t.id, t]));
  const akcClasses = scoped.filter(cls => isAkcTrial(trialById.get(cls.trial_id ?? '')));
  if (akcClasses.length === 0) return null;
  if (reportType === AKC_ONLY_WHEN_WHOLE_SELECTION_IS_AKC && akcClasses.length !== scoped.length) {
    return null;
  }

  const judges = show?.assignedJudges ?? [];
  const missing =
    reportType === AKC_ONLY_WHEN_WHOLE_SELECTION_IS_AKC
      ? // The marked catalog prints every class, cancelled ones too (review, PR #3797).
        classesMissingJudge(akcClasses, judges)
      : trialFormClassesMissingJudge(akcClasses, judges);
  if (missing.length === 0) return null;

  const multipleTrials = new Set(akcClasses.map(cls => cls.trial_id)).size > 1;
  const names = missing.map(cls => {
    const label = classLabel(cls) || 'Unnamed class';
    const trialNumber = trialById.get(cls.trial_id ?? '')?.trial_number;
    return multipleTrials && trialNumber != null ? `${label} (Trial ${trialNumber})` : label;
  });
  return `These classes need a judge before you can print this form: ${names.join(', ')}. Assign a judge to each class, then come back.`;
}
