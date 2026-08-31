import type { Trial } from '@/components/trials/types/trial.types';
import { getLiveExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import { getTrialRegistry, getTrialTimezone } from '@/features/registries';
import type { Show } from '@/types/show-types';
import { formatFee } from '@/utils/format';

export interface LandingTrial {
  id: string;
  trialNumber: number | string;
  date: string | null;
  judgeName?: string;
}

export interface LandingJudge {
  id: string;
  name: string;
  city?: string | null;
  trials: string[];
  elements: string[];
}

export interface LandingJourneyStep {
  date: string | null;
  label: string;
  description: string;
  status: 'done' | 'active' | 'future';
}

export interface LandingFee {
  label: string;
  amount: string;
}

export interface LandingAccommodation {
  name: string;
  address?: string;
  phone?: string;
  url?: string;
  type?: string;
}

export interface LandingData<
  TTrial extends LandingTrial = LandingTrial,
  TJudge extends LandingJudge = LandingJudge,
  TFee extends LandingFee = LandingFee,
  TAccommodation extends LandingAccommodation = LandingAccommodation,
> {
  clubName: string;
  showName: string;
  showSubtitle: string;
  welcomeText: string | null;
  trialChairName: string | null;
  entryOpenDate: string | null;
  entryCloseDate: string | null;
  confirmationDate: string | null;
  trialStartDate: string | null;
  trialEndDate: string | null;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  trials: TTrial[];
  judges: TJudge[];
  entryCount: number | null;
  entryLimit: number | null;
  fees: TFee[];
  accommodations: TAccommodation[];
  vetClinic: { name: string; address: string; phone: string } | null;
  coverImageUrl: string | null;
  pullQuote: string | null;
  pullQuoteAttribution: string | null;
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  houseRulesNotes: string | null;
  secretaryName: string | null;
  secretaryEmail: string | null;
  licenseLanguage: string;
  memberClubLanguage: string;
  journeySteps: LandingJourneyStep[];
  entryWizardUrl: string;
}

export function toRoman(value: number | string | null | undefined): string {
  if (value == null) return '';
  let number = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (Number.isNaN(number) || number <= 0) return String(value);

  const numerals: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let result = '';
  for (const [amount, numeral] of numerals) {
    while (number >= amount) {
      result += numeral;
      number -= amount;
    }
  }
  return result || String(value);
}

export function buildJourneySteps(
  entryOpenDate: string | null,
  entryCloseDate: string | null,
  confirmationDate: string | null,
  trialStartDate: string | null,
  trialEndDate: string | null
): LandingJourneyStep[] {
  const now = Date.now();
  const makeStep = (
    date: string | null,
    label: string,
    description: string
  ): LandingJourneyStep => {
    if (!date) return { date, label, description, status: 'future' };
    const timestamp = new Date(date).getTime();
    if (timestamp < now) return { date, label, description, status: 'done' };
    if (timestamp - now < 7 * 24 * 60 * 60 * 1000) {
      return { date, label, description, status: 'active' };
    }
    return { date, label, description, status: 'future' };
  };

  return [
    makeStep(entryOpenDate, 'Entries open', 'Online entry portal opens'),
    makeStep(entryCloseDate, 'Entries close', 'Final deadline for all entries'),
    makeStep(confirmationDate, 'Confirmations sent', 'Draw complete — armbands assigned'),
    makeStep(trialStartDate, 'Trial begins', 'First runs of the event'),
    makeStep(trialEndDate, 'Trial concludes', 'Final runs, awards ceremony'),
  ].filter(step => step.date !== null);
}

export function buildLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[],
  entryCount: number | null
): LandingData {
  const liveExperience = show ? getLiveExperienceSnapshot(show) : null;
  const supplemental = liveExperience?.supplemental;
  const supplementalRecord = supplemental as
    (Record<string, unknown> & typeof supplemental) | undefined;
  const registry = getTrialRegistry(currentTrial);
  const timezone = getTrialTimezone(currentTrial);
  const entryCloseDate = currentTrial?.entryCloseDate ?? show?.entryCloseDate ?? null;
  const trialStartDate = show?.startDate ?? null;
  const trialEndDate = show?.endDate ?? null;

  const trials = allTrials
    .slice()
    // MYK9-282: parseInt("Friday Trial 1") is NaN, and NaN - NaN is NaN, so this
    // comparator returned NaN for every pair and the sort silently did nothing —
    // trials rendered in fetch order with no visible symptom.
    .sort((left, right) =>
      String(left.trialNumber ?? '').localeCompare(String(right.trialNumber ?? ''), undefined, {
        numeric: true,
      })
    )
    .map<LandingTrial>(trial => ({
      id: trial.id,
      trialNumber: trial.trialNumber ?? '',
      date: trial.trialDate ?? null,
      ...(trial.judge ? { judgeName: trial.judge } : {}),
    }));

  const judgeMap = new Map<string, string[]>();
  for (const trial of trials) {
    if (!trial.judgeName) continue;
    const label = toRoman(trial.trialNumber);
    const labels = judgeMap.get(trial.judgeName) ?? [];
    if (label && !labels.includes(label)) labels.push(label);
    judgeMap.set(trial.judgeName, labels);
  }
  const judges = Array.from(judgeMap.entries()).map<LandingJudge>(([name, labels], index) => ({
    id: `judge-${index}`,
    name,
    city: null,
    trials: labels,
    elements: [],
  }));

  const entryLimit = allTrials.reduce<number | null>((maximum, trial) => {
    const value = trial.maxTotalEntries ?? null;
    if (value == null) return maximum;
    return maximum == null ? value : Math.max(maximum, value);
  }, null);

  const fees: LandingFee[] = [];
  if (show?.preEntryFee) fees.push({ label: 'First entry', amount: formatFee(show.preEntryFee) });
  if (show?.dayOfShowFee) {
    fees.push({ label: 'Day-of entry', amount: formatFee(show.dayOfShowFee) });
  }

  return {
    clubName: show?.organization ?? '',
    showName: show?.name ?? '',
    showSubtitle: `${registry.licenseLanguage} · ${allTrials.length} Trial${allTrials.length === 1 ? '' : 's'}`,
    welcomeText: null,
    trialChairName: null,
    entryOpenDate: show?.entryOpenDate ?? null,
    entryCloseDate,
    confirmationDate: currentTrial?.confirmationDate ?? null,
    trialStartDate,
    trialEndDate,
    timezone,
    venueName: null,
    venueAddress: show?.location ?? null,
    venueCity: null,
    trials,
    judges,
    entryCount,
    entryLimit,
    fees,
    accommodations: supplemental?.accommodations ?? [],
    vetClinic: supplemental?.vetClinic ?? null,
    coverImageUrl: supplemental?.coverImageUrl ?? null,
    pullQuote:
      typeof supplementalRecord?.pullQuote === 'string' ? supplementalRecord.pullQuote : null,
    pullQuoteAttribution:
      typeof supplementalRecord?.pullQuoteAttribution === 'string'
        ? supplementalRecord.pullQuoteAttribution
        : null,
    hospitalityNotes: supplemental?.hospitalityNotes ?? null,
    awardsDescription: supplemental?.awardsDescription ?? null,
    houseRulesNotes: supplemental?.additionalNotes ?? null,
    secretaryName: null,
    secretaryEmail: null,
    licenseLanguage: registry.licenseLanguage,
    memberClubLanguage: registry.memberClubLanguage,
    journeySteps: buildJourneySteps(
      show?.entryOpenDate ?? null,
      entryCloseDate,
      currentTrial?.confirmationDate ?? null,
      trialStartDate,
      trialEndDate
    ),
    entryWizardUrl: show?.id ? `/shows/${show.id}/register` : '/shows',
  };
}
