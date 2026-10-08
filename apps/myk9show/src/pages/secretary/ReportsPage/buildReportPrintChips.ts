import {
  derivePaperworkPrintState,
  type PaperworkDescriptor,
  type PaperworkPrintEvidence,
} from '@/features/show-map/cockpit/paperworkPrintState';
import { buildReportPaperworkDescriptor } from '@/features/show-map/cockpit/buildReportPaperworkDescriptor';
import type { ReportScope } from '@/lib/reports/types';

export type ReportPrintChipTone = 'done' | 'warning' | 'neutral';

export interface ReportPrintChip {
  label: string;
  tone: ReportPrintChipTone;
}

/**
 * The reports `buildReportPaperworkDescriptor` can fingerprint. Anything else has
 * no print record to read, so it gets no chip rather than an invented one.
 */
const DESCRIBED_REPORT_IDS = ['check-in-sheet', 'scoresheet', 'results-sheet', 'result-labels'];

function formatPrintedDate(printedAt: string, timeZone: string | undefined): string {
  const date = new Date(printedAt);
  if (Number.isNaN(date.getTime())) return 'Printed';
  try {
    return `Printed ${new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      ...(timeZone ? { timeZone } : {}),
    }).format(date)}`;
  } catch {
    return 'Printed';
  }
}

function chipFor(
  records: readonly PaperworkPrintEvidence[],
  descriptor: PaperworkDescriptor,
  timeZone: string | undefined
): ReportPrintChip {
  const derived = derivePaperworkPrintState(records, descriptor);
  if (derived.state === 'current' && derived.record) {
    return { label: formatPrintedDate(derived.record.printedAt, timeZone), tone: 'done' };
  }
  if (derived.state === 'stale') return { label: 'Changed since printed', tone: 'warning' };
  return { label: 'Not printed', tone: 'neutral' };
}

/**
 * Print status per report id, from the SAME descriptors and print records the
 * selected-report status panel uses.
 *
 * Returns an empty map unless the print record is known AND the class/entry rows
 * are settled (`rowsReady`): a fingerprint built from rows that are loading or
 * being replaced describes obsolete facts, and "Not printed" over a cold replica
 * would read as a fact (LESSONS offline-identity-pairing). A report with no
 * descriptor (no entries in scope, or not a fingerprinted report) is simply absent.
 */
export function buildReportPrintChips(input: {
  rowsReady: boolean;
  records: readonly PaperworkPrintEvidence[] | undefined;
  scope: ReportScope;
  classes: Parameters<typeof buildReportPaperworkDescriptor>[0]['classes'];
  entries: Parameters<typeof buildReportPaperworkDescriptor>[0]['entries'];
  /** The armband descriptor comes from its own read, so it only exists while that report is open. */
  armband?: { selected: boolean; descriptor: PaperworkDescriptor | null };
  timeZone?: string | undefined;
}): Record<string, ReportPrintChip> {
  if (!input.rowsReady || !input.records) return {};
  const chips: Record<string, ReportPrintChip> = {};
  for (const reportId of DESCRIBED_REPORT_IDS) {
    const descriptor = buildReportPaperworkDescriptor({
      reportId,
      scope: input.scope,
      classes: input.classes,
      entries: input.entries,
    });
    if (descriptor) chips[reportId] = chipFor(input.records, descriptor, input.timeZone);
  }
  if (input.armband?.selected && input.armband.descriptor) {
    chips['armband-labels'] = chipFor(input.records, input.armband.descriptor, input.timeZone);
  }
  return chips;
}
