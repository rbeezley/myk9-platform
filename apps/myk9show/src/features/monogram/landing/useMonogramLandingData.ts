/**
 * Assembles all data needed by MonogramLandingPage from store + query sources.
 * Returns a typed MonogramLandingData object — sections only receive this,
 * never raw store shapes.
 *
 * Cloned from features/heritage/landing/useHeritageLandingData.ts. The two
 * hooks intentionally share their fetch shape so future refactors can extract
 * a shared `useLandingShowData` once a third style needs the same data.
 */

import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { getLiveExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import { getRegistry, getTrialTimezone } from '@/features/registries';
import { formatFee } from '@/utils/format';
import { buildMonogram } from '../utils/buildMonogram';
import type {
  MonogramLandingData,
  MonogramTrial,
  MonogramJudge,
  MonogramFee,
} from './types';

export function useMonogramLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): MonogramLandingData {
  const showId = show?.id ?? '';
  const { data: entries = [] } = useEntriesByShowQuery(showId, !!showId);
  const entryCount = entries.length;

  const akc = getRegistry('AKC');
  const timezone = getTrialTimezone(currentTrial);

  return useMemo<MonogramLandingData>(() => {
    const liveExperience = show ? getLiveExperienceSnapshot(show) : null;
    const supplemental = liveExperience?.supplemental;

    const clubName = show?.organization ?? '';
    const showName = show?.name ?? '';
    const monogramLetters = buildMonogram(clubName || showName, 3);

    const entryCloseDate = currentTrial?.entryCloseDate ?? show?.entryCloseDate ?? null;
    const trialStartDate = show?.startDate ?? null;
    const trialEndDate = show?.endDate ?? null;

    // Trials — sort by trial number, map to Monogram shape
    const trials: MonogramTrial[] = allTrials
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
        const trial: MonogramTrial = {
          id: t.id,
          trialNumber: t.trialNumber ?? '',
          date: t.trialDate ?? null,
        };
        if (t.judge) {
          trial.judgeName = t.judge;
        }
        return trial;
      });

    // Judges — derive from trials that have a judge field. Initials cap at 2
    // for the 64px portrait slot (the design spec uses CB / MW throughout).
    const judgeMap = new Map<string, MonogramJudge>();
    trials.forEach(t => {
      if (!t.judgeName) return;
      if (judgeMap.has(t.judgeName)) return;
      judgeMap.set(t.judgeName, {
        id: `judge-${judgeMap.size}`,
        name: t.judgeName,
        initials: buildMonogram(t.judgeName, 2),
        credential: null,
        bio: null,
      });
    });
    const judges = Array.from(judgeMap.values());

    // Fees
    const fees: MonogramFee[] = [];
    if (show?.preEntryFee) {
      fees.push({ label: 'First entry', amount: formatFee(show.preEntryFee) });
    }
    if (show?.dayOfShowFee) {
      fees.push({ label: 'Each additional', amount: formatFee(show.dayOfShowFee) });
    }

    // Entry limit — take max across trials (matches Heritage)
    const entryLimit = allTrials.reduce<number | null>((max, t) => {
      const v = t.maxTotalEntries ?? null;
      if (v == null) return max;
      return max == null ? v : Math.max(max, v);
    }, null);

    return {
      monogramLetters,
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
