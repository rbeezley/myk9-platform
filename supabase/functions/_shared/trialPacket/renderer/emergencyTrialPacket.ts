/**
 * No app-alias or workspace imports: this module is read verbatim by a Deno
 * edge function (MYK9-228 phase 2). `formatPacketSeconds` mirrors
 * `@myk9/core`'s `formatTimeLimitSeconds`, and a contract test asserts the two
 * agree so the copy cannot drift.
 */
function formatPacketSeconds(seconds?: number | null): string {
  if (!seconds || seconds === 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
import {
  EMERGENCY_PACKET_MARKER,
  type EmergencyPacketAvailability,
  type EmergencyPacketClass,
  type EmergencyPacketEntry,
  type EmergencyPacketInput,
  type EmergencyPacketModel,
  type EmergencyPacketPage,
  type EmergencyPacketPageContext,
  type EmergencyPacketPageKind,
  type EmergencyPacketDay,
  type EmergencyPacketTrial,
  type PacketReportEntry,
} from './types.ts';
import { resolveScoresheetConfig } from './scoresheetConfig.ts';

const CATALOG_ROWS_PER_PAGE = 24;
const CHECK_IN_ROWS_PER_PAGE = 20;

/**
 * Measured, not guessed. A per-dog block is `SCORE_BLOCK_HEIGHT_MM` (36mm,
 * `buildEmergencyTrialPacketPdf.ts`) and the class header above it is 1-4
 * lines (`maxDetailLinesForKind('score-recording')` caps it at 4), so the
 * table's top edge lands between y=42 (one line) and y=57 (four lines,
 * `TITLE_BASE_Y + (lines-1) * DETAIL_LINE_HEIGHT`). Against the footer at
 * y=271.4mm that is 6 blocks of headroom for a typical class (measured:
 * trial/date/ring/class/hides/distractions/judge routinely wraps to 3 lines)
 * but only 5 for a class whose identity is long enough to hit the 4-line
 * ceiling (long trial name, long class name, and a long judge name, measured
 * directly) — at 6 blocks that worst case ends at 273mm, 1.6mm past the
 * footer.
 *
 * The renderer draws an IDENTICAL header on every score-recording page of a
 * class — there is no compact continuation header — so a class that hits the
 * 4-line ceiling on page 1 hits it on every later page too. A first-page/
 * continuation split therefore cannot safely use a bigger number on
 * continuations: whichever page overflows, it overflows on paper a judge
 * keeps for a year. Both constants are kept (Task 6 imports both by name)
 * but hold the same worst-case-safe value.
 */
const SCORE_ROWS_FIRST_PAGE = 5;
const SCORE_ROWS_CONTINUATION = 5;

function compareText(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { numeric: true, sensitivity: 'base' });
}

function compareTrials(a: EmergencyPacketTrial, b: EmergencyPacketTrial): number {
  return (
    compareText(a.date, b.date) ||
    compareText(a.trialNumber, b.trialNumber) ||
    compareText(a.id, b.id)
  );
}

function compareClasses(a: EmergencyPacketClass, b: EmergencyPacketClass): number {
  const displayOrderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const displayOrderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
  return (
    displayOrderA - displayOrderB ||
    compareText(a.classNumber, b.classNumber) ||
    compareText(a.element, b.element) ||
    compareText(a.level, b.level) ||
    compareText(a.section, b.section) ||
    compareText(a.id, b.id)
  );
}

function compareEntries(a: PacketReportEntry, b: PacketReportEntry): number {
  const runOrderA = a.runOrder ?? Number.MAX_SAFE_INTEGER;
  const runOrderB = b.runOrder ?? Number.MAX_SAFE_INTEGER;
  return runOrderA - runOrderB || a.armband - b.armband || compareText(a.id, b.id);
}

function chunks<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/**
 * Like `chunks`, but the first page can hold a different count than every
 * page after it. Whole blocks only: never split a dog's block across two
 * pages, so a ragged bottom (fewer rows on the last page) is accepted
 * instead of shrinking a row to make it fit.
 *
 * Unlike `chunks`, an empty list produces zero pages, not one blank page —
 * a cancelled class with no entries must not print an empty score sheet in
 * the middle of the packet.
 */
function chunksWithFirst<T>(items: T[], first: number, rest: number): T[][] {
  if (items.length === 0) return [];
  const pages = [items.slice(0, first)];
  for (let index = first; index < items.length; index += rest) {
    pages.push(items.slice(index, index + rest));
  }
  return pages;
}

function classLabel(classItem: EmergencyPacketClass): string {
  const identity = [classItem.element, classItem.level, classItem.section]
    .filter(Boolean)
    .join(' ');
  return classItem.classNumber
    ? `${classItem.classNumber} · ${identity}`
    : identity || classItem.name;
}

function trialLabel(trial: EmergencyPacketTrial): string {
  return trial.trialNumber ? `Trial ${trial.trialNumber}` : trial.name;
}

function packetEntry(entry: PacketReportEntry): EmergencyPacketEntry {
  return {
    ...entry,
    checkInMark: '',
    resultMark: '',
    runOrderDisplay: entry.runOrder == null ? '' : String(entry.runOrder),
  };
}

function baseContext(input: EmergencyPacketInput): EmergencyPacketPageContext {
  // A per-day packet must say which DAY it is for, on the cover and in every
  // footer — that is what stops two evenings' stacks being confused. Derive it
  // from the trials actually present rather than the show's span, so the same
  // builder serves both a per-day packet and a whole-show one.
  const dates = [...new Set(input.trials.map(trial => trial.date).filter(Boolean))].sort();
  if (dates.length === 1) return { showName: input.show.name, trialDate: dates[0] };
  if (dates.length > 1) {
    return { showName: input.show.name, trialDate: `${dates[0]}–${dates[dates.length - 1]}` };
  }
  return {
    showName: input.show.name,
    trialDate:
      input.show.startDate === input.show.endDate
        ? input.show.startDate
        : `${input.show.startDate}–${input.show.endDate}`,
  };
}

function page(
  input: EmergencyPacketInput,
  kind: EmergencyPacketPageKind,
  title: string,
  context: EmergencyPacketPageContext,
  entries: PacketReportEntry[] = []
): Omit<EmergencyPacketPage, 'pageNumber'> {
  return {
    kind,
    title,
    marker: EMERGENCY_PACKET_MARKER,
    generatedAt: input.generatedAt,
    context,
    entries: entries.map(packetEntry),
  };
}

export function emergencyPacketAvailability(
  input: Pick<EmergencyPacketInput, 'trials' | 'classes' | 'entries'>
): EmergencyPacketAvailability {
  if (input.trials.length === 0) {
    return { available: false, reason: 'Add a trial before preparing the emergency packet.' };
  }
  if (input.classes.length === 0) {
    return { available: false, reason: 'Add classes before preparing the emergency packet.' };
  }
  if (input.entries.length === 0) {
    return { available: false, reason: 'No entries are ready for an emergency packet yet.' };
  }
  return { available: true };
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

/**
 * One packet per trial DAY, not per show and not per trial (MYK9-228).
 *
 * A show is the whole event; a trial is a unit inside it, and a day can hold
 * several — the seeded Heartland weekend runs one trial on Saturday and three
 * on Sunday, under three different sanctioning bodies.
 *
 * Per-show is wrong for a nightly trigger: regenerating each evening reprints
 * the previous day's spent pages and leaves two near-identical stacks, the
 * confusion the packet's own recovery page warns about. Per-trial is too
 * granular to deliver: a three-trial Sunday becomes three links, three print
 * jobs, three things to mislay. The per-trial STRUCTURE still matters and is
 * preserved inside each day's packet, which is what keeps a separate
 * certification page per sanctioning body.
 *
 * This partitions the INPUT and reuses `buildEmergencyPacketModel` unchanged,
 * so a per-day packet cannot drift from the whole-show one.
 */
export function splitPacketInputByTrialDay(input: EmergencyPacketInput): EmergencyPacketDay[] {
  const byDate = new Map<string, EmergencyPacketTrial[]>();
  for (const trial of [...input.trials].sort(compareTrials)) {
    const existing = byDate.get(trial.date);
    if (existing) existing.push(trial);
    else byDate.set(trial.date, [trial]);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([trialDate, trials]) => {
      const trialIds = new Set(trials.map(trial => trial.id));
      const classes = input.classes.filter(classItem => trialIds.has(classItem.trialId));
      const classIds = new Set(classes.map(classItem => classItem.id));
      return {
        trialDate,
        input: {
          ...input,
          trials,
          classes,
          // Match on trialId OR classId, exactly as the model builder does. A
          // stricter filter here would silently drop entries the packet would
          // otherwise have rendered.
          entries: input.entries.filter(
            entry =>
              (entry.trialId ? trialIds.has(entry.trialId) : false) ||
              (entry.classId ? classIds.has(entry.classId) : false)
          ),
        },
      };
    });
}

export function buildEmergencyPacketModel(input: EmergencyPacketInput): EmergencyPacketModel {
  const sortedTrials = [...input.trials].sort(compareTrials);
  const sortedClasses = [...input.classes].sort(compareClasses);
  const sortedEntries = [...input.entries].sort(compareEntries);
  const trialSections = sortedTrials.map(trial => ({
    ...trial,
    classes: sortedClasses.filter(classItem => classItem.trialId === trial.id),
  }));
  const pendingPages: Array<Omit<EmergencyPacketPage, 'pageNumber'>> = [
    page(input, 'cover', 'Emergency Trial Packet', baseContext(input)),
  ];

  for (const trial of trialSections) {
    const trialClassIds = new Set(trial.classes.map(classItem => classItem.id));
    const trialEntries = sortedEntries.filter(
      entry =>
        entry.trialId === trial.id || (entry.classId ? trialClassIds.has(entry.classId) : false)
    );
    const context: EmergencyPacketPageContext = {
      showName: input.show.name,
      trialDate: trial.date,
      trialLabel: trialLabel(trial),
    };

    chunks(trialEntries, CATALOG_ROWS_PER_PAGE).forEach((entries, index, pages) => {
      const suffix = pages.length > 1 ? ` (${index + 1}/${pages.length})` : '';
      pendingPages.push(page(input, 'catalog', `Entry Catalog${suffix}`, context, entries));
    });

    for (const classItem of trial.classes) {
      const classEntries = sortedEntries.filter(entry => entry.classId === classItem.id);
      const classContext: EmergencyPacketPageContext = {
        ...context,
        ringLabel: classItem.ringLabel || undefined,
        classLabel: classLabel(classItem),
        judgeName: classItem.judgeName || 'Judge unassigned',
        timeLimitLabel: formatClassTimeLimits(classItem),
        areaCount: resolveAreaCount(classItem),
        registryId: classItem.registryId ?? trial.registryId,
        numHides: classItem.numHides,
        distractionCount: classItem.distractionCount,
      };

      chunks(classEntries, CHECK_IN_ROWS_PER_PAGE).forEach((entries, index, pages) => {
        const suffix = pages.length > 1 ? ` (${index + 1}/${pages.length})` : '';
        pendingPages.push(
          page(input, 'check-in', `Check-in & Running Order${suffix}`, classContext, entries)
        );
      });
      // Title carries the registry's own vocabulary (`orgTitle`) rather than a
      // hard-coded "Score Recording" — the whole point of a per-registry
      // scoresheet config is that it has visible, testable surface, not just a
      // reason-list lookup nothing ever reads. Keep the `(n/m)` suffix intact:
      // pagination identifies a continuation page by matching it.
      const scoresheetTitle = `${resolveScoresheetConfig(classContext.registryId).orgTitle} Scoresheet`;
      chunksWithFirst(classEntries, SCORE_ROWS_FIRST_PAGE, SCORE_ROWS_CONTINUATION).forEach(
        (entries, index, pages) => {
          const suffix = pages.length > 1 ? ` (${index + 1}/${pages.length})` : '';
          pendingPages.push(
            page(input, 'score-recording', `${scoresheetTitle}${suffix}`, classContext, entries)
          );
        }
      );
    }

    pendingPages.push(page(input, 'certification', 'Judge & Secretary Certification', context));
  }

  pendingPages.push(page(input, 'transcription', 'Paper Results Recovery', baseContext(input)));

  return {
    generatedAt: input.generatedAt,
    show: input.show,
    trials: trialSections,
    pages: pendingPages.map((item, index) => ({ ...item, pageNumber: index + 1 })),
  };
}

export function formatEmergencyPacketPageLabel(pageItem: EmergencyPacketPage): string {
  return [
    pageItem.context.showName,
    pageItem.context.trialDate,
    pageItem.context.ringLabel,
    pageItem.context.classLabel,
  ]
    .filter(Boolean)
    .join(' · ');
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export function buildEmergencyPacketFilename(showName: string, generatedAt: string): string {
  const timestamp = generatedAt.replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
  return `${slugify(showName) || 'show'}-emergency-packet-${timestamp}.pdf`;
}

export function buildEmergencyPacketStoragePath(showId: string, snapshotId: string): string {
  if (!showId.trim() || !snapshotId.trim()) throw new Error('Show and snapshot IDs are required');
  if (showId.includes('/') || snapshotId.includes('/'))
    throw new Error('Packet IDs cannot contain slashes');
  return `${showId}/${snapshotId}.pdf`;
}
