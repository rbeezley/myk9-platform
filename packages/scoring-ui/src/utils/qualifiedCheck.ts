/**
 * What a Qualified needs before it can be saved (MYK9-2004): a time above zero
 * and at or under the limit for every area, and a fault count within the
 * registry's limit. Pure, so the hook, the sheets and the tests share one answer.
 *
 * The app never changes the result itself: these return the sentence the judge
 * reads, and Save stays off until the judge fixes the sheet or picks NQ.
 */

import { formatDuration, parseDuration } from '@myk9/core';
import type { AreaScore, ResolvedClassRules, ScoresheetSportType } from '../types';
import { maxTimeForArea } from './buildResolvedClassRules';
import { maxTimeLabel } from './maxTimeLabel';

/** A registry's most faults a Qualified may carry. */
export interface FaultLimit {
  max: number;
  /** "UKC" or "ASCA", for the sentence. */
  registry: string;
}

/**
 * Fault limits from the rulebooks (docs/rulebooks): UKC Nosework allows one fault
 * in every class (Section 9); ASCA allows two in Novice and Open (5.5.2, 6.5.2)
 * and one in Advanced and Excellent (7.5.1, 8.5.2). AKC has none: faults there
 * only affect placement. A level that is not recognised has no limit rather than
 * a guessed one.
 */
export function faultLimitFor(
  sportType: ScoresheetSportType | undefined,
  level: string | undefined
): FaultLimit | undefined {
  if (sportType === 'UKC_NOSEWORK') return { max: 1, registry: 'UKC' };
  if (sportType === 'ASCA_SCENT_DETECTION' && level) {
    const lvl = level.toLowerCase();
    if (lvl.includes('novice') || lvl.includes('open')) return { max: 2, registry: 'ASCA' };
    if (lvl.includes('advanced') || lvl.includes('excellent')) return { max: 1, registry: 'ASCA' };
  }
  return undefined;
}

/** "3:40", or "3:40.50" when there are hundredths. */
function shortTime(seconds: number): string {
  return formatDuration(seconds, 'search').replace(/\.00$/, '');
}

/**
 * One sentence per area, or null where the area is fine. A typed time that is not
 * a time yet is left to the unresolved-time check, which already refuses it.
 *
 * `mayStayBlank` is for a correction of a score whose area times were never all
 * stored (Nationals, until MYK9-2068): an area it names may stay blank, and since
 * the per-area limit cannot be judged without every area, the times that are there
 * are checked against the class time as a total instead.
 */
export function qualifiedTimeProblems(
  areas: Pick<AreaScore, 'time'>[],
  rules: ResolvedClassRules,
  mayStayBlank?: (index: number) => boolean
): (string | null)[] {
  const incomplete =
    !!mayStayBlank && areas.some((a, i) => a.time.trim() === '' && mayStayBlank(i));
  const problems = areas.map((area, index) => {
    if (area.time.trim() === '') {
      return mayStayBlank?.(index) ? null : 'Add a time to save a Qualified';
    }
    const parsed = parseDuration(area.time, 'search');
    if (!parsed.ok) return null;
    if (parsed.seconds <= 0) return 'Add a time to save a Qualified';
    const limit = incomplete ? 0 : maxTimeForArea(rules, index);
    if (limit > 0 && parsed.seconds > limit) {
      return `${shortTime(parsed.seconds)} is over the ${maxTimeLabel(limit)} limit. Fix the time, or choose NQ.`;
    }
    return null;
  });
  if (incomplete && rules.maxTimeSeconds > 0) {
    const total = areas.reduce((sum, a) => {
      const parsed = parseDuration(a.time, 'search');
      return parsed.ok ? sum + parsed.seconds : sum;
    }, 0);
    const first = problems.findIndex((p, i) => p === null && areas[i]!.time.trim() !== '');
    if (total > rules.maxTimeSeconds && first >= 0) {
      problems[first] =
        `${shortTime(total)} in all is over the ${maxTimeLabel(rules.maxTimeSeconds)} class limit. Fix the time, or choose NQ.`;
    }
  }
  return problems;
}

/** The sentence for a Qualified over the registry's fault limit, or null. */
export function qualifiedFaultProblem(
  faultCount: number,
  limit: FaultLimit | undefined
): string | null {
  if (!limit || faultCount <= limit.max) return null;
  return `${faultCount} faults is over the ${limit.registry} limit of ${limit.max}. Remove a fault, or choose NQ.`;
}
