/**
 * What the top of a class's check-in sheet and scoresheet prints, in ONE place (MYK9-2103).
 *
 * The renderer builds each class page's context from `printedClassHeader`, and the print
 * fingerprint (`_shared/paperwork/printedSheet.ts`) hashes `printedClassFacts` of the same header,
 * so the paper and its "changed since printing" verdict cannot drift apart.
 *
 * No app-alias or workspace imports: this module is read verbatim by a Deno edge function.
 * `formatPacketSeconds` mirrors `@myk9/core`'s `formatTimeLimitSeconds`, and a contract test asserts
 * the two agree so the copy cannot drift.
 */
import { formatPacketTrialLabel } from './packetClassOrder.ts';
import { resolveScoresheetConfig } from './scoresheetConfig.ts';
import type {
  EmergencyPacketClass,
  EmergencyPacketPageContext,
  EmergencyPacketTrial,
} from './types.ts';

/**
 * What a class nobody judges prints (MYK9-2377). The same wording the app uses for an unset
 * judge (`UNSET_JUDGE_LABEL`); it reads as a whole line, so the sheet prints it without a
 * "Judge: " prefix. Duplicated here because this module has no app imports.
 */
export const PACKET_UNSET_JUDGE_LABEL = 'Judge to be announced';

/** The legacy stored text for an unset judge; the Reports mapping still hands it over. */
export function isUnsetPacketJudge(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim();
  return trimmed === '' || trimmed === 'TBD';
}

/** The sheet's judge line: "Judge: Name", or the whole-line "Judge to be announced". */
export function judgeDetailLine(judgeName: string | undefined): string | undefined {
  if (!judgeName) return undefined;
  return judgeName === PACKET_UNSET_JUDGE_LABEL ? judgeName : `Judge: ${judgeName}`;
}

