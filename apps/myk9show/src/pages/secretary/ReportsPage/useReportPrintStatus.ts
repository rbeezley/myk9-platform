import { useMemo } from 'react';

import {
  derivePaperworkPrintState,
  type PaperworkDescriptor,
} from '@/features/show-map/cockpit/paperworkPrintState';
import { useShowPaperworkPrints } from '@/features/show-map/cockpit/useShowPaperworkPrints';
import type { ReportScope } from '@/lib/reports/types';

import { buildReportPrintChips } from './buildReportPrintChips';

/**
 * Print status for the Reports page: the selected report's verdict (`printState`,
 * for the status panel and the Mark printed toast) and a chip per fingerprinted
 * report (`printChips`, for the phase sections). Both read the same replicated
 * print record and the same settled class/entry rows, so they cannot disagree.
 */
export function useReportPrintStatus(input: {
  showId: string;
  reportType: string;
  dataState: string;
  paperworkDescriptor: PaperworkDescriptor | null;
  armbandDescriptor: PaperworkDescriptor | null;
  scope: ReportScope;
  classes: unknown;
  entries: unknown;
  timeZone: string | undefined;
}) {
  const {
    showId,
    reportType,
    dataState,
    paperworkDescriptor,
    armbandDescriptor,
    scope,
    classes,
    entries,
    timeZone,
  } = input;
  const paperworkPrints = useShowPaperworkPrints(showId);
  // The descriptor is built from the class and entry rows, so a print confirmation (or an
  // out-of-date verdict) is only meaningful once those reads are settled: React Query keeps `data`
  // across a failed or in-flight refetch, and cached rows being replaced describe obsolete facts.
  // The armband descriptor comes from its own read, so it is exempt (as it is from Print gating).
  const paperworkRowsSettled = reportType === 'armband-labels' || dataState === 'ready';
  const printStatusUnavailable =
    paperworkPrints.isError ||
    paperworkPrints.syncFailed ||
    (!paperworkRowsSettled && dataState === 'error');
  const printStatusChecking =
    paperworkPrints.isLoading ||
    printStatusUnavailable ||
    !paperworkPrints.data ||
    !paperworkRowsSettled;
  const printStatusKnown = Boolean(paperworkPrints.data) && !printStatusChecking;
  const printState = useMemo(
    () =>
      printStatusKnown && paperworkDescriptor && paperworkPrints.data
        ? derivePaperworkPrintState(paperworkPrints.data, paperworkDescriptor)
        : null,
    [paperworkDescriptor, paperworkPrints.data, printStatusKnown]
  );

  // A card's chip needs ALL the rows settled, not just the selected report's: the other cards
  // are fingerprinted from the same class and entry rows. Empty until both are known.
  const printChips = useMemo(
    () =>
      buildReportPrintChips({
        rowsReady: dataState === 'ready' && printStatusKnown,
        records: paperworkPrints.data,
        scope,
        classes: (classes ?? []) as Parameters<typeof buildReportPrintChips>[0]['classes'],
        entries: (entries ?? []) as Parameters<typeof buildReportPrintChips>[0]['entries'],
        armband: { selected: reportType === 'armband-labels', descriptor: armbandDescriptor },
        timeZone,
      }),
    [
      dataState,
      printStatusKnown,
      paperworkPrints.data,
      scope,
      classes,
      entries,
      reportType,
      armbandDescriptor,
      timeZone,
    ]
  );

  return { printStatusUnavailable, printStatusChecking, printStatusKnown, printState, printChips };
}
