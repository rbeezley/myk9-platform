import type { ReportEntry } from '@/lib/reports/types';
import { formatTimeLimitSeconds } from '@myk9/core';
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
  type EmergencyPacketTrial,
} from './types';

const CATALOG_ROWS_PER_PAGE = 24;
const CHECK_IN_ROWS_PER_PAGE = 20;
const SCORE_ROWS_PER_PAGE = 7;

function compareText(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { numeric: true, sensitivity: 'base' });
}

function compareTrials(a: EmergencyPacketTrial, b: EmergencyPacketTrial): number {
  return compareText(a.date, b.date) || compareText(a.trialNumber, b.trialNumber) || compareText(a.id, b.id);
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

function compareEntries(a: ReportEntry, b: ReportEntry): number {
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

function classLabel(classItem: EmergencyPacketClass): string {
  const identity = [classItem.element, classItem.level, classItem.section].filter(Boolean).join(' ');
  return classItem.classNumber ? `${classItem.classNumber} · ${identity}` : identity || classItem.name;
}

function trialLabel(trial: EmergencyPacketTrial): string {
  return trial.trialNumber ? `Trial ${trial.trialNumber}` : trial.name;
}

function packetEntry(entry: ReportEntry): EmergencyPacketEntry {
  return {
    ...entry,
    checkInMark: '',
    resultMark: '',
    runOrderDisplay: entry.runOrder == null ? '' : String(entry.runOrder),
  };
}

function baseContext(input: EmergencyPacketInput): EmergencyPacketPageContext {
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
  entries: ReportEntry[] = []
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
  ].map(seconds => formatTimeLimitSeconds(seconds));

  if (configured.every(label => label === '')) return undefined;

  // Report every area the class searches, and never hide a limit configured
  // beyond that count — a stale value is still information the ring can use.
  //
  // `classes` stores only THREE per-area limits, and sport_class_rules tops out
  // at three areas, but nothing in the schema constrains num_areas. Clamping to
  // three silently dropped the rest; naming them with no limit is the truth,
  // since the system has nowhere to record one. MAX_AREAS is a defensive bound
  // so a data-entry typo cannot run the header off the page.
  const MAX_AREAS = 10;
  const highestConfigured = configured.reduce(
    (highest, label, index) => (label === '' ? highest : index + 1),
    1
  );
  const areaCount = Math.min(MAX_AREAS, Math.max(classItem.numAreas ?? 1, highestConfigured));

  if (areaCount === 1) {
    return configured[0] === '' ? undefined : `Max time ${configured[0]}`;
  }

  return `Max time — ${Array.from({ length: areaCount }, (_, index) => {
    const label = configured[index] ?? '';
    return `Area ${index + 1} ${label === '' ? 'not set' : label}`;
  }).join(' · ')}`;
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
      entry => entry.trialId === trial.id || (entry.classId ? trialClassIds.has(entry.classId) : false)
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
      };

      chunks(classEntries, CHECK_IN_ROWS_PER_PAGE).forEach((entries, index, pages) => {
        const suffix = pages.length > 1 ? ` (${index + 1}/${pages.length})` : '';
        pendingPages.push(
          page(input, 'check-in', `Check-in & Running Order${suffix}`, classContext, entries)
        );
      });
      chunks(classEntries, SCORE_ROWS_PER_PAGE).forEach((entries, index, pages) => {
        const suffix = pages.length > 1 ? ` (${index + 1}/${pages.length})` : '';
        pendingPages.push(
          page(input, 'score-recording', `Score Recording${suffix}`, classContext, entries)
        );
      });
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
  if (showId.includes('/') || snapshotId.includes('/')) throw new Error('Packet IDs cannot contain slashes');
  return `${showId}/${snapshotId}.pdf`;
}
