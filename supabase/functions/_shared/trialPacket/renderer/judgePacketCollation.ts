import type {
  EmergencyPacketClass,
  EmergencyPacketInput,
  EmergencyPacketModel,
  EmergencyPacketTrial,
} from './types.ts';
import { formatPacketSeconds } from './emergencyTrialPacket.ts';
import { isUnsetPacketJudge } from './printedClassHeader.ts';

/**
 * Collation of one trial's classes into one packet per judge (MYK9-2085). Pure and runtime
 * agnostic: no app aliases, no workspace imports, so the browser and the edge function group
 * and total a packet the same way. What needs app data (the registry's element order, reading
 * a stored clock time, which classes are cancelled) arrives as plain values or functions.
 */

/** What one class contributes to a judge's packet, besides the class itself. */
export interface PacketClassSheets {
  /** Dogs that run: the rows on the scoresheet. A class with none is left out of the packet. */
  dogCount: number;
  /** Armbands in the order the dogs run: the order the scoresheet prints them. */
  runOrder: string[];
  checkInPages: number;
  scoreSheetPages: number;
}

/** One class in a judge's packet. */
export type PacketJudgeClass<T = object> = T &
  PacketClassSheets & {
    classId: string;
    /** "Container Novice B", as the check-in sheet names it. */
    label: string;
    /** Minute of the day the class starts, or null when it has no scheduled time. */
    startMinutes: number | null;
    /** The class's own time limit, "3:00", or "" when none is set. */
    maxTime: string;
  };

/** Everything one judge receives for one trial. */
export interface PacketJudge<T = object> {
  /** Stable key: the judge's name, lower-cased, or `no-judge` for classes nobody is assigned. */
  key: string;
  /** Null for the "No judge assigned" packet. */
  judgeName: string | null;
  classes: PacketJudgeClass<T>[];
  dogTotal: number;
  sheetTotal: number;
}

/** The packet key for classes with no judge. Not a secret: compared through `isNoJudgePacket`. */
const NO_JUDGE = 'no-judge';
export const NO_JUDGE_KEY = NO_JUDGE;

/** Is this the no-judge packet? */
export function isNoJudgePacket(value: string): boolean {
  return value === NO_JUDGE;
}

/** A judge's dog and sheet totals for the classes it holds. */
export function withJudgeTotals<T>(judge: PacketJudge<T>): PacketJudge<T> {
  return {
    ...judge,
    dogTotal: judge.classes.reduce((sum, item) => sum + item.dogCount, 0),
    // The cover sheet is one page of every judge's packet.
    sheetTotal:
      1 + judge.classes.reduce((sum, item) => sum + item.checkInPages + item.scoreSheetPages, 0),
  };
}

function judgeKeyOf(name: string): string {
  // A stored "TBD" is an unset judge, so it joins the "No judge assigned" packet (MYK9-2377).
  return isUnsetPacketJudge(name) ? NO_JUDGE_KEY : name.trim().toLowerCase();
}

/** The label the check-in sheet gives the class: element, level and a real section. */
export function packetClassLabel(
  classItem: Pick<EmergencyPacketClass, 'element' | 'level' | 'section' | 'name'>
): string {
  const section = classItem.section && classItem.section !== '-' ? classItem.section : '';
  return [classItem.element, classItem.level, section].filter(Boolean).join(' ') || classItem.name;
}

/** Dogs and page counts for one class, read off its model's check-in and score-recording pages. */
export function summarizeClassSheets(model: EmergencyPacketModel): PacketClassSheets {
  const checkIn = model.pages.filter(page => page.kind === 'check-in');
  const scoreSheets = model.pages.filter(page => page.kind === 'score-recording');
  return {
    // The sheets leave off a moved-up source and a declined dog (MYK9-2082); the scoresheet
    // also leaves off a dog that will not run (MYK9-2387). The counts come from what prints.
    dogCount: scoreSheets.reduce((sum, page) => sum + page.entries.length, 0),
    runOrder: scoreSheets.flatMap(page => page.entries.map(entry => entry.armband ?? '')),
    checkInPages: checkIn.length,
    scoreSheetPages: scoreSheets.length,
  };
}

