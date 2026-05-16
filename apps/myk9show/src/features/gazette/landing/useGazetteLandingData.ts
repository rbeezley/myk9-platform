/**
 * Assembles all data needed by GazetteLandingPage from store + query sources.
 * Sections only receive a typed GazetteLandingData object, never raw store
 * shapes.
 *
 * The trial-number → roman-numeral conversion mirrors Heritage's helper —
 * we re-export Heritage's `toRoman` rather than duplicating it.
 */

import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { getLiveExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import { getRegistry, getTrialTimezone } from '@/features/registries';
import { formatFee } from '@/utils/format';
import { toRoman } from '@/features/heritage/landing/useHeritageLandingData';
import {
  GAZETTE_DEFAULT_VOLUME_ROMAN,
  GAZETTE_DEFAULT_EDITION,
  GAZETTE_DEFAULT_MOTTO,
} from '../tokens';
import type {
  GazetteLandingData,
  GazetteTrial,
  GazetteJudge,
  GazetteJourneyStep,
  GazetteFee,
  GazetteAccommodation,
} from './types';

/** Lowercase roman for the masthead trial-list strip ("trials i · iii · v"). */
function toLowerRoman(n: number | string | null | undefined): string {
  return toRoman(n).toLowerCase();
}

export function buildJourneySteps(
  entryOpenDate: string | null,
  entryCloseDate: string | null,
  confirmationDate: string | null,
  trialStartDate: string | null,
  trialEndDate: string | null
): GazetteJourneyStep[] {
  const now = Date.now();

  const step = (date: string | null, label: string, description: string): GazetteJourneyStep => {
    if (!date) return { date, label, description, status: 'future' };
    const t = new Date(date).getTime();
    if (t < now) return { date, label, description, status: 'done' };
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

export function useGazetteLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): GazetteLandingData {
  const showId = show?.id ?? '';
  const { data: entries = [] } = useEntriesByShowQuery(showId, !!showId);
  const entryCount = entries.length;

  const akc = getRegistry('AKC');
  const timezone = getTrialTimezone(currentTrial);

  return useMemo<GazetteLandingData>(() => {
    const liveExperience = show ? getLiveExperienceSnapshot(show) : null;
    const supplemental = liveExperience?.supplemental;
    const entryCloseDate = currentTrial?.entryCloseDate ?? show?.entryCloseDate ?? null;
    const trialStartDate = show?.startDate ?? null;
    const trialEndDate = show?.endDate ?? null;

    // Trials — sort by number, map to Gazette shape
    const trials: GazetteTrial[] = allTrials
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
        const trial: GazetteTrial = {
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

    // Judges — dedup by name, collect lowercase-roman trial labels per judge
    const judgeMap = new Map<string, { trials: string[]; elements: string[] }>();
    trials.forEach(t => {
      if (!t.judgeName) return;
      const roman = toLowerRoman(t.trialNumber);
      const existing = judgeMap.get(t.judgeName);
      if (existing) {
        existing.trials.push(roman);
      } else {
        judgeMap.set(t.judgeName, { trials: [roman], elements: [] });
      }
    });
    const judges: GazetteJudge[] = Array.from(judgeMap.entries()).map(([name, data], i) => ({
      id: `judge-${i}`,
      name,
      city: null,
      trials: data.trials,
      elements: data.elements,
      hall: null,
      bio: null,
    }));

    // Fees
    const fees: GazetteFee[] = [];
    if (show?.preEntryFee) {
      fees.push({ label: 'First entry', amount: formatFee(show.preEntryFee) });
    }
    if (show?.dayOfShowFee) {
      fees.push({ label: 'Day-of entry', amount: formatFee(show.dayOfShowFee) });
    }

    // Entry limit — max across trials
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

    // Classifieds: accommodations → lodging, vetClinic → emergency vet,
    // hospitalityNotes → hospitality card, awardsDescription → awards card
    const accommodations: GazetteAccommodation[] = [];
    (supplemental?.accommodations ?? []).forEach((a, idx) => {
      accommodations.push({
        name: a.name,
        address: a.address,
        phone: a.phone,
        type: 'Lodging',
        meta: `LODGING · ${toRoman(idx + 1)}`,
      });
    });
    if (supplemental?.vetClinic) {
      accommodations.push({
        name: supplemental.vetClinic.name,
        address: supplemental.vetClinic.address,
        phone: supplemental.vetClinic.phone,
        type: 'Emergency Vet',
        meta: 'VET · EMERGENCY',
      });
    }

    return {
      clubName: show?.organization ?? '',
      showName: show?.name ?? '',
      showSubtitle: `${akc.licenseLanguage} · ${allTrials.length} Trial${allTrials.length !== 1 ? 's' : ''}`,
      welcomeText: null,
      trialChairName: null,
      trialChairTitle: null,

      // Visual metadata — fixed per README §Open Questions Q1 (MVP-static)
      volumeRoman: GAZETTE_DEFAULT_VOLUME_ROMAN,
      edition: GAZETTE_DEFAULT_EDITION,
      motto: GAZETTE_DEFAULT_MOTTO,
      established: null,
      cityLabel: null,

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
      accommodations,
      hospitalityNotes: supplemental?.hospitalityNotes ?? null,
      awardsDescription: supplemental?.awardsDescription ?? null,
      houseRulesNotes: null,

      schedule: [],
      officers: [],

      secretaryName: null,
      secretaryEmail: null,
      secretaryPhone: null,

      licenseLanguage: akc.licenseLanguage,
      memberClubLanguage: akc.memberClubLanguage,

      journeySteps,

      entryWizardUrl: show?.id ? `/shows/${show.id}/register` : '/shows',
    };
  }, [show, currentTrial, allTrials, entryCount, akc, timezone]);
}
