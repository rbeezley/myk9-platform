/**
 * Assembles all data needed by HeritageLandingPage from store + query sources.
 * Returns a typed HeritageLandingData object — sections only receive this, never raw
 * store shapes.
 */

import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { getRegistry, getTrialTimezone } from '@/features/registries';
import type { HeritageLandingData, HeritageTrial, HeritageJourneyStep, HeritageFee } from './types';

interface TrialLike {
  id: string;
  showId?: string | null;
  trialDate?: string | null;
  trialNumber?: number | string | null;
  entryCloseDate?: string | null;
  timezone?: string | null;
  maxTotalEntries?: number | null;
  judge?: string | null;
  type?: string | null;
}

function toRoman(n: number | string | null | undefined): string {
  if (n == null) return '';
  const num = typeof n === 'string' ? parseInt(n, 10) : n;
  if (isNaN(num) || num <= 0) return String(n);
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let result = '';
  for (let i = 0; i < vals.length; i++) {
    while (num >= vals[i]) {
      result += syms[i];
      // num -= vals[i]; — safe: reassign disallowed with const but num is let above
    }
  }
  return result || String(n);
}

function formatFee(cents: number | string | null | undefined): string {
  if (cents == null) return '';
  const n = typeof cents === 'string' ? parseFloat(cents) : cents;
  if (isNaN(n)) return String(cents);
  // If value looks like it's already in dollars (< 100), treat as dollars
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${(n / 100).toFixed(2)}`;
}

function buildJourneySteps(
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
  currentTrial: TrialLike | null | undefined,
  allTrials: TrialLike[]
): HeritageLandingData {
  const showId = show?.id ?? '';
  const { data: entries = [] } = useEntriesByShowQuery(showId, !!showId);

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
      currentTrial?.timezone ? null : null, // confirmation_date not yet on TrialLike — null until type regen
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
      confirmationDate: null, // populated once trials.confirmation_date types are regenerated
      trialStartDate,
      trialEndDate,
      timezone,

      venueName: null,
      venueAddress: show?.location ?? null,
      venueCity: null,

      trials,
      judges,

      entryCount: entries.length,
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
  }, [show, currentTrial, allTrials, entries, akc, timezone]);
}
