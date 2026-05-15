/**
 * Assembles all data needed by BannerLandingPage. Cloned from the Monogram
 * hook with two Banner-specific additions:
 *   1. `brandColors` bundle from useBannerBrandColor
 *   2. Per-judge `trialsLabel` ("TRIALS 01 · 03 · 05") since the Banner
 *      judge card displays this in a fixed slot above the name
 */

import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { getLiveExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import { getRegistry, getTrialTimezone } from '@/features/registries';
import { formatFee } from '@/utils/format';
import { useBannerBrandColor } from '../hooks/useBannerBrandColor';
import type {
  BannerFee,
  BannerJudge,
  BannerLandingData,
  BannerTrial,
} from './types';

/** Format a trial number as zero-padded 2-digit "01", "02", … */
function pad2(n: number | string): string {
  const num = typeof n === 'number' ? n : parseInt(String(n), 10);
  if (isNaN(num)) return String(n);
  return num.toString().padStart(2, '0');
}

export function useBannerLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): BannerLandingData {
  const showId = show?.id ?? '';
  const { data: entries = [] } = useEntriesByShowQuery(showId, !!showId);
  const entryCount = entries.length;

  const akc = getRegistry('AKC');
  const timezone = getTrialTimezone(currentTrial);
  const brandColors = useBannerBrandColor(show);

  return useMemo<BannerLandingData>(() => {
    const liveExperience = show ? getLiveExperienceSnapshot(show) : null;
    const supplemental = liveExperience?.supplemental;

    const clubName = show?.organization ?? '';
    const showName = show?.name ?? '';

    const entryCloseDate = currentTrial?.entryCloseDate ?? show?.entryCloseDate ?? null;
    const trialStartDate = show?.startDate ?? null;
    const trialEndDate = show?.endDate ?? null;

    // Trials — sort by trial number
    const trials: BannerTrial[] = allTrials
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
        const trial: BannerTrial = {
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
      const padded = pad2(t.trialNumber);
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
    const judges: BannerJudge[] = Array.from(judgeMap.entries()).map(([name, { id, trials: tn }]) => ({
      id,
      name,
      trialsLabel: tn.length > 0 ? `TRIALS ${tn.join(' · ')}` : null,
      city: null,
      elementPanel: null,
      bio: null,
    }));

    // Fees — Banner mock surfaces sub-lines per fee row so consumers can read
    // "per dog, per trial" / "same dog, additional trials".
    const fees: BannerFee[] = [];
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
      brandColors,

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
  }, [show, currentTrial, allTrials, entryCount, akc, timezone, brandColors]);
}
