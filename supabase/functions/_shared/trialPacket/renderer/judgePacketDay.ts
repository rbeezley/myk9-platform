import {
  buildEmergencyTrialPacketPdf,
  MAX_EMERGENCY_PACKET_BYTES,
  type JsPdfConstructor,
} from './buildEmergencyTrialPacketPdf.ts';
import { buildEmergencyPacketModel } from './emergencyTrialPacket.ts';
import type { CoverPdfConstructor } from './judgeCoverSheet.ts';
import { collateJudgePackets, summarizeClassSheets } from './judgePacketCollation.ts';
import { assembleJudgePacketPdf, type PdfLibModule } from './judgePacketPdf.ts';
import {
  comparePacketClassProgression,
  formatPacketTrialLabel,
  packetRegistryName,
  parsePacketClockTime,
} from './packetClassOrder.ts';
import type {
  EmergencyPacketClass,
  EmergencyPacketInput,
  EmergencyPacketModel,
  EmergencyPacketPage,
  EmergencyPacketPageKind,
  EmergencyPacketTrial,
} from './types.ts';

/**
 * One trial day's saved packet (MYK9-2079): each trial's judge packets (cover sheet, then each
 * class's check-in sheet and scoresheet, footer on every page), then that trial's entry catalog
 * and certification page; the paper-results recovery page once, at the end. The judge packets are
 * the same pages the browser's before-trial packet prints; the catalog, certification and
 * recovery pages keep the emergency packet's own rendering and its snapshot marker.
 */

/** Eastern, as `getTrialTimezone` reads a trial with no (or an unreadable) time zone. */
const DEFAULT_TIME_ZONE = 'America/New_York';

export interface RenderedPacket {
  bytes: Uint8Array;
  /** Pages in the finished PDF, counted from the PDF itself. */
  pageCount: number;
}

interface BuildTrialDayPacketOptions {
  /** One trial day, as `splitPacketInputByTrialDay` returns it. */
  input: EmergencyPacketInput;
  pdfLib: PdfLibModule;
  JsPdf: JsPdfConstructor & CoverPdfConstructor;
  printedAt: Date;
}

/** One class's sheets of one kind, renumbered so "Page X of Y" counts only what is rendered. */
function selectPages(model: EmergencyPacketModel, kind: EmergencyPacketPageKind) {
  return {
    ...model,
    pages: model.pages
      .filter(page => page.kind === kind)
      .map((page, index) => ({ ...page, pageNumber: index + 1 })),
  };
}

/** The class alone through the model builder, as the Reports sheets build it (no marker). */
export function classSheetModel(
  input: EmergencyPacketInput,
  trial: EmergencyPacketTrial,
  classItem: EmergencyPacketClass
): EmergencyPacketModel {
  return buildEmergencyPacketModel(
    {
      ...input,
      trials: [trial],
      // A class nobody judges prints "Judge to be announced" from the model builder, the same
      // line the Reports sheets print (MYK9-2377).
      classes: [classItem],
      entries: input.entries.filter(entry => entry.classId === classItem.id),
    },
    { snapshotMarker: false }
  );
}

/** The class's check-in sheet, then its scoresheet: the two PDFs the browser merges per class. */
export function buildClassSheetParts(
  model: EmergencyPacketModel,
  JsPdf: JsPdfConstructor
): Uint8Array[] {
  return (['check-in', 'score-recording'] as const).map(kind =>
    buildEmergencyTrialPacketPdf(selectPages(model, kind), JsPdf)
  );
}

/** A time zone `toLocaleString` accepts, else the default (a bad name would throw mid-packet). */
function usableTimeZone(timeZone: string | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/**
 * The catalog and certification pages of each trial, then the recovery page: split at each
 * certification page, which ends a trial's section in the model.
 */
function appendedPageGroups(model: EmergencyPacketModel): EmergencyPacketPage[][] {
  const groups: EmergencyPacketPage[][] = [];
  let current: EmergencyPacketPage[] = [];
  for (const page of model.pages) {
    if (page.kind !== 'catalog' && page.kind !== 'certification' && page.kind !== 'transcription') {
      continue;
    }
    current.push(page);
    if (page.kind === 'certification') {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function renderPageGroup(
  model: EmergencyPacketModel,
  pages: EmergencyPacketPage[],
  JsPdf: JsPdfConstructor
): Uint8Array {
  return buildEmergencyTrialPacketPdf(
    { ...model, pages: pages.map((page, index) => ({ ...page, pageNumber: index + 1 })) },
    JsPdf
  );
}

/** Builds the day's PDF and counts its pages from the PDF itself. */
export async function buildTrialDayPacketPdf(
  options: BuildTrialDayPacketOptions
): Promise<RenderedPacket> {
  const { input, pdfLib, JsPdf, printedAt } = options;
  const model = buildEmergencyPacketModel(input);
  const groups = appendedPageGroups(model);
  const parts: Uint8Array[] = [];

  for (const [index, trial] of model.trials.entries()) {
    const trialLabel = formatPacketTrialLabel(trial);
    const registryName = packetRegistryName(trial.registryId);
    const collated = collateJudgePackets<{ model: EmergencyPacketModel }>(input, {
      trialId: trial.id,
      trialLabel,
      registryName,
      parseStartMinutes: parsePacketClockTime,
      compareProgression: (a, b) => comparePacketClassProgression(a, b, trial.registryId),
      sheetsFor: classItem => {
        const classModel = classSheetModel(input, trial, classItem);
        return { ...summarizeClassSheets(classModel), model: classModel };
      },
    });
    for (const judge of collated?.judges ?? []) {
      parts.push(
        await assembleJudgePacketPdf({
          pdfLib,
          JsPdf,
          packet: { trialLabel, trialDate: trial.date, registryName },
          judge,
          showName: input.show.name,
          classParts: judge.classes.flatMap(item => buildClassSheetParts(item.model, JsPdf)),
          printedAt,
          timeZone: usableTimeZone(trial.timezone),
        })
      );
    }
    const trialPages = groups[index];
    if (trialPages) parts.push(renderPageGroup(model, trialPages, JsPdf));
  }
  const recovery = groups[model.trials.length];
  if (recovery) parts.push(renderPageGroup(model, recovery, JsPdf));

  // Merged here rather than through `mergePdfParts`, so the page count comes from the document
  // already in hand instead of parsing the finished PDF a second time.
  const merged = await pdfLib.PDFDocument.create();
  for (const part of parts) {
    const source = await pdfLib.PDFDocument.load(part);
    const pages = await merged.copyPages(source as never, source.getPageIndices());
    for (const page of pages) merged.addPage(page as never);
  }
  const pageCount = merged.getPageIndices().length;
  const bytes = await merged.save();
  if (bytes.byteLength > MAX_EMERGENCY_PACKET_BYTES) {
    throw new Error('Emergency packet is too large to upload. Narrow the show data and try again.');
  }
  return { bytes, pageCount };
}
