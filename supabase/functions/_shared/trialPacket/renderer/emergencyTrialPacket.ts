/**
 * No app-alias or workspace imports: this module is read verbatim by a Deno
 * edge function (MYK9-228 phase 2). `formatPacketSeconds` mirrors
 * `@myk9/core`'s `formatTimeLimitSeconds`, and a contract test asserts the two
 * agree so the copy cannot drift.
 */
import { compareArmbands } from './armband.ts';
import { printedClassHeader } from './printedClassHeader.ts';
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
import { formatPacketTrialLabel } from './packetClassOrder.ts';
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
 *
 * Exported (not just Task 6's import) so `buildEmergencyTrialPacketPdf.test.ts`
 * can assert the geometry directly — `SCORE_ROWS_FIRST_PAGE * SCORE_BLOCK_HEIGHT_MM`
 * plus the worst-case header must never exceed the footer position — rather
 * than trusting this comment to stay in sync with either module by hand.
 */
export const SCORE_ROWS_FIRST_PAGE = 5;
export const SCORE_ROWS_CONTINUATION = 5;

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

export function compareEntries(a: PacketReportEntry, b: PacketReportEntry): number {
  const runOrderA = a.runOrder ?? Number.MAX_SAFE_INTEGER;
  const runOrderB = b.runOrder ?? Number.MAX_SAFE_INTEGER;
  // Armband ordering is the shared contract's, not a numeric subtraction:
  // a suffixed "12A" sorts beside 12, and an unassigned dog sorts LAST
  // rather than leading the running order as the old `0` sentinel did
  // (MYK9-243).
  return runOrderA - runOrderB || compareArmbands(a.armband, b.armband) || compareText(a.id, b.id);
}

/**
 * The check-in sheet's order (MYK9-2387): every dog that runs, in `compareEntries` order, then
 * every dog that will not (Pending, Withdrawn, Pulled, Absent) in the same order. The catalog and
 * the print fingerprint's scoresheet use `compareEntries` alone.
 */
export function compareCheckInEntries(a: PacketReportEntry, b: PacketReportEntry): number {
  return Number(!!a.notRunningLabel) - Number(!!b.notRunningLabel) || compareEntries(a, b);
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

/**
 * The printed "Order" is the row's position on its class's check-in sheet
 * (1..N in sheet order), never the stored `run_order` (MYK9-992): the stored
 * number is a sort key that starts above 1 and has gaps, so printing it showed
 * a steward "31" at the top of a sheet. An entry with no order assigned prints
 * blank, as before. `sortedEntries` must already be in sheet order.
 */
export function sheetPositions(sortedEntries: readonly PacketReportEntry[]): Map<string, number> {
  const nextByClass = new Map<string, number>();
  const positions = new Map<string, number>();
  for (const entry of sortedEntries) {
    if (entry.runOrder == null || !entry.classId) continue;
    const position = (nextByClass.get(entry.classId) ?? 0) + 1;
    nextByClass.set(entry.classId, position);
    positions.set(entry.id, position);
  }
  return positions;
}

function packetEntry(
  entry: PacketReportEntry,
  positions: ReadonlyMap<string, number>
): EmergencyPacketEntry {
  const position = positions.get(entry.id);
  return {
    ...entry,
    checkInMark: '',
    resultMark: '',
    runOrderDisplay: position === undefined ? '' : String(position),
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
  entries: PacketReportEntry[] = [],
  snapshotMarker = true,
  positions: ReadonlyMap<string, number> = new Map()
): Omit<EmergencyPacketPage, 'pageNumber'> {
  return {
    kind,
    title,
    marker: snapshotMarker ? EMERGENCY_PACKET_MARKER : '',
    generatedAt: input.generatedAt,
    context,
    entries: entries.map(entry => packetEntry(entry, positions)),
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

export interface BuildEmergencyPacketModelOptions {
  /**
   * Defaults to `true` — the actual emergency trial packet always carries
   * the "SNAPSHOT — NOT LIVE" marker and its emergency titling. Pass `false`
   * for a model built for the Reports page's check-in sheet or scoresheet:
   * those reuse this same builder for byte-identical layout, but are printed
   * on an ordinary working day, not during degraded-mode operation, so the
   * marker and titling would be actively misleading.
   */
  snapshotMarker?: boolean;
}

export function buildEmergencyPacketModel(
  input: EmergencyPacketInput,
  options: BuildEmergencyPacketModelOptions = {}
): EmergencyPacketModel {
  const snapshotMarker = options.snapshotMarker ?? true;
  const sortedTrials = [...input.trials].sort(compareTrials);
  const sortedClasses = [...input.classes].sort(compareClasses);
  const sortedEntries = [...input.entries].sort(compareEntries);
  // The catalog: as before MYK9-2387, runners and Pending dogs in `compareEntries` order, each
  // numbered by its stored run order.
  const inCatalog = (entry: PacketReportEntry) => !entry.omitFromCatalog;
  const catalogPositions = sheetPositions(sortedEntries.filter(inCatalog));
  const trialSections = sortedTrials.map(trial => ({
    ...trial,
    classes: sortedClasses.filter(classItem => classItem.trialId === trial.id),
  }));
  const pendingPages: Array<Omit<EmergencyPacketPage, 'pageNumber'>> = [
    page(input, 'cover', 'Emergency Trial Packet', baseContext(input), [], snapshotMarker),
  ];

  for (const trial of trialSections) {
    const trialClassIds = new Set(trial.classes.map(classItem => classItem.id));
    const trialEntries = sortedEntries.filter(
      entry =>
        inCatalog(entry) &&
        (entry.trialId === trial.id || (entry.classId ? trialClassIds.has(entry.classId) : false))
    );
    const context: EmergencyPacketPageContext = {
      showName: input.show.name,
      trialDate: trial.date,
      trialLabel: formatPacketTrialLabel(trial),
    };

    chunks(trialEntries, CATALOG_ROWS_PER_PAGE).forEach((entries, index, pages) => {
      const suffix = pages.length > 1 ? ` (${index + 1}/${pages.length})` : '';
      pendingPages.push(
        page(
          input,
          'catalog',
          `Entry Catalog${suffix}`,
          context,
          entries,
          snapshotMarker,
          catalogPositions
        )
      );
    });

    for (const classItem of trial.classes) {
      // MYK9-2387: the check-in sheet lists every entry, runners first; only runners are numbered
      // and only runners reach the scoresheet.
      const classEntries = sortedEntries
        .filter(entry => entry.classId === classItem.id)
        .sort(compareCheckInEntries);
      const checkInPositions = sheetPositions(classEntries.filter(entry => !entry.notRunningLabel));
      const classContext: EmergencyPacketPageContext = {
        ...context,
        ...printedClassHeader(classItem, trial),
      };

      chunks(classEntries, CHECK_IN_ROWS_PER_PAGE).forEach((entries, index, pages) => {
        const suffix = pages.length > 1 ? ` (${index + 1}/${pages.length})` : '';
        pendingPages.push(
          page(
            input,
            'check-in',
            `Check-in & Running Order${suffix}`,
            classContext,
            entries,
            snapshotMarker,
            checkInPositions
          )
        );
      });
      // Title carries the registry's own vocabulary (`orgTitle`) rather than a
      // hard-coded "Score Recording" — the whole point of a per-registry
      // scoresheet config is that it has visible, testable surface, not just a
      // reason-list lookup nothing ever reads. Keep the `(n/m)` suffix intact:
      // pagination identifies a continuation page by matching it.
      const scoresheetTitle = `${resolveScoresheetConfig(classContext.registryId).orgTitle} Scoresheet`;
      // MYK9-2387: the scoresheet lists only the dogs that run.
      const runningEntries = classEntries.filter(entry => !entry.notRunningLabel);
      // A class that lists dogs but runs none still gets one page, which says so, rather than none.
      const scorePages =
        runningEntries.length === 0 && classEntries.length > 0
          ? [[] as PacketReportEntry[]]
          : chunksWithFirst(runningEntries, SCORE_ROWS_FIRST_PAGE, SCORE_ROWS_CONTINUATION);
      scorePages.forEach((entries, index, pages) => {
        const suffix = pages.length > 1 ? ` (${index + 1}/${pages.length})` : '';
        pendingPages.push(
          page(
            input,
            'score-recording',
            `${scoresheetTitle}${suffix}`,
            classContext,
            entries,
            snapshotMarker
          )
        );
      });
    }

    pendingPages.push(
      page(input, 'certification', 'Judge & Secretary Certification', context, [], snapshotMarker)
    );
  }

  pendingPages.push(
    page(input, 'transcription', 'Paper Results Recovery', baseContext(input), [], snapshotMarker)
  );

  return {
    generatedAt: input.generatedAt,
    show: input.show,
    trials: trialSections,
    snapshotMarker,
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

export {
  formatClassTimeLimits,
  formatPacketSeconds,
  resolveAreaCount,
} from './printedClassHeader.ts';
