import { formatPacketArmband } from '../trialPacket/renderer/armband.ts';
import {
  compareCheckInEntries,
  compareEntries,
  sheetPositions,
} from '../trialPacket/renderer/emergencyTrialPacket.ts';
import {
  printedClassFacts,
  printedClassHeader,
  type PrintedSheetKind,
} from '../trialPacket/renderer/printedClassHeader.ts';
import type {
  EmergencyPacketClass,
  EmergencyPacketTrial,
  PacketReportEntry,
} from '../trialPacket/renderer/types.ts';
import { buildDescriptor, type PaperworkDescriptor, type PaperworkScope } from './descriptor.ts';

/**
 * The check-in sheet and scoresheet print-evidence descriptor, built from the renderer's own input
 * (MYK9-2103). Every subject's facts are the text the sheet prints for it, so a change to a
 * printed fact turns the print stale and a change to anything else (dog id, check-in status, fees,
 * an entry status the sheet does not print) does not.
 *
 * - One subject per printed entry (`entry:<id>`): the row's text plus where it sits on the sheet.
 *   An entry the renderer leaves out (held, a move-up's source, a declined one) has no subject, so it dropping off
 *   reads as a change.
 * - One subject per class that prints at least one entry (`class:<id>`): the class header, from
 *   the same `printedClassHeader` the renderer calls.
 *
 * No app-alias imports: a Deno edge function can compute the same fingerprint the app stores.
 */
export type PrintedSheetReportId = 'check-in-sheet' | 'scoresheet';

const KIND_OF: Record<PrintedSheetReportId, PrintedSheetKind> = {
  'check-in-sheet': 'check-in',
  scoresheet: 'scoresheet',
};

export function isPrintedSheetReportId(reportId: string): reportId is PrintedSheetReportId {
  return reportId === 'check-in-sheet' || reportId === 'scoresheet';
}

/** The text one entry prints on a sheet, plus its row on that sheet. */
export function printedEntryFacts(
  entry: PacketReportEntry,
  kind: PrintedSheetKind,
  rowIndex: number,
  position: number | undefined
): Record<string, unknown> {
  const armband = formatPacketArmband(entry.armband);
  if (kind === 'check-in') {
    return {
      row: rowIndex,
      order: position === undefined ? '' : String(position),
      // MYK9-2387: a dog that will not run prints its status where the order would be. A runner
      // has no status key, so a sheet printed before this change keeps its fingerprint.
      ...(entry.notRunningLabel ? { status: entry.notRunningLabel } : {}),
      armband,
      callName: entry.callName,
      breed: entry.breed,
      handler: entry.handler,
    };
  }
  return {
    row: rowIndex,
    armband,
    callName: entry.callName,
    // Blank lines are skipped, so the lines are what prints (a blank breed moves the rest up).
    lines: [entry.breed, entry.registrationNumber, entry.handler].filter(Boolean),
  };
}

/**
 * Null only when the report is not one of the two paper sheets. When nothing in scope prints, the
 * descriptor is EMPTY (no subjects, a defined fingerprint), never null: a recorded print compares
 * against it and reads changed (the dogs it listed are gone), while a recording path refuses to
 * record a descriptor with no subjects. A class with no printed entry gets no page, so it
 * contributes no subjects.
 */
export function buildSheetDescriptorFromPrinted(input: {
  reportId: string;
  scope: PaperworkScope;
  trials: readonly EmergencyPacketTrial[];
  classes: readonly EmergencyPacketClass[];
  entries: readonly PacketReportEntry[];
}): PaperworkDescriptor | null {
  if (!isPrintedSheetReportId(input.reportId)) return null;
  const kind = KIND_OF[input.reportId];
  const { scope } = input;
  const trialById = new Map(input.trials.map(trial => [trial.id, trial] as const));
  // Only a class under a trial prints; the renderer walks trials, then their classes.
  const printedClasses = input.classes.filter(
    classItem =>
      trialById.has(classItem.trialId) &&
      (scope.kind === 'class'
        ? classItem.id === scope.classId
        : scope.kind === 'trial'
          ? classItem.trialId === scope.trialId
          : true)
  );
  const classById = new Map(printedClasses.map(classItem => [classItem.id, classItem] as const));
  // The scoresheet lists only the dogs that run (MYK9-2387); the check-in sheet lists them all.
  const sorted = [...input.entries]
    .filter(entry => kind === 'check-in' || !entry.notRunningLabel)
    .sort(kind === 'check-in' ? compareCheckInEntries : compareEntries);
  const positions = sheetPositions(sorted.filter(entry => !entry.notRunningLabel));
  const rowByClass = new Map<string, number>();
  const printed = sorted.flatMap(entry => {
    const classItem = entry.classId ? classById.get(entry.classId) : undefined;
    if (!classItem) return [];
    const rowIndex = rowByClass.get(classItem.id) ?? 0;
    rowByClass.set(classItem.id, rowIndex + 1);
    return [{ entry, classItem, rowIndex }];
  });
  const classIdsWithRows = new Set(printed.map(item => item.classItem.id));
  return buildDescriptor(input.reportId, scope, [
    ...printed.map(({ entry, classItem, rowIndex }) => ({
      key: `entry:${entry.id}`,
      facts: printedEntryFacts(entry, kind, rowIndex, positions.get(entry.id)),
      classIds: [classItem.id],
      trialIds: [classItem.trialId],
    })),
    ...printedClasses
      .flatMap(classItem => {
        const trial = trialById.get(classItem.trialId);
        return trial && classIdsWithRows.has(classItem.id) ? [{ classItem, trial }] : [];
      })
      .map(({ classItem, trial }) => ({
        key: `class:${classItem.id}`,
        facts: printedClassFacts(printedClassHeader(classItem, trial), kind),
        classIds: [classItem.id],
        trialIds: [classItem.trialId],
      })),
  ]);
}
