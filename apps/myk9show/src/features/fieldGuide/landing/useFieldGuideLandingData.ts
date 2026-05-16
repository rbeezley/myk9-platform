/**
 * Assembles all data needed by FieldGuideLandingPage. Mirrors the Banner
 * landing hook minus the per-club brand-color machinery; adds two
 * Field-Guide-specific projections:
 *   1. `quickRefCells` — the 6-cell hero grid (DATES / OPENS / CLOSES /
 *      DRAW / CONFIRM / CAP), with CLOSES marked emphasis-orange
 *   2. `judges[].trialsLabel` — chip text "TRIALS 01·03·05" for the
 *      chip-tagged judge cards
 */

import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { getLiveExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import { getRegistry, getTrialTimezone } from '@/features/registries';
import { formatFee } from '@/utils/format';
import type {
  FieldGuideFee,
  FieldGuideJudge,
  FieldGuideLandingData,
  FieldGuideQuickRefCell,
  FieldGuideTrial,
} from './types';
import { formatDateInTimezone, formatDateRange } from './utils/dateFormat';
import { deriveShowCode } from './utils/showCode';

/** Format a trial number as zero-padded 2-digit "01", "02", … */
function pad2(n: number | string): string {
  const num = typeof n === 'number' ? n : parseInt(String(n), 10);
  if (isNaN(num)) return String(n);
  return num.toString().padStart(2, '0');
}

export function useFieldGuideLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): FieldGuideLandingData {
  const showId = show?.id ?? '';
  const { data: entries = [] } = useEntriesByShowQuery(showId, !!showId);
  const entryCount = entries.length;

  const akc = getRegistry('AKC');
  const timezone = getTrialTimezone(currentTrial);

  return useMemo<FieldGuideLandingData>(() => {
    const liveExperience = show ? getLiveExperienceSnapshot(show) : null;
    const supplemental = liveExperience?.supplemental;

    const clubName = show?.organization ?? '';
    const showName = show?.name ?? '';

    const entryCloseDate = currentTrial?.entryCloseDate ?? show?.entryCloseDate ?? null;
    const trialStartDate = show?.startDate ?? null;
    const trialEndDate = show?.endDate ?? null;
    const confirmationDate = currentTrial?.confirmationDate ?? null;
    const entryOpenDate = show?.entryOpenDate ?? null;

    // Trials — sort by trial number
    const trials: FieldGuideTrial[] = allTrials
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
        const trial: FieldGuideTrial = {
          id: t.id,
          trialNumber: t.trialNumber ?? '',
          date: t.trialDate ?? null,
        };
        if (t.judge) trial.judgeName = t.judge;
        return trial;
      });

    // Judges — dedupe by name, build "TRIALS 01·03·05" label per judge.
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
    const judges: FieldGuideJudge[] = Array.from(judgeMap.entries()).map(
      ([name, { id, trials: tn }]) => ({
        id,
        name,
        trialsLabel: tn.length > 0 ? `TRIALS ${tn.join('·')}` : null,
        city: null,
        elementPanel: null,
        bio: null,
      })
    );

    // Fees — surfaced as "stat cards" via FieldGuideStatGrid in the
    // landing FeesSection. Render with mono caption sub-lines.
    const fees: FieldGuideFee[] = [];
    if (show?.preEntryFee) {
      fees.push({
        label: 'FIRST ENTRY',
        amount: formatFee(show.preEntryFee),
        sub: 'PER DOG / PER TRIAL',
      });
    }
    if (show?.dayOfShowFee) {
      fees.push({
        label: 'EACH ADDITIONAL',
        amount: formatFee(show.dayOfShowFee),
        sub: 'SAME DOG / +TRIALS',
      });
    }

    const entryLimit = allTrials.reduce<number | null>((max, t) => {
      const v = t.maxTotalEntries ?? null;
      if (v == null) return max;
      return max == null ? v : Math.max(max, v);
    }, null);

    // Quick-ref hero — 6 cells. CLOSES is the emphasis cell since "when
    // does this close?" is the most-asked-for fact on this surface.
    const quickRefCells: FieldGuideQuickRefCell[] = [
      {
        label: 'DATES',
        value: formatDateRange(trialStartDate, trialEndDate, timezone) || 'TBA',
      },
      {
        label: 'OPENS',
        value: entryOpenDate ? formatDateInTimezone(entryOpenDate, timezone, 'monthDay') : 'TBA',
      },
      {
        label: 'CLOSES',
        value: entryCloseDate
          ? formatDateInTimezone(entryCloseDate, timezone, 'monthDay')
          : 'TBA',
        emphasis: true,
      },
      {
        label: 'DRAW',
        value: entryCloseDate
          ? formatDateInTimezone(entryCloseDate, timezone, 'monthDay')
          : 'TBA',
      },
      {
        label: 'CONFIRM',
        value: confirmationDate
          ? formatDateInTimezone(confirmationDate, timezone, 'monthDay')
          : 'TBA',
      },
      {
        label: 'CAP',
        value: entryLimit != null ? `${entryLimit}` : 'OPEN',
      },
    ];

    const showCode = deriveShowCode(clubName, showName, trialStartDate);

    return {
      showCode,
      clubName,
      showName,
      showSubtitle: `FIELD GUIDE · ${showCode} · REV 01`,
      welcomeText: null,
      trialChairName: null,
      trialChairEmail: null,

      entryOpenDate,
      entryCloseDate: entryCloseDate ?? null,
      confirmationDate,
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

      quickRefCells,
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