export interface CollateJudgePacketsOptions<T> {
  trialId: string;
  /** "Trial 1": named as the sheets' own footers name it. */
  trialLabel: string;
  registryName: string;
  /** Reads a stored clock time as minutes after midnight, or null when it is not one. */
  parseStartMinutes: (stored: string | null) => number | null;
  /** The registry's element and level progression; negative when `a` runs first. */
  compareProgression: (a: EmergencyPacketClass, b: EmergencyPacketClass) => number;
  /**
   * The class's sheets, or null when it prints none (no dogs). Whatever else the caller needs
   * to keep with the class (the app keeps the report data set) rides along on the result.
   */
  sheetsFor: (classItem: EmergencyPacketClass) => (PacketClassSheets & T) | null;
}

export interface CollatedJudgePackets<T = object> {
  trial: EmergencyPacketTrial;
  trialLabel: string;
  registryName: string;
  judges: PacketJudge<T>[];
  /** Classes with no dogs entered: nothing to judge, so no sheets are printed for them. */
  emptyClassCount: number;
}

/**
 * The schedule's own order: scheduled time, then the registry's progression, then display order
 * and name (secretaryCockpitClassLabel.compareCockpitClasses).
 */
function compareSchedule<T>(options: CollateJudgePacketsOptions<T>) {
  return (a: EmergencyPacketClass, b: EmergencyPacketClass): number => {
    const aTime = options.parseStartMinutes(a.startTime);
    const bTime = options.parseStartMinutes(b.startTime);
    if (aTime !== bTime) return (aTime ?? Infinity) - (bTime ?? Infinity);
    const progression = options.compareProgression(a, b);
    if (progression !== 0) return progression;
    return (
      (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name)
    );
  };
}

/**
 * Groups one trial's classes into one packet per judge: classes in schedule order, and a
 * "No judge assigned" packet last for classes nobody has. A class's `judgeName` is its judge as
 * the schedule names them, or empty when none is assigned. Null when the trial is not in `input`.
 */
export function collateJudgePackets<T = object>(
  input: EmergencyPacketInput,
  options: CollateJudgePacketsOptions<T>
): CollatedJudgePackets<T> | null {
  const trial = input.trials.find(item => item.id === options.trialId);
  if (!trial) return null;
  const trialClasses = input.classes
    .filter(classItem => classItem.trialId === options.trialId)
    .sort(compareSchedule(options));

  const judges = new Map<string, PacketJudge<T>>();
  let emptyClassCount = 0;
  for (const classItem of trialClasses) {
    const sheets = options.sheetsFor(classItem);
    if (!sheets || sheets.dogCount === 0) {
      emptyClassCount += 1;
      continue;
    }
    const key = judgeKeyOf(classItem.judgeName);
    const packetClass = {
      ...sheets,
      classId: classItem.id,
      label: packetClassLabel(classItem),
      startMinutes: options.parseStartMinutes(classItem.startTime),
      maxTime: formatPacketSeconds(classItem.timeLimitSeconds),
    } as PacketJudgeClass<T>;
    const existing = judges.get(key);
    if (existing) existing.classes.push(packetClass);
    else {
      judges.set(key, {
        key,
        judgeName: isNoJudgePacket(key) ? null : classItem.judgeName.trim(),
        classes: [packetClass],
        dogTotal: 0,
        sheetTotal: 0,
      });
    }
  }
  return {
    trial,
    trialLabel: options.trialLabel,
    registryName: options.registryName,
    judges: [...judges.values()]
      .map(withJudgeTotals)
      .sort((a, b) => Number(isNoJudgePacket(a.key)) - Number(isNoJudgePacket(b.key))),
    emptyClassCount,
  };
}
