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

export interface TVDisplayData {
  show: TVShowInfo | null;
  classes: TVClass[];
}

/** Shared mapper for dog data from Supabase rows. */
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

export function getDisplayName(dog: TVDogInfo | null): string {
  return dog?.callName ?? dog?.name ?? 'Unknown';
}

export function formatArmband(armband: string | null): string {
  return armband ? `#${armband}` : '';
}

export function formatDisplayTime(searchTime: number | null, totalScore: number | null): string {
  if (searchTime != null) return `${searchTime.toFixed(1)}s`;
  if (totalScore != null) return `${totalScore}`;
  return '';
}

export function getTVStatusLabel(status: string | null, startTime?: string | null): string {
  if (status === 'start_time' && startTime) {
    return `STARTS ${startTime}`;
  }
  return getStatusDescriptor('class', status).label.toUpperCase();
}
import { getStatusDescriptor } from '@myk9/ui';
