/**
 * AKC Scent Work High in Trial (HIT) — Regulations Chapter 6, Sections 8 and 10.
 *
 * The rules this encodes, quoted where the wording decides an edge case:
 *
 * - **Offered only above one element.** "If a club offers more than one element
 *   (Container, Interior, Exterior, Buried) of a particular difficulty level, they are
 *   eligible to confer High in Trial" (§8). A level running a single element has no HIT.
 * - **Eligibility is all-or-nothing.** "Only teams who participate in the same difficulty
 *   level in all elements offered, and qualify in each" (§8).
 * - **Handler Discrimination is excluded** "even if offered at the trial" (§8).
 * - **Ranking** is summed faults, then summed time, then a coin flip (§8).
 * - **One winner per difficulty level** (§8).
 * - **Limited offerings** (§10): a level's HIT is computed over the elements available
 *   *at that level*, so Novice can run across three elements while Advanced runs across
 *   two in the same trial.
 *
 * Three things here are deliberate and easy to "simplify" into a bug:
 *
 * 1. `HIT_ELEMENTS` is an **allowlist, not a denylist**. Excluding only Handler
 *    Discrimination would be wrong twice over: `public.classes` is shared across
 *    registries and really does hold non-AKC elements ("Vehicle"), and AKC's own
 *    Detective class (Chapter 9) is an element in our registry config but is not one of
 *    the four Odor Search elements §8 names.
 * 2. Levels group **without section**. "Novice A and Novice B are different sections of
 *    the same class" (Chapter 2 §11), and §8 awards one HIT per *difficulty level* — so
 *    a dog running Container Novice A and Interior Novice B is one Novice team, and a
 *    trial offering both sections still confers exactly one Novice HIT.
 * 3. Ties are **surfaced, never resolved**. §8's tie-break is a coin flip, which is a
 *    human act. Picking a winner here would fabricate a result, which is exactly what
 *    the deleted `AwardsProcessor` mock did.
 *
 * High Combined Division (§9) is deliberately NOT implemented: our copy of the
 * regulations truncates mid-sentence at the page break after "participate in the same
 * difficulty level in all elements plus Handler Discrimination, and", and no AKC Scent
 * Work regulations PDF is in the repo to confirm the rest. Guessing a rule is worse than
 * omitting the award.
 */
import type { PacketArmband } from '@/features/emergency-trial-packet/armband';
import type { ReportEntry } from '@/lib/reports/types';
import { isQualified } from '@/lib/reports/reportUtils';
import { AKC_SCENT_WORK_LEVELS } from '@/lib/reports/entryFormTypes';

/** Chapter 7 §1 — the four Odor Search Division elements, the only ones §8 counts. */
export const HIT_ELEMENTS = ['Container', 'Interior', 'Exterior', 'Buried'] as const;

export type HitElement = (typeof HIT_ELEMENTS)[number];

/**
 * Entry statuses that mean the dog is not in the class. A `moved` entry is the vacated
 * half of a move-up and its replacement is a separate row, so counting it would demand a
 * qualifying score from a class the dog no longer ran.
 */
const NOT_ENTERED_STATUSES = new Set(['withdrawn', 'moved', 'cancelled']);

export interface HighInTrialElementScore {
  element: HitElement;
  faults: number;
  timeSeconds: number | null;
}

export interface HighInTrialTeam {
  /** Stable per dog within the trial; see `teamKey`. */
  key: string;
  armband: PacketArmband;
  callName: string;
  breed: string;
  handler: string;
  totalFaults: number;
  /** Null when any counted run is missing a time — such a team cannot win a tie-break. */
  totalTimeSeconds: number | null;
  elements: HighInTrialElementScore[];
  /** 1-based. Tied teams share a rank, and the next rank skips accordingly. */
  rank: number;
  /** How many teams share this rank; > 1 means §8's coin flip decides between them. */
  tiedCount: number;
}

