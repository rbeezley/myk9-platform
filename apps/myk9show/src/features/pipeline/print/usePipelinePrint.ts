/**
 * Hook for printing reports from the pipeline dashboard.
 * Fetches entry data on demand and calls print-service functions.
 */

import { useState, useCallback, useRef } from 'react';
import { notifications } from '@/lib/notifications';
import { getEntriesByClass } from '@/services/database/entries';
import {
  getHandlerPeopleHydrationRevision,
  settleHandlerPeopleHydration,
} from '@/services/database/entries/handlerHydration';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { loadDogRegistrations } from '@/services/database/dogs/reads';
import { getTrialRegistry } from '@/features/registries';
import { isAwaitingRegistrationNumber, registrationsFromRead } from '@/features/dogs/identity';
import { generateRunOrder, generateScoreSheet, generateResults } from './print-service';
import type { ClassPipelineItem } from '../mission-control-types';
import type { PrintClassInfo, PrintReportEntry } from './print-types';
import type { ProjectedEntryHandler } from '@/services/database/entries/entryHandlerProjection';

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

interface DogData {
  call_name?: string | null;
  breed?: string | null;
}

interface EntryRow {
  id: string;
  dog_id?: string | null;
  entry_status?: string | null;
  armband?: string | number | null;
  run_order?: number | null;
  is_scored?: boolean | null;
  result_status?: string | null;
  final_placement?: number | null;
  search_time_seconds?: number | null;
  total_faults?: number | null;
  dog?: DogData | null;
  handler_identity?: ProjectedEntryHandler | null;
}

function mapEntry(row: EntryRow): PrintReportEntry {
  const dog = row.dog;
  const handlerName =
    row.handler_identity?.source === 'unknown' || !row.handler_identity?.name
      ? 'Unknown Handler'
      : row.handler_identity.name;

  return {
    id: String(row.id),
    armband: row.armband != null && row.armband !== '' ? Number(row.armband) : null,
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

/**
 * MYK9-1162: an entry awaiting a registration number holds its capacity place
 * but is never printed. With no trial registry, or a registration read that did
 * not answer for a dog, nothing is held: an unverified class is never emptied.
 */
async function withoutHeldEntries(
  rows: EntryRow[],
  trial: (Parameters<typeof getTrialRegistry>[0] & { trialType?: string | undefined }) | undefined,
  className: string
): Promise<EntryRow[]> {
  const dogIds = [...new Set(rows.map(row => row.dog_id).filter((id): id is string => !!id))];
  if (!trial || dogIds.length === 0) return rows;
  const registryId = getTrialRegistry(trial).id;
  const read = await loadDogRegistrations(dogIds);
  return rows.filter(
    row =>
      !row.dog_id ||
      !isAwaitingRegistrationNumber(
        { entryStatus: row.entry_status ?? undefined },
        registryId,
        registrationsFromRead(read, row.dog_id),
        { trialType: trial.trialType, className, element: null, level: null }
      )
  );
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
        trialName: trial?.name ?? null,
        trialNumber: trial?.trialNumber ?? '',
        showName: show?.name ?? 'Show',
        timeLimitSeconds: null,
        areaCount: null,
      };
    },
    [showId, trialId, shows, trials]
  );

  const fetchEntries = useCallback(
    async (classId: string, className: string): Promise<PrintReportEntry[]> => {
      const read = async () => {
        const { data, error } = await getEntriesByClass(classId);
        if (error) throw error;
        return data as unknown as EntryRow[];
      };
      // A print is one-shot: it cannot replay when a handler people refresh
      // that missed its fast window lands later, as Reports does. Wait for it,
      // then re-read if it changed any cached identity (MYK9-743).
      const revision = getHandlerPeopleHydrationRevision();
      let rows = await read();
      await settleHandlerPeopleHydration();
      if (getHandlerPeopleHydrationRevision() !== revision) rows = await read();
      return (
        await withoutHeldEntries(
          rows,
          trials.find(t => t.id === trialId),
          className
        )
      ).map(mapEntry);
    },
    [trialId, trials]
  );

  const makePrintHandler = useCallback(
    (generate: (info: PrintClassInfo, entries: PrintReportEntry[]) => void) =>
      async (item: ClassPipelineItem) => {
        if (isPrintingRef.current) return;
        isPrintingRef.current = true;
        setIsPrinting(true);
        try {
          const entries = await fetchEntries(item.id, item.name);
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
