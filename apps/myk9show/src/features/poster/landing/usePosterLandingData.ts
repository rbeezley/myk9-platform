/**
 * Assembles all data needed by PosterLandingPage. Cloned from the Banner
 * hook with the per-club brand color removed — Poster's palette is fixed
 * at the design-system level (cream / ink / red / olive only).
 */

import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { getLiveExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import { getRegistry, getTrialTimezone } from '@/features/registries';
import { formatFee } from '@/utils/format';
import { padTrialNumber } from './utils/dateFormat';
import type {
  PosterFee,
  PosterJudge,
  PosterLandingData,
  PosterTrial,
} from './types';

export function usePosterLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): PosterLandingData {
  const showId = show?.id ?? '';
  const { data: entries = [] } = useEntriesByShowQuery(showId, !!showId);
  const entryCount = entries.length;

  const akc = getRegistry('AKC');
  const timezone = getTrialTimezone(currentTrial);

  return useMemo<PosterLandingData>(() => {
    const liveExperience = show ? getLiveExperienceSnapshot(show) : null;
    const supplemental = liveExperience?.supplemental;

    const clubName = show?.organization ?? '';
    const showName = show?.name ?? '';

    const entryCloseDate = currentTrial?.entryCloseDate ?? show?.entryCloseDate ?? null;
    const trialStartDate = show?.startDate ?? null;
    const trialEndDate = show?.endDate ?? null;

    // Trials — sort by trial number
    const trials: PosterTrial[] = allTrials
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
        const trial: PosterTrial = {
          id: t.id,
          trialNumber: t.trialNumber ?? '',
          date: t.trialDate ?? null,
        };
        if (t.judge) trial.judgeName = t.judge;
        return trial;
      });

    // Judges — dedupe by name, build "TRIALS 01 · 03 · 05" label per judge.
    const judgeMap = new Map<string, { trials: string[]; id: string }>();
    trials.forEach(t => {
      if (!t.judgeName) return;
      const padded = padTrialNumber(t.trialNumber);
      const existing = judgeMap.get(t.judgeName);
      if (existing) {
        if (padded && !existing.trials.includes(padded)) existing.trials.push(padded);
        return;
      }
      judgeMap.set(t.judgeName, {
        trials: padded ? [padded] : [],
        id: `judge-${judgeMap.size}`,
      });
    });
    const judges: PosterJudge[] = Array.from(judgeMap.entries()).map(
      ([name, { id, trials: tn }]) => ({
        id,
        name,
        trialsLabel: tn.length > 0 ? `TRIALS ${tn.join(' · ')}` : null,
        city: null,
        elementPanel: null,
        bio: null,
      })
    );

    // Fees — Poster's design surfaces sub-lines like "PER DOG, PER TRIAL".
    const fees: PosterFee[] = [];
    if (show?.preEntryFee) {
      fees.push({
        label: 'First entry',
        amount: formatFee(show.preEntryFee),
        sub: 'per dog, per trial',
      });
    }
    if (show?.dayOfShowFee) {
      fees.push({
        label: 'Each additional',
        amount: formatFee(show.dayOfShowFee),
        sub: 'same dog, additional trials',
      });
    }

    const entryLimit = allTrials.reduce<number | null>((max, t) => {
      const v = t.maxTotalEntries ?? null;
      if (v == null) return max;
      return max == null ? v : Math.max(max, v);
    }, null);

    return {
      clubName,
      showName,
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

      onTheDay: [],
      accommodations: supplemental?.accommodations ?? [],
      hospitalityNotes: supplemental?.hospitalityNotes ?? null,

      secretaryName: null,
      secretaryEmail: null,

      licenseLanguage: akc.licenseLanguage,
      memberClubLanguage: akc.memberClubLanguage,

      entryWizardUrl: show?.id ? `/shows/${show.id}/register` : '/shows',
    };
  }, [show, currentTrial, allTrials, entryCount, akc, timezone]);
}
