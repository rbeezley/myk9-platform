import type { ShowInput } from '@/store/showStore';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { GeneratedPremium } from '@/types/premium-types';
import { premiumTrialKey } from '@/features/premium/premiumClassLabel';

type PremiumJudge = NonNullable<GeneratedPremium['trials'][number]['judges']>[number];

function toPremiumJudge(judge: ShowJudgeAssignment, classes: string[]): PremiumJudge {
  return { name: judge.judgeName, residence: judge.residence ?? null, classes };
}

const entryKey = (entry: { trialName: string; trialDate: string }) =>
  premiumTrialKey(entry.trialName, entry.trialDate);

/**
 * The judges one premium trial lists (MYK9-2067). A judge with class assignments is listed only
 * where they have classes, with those classes only: trials of one weekend repeat the same class
 * labels. A show-level row is roster membership (the show wizard writes one and keeps it beside the
 * class picks), so it never hides the classes; a judge on the roster with no class yet is listed on
 * every trial with no class line.
 *
 * Premium trials carry no id, so they match by name and date, and a trial renamed or re-dated after
 * the premium was generated matches nothing. Such a trial lists the judges whose trials match no
 * premium trial (with their classes by label), so a judge never vanishes; premiumFacts then keeps
 * only the labels the trial runs.
 */
function judgesForTrial(
  judges: ShowJudgeAssignment[],
  trial: { name: string; date: string },
  premiumKeys: ReadonlySet<string>
): PremiumJudge[] {
  const key = premiumTrialKey(trial.name, trial.date);
  const trialMatched = judges.some(judge =>
    (judge.classLabelsByTrial ?? []).some(entry => entryKey(entry) === key)
  );
  return judges.flatMap(judge => {
    const entries = judge.classLabelsByTrial ?? [];
    const here = entries.find(entry => entryKey(entry) === key);
    if (here) return [toPremiumJudge(judge, here.labels)];
    if (judge.hasShowLevelAssignment && entries.length === 0) {
      return [toPremiumJudge(judge, judge.classLabels ?? [])];
    }
    const unplaced =
      entries.length === 0 || entries.some(entry => !premiumKeys.has(entryKey(entry)));
    return !trialMatched && unplaced ? [toPremiumJudge(judge, judge.classLabels ?? [])] : [];
  });
}

function parseOptionalCurrency(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function applyShowFormDataToPremium(
  premium: GeneratedPremium,
  formData: Partial<ShowInput>,
  judges: ShowJudgeAssignment[]
): GeneratedPremium {
  const preEntryFee = parseOptionalCurrency(formData.preEntryFee);
  const dayOfFee = parseOptionalCurrency(formData.dayOfShowFee);
  const premiumKeys = new Set(premium.trials.map(t => premiumTrialKey(t.name, t.date)));

  return {
    ...premium,
    style: (formData.style ?? premium.style) as GeneratedPremium['style'],
    show: {
      ...premium.show,
      name: formData.name ?? premium.show.name,
      startDate: formData.startDate ?? premium.show.startDate,
      endDate: formData.endDate ?? premium.show.endDate,
      venue: formData.location ?? premium.show.venue,
      entryOpenDate: formData.entryOpenDate ?? premium.show.entryOpenDate,
      entryCloseDate: formData.entryCloseDate ?? premium.show.entryCloseDate,
      preEntryFee: preEntryFee ?? premium.show.preEntryFee,
      dayOfFee: dayOfFee ?? premium.show.dayOfFee,
      acceptChecks: formData.acceptCheckPayments ?? premium.show.acceptChecks,
      acceptCash: formData.acceptCashPayments ?? premium.show.acceptCash,
      onlineEntriesEnabled: formData.onlineEntriesEnabled ?? premium.show.onlineEntriesEnabled,
    },
    trials: premium.trials.map(trial => ({
      ...trial,
      judges: judgesForTrial(judges, trial, premiumKeys),
    })),
  };
}
