/** Status values supported for active class display.
 *  Platform uses 'In Progress', 'Scheduled'. myK9Q uses 'in_progress', 'briefing', 'setup', 'start_time'.
 *  Support both for forward-compatibility when myK9Q aligns to platform DB. */
export const TV_ACTIVE_STATUSES = [
  'In Progress',
  'Scheduled',
  'in_progress',
  'briefing',
  'setup',
  'start_time',
] as const;

export const TV_STATUS_CONFIG = {
  'In Progress': { label: 'IN PROGRESS', color: 'bg-green-500 text-white' },
  in_progress: { label: 'IN PROGRESS', color: 'bg-green-500 text-white' },
  briefing: { label: 'BRIEFING', color: 'bg-amber-500 text-white' },
  setup: { label: 'UPCOMING', color: 'bg-zinc-600 text-zinc-200' },
  Scheduled: { label: 'UPCOMING', color: 'bg-zinc-600 text-zinc-200' },
  start_time: { label: 'UPCOMING', color: 'bg-zinc-600 text-zinc-200' },
} as const;

export interface TVShowInfo {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface TVDogInfo {
  name: string;
  callName: string | null;
  breed: string | null;
  imageUrl: string | null;
}

export interface TVEntry {
  id: string;
  armband: string | null;
  handler: string | null;
  runOrder: number | null;
  isInRing: boolean;
  isScored: boolean;
  dog: TVDogInfo | null;
}

export interface TVClass {
  id: string;
  name: string;
  element: string | null;
  level: string | null;
  status: string | null;
  judgeName: string | null;
  totalEntries: number | null;
  scoredCount: number | null;
  startTime: string | null;
  trialDate: string | null;
  trialNumber: number | null;
  entries: TVEntry[];
}

export interface TVPlacement {
  placement: number;
  armband: string | null;
  handler: string | null;
  searchTime: number | null;
  totalScore: number | null;
  dog: TVDogInfo | null;
}

export interface TVCompletedClass {
  id: string;
  name: string;
  element: string | null;
  level: string | null;
  judgeName: string | null;
  totalEntries: number | null;
  qualifiedCount: number | null;
  fastestTime: number | null;
  placements: TVPlacement[];
}

/** Shared mapper for dog data from Supabase rows. Used by useTVData and useTVResults. */
export function mapDogInfo(
  raw: {
    name: string;
    call_name: string | null;
    breed: string | null;
    image_url: string | null;
  } | null
): TVDogInfo | null {
  if (!raw) return null;
  return { name: raw.name, callName: raw.call_name, breed: raw.breed, imageUrl: raw.image_url };
}