export interface HighInTrialLevel {
  level: string;
  /** The elements offered at this level, in `HIT_ELEMENTS` order. */
  elements: HitElement[];
  /** Eligible teams only (entered and qualified in every element), ranked. */
  teams: HighInTrialTeam[];
  /** Entries at this level still awaiting a result. */
  pendingCount: number;
  /** False while any counted entry is unscored — the standing can still change. */
  isFinal: boolean;
  /** True when the top rank is shared and §8's coin flip is required. */
  needsCoinFlip: boolean;
}

export interface HighInTrialExclusion {
  element: string;
  level: string;
  reason: 'not-an-odor-search-element' | 'single-element-level';
}

export interface HighInTrialModel {
  levels: HighInTrialLevel[];
  /** Classes the report did not count, so the secretary can see the omission is intended. */
  exclusions: HighInTrialExclusion[];
}

export interface HighInTrialClassLike {
  id: string;
  element: string;
  level: string;
}

/**
 * Novice -> Master, so the report reads in progression order rather than in whatever
 * order the trial's classes happen to arrive. A level the constant does not know sorts
 * after the known ones instead of being dropped.
 */
function levelOrder(level: string): number {
  const index = (AKC_SCENT_WORK_LEVELS as readonly string[]).indexOf(level);
  return index === -1 ? AKC_SCENT_WORK_LEVELS.length : index;
}

function isHitElement(element: string): element is HitElement {
  return (HIT_ELEMENTS as readonly string[]).includes(element);
}

/**
 * `dogId` is the real identity, but it is optional on `ReportEntry`. Armband is unique
 * within a show and present on every entry that reached a class, so it is the fallback
 * rather than dropping the team.
 */
function teamKey(entry: ReportEntry): string | null {
  if (entry.dogId) return `dog:${entry.dogId}`;
  if (entry.armband != null && String(entry.armband).trim() !== '') {
    return `armband:${String(entry.armband)}`;
  }
  return null;
}

function isEntered(entry: ReportEntry): boolean {
  return !NOT_ENTERED_STATUSES.has((entry.entryStatus ?? '').toLowerCase());
}

/** Awaiting a result: entered, not scored, and carrying no result text yet. */
function isPending(entry: ReportEntry): boolean {
  if (!isEntered(entry)) return false;
  if (entry.isScored) return false;
  const text = entry.resultText?.trim().toLowerCase() ?? '';
  return text === '' || text === 'pending';
}

function compareTeams(a: HighInTrialTeam, b: HighInTrialTeam): number {
  if (a.totalFaults !== b.totalFaults) return a.totalFaults - b.totalFaults;
  // A team missing a time cannot be declared the faster one, so it sorts last among
  // equals rather than being treated as time zero.
  if (a.totalTimeSeconds == null && b.totalTimeSeconds == null) return 0;
  if (a.totalTimeSeconds == null) return 1;
  if (b.totalTimeSeconds == null) return -1;
  return a.totalTimeSeconds - b.totalTimeSeconds;
}

/** Assign 1-based ranks, sharing a rank across teams §8 cannot separate. */
function assignRanks(sorted: HighInTrialTeam[]): HighInTrialTeam[] {
  const ranked: HighInTrialTeam[] = [];
  let index = 0;

  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && compareTeams(sorted[index]!, sorted[end]!) === 0) end += 1;

    const tiedCount = end - index;
    for (let i = index; i < end; i += 1) {
      ranked.push({ ...sorted[i]!, rank: index + 1, tiedCount });
    }
    index = end;
  }

  return ranked;
}

/**
 * Compute High in Trial for one trial.
 *
 * `classes` must be the trial's classes — eligibility depends on which elements were
 * *offered*, which entries alone cannot tell you: an element nobody qualified in still
 * makes every team at that level ineligible.
 */
