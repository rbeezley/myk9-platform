/**
 * Assembles all data needed by HeritageLandingPage from store + query sources.
 * Returns a typed HeritageLandingData object — sections only receive this, never raw
 * store shapes.
 */

import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { getRegistry, getTrialTimezone } from '@/features/registries';
import { formatFee } from '@/utils/format';
import type { HeritageLandingData, HeritageTrial, HeritageJourneyStep, HeritageFee } from './types';

export function toRoman(n: number | string | null | undefined): string {
  if (n == null) return '';
  let num = typeof n === 'string' ? parseInt(n, 10) : n;
  if (isNaN(num) || num <= 0) return String(n);
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let result = '';
  for (let i = 0; i < vals.length; i++) {
    while (num >= vals[i]) {
      result += syms[i];
      num -= vals[i];
    }
  }
  return result || String(n);
}

export function buildJourneySteps(
  entryOpenDate: string | null,
  entryCloseDate: string | null,
  confirmationDate: string | null,
  trialStartDate: string | null,
  trialEndDate: string | null
): HeritageJourneyStep[] {
  const now = Date.now();

  const step = (date: string | null, label: string, description: string): HeritageJourneyStep => {
    if (!date) return { date, label, description, status: 'future' };
    const t = new Date(date).getTime();
    if (t < now) return { date, label, description, status: 'done' };
    // Active = within 7 days of now
    if (t - now < 7 * 24 * 60 * 60 * 1000) return { date, label, description, status: 'active' };
    return { date, label, description, status: 'future' };
  };

  return [
    step(entryOpenDate, 'Entries open', 'Online entry portal opens'),
    step(entryCloseDate, 'Entries close', 'Final deadline for all entries'),
    step(confirmationDate, 'Confirmations sent', 'Draw complete — armbands assigned'),
    step(trialStartDate, 'Trial begins', 'First runs of the event'),
    step(trialEndDate, 'Trial concludes', 'Final runs, awards ceremony'),
  ].filter(s => s.date !== null);
}

export function useHeritageLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): HeritageLandingData {
  const showId = show?.id ?? '';
  const { data: entries = [] } = useEntriesByShowQuery(showId, !!showId);
  const entryCount = entries.length;

  const akc = getRegistry('AKC');
  const timezone = getTrialTimezone(currentTrial);

  return useMemo<HeritageLandingData>(() => {
    const entryCloseDate = currentTrial?.entryCloseDate ?? show?.entryCloseDate ?? null;
    const trialStartDate = show?.startDate ?? null;
    const trialEndDate = show?.endDate ?? null;

    // Trials — sort by trial number, map to Heritage shape
    const trials: HeritageTrial[] = allTrials
      .slice()
      .sort((a, b) => {
        const an =
          typeof a.trialNumber === 'number'
            ? a.trialNumber
            : parseInt(String(a.trialNumber ?? 0), 10);
        const bn =
          typeof b.trialNumber === 'number'
            ? b.trialNumber
            : parseInt(String(b.trialNumber ?? 0), 10);
        return an - bn;
      })
      .map(t => {
        const trial: HeritageTrial = {
          id: t.id,
          trialNumber: t.trialNumber ?? '',
          date: t.trialDate ?? null,
        };
        if (t.judge) {
          trial.judge = t.judge;
          trial.judgeName = t.judge;
        }
        return trial;
      });

    // Judges — derive from trials that have a judge field
    const judgeMap = new Map<string, { trials: string[]; elements: string[] }>();
    trials.forEach(t => {
      if (!t.judgeName) return;
      const roman = toRoman(t.trialNumber);
      const existing = judgeMap.get(t.judgeName);
      if (existing) {
        existing.trials.push(roman);
      } else {
        judgeMap.set(t.judgeName, { trials: [roman], elements: [] });
      }
    });
    const judges = Array.from(judgeMap.entries()).map(([name, data], i) => ({
      id: `judge-${i}`,
      name,
      city: null,
      trials: data.trials,
      elements: data.elements,
    }));

    // Fees
    const fees: HeritageFee[] = [];
    if (show?.preEntryFee) {
      fees.push({ label: 'First entry', amount: formatFee(show.preEntryFee) });
    }
    if (show?.dayOfShowFee) {
      fees.push({ label: 'Day-of entry', amount: formatFee(show.dayOfShowFee) });
    }

    // Entry limit — take max across trials
    const entryLimit = allTrials.reduce<number | null>((max, t) => {
      const v = t.maxTotalEntries ?? null;
      if (v == null) return max;
      return max == null ? v : Math.max(max, v);
    }, null);

    const journeySteps = buildJourneySteps(
      show?.entryOpenDate ?? null,
      entryCloseDate,
      currentTrial?.confirmationDate ?? null,
      trialStartDate,
      trialEndDate
    );

    return {
      clubName: show?.organization ?? '',
      showName: show?.name ?? '',
      showSubtitle: `${akc.licenseLanguage} · ${allTrials.length} Trial${allTrials.length !== 1 ? 's' : ''}`,
      welcomeText: null,
      trialChairName: null,

      entryOpenDate: show?.entryOpenDate ?? null,
      entryCloseDate: entryCloseDate ?? null,
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
      officers: [],
      accommodations: [],
      hospitalityNotes: null,
      awardsDescription: null,
      houseRulesNotes: null,

      secretaryName: null,
      secretaryEmail: null,

      journeySteps,

      licenseLanguage: akc.licenseLanguage,
      memberClubLanguage: akc.memberClubLanguage,

      entryWizardUrl: show?.id ? `/shows/${show.id}/register` : '/shows',
    };
  }, [show, currentTrial, allTrials, entryCount, akc, timezone]);
}
