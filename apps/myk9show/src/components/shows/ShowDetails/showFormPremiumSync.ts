import type { ShowInput } from '@/store/showStore';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { GeneratedPremium } from '@/types/premium-types';
import { premiumTrialKey } from '@/features/premium/premiumClassLabel';

type PremiumJudge = NonNullable<GeneratedPremium['trials'][number]['judges']>[number];

function toPremiumJudge(judge: ShowJudgeAssignment, classes: string[]): PremiumJudge {
  return { name: judge.judgeName, residence: judge.residence ?? null, classes };
}

/**
 * The judges one premium trial lists. A judge with a show-level assignment judges every class, so
 * is listed with no class line. Any other judge is listed only where they have classes, with those
 * classes only (MYK9-2067): trials of one weekend repeat the same class labels. When no trial of
 * the premium matches any judge's trial (an old premium, a renamed trial), every judge is listed on
 * every trial with their classes by label, so judges never vanish; premiumFacts then keeps only the
 * labels the trial runs.
 */
function judgesForTrial(
  judges: ShowJudgeAssignment[],
  trial: { name: string; date: string },
  matchesAnyTrial: boolean
): PremiumJudge[] {
  const key = premiumTrialKey(trial.name, trial.date);
  return judges.flatMap(judge => {
    if (judge.hasShowLevelAssignment) return [toPremiumJudge(judge, [])];
    if (!matchesAnyTrial) return [toPremiumJudge(judge, judge.classLabels ?? [])];
    const here = (judge.classLabelsByTrial ?? []).find(
      entry => premiumTrialKey(entry.trialName, entry.trialDate) === key
    );
    return here ? [toPremiumJudge(judge, here.labels)] : [];
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
  const matchesAnyTrial = judges.some(judge =>
    (judge.classLabelsByTrial ?? []).some(entry =>
      premiumKeys.has(premiumTrialKey(entry.trialName, entry.trialDate))
    )
  );

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
    },
    trials: premium.trials.map(trial => ({
      ...trial,
      judges: judgesForTrial(judges, trial, matchesAnyTrial),
    })),
  };
}
