/**
 * ASCA Scent Detection High in Trial (HIT): Program Rules §1.10
 * (`docs/rulebooks/asca-scent-detection-rules.txt`).
 *
 * The ranking engine is the shared `buildCombinedAward`; this file supplies only what is
 * ASCA's own, and none of it is inherited from the AKC rules in `highInTrial.ts`:
 *
 * - **§1.10.1 Optional.** Offering HIT is the host club's choice. The owner prefers
 *   automatic over settings, so there is no club switch: the standing is shown for every
 *   level that ran two or more elements, and a level with one element is reported as
 *   having no HIT.
 * - **§1.10.2 One winner per level offered.** Levels group without section.
 * - **§1.10.3 Eligibility and ranking.** Only teams entered in the same level of each
 *   element offered, and qualified in each, are eligible. Faults are summed, then times;
 *   fewest faults then lowest time wins; a tie on both is a coin flip. The coin flip is a
 *   human act, so a full tie is surfaced (`needsCoinFlip`) and never resolved here.
 * - **§1.10.4 More than one level.** A team entered in more than one level at the trial is
 *   ineligible. AKC has no equivalent.
 * - **§1.10.5 Level C.** A team entered in Level C of any level is ineligible, and a Level C
 *   class is not one of the elements offered for the level's HIT.
 *
 * `ASCA_HIT_ELEMENTS` is ASCA's element list (Container, Interior, Exterior, Vehicle). It
 * has no Handler Discrimination and no High Combined Division, and no Buried: ASCA names
 * none of them. Champion is a level of its own, not an element, so it is not listed.
 */
import type { ReportEntry } from '@/lib/reports/types';
import { buildCombinedAward, isEntered, teamKey } from '@/lib/reports/highInTrial';
import type { HighInTrialClassLike, HighInTrialModel } from '@/lib/reports/highInTrial';

export const ASCA_HIT_ELEMENTS = ['Container', 'Interior', 'Exterior', 'Vehicle'] as const;

export type AscaHitElement = (typeof ASCA_HIT_ELEMENTS)[number];

/** Novice -> Excellent, so levels read in progression order. */
const ASCA_LEVEL_ORDER = ['Novice', 'Open', 'Advanced', 'Excellent', 'Champion'];

export interface AscaHitClassLike extends HighInTrialClassLike {
  /** `classes.section`; 'C' is Level C (a continuation class alongside the base level). */
  section?: string | null;
}

export interface AscaHitIneligibleTeam {
  key: string;
  armband: ReportEntry['armband'];
  callName: string;
  handler: string;
  /** Levels the team is entered in, in progression order. */
  levels: string[];
  /** §1.10.4 (more than one level) takes precedence over §1.10.5 (Level C). */
  reason: 'multiple-levels' | 'level-c';
}

export interface AscaHighInTrialModel extends HighInTrialModel<AscaHitElement> {
  ineligible: AscaHitIneligibleTeam[];
}

function isLevelC(section: string | null | undefined): boolean {
  return (section ?? '').trim().toUpperCase() === 'C';
}

function levelRank(level: string): number {
  const index = ASCA_LEVEL_ORDER.indexOf(level);
  return index === -1 ? ASCA_LEVEL_ORDER.length : index;
}

export function buildAscaHighInTrial(input: {
  entries: readonly ReportEntry[];
  classes: readonly AscaHitClassLike[];
}): AscaHighInTrialModel {
  const levelCClassIds = new Set(input.classes.filter(c => isLevelC(c.section)).map(c => c.id));
  const cancelledClassIds = new Set(
    input.classes.filter(c => (c.status ?? '').toLowerCase() === 'cancelled').map(c => c.id)
  );
  const inLevelC = (entry: ReportEntry) =>
    isLevelC(entry.classSection) || (entry.classId != null && levelCClassIds.has(entry.classId));

  // §1.10.4 / §1.10.5: who is entered where, across every class at the trial.
  const byTeam = new Map<string, { entry: ReportEntry; levels: Set<string>; levelC: boolean }>();
  for (const entry of input.entries) {
    const level = entry.classLevel?.trim() ?? '';
    const key = teamKey(entry);
    if (!key || level === '' || !isEntered(entry)) continue;
    if (entry.classId != null && cancelledClassIds.has(entry.classId)) continue;
    const team = byTeam.get(key) ?? { entry, levels: new Set<string>(), levelC: false };
    team.levels.add(level);
    team.levelC ||= inLevelC(entry);
    byTeam.set(key, team);
  }

  const ineligible: AscaHitIneligibleTeam[] = [];
  for (const [key, team] of byTeam) {
    if (team.levels.size <= 1 && !team.levelC) continue;
    ineligible.push({
      key,
      armband: team.entry.armband,
      callName: team.entry.callName,
      handler: team.entry.handler,
      levels: [...team.levels].sort((a, b) => levelRank(a) - levelRank(b)),
      reason: team.levels.size > 1 ? 'multiple-levels' : 'level-c',
    });
  }
  const ineligibleKeys = new Set(ineligible.map(team => team.key));

  const model = buildCombinedAward(
    {
      // Level C classes are not elements of the level's HIT, and an ineligible team must
      // neither rank nor hold a level open awaiting a result (§1.10.4, §1.10.5).
      entries: input.entries.filter(entry => {
        const key = teamKey(entry);
        return !inLevelC(entry) && !(key && ineligibleKeys.has(key));
      }),
      classes: input.classes.filter(cls => !isLevelC(cls.section)),
    },
    { elements: ASCA_HIT_ELEMENTS, minimumElements: 2 }
  );

  model.levels.sort((a, b) => levelRank(a.level) - levelRank(b.level));
  ineligible.sort((a, b) =>
    String(a.armband).localeCompare(String(b.armband), undefined, { numeric: true })
  );
  return { ...model, ineligible };
}