export function formatPacketSeconds(seconds?: number | null): string {
  if (!seconds || seconds === 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function classLabel(classItem: EmergencyPacketClass): string {
  const identity = [classItem.element, classItem.level, classItem.section]
    .filter(Boolean)
    .join(' ');
  return classItem.classNumber
    ? `${classItem.classNumber} · ${identity}`
    : identity || classItem.name;
}

/**
 * The class maximum, stated on every page a judge or timekeeper writes on.
 *
 * Two traps, both caught in review and both reachable in live data:
 *
 *  1. The three limit columns are INDEPENDENTLY nullable. Compacting the
 *     configured values renumbers them, so an area-3 limit prints as "Area 2".
 *     A wrong number on the sheet the ring times from is worse than no number,
 *     so each limit keeps its own area index and a missing one is named.
 *  2. `num_areas` is the authoritative area count, not "how many limits happen
 *     to be filled in". A class with two areas and only an area-1 limit would
 *     otherwise print a bare "Max time 3:00" and imply a single-area search.
 *     Naming the gap lets the secretary write it in at the briefing.
 *
 * Returns undefined when nothing is configured at all: on a page the ring runs
 * on, silence beats a confident "Max time 0:00".
 */
/**
 * `classes` stores only THREE per-area limits, and sport_class_rules tops out
 * at three areas, but nothing in the schema constrains num_areas. Clamping to
 * three silently dropped the rest; naming them with no limit is the truth,
 * since the system has nowhere to record one. MAX_AREAS is a defensive bound
 * so a data-entry typo cannot run the header (or the scoresheet's time stack)
 * off the page.
 */
const MAX_AREAS = 10;

/**
 * The authoritative area count for a class: `num_areas` when set, but never
 * lower than the highest per-area time limit actually configured (a class
 * with two areas and only an area-1 limit still searches area 2).
 *
 * Exported so the scoresheet's per-dog time stack (`buildEmergencyTrialPacketPdf.ts`)
 * and this file's own `formatClassTimeLimits` share ONE area count rather than
 * two computations that can drift.
 */
export function resolveAreaCount(classItem: {
  timeLimitSeconds: number | null;
  timeLimitArea2Seconds?: number | null;
  timeLimitArea3Seconds?: number | null;
  numAreas?: number | null;
}): number {
  const configured = [
    classItem.timeLimitSeconds,
    classItem.timeLimitArea2Seconds,
    classItem.timeLimitArea3Seconds,
  ].map(seconds => formatPacketSeconds(seconds));
  const highestConfigured = configured.reduce(
    (highest, label, index) => (label === '' ? highest : index + 1),
    1
  );
  return Math.min(MAX_AREAS, Math.max(classItem.numAreas ?? 1, highestConfigured));
}

export function formatClassTimeLimits(classItem: {
  timeLimitSeconds: number | null;
  timeLimitArea2Seconds?: number | null;
  timeLimitArea3Seconds?: number | null;
  numAreas?: number | null;
}): string | undefined {
  const configured = [
    classItem.timeLimitSeconds,
    classItem.timeLimitArea2Seconds,
    classItem.timeLimitArea3Seconds,
  ].map(seconds => formatPacketSeconds(seconds));

  if (configured.every(label => label === '')) return undefined;

  // Report every area the class searches, and never hide a limit configured
  // beyond that count — a stale value is still information the ring can use.
  const areaCount = resolveAreaCount(classItem);

  if (areaCount === 1) {
    return configured[0] === '' ? undefined : `Max time ${configured[0]}`;
  }

  return `Max time — ${Array.from({ length: areaCount }, (_, index) => {
    const label = configured[index] ?? '';
    return `Area ${index + 1} ${label === '' ? 'not set' : label}`;
  }).join(' · ')}`;
}

export type PrintedSheetKind = 'check-in' | 'scoresheet';

/** The class-level context both sheets print under their title, beneath the show name. */
export type PrintedClassHeader = Required<
  Pick<
    EmergencyPacketPageContext,
    'trialLabel' | 'trialDate' | 'classLabel' | 'judgeName' | 'areaCount'
  >
> &
  Pick<
    EmergencyPacketPageContext,
    'ringLabel' | 'timeLimitLabel' | 'registryId' | 'numHides' | 'distractionCount'
  >;

/**
 * The class header the renderer prints. A class with no judge (blank, or the legacy "TBD") prints "Judge to be announced"; the
 * class's own registry (falling back to the trial's) picks the scoresheet's title wording.
 */
export function printedClassHeader(
  classItem: EmergencyPacketClass,
  trial: Pick<EmergencyPacketTrial, 'date' | 'name' | 'trialNumber' | 'registryId'>
): PrintedClassHeader {
  return {
    trialLabel: formatPacketTrialLabel(trial),
    trialDate: trial.date,
    ringLabel: classItem.ringLabel || undefined,
    classLabel: classLabel(classItem),
    judgeName: isUnsetPacketJudge(classItem.judgeName)
      ? PACKET_UNSET_JUDGE_LABEL
      : classItem.judgeName.trim(),
    timeLimitLabel: formatClassTimeLimits(classItem),
    areaCount: resolveAreaCount(classItem),
    registryId: classItem.registryId ?? trial.registryId,
    numHides: classItem.numHides,
    distractionCount: classItem.distractionCount,
  };
}

/**
 * The header facts one sheet kind prints. The check-in sheet carries no hides, distractions,
 * area count or registry title; the scoresheet carries all of them (the area count draws its
 * per-dog time boxes, the registry its title).
 */
export function printedClassFacts(
  header: PrintedClassHeader,
  kind: PrintedSheetKind
): Record<string, unknown> {
  const common = {
    trialLabel: header.trialLabel,
    trialDate: header.trialDate,
    ringLabel: header.ringLabel ?? null,
    classLabel: header.classLabel,
    judgeName: header.judgeName,
    timeLimitLabel: header.timeLimitLabel ?? null,
  };
  if (kind === 'check-in') return common;
  return {
    ...common,
    areaCount: header.areaCount,
    hides: header.numHides ?? null,
    distractions: header.distractionCount ?? null,
    title: resolveScoresheetConfig(header.registryId).orgTitle,
  };
}
