import { formatTimeLimitSeconds, formatTrialLabel, parseStoredClockTime } from '@myk9/core';

import { compareClassesByProgression } from '@/features/premium/pdf/bodies/classOrder';
import { getTrialRegistry } from '@/features/registries';
import { buildPages, type PageData } from '@/pages/secretary/ReportsPage/reportPreviewPages';
import { lifecycleFor } from '../buildSecretaryCockpitSnapshot';
import { resolveClassJudgeName } from '@/utils/classJudgeDisplay';
import { selectPacketPages, toScoresheetModel } from '@/lib/reports/toScoresheetModel';
import type { ReportDataSet } from '@/lib/reports/types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

/** One class in a judge's packet. */
export interface TrialPacketClass {
  classId: string;
  /** "Container Novice B", as the check-in sheet names it. */
  label: string;
  /** Minute of the day the class starts, or null when it has no scheduled time. */
  startMinutes: number | null;
  /** The class's own time limit, "3:00", or "" when none is set. */
  maxTime: string;
  dogCount: number;
  /** Armbands in the order the dogs run: the order the scoresheet prints them. */
  runOrder: string[];
  checkInPages: number;
  scoreSheetPages: number;
  /** The one-class data the single-class print uses, so both outputs render the same pages. */
  dataSet: ReportDataSet;
}

/** Everything one judge receives for one trial. */
export interface TrialPacketJudge {
  /** Stable key: the judge's name, or `no-judge` for the classes nobody is assigned. */
  key: string;
  /** Null for the "No judge assigned" packet. */
  judgeName: string | null;
  classes: TrialPacketClass[];
  dogTotal: number;
  sheetTotal: number;
}

export interface CollatedTrialPacket {
  trial: DbTrial;
  trialLabel: string;
  registryName: string;
  judges: TrialPacketJudge[];
  /** Classes with no dogs entered: nothing to judge, so no sheets are printed for them. */
  emptyClassCount: number;
  /** Cancelled classes: the cockpit lists no paperwork for them, so none is printed or marked. */
  cancelledClassCount: number;
}

export const NO_JUDGE_KEY = 'no-judge';

function classLabel(classItem: DbClass): string {
  const section = classItem.section && classItem.section !== '-' ? classItem.section : '';
  return [classItem.element, classItem.level, section].filter(Boolean).join(' ') || '';
}

/**
 * The schedule's own order (secretaryCockpitClassLabel.compareCockpitClasses): scheduled time,
 * then the registry's element and level progression, then display order and name.
 */
function compareSchedule(registryId: string) {
  return (a: DbClass, b: DbClass): number => {
    const aTime = parseStoredClockTime(a.start_time);
    const bTime = parseStoredClockTime(b.start_time);
    if (aTime !== bTime) return (aTime ?? Infinity) - (bTime ?? Infinity);
    const progression = compareClassesByProgression(
      { element: a.element ?? '', level: a.level ?? '', section: a.section ?? null },
      { element: b.element ?? '', level: b.level ?? '', section: b.section ?? null },
      registryId as Parameters<typeof compareClassesByProgression>[2]
    );
    if (progression !== 0) return progression;
    return (
      (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER) ||
      (a.name ?? '').localeCompare(b.name ?? '')
    );
  };
}

function judgeKeyOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.toLowerCase() : NO_JUDGE_KEY;
}

/**
 * Groups one trial's classes into one packet per judge: classes in schedule order, dogs in run
 * order, and a "No judge assigned" packet last for classes nobody has. Reads the same mapped rows
 * the single-class print reads (`toScoresheetModel`), so a packet's pages for a class are the
 * pages its own Print shows.
 */
export function collateTrialPacket(input: {
  show: Show;
  trials: readonly DbTrial[];
  classes: readonly DbClass[];
  entries: readonly DbEntry[];
  trialId: string;
}): CollatedTrialPacket | null {
  const trial = input.trials.find(item => item.id === input.trialId);
  if (!trial) return null;
  const registry = getTrialRegistry(trial);
  const trialClasses = input.classes
    .filter(classItem => classItem.trial_id === input.trialId)
    .sort(compareSchedule(registry.id));

  const judges = new Map<string, TrialPacketJudge>();
  let emptyClassCount = 0;
  let cancelledClassCount = 0;
  for (const classItem of trialClasses) {
    // The cockpit's own predicate (classChecklist.ts: a cancelled class has no checklist items).
    if (lifecycleFor(classItem.status ?? undefined) === 'cancelled') {
      cancelledClassCount += 1;
      continue;
    }
    const pages: PageData[] = buildPages(
      input.trialId,
      classItem.id,
      [trial],
      [classItem] as DbClass[],
      input.entries as DbEntry[]
    );
    const page = pages[0];
    if (!page || page.entries.length === 0) {
      emptyClassCount += 1;
      continue;
    }
    const dataSet: ReportDataSet = { show: input.show, pages };
    const model = toScoresheetModel(dataSet, 'run-order');
    const checkIn = selectPacketPages(model, 'check-in');
    const scoreSheets = selectPacketPages(model, 'score-recording');
    const judgeName = resolveClassJudgeName(classItem, input.show.assignedJudges ?? [], '');
    const key = judgeKeyOf(judgeName);
    const packetClass: TrialPacketClass = {
      classId: classItem.id,
      label: classLabel(classItem) || (classItem.name ?? ''),
      startMinutes: parseStoredClockTime(classItem.start_time),
      maxTime: formatTimeLimitSeconds(classItem.time_limit_seconds),
      dogCount: page.entries.length,
      runOrder: scoreSheets.pages.flatMap(item => item.entries.map(entry => entry.armband ?? '')),
      checkInPages: checkIn.pages.length,
      scoreSheetPages: scoreSheets.pages.length,
      dataSet,
    };
    const existing = judges.get(key);
    if (existing) existing.classes.push(packetClass);
    else {
      judges.set(key, {
        key,
        judgeName: key === NO_JUDGE_KEY ? null : judgeName.trim(),
        classes: [packetClass],
        dogTotal: 0,
        sheetTotal: 0,
      });
    }
  }
  const ordered = [...judges.values()]
    .map(judge => ({
      ...judge,
      // The cover sheet is one page of every judge's packet.
      dogTotal: judge.classes.reduce((sum, item) => sum + item.dogCount, 0),
      sheetTotal:
        1 + judge.classes.reduce((sum, item) => sum + item.checkInPages + item.scoreSheetPages, 0),
    }))
    .sort((a, b) => Number(a.key === NO_JUDGE_KEY) - Number(b.key === NO_JUDGE_KEY));
  return {
    trial,
    // Named as the sheets' own footers name it: "Trial 1" when it has a number.
    trialLabel: trial.trial_number
      ? `Trial ${trial.trial_number}`
      : formatTrialLabel({ name: trial.name, trialNumber: trial.trial_number }),
    registryName: registry.name,
    judges: ordered,
    emptyClassCount,
    cancelledClassCount,
  };
}
