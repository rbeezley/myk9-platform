import type {
  MultiAreaScentWorkResult,
  ScentWorkEntry,
  ScentWorkResult,
} from '@/types/scent-work-types';

export interface PlacementEntry {
  entryId: string;
  armband: string;
  dogName: string;
  handlerName: string;
  searchTime: number;
  faults: number;
  qualification: string;
  placement?: number;
  isQualified: boolean;
}

type PlacementResult = ScentWorkResult | MultiAreaScentWorkResult;

function parsePlacement(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const placement = Number.parseInt(value, 10);
  return Number.isFinite(placement) && placement > 0 ? placement : undefined;
}

function getServerPlacement(entry: ScentWorkEntry, result?: PlacementResult): number | undefined {
  if (result?.qualification !== 'Qualified') return undefined;
  if (result?.placementCalculated !== undefined) return result.placementCalculated;

  return parsePlacement(entry.competitionData?.placement);
}

/**
 * Build secretary placement rows from server-provided placements.
 * Placement is deliberately not calculated here; the server's
 * recalculate_class_placements function owns the faults-then-time rule.
 */
export function buildPlacementData(
  entries: ScentWorkEntry[],
  results: Map<string, PlacementResult>
): PlacementEntry[] {
  const placementData = entries.map<PlacementEntry>(entry => {
    const result = results.get(entry.id);

    if (!result) {
      return {
        entryId: entry.id,
        armband: entry.displayInfo.armband,
        dogName: entry.displayInfo.dogName,
        handlerName: entry.displayInfo.handlerName,
        searchTime: 0,
        faults: 0,
        qualification: 'No Result',
        isQualified: false,
      };
    }

    const searchTime = 'totalSearchTime' in result ? result.totalSearchTime : result.searchTime;
    const faults = 'totalFaults' in result ? result.totalFaults : result.faults;

    const placement = getServerPlacement(entry, result);
    const placementFields = placement === undefined ? {} : { placement };

    return {
      entryId: entry.id,
      armband: entry.displayInfo.armband,
      dogName: entry.displayInfo.dogName,
      handlerName: entry.displayInfo.handlerName,
      searchTime,
      faults,
      qualification: result.qualification,
      ...placementFields,
      isQualified: result.qualification === 'Qualified',
    };
  });

  return [...placementData].sort((a, b) => {
    if (a.placement === undefined && b.placement === undefined) return 0;
    if (a.placement === undefined) return 1;
    if (b.placement === undefined) return -1;
    return a.placement - b.placement;
  });
}
