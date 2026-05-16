/**
 * Assembles every datum the Magazine Landing Page needs from the show /
 * trial / registry / supplemental-content layers. Returns a typed
 * `MagazineLandingData` — sections only receive this, never raw store
 * shapes.
 *
 * Modeled on `useHeritageLandingData`. The Magazine-specific work happens
 * inside the `useMemo`:
 * - `monogramLetters` — derived from club name; used by both photo
 *   placeholders (cover + judge portraits)
 * - `coverImageUrl` — read from `supplemental.coverImageUrl`
 * - `judges[].plateLabel` / `judges[].initials` / `judges[].portraitUrl` —
 *   the additional fields the editorial portrait spread needs
 * - `pullQuote` — best-effort pull from a forward-compatible
 *   `supplemental.pullQuote` field; the migration that adds that field is
 *   documented in the PR description's "Phase 3 wiring instructions"
 */

import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { getLiveExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import { getRegistry, getTrialTimezone } from '@/features/registries';
import { formatFee } from '@/utils/format';
import type {
  MagazineLandingData,
  MagazineTrial,
  MagazineJourneyStep,
  MagazineFee,
  MagazineJudge,
} from './types';

/**
 * Lowercase Roman numerals for the editorial voice — "i / ii / iii" reads
 * more like a magazine plate caption than uppercase Roman numerals would.
 * Uppercase Roman numerals look certificate-y, which is Heritage's
 * register, not Magazine's.
 */
export function toLowerRoman(n: number | string | null | undefined): string {
  if (n == null) return '';
  let num = typeof n === 'string' ? parseInt(n, 10) : n;
  if (isNaN(num) || num <= 0) return String(n);
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'];
  let result = '';
  for (let i = 0; i < vals.length; i++) {
    while (num >= vals[i]) {
      result += syms[i];
      num -= vals[i];
    }
  }
  return result || String(n);
}

/**
 * Derive 1–3 character monogram from a club name. Picks the first letter of
 * up to the first three capitalized words; falls back to the first non-
 * whitespace character pair when no capitalized words are found.
 *
 * Examples:
 * - "Bexar County Kennel Club" → "BCK"
 * - "lone star working dog club" → "LO" (no caps → first two chars uppercased)
 * - "" → "·" (single ornament glyph so the placeholder never renders empty)
 */
export function deriveMonogram(clubName: string): string {
  const trimmed = clubName.trim();
  if (!trimmed) return '·';
  const capitalWords = trimmed.split(/\s+/).filter(w => /^[A-Z]/.test(w));
  if (capitalWords.length >= 1) {
    return capitalWords
      .slice(0, 3)
      .map(w => w.charAt(0))
      .join('');
  }
  return trimmed.slice(0, 2).toUpperCase();
}

/** Initials of a judge's display name — up to 3 chars, uppercase. */
export function deriveJudgeInitials(name: string): string {
  const tokens = name
    .replace(/\b(Mr|Mrs|Ms|Dr|Miss)\.?\s+/gi, '')
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return '·';
  return tokens
    .slice(0, 3)
    .map(t => t.charAt(0).toUpperCase())
    .join('');
}

const PLATE_LABELS = ['Plate I', 'Plate II', 'Plate III', 'Plate IV', 'Plate V', 'Plate VI'];

export function buildJourneySteps(
  entryOpenDate: string | null,
  entryCloseDate: string | null,
  confirmationDate: string | null,
  trialStartDate: string | null,
  trialEndDate: string | null
): MagazineJourneyStep[] {
  const now = Date.now();

  const step = (date: string | null, label: string, description: string): MagazineJourneyStep => {
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
    step(trialEndDate, 'Trial concludes', 'Final runs, awards'),
  ].filter(s => s.date !== null);
}

/**
 * Forward-compatible read of an optional `pullQuote` field on supplemental.
 * The migration adding it is documented in the PR description; until then
 * this returns null and the landing page hides the pull-quote element.
 */
function readOptionalPullQuote(supplemental: unknown): {
  text: string | null;
  attribution: string | null;
} {
  if (!supplemental || typeof supplemental !== 'object') {
    return { text: null, attribution: null };
  }
  const s = supplemental as Record<string, unknown>;
  const text = typeof s.pullQuote === 'string' ? s.pullQuote : null;
  const attribution = typeof s.pullQuoteAttribution === 'string' ? s.pullQuoteAttribution : null;
  return { text, attribution };
}

export function useMagazineLandingData(
  show: Show | null | undefined,
  currentTrial: Trial | null | undefined,
  allTrials: Trial[]
): MagazineLandingData {
  const showId = show?.id ?? '';
  const { data: entries = [] } = useEntriesByShowQuery(showId, !!showId);
  const entryCount = entries.length;

  const akc = getRegistry('AKC');
  const timezone = getTrialTimezone(currentTrial);

  return useMemo<MagazineLandingData>(() => {
    const liveExperience = show ? getLiveExperienceSnapshot(show) : null;
    const supplemental = liveExperience?.supplemental ?? null;
    const entryCloseDate = currentTrial?.entryCloseDate ?? show?.entryCloseDate ?? null;
    const trialStartDate = show?.startDate ?? null;
    const trialEndDate = show?.endDate ?? null;

    // Trials — sort by trial number, map to Magazine shape
    const trials: MagazineTrial[] = allTrials
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
        const trial: MagazineTrial = {
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

    // Judges — dedup by name and aggregate trial numerals + plate labels
    const judgeMap = new Map<string, { trials: string[]; elements: string[] }>();
    trials.forEach(t => {
      if (!t.judgeName) return;
      const lower = toLowerRoman(t.trialNumber);
      const existing = judgeMap.get(t.judgeName);
      if (existing) {
        existing.trials.push(lower);
      } else {
        judgeMap.set(t.judgeName, { trials: [lower], elements: [] });
      }
    });

    const judges: MagazineJudge[] = Array.from(judgeMap.entries()).map(([name, data], i) => ({
      id: `judge-${i}`,
      name,
      city: null,
      trials: data.trials,
      elements: data.elements,
      plateLabel: PLATE_LABELS[i] ?? `Plate ${i + 1}`,
      initials: deriveJudgeInitials(name),
      portraitUrl: null,
    }));

    // Fees
    const fees: MagazineFee[] = [];
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

    const pullQuoteParts = readOptionalPullQuote(supplemental);

    const clubName = show?.organization ?? '';

    return {
      clubName,
      monogramLetters: deriveMonogram(clubName),

      showName: show?.name ?? '',
      showSubtitle: `${akc.licenseLanguage} · ${allTrials.length} Trial${allTrials.length !== 1 ? 's' : ''}`,
      welcomeText: null,
      trialChairName: null,

      pullQuote: pullQuoteParts.text,
      pullQuoteAttribution: pullQuoteParts.attribution,

      entryOpenDate: show?.entryOpenDate ?? null,
      entryCloseDate: entryCloseDate ?? null,
      confirmationDate: currentTrial?.confirmationDate ?? null,
      trialStartDate,
      trialEndDate,
      timezone,

      venueName: null,
      venueAddress: show?.location ?? null,
      venueCity: null,

      coverImageUrl: supplemental?.coverImageUrl ?? null,
      coverCaption: null,

      trials,
      judges,

      entryCount,
      entryLimit,

      fees,
      officers: [],
      accommodations: supplemental?.accommodations ?? [],
      hospitalityNotes: supplemental?.hospitalityNotes ?? null,
      awardsDescription: supplemental?.awardsDescription ?? null,
      houseRulesNotes: null,

      secretaryName: null,
      secretaryEmail: null,

      licenseLanguage: akc.licenseLanguage,
      memberClubLanguage: akc.memberClubLanguage,

      journeySteps,

      entryWizardUrl: show?.id ? `/shows/${show.id}/register` : '/shows',
    };
  }, [show, currentTrial, allTrials, entryCount, akc, timezone]);
}