export function buildHighInTrial(input: {
  entries: readonly ReportEntry[];
  classes: readonly HighInTrialClassLike[];
}): HighInTrialModel {
  const { entries, classes } = input;
  const exclusions: HighInTrialExclusion[] = [];

  // Which elements each level offers. Section is deliberately not part of the key.
  const elementsByLevel = new Map<string, Set<HitElement>>();
  for (const cls of classes) {
    const level = cls.level?.trim() ?? '';
    const element = cls.element?.trim() ?? '';
    if (level === '' || element === '') continue;

    if (!isHitElement(element)) {
      exclusions.push({ element, level, reason: 'not-an-odor-search-element' });
      continue;
    }
    const set = elementsByLevel.get(level) ?? new Set<HitElement>();
    set.add(element);
    elementsByLevel.set(level, set);
  }

  const levels: HighInTrialLevel[] = [];

  for (const [level, elementSet] of elementsByLevel) {
    // §8: HIT exists only where more than one element runs at the level.
    if (elementSet.size < 2) {
      for (const element of elementSet) {
        exclusions.push({ element, level, reason: 'single-element-level' });
      }
      continue;
    }

    const offered = HIT_ELEMENTS.filter(element => elementSet.has(element));
    const levelEntries = entries.filter(
      entry =>
        (entry.classLevel?.trim() ?? '') === level &&
        isHitElement(entry.classElement?.trim() ?? '') &&
        elementSet.has((entry.classElement?.trim() ?? '') as HitElement)
    );

    const pendingCount = levelEntries.filter(isPending).length;

    // Best qualifying run per (team, element).
    const qualifyingByTeam = new Map<string, Map<HitElement, ReportEntry>>();
    const identityByTeam = new Map<string, ReportEntry>();

    for (const entry of levelEntries) {
      if (!isEntered(entry) || !isQualified(entry)) continue;
      const key = teamKey(entry);
      if (!key) continue;

      const element = (entry.classElement?.trim() ?? '') as HitElement;
      const perElement = qualifyingByTeam.get(key) ?? new Map<HitElement, ReportEntry>();
      const existing = perElement.get(element);
      // A dog should not qualify twice in one element at one level, but if the data says
      // so, count the better run rather than whichever happened to be first.
      if (
        !existing ||
        (entry.totalFaults ?? 0) < (existing.totalFaults ?? 0) ||
        ((entry.totalFaults ?? 0) === (existing.totalFaults ?? 0) &&
          (entry.searchTimeSeconds ?? Infinity) < (existing.searchTimeSeconds ?? Infinity))
      ) {
        perElement.set(element, entry);
      }
      qualifyingByTeam.set(key, perElement);
      if (!identityByTeam.has(key)) identityByTeam.set(key, entry);
    }

    const teams: HighInTrialTeam[] = [];
    for (const [key, perElement] of qualifyingByTeam) {
      // §8: qualified in EVERY element offered at this level.
      if (offered.some(element => !perElement.has(element))) continue;

      const identity = identityByTeam.get(key)!;
      const scores: HighInTrialElementScore[] = offered.map(element => {
        const entry = perElement.get(element)!;
        return {
          element,
          faults: entry.totalFaults ?? 0,
          timeSeconds: entry.searchTimeSeconds ?? null,
        };
      });

      const totalFaults = scores.reduce((sum, score) => sum + score.faults, 0);
      const totalTimeSeconds = scores.some(score => score.timeSeconds == null)
        ? null
        : scores.reduce((sum, score) => sum + (score.timeSeconds ?? 0), 0);

      teams.push({
        key,
        armband: identity.armband,
        callName: identity.callName,
        breed: identity.breed,
        handler: identity.handler,
        totalFaults,
        totalTimeSeconds,
        elements: scores,
        rank: 0,
        tiedCount: 1,
      });
    }

    const ranked = assignRanks([...teams].sort(compareTeams));

    levels.push({
      level,
      elements: offered,
      teams: ranked,
      pendingCount,
      isFinal: pendingCount === 0,
      needsCoinFlip: ranked.filter(team => team.rank === 1).length > 1,
    });
  }

  levels.sort((a, b) => {
    const byOrder = levelOrder(a.level) - levelOrder(b.level);
    return byOrder !== 0 ? byOrder : a.level.localeCompare(b.level);
  });

  return { levels, exclusions };
}
