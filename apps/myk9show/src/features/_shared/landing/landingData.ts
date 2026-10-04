import { formatTrialLabel } from '@myk9/core';
import type { Trial } from '@/components/trials/types/trial.types';
import { getLiveExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import { getTrialRegistry, getTrialTimezone } from '@/features/registries';
import type { ConfirmedJudgeAssignment } from '@/services/database/_shared/judgeNamesByClass';
import type { Show } from '@/types/show-types';
import { formatFee } from '@/utils/format';
import { formatWeekdayMonthDay } from '@/lib/format/dates';
import { canonicalizeWebsiteUrl } from '@/lib/websiteUrl';

/**
 * Accommodation websites are secretary-typed free text rendered as public
 * links by several templates: canonicalize once here (undefined when unsafe)
 * so every template's href and label agree.
 */
export function canonicalizeAccommodationUrl<T extends object>(item: T): T & { url?: string } {
  // The typed supplemental shape has no `url`, but stored JSON can carry one.
  const { url } = item as { url?: unknown };
  if (typeof url !== 'string' || !url) return item;
  const canonical = canonicalizeWebsiteUrl(url);
  if (canonical) return { ...item, url: canonical };
  const withoutUrl = { ...item } as Record<string, unknown>;
  delete withoutUrl.url;
  return withoutUrl as T;
}

export interface LandingTrial {
  id: string;
  /** trials.name — the display label (MYK9-704). */
  name?: string;
  trialNumber: number | string;
  date: string | null;
  judgeName?: string;
}

export interface LandingJudge {
  id: string;
  name: string;
  city?: string | null;
  trials: string[];
  /** Raw trial numbers this judge sits, in trial order (for "TRIALS 01 · 02" chip labels). */
  trialNumbers?: Array<number | string>;
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

/**
 * One label per trial a judge sits. A label shared by two of those trials is
 * suffixed with the trial's date ("Trial 1 (Sat, Oct 31)") so neither reads as
 * a duplicate; a label unique to one trial is left as-is.
 */
function judgeTrialLabels(assigned: readonly LandingTrial[]): string[] {
  const labels = assigned.map(trial =>
    formatTrialLabel({ name: trial.name, trialNumber: trial.trialNumber })
  );
  // INTENT: same-name, same-day trials render with identical labels by design (Richard, 2026-09-24,
  // MYK9-704): the data has no public discriminator and the case is a secretary data-entry error.
  // Both assignments are still listed, so none is hidden; do not add a synthetic suffix.
  return labels.map((label, index) => {
    const shared = labels.filter(other => other === label).length > 1;
    const day = shared ? formatWeekdayMonthDay(assigned[index]?.date) : '';
    return day ? `${label} (${day})` : label;
  });
}

export function buildLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[],
  entryCount: number | null,
  judgeAssignments: readonly ConfirmedJudgeAssignment[] = []
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
    // MYK9-282: this was parseInt(trialNumber) subtraction. trials.trial_number is
    // TEXT ("Saturday Trial", "UKC-Nosework"), so both sides were NaN, the comparator
    // returned NaN for every pair, and the sort silently did nothing.
    //
    // Date is the PRIMARY key, not the label. Sorting by label alone reorders a
    // multi-day show: Heartland has "Saturday Trial" on Aug 1 and "ASCA-ScentDetection"
    // on Aug 2, and alphabetically ASCA leads — putting day two before day one on a
    // public page. The label is only a tiebreaker within a single date, numeric-aware
    // so "Trial 2" precedes "Trial 10". Undated trials sort last rather than jumping
    // to the front on an empty-string compare.
    .sort((left, right) => {
      const leftDate = left.trialDate ?? '';
      const rightDate = right.trialDate ?? '';
      if (leftDate !== rightDate) {
        if (!leftDate) return 1;
        if (!rightDate) return -1;
        return leftDate.localeCompare(rightDate);
      }
      return String(left.trialNumber ?? '').localeCompare(
        String(right.trialNumber ?? ''),
        undefined,
        {
          numeric: true,
        }
      );
    })
    .map<LandingTrial>(trial => ({
      id: trial.id,
      ...(trial.name ? { name: trial.name } : {}),
      trialNumber: trial.trialNumber ?? '',
      date: trial.trialDate ?? null,
      ...(trial.judge ? { judgeName: trial.judge } : {}),
    }));

  // A judge's assignments are keyed by trial ID: trial names are not unique, so
  // de-duplicating by label hid one of two same-named trials (MYK9-704).
  // MYK9-985: a judge is one person however many trials they sit, so confirmed assignments
  // collapse by person id; the legacy `trial.judge` string (never populated today) collapses
  // by name.
  const judgeMap = new Map<string, { name: string; assigned: Map<string, LandingTrial> }>();
  const addJudge = (key: string, name: string, trial: LandingTrial | undefined) => {
    const entry = judgeMap.get(key) ?? { name, assigned: new Map<string, LandingTrial>() };
    if (trial) entry.assigned.set(trial.id, trial);
    judgeMap.set(key, entry);
  };
  for (const trial of trials) {
    if (trial.judgeName) addJudge(`name:${trial.judgeName}`, trial.judgeName, trial);
  }
  const trialsById = new Map(trials.map(trial => [trial.id, trial]));
  // Same fallback as the replication mapper (`row.trial_id ?? cls.trial_id`): a class-level
  // assignment has no trial_id of its own, so its owning trial is the one holding the class.
  const trialIdByClassId = new Map<string, string>();
  for (const showTrial of show?.trials ?? []) {
    for (const classInfo of showTrial.classes ?? [])
      trialIdByClassId.set(classInfo.id, showTrial.id);
  }
  const resolvedAssignments = judgeAssignments.map(assignment => ({
    ...assignment,
    trialId:
      assignment.trialId ??
      (assignment.classId ? (trialIdByClassId.get(assignment.classId) ?? null) : null),
  }));
  const assignmentsInTrialOrder = [...resolvedAssignments].sort(
    (left, right) =>
      trials.findIndex(trial => trial.id === left.trialId) -
      trials.findIndex(trial => trial.id === right.trialId)
  );
  for (const assignment of assignmentsInTrialOrder) {
    const name = `${assignment.firstName ?? ''} ${assignment.lastName ?? ''}`.trim();
    if (!name) continue;
    addJudge(
      `person:${assignment.personId}`,
      name,
      assignment.trialId ? trialsById.get(assignment.trialId) : undefined
    );
  }
  const judges = Array.from(judgeMap.values()).map<LandingJudge>(({ name, assigned }, index) => ({
    id: `judge-${index}`,
    name,
    city: null,
    trials: judgeTrialLabels([...assigned.values()]),
    trialNumbers: [...assigned.values()].map(trial => trial.trialNumber),
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
    accommodations: (supplemental?.accommodations ?? []).map(canonicalizeAccommodationUrl),
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
