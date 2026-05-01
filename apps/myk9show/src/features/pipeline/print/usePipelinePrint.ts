/**
 * Hook for printing reports from the pipeline dashboard.
 * Fetches entry data on demand and calls print-service functions.
 */

import { useState, useCallback, useRef } from 'react';
import { notifications } from '@/lib/notifications';
import { getEntriesByClass } from '@/services/database/entries';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { generateRunOrder, generateScoreSheet, generateResults } from './print-service';
import type { ClassPipelineItem } from '../mission-control-types';
import type { PrintClassInfo, PrintReportEntry } from './print-types';

/** Map result_status from DB to display text */
function mapResultStatus(status: string | null): string | null {
  if (!status || status === 'pending') return null;
  const map: Record<string, string> = {
    qualified: 'Q',
    nq: 'NQ',
    absent: 'Absent',
    excused: 'Excused',
    withdrawn: 'Withdrawn',
  };
  return map[status] ?? status;
}

interface OwnerData {
  first_name?: string | null;
  last_name?: string | null;
}

interface DogData {
  call_name?: string | null;
  breed?: string | null;
  owner?: OwnerData | null;
}

interface EntryRow {
  id: string;
  armband?: string | number | null;
  run_order?: number | null;
  is_scored?: boolean | null;
  result_status?: string | null;
  final_placement?: number | null;
  search_time_seconds?: number | null;
  total_faults?: number | null;
  dog?: DogData | null;
}

function mapEntry(row: EntryRow): PrintReportEntry {
  const dog = row.dog;
  const owner = dog?.owner;
  const firstName = owner?.first_name ?? '';
  const lastName = owner?.last_name ?? '';
  const handlerName = firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Unknown Handler';

  return {
    id: String(row.id),
    armband: Number(row.armband) || 0,
    runOrder: row.run_order ?? null,
    callName: dog?.call_name ?? 'Unknown',
    breed: dog?.breed ?? '',
    handlerName,
    isScored: Boolean(row.is_scored),
    resultText: mapResultStatus(row.result_status ?? null),
    placement: row.final_placement ?? null,
    searchTimeSeconds: row.search_time_seconds ?? null,
    faultCount: row.total_faults ?? null,
  };
}

export interface UsePipelinePrintReturn {
  isPrinting: boolean;
  printRunOrder: (item: ClassPipelineItem) => Promise<void>;
  printScoreSheet: (item: ClassPipelineItem) => Promise<void>;
  printResults: (item: ClassPipelineItem) => Promise<void>;
}

export function usePipelinePrint(showId: string, trialId: string): UsePipelinePrintReturn {
  const [isPrinting, setIsPrinting] = useState(false);
  const isPrintingRef = useRef(false);
  const shows = useShowStore(s => s.shows);
  const trials = useTrialStore(s => s.trials);

  const buildClassInfo = useCallback(
    (item: ClassPipelineItem): PrintClassInfo => {
      const show = shows.find(s => s.id === showId);
      const trial = trials.find(t => t.id === trialId);

      return {
        className: item.name,
        element: null, // Not available on ClassPipelineItem; templates handle null gracefully
        level: null,
        section: null,
        judgeName: item.judge_name,
        trialDate: trial?.trialDate ?? new Date().toISOString().split('T')[0],
        trialNumber: trial?.trialNumber ?? '1',
        showName: show?.name ?? 'Show',
        timeLimitSeconds: null,
        areaCount: null,
      };
    },
    [showId, trialId, shows, trials]
  );

  const fetchEntries = useCallback(async (classId: string): Promise<PrintReportEntry[]> => {
    const { data, error } = await getEntriesByClass(classId);
    if (error) throw error;
    return (data as unknown as EntryRow[]).map(mapEntry);
  }, []);

  const makePrintHandler = useCallback(
    (generate: (info: PrintClassInfo, entries: PrintReportEntry[]) => void) =>
      async (item: ClassPipelineItem) => {
        if (isPrintingRef.current) return;
        isPrintingRef.current = true;
        setIsPrinting(true);
        try {
          const entries = await fetchEntries(item.id);
          if (entries.length === 0) {
            notifications.warning('No entries found for this class');
            return;
          }
          generate(buildClassInfo(item), entries);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          notifications.error(`Failed to generate print report: ${message}`);
        } finally {
          isPrintingRef.current = false;
          setIsPrinting(false);
        }
      },
    [fetchEntries, buildClassInfo]
  );

  const printRunOrder = makePrintHandler(generateRunOrder);
  const printScoreSheet = makePrintHandler(generateScoreSheet);
  const printResults = makePrintHandler(generateResults);

  return { isPrinting, printRunOrder, printScoreSheet, printResults };
}
