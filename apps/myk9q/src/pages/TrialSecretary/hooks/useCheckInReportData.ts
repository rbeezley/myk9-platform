/**
 * Hook to fetch check-in status data for the entire show
 *
 * Aggregates entry check-in status across all classes to identify:
 * - Exhibitors not checked into ANY class
 * - Exhibitors with partial check-ins (some but not all classes)
 * - Overall check-in statistics
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

// Types for the report
export interface PendingClassEntry {
  /** Entry ID for check-in operations */
  entryId: number;
  /** Display name (element + level + section) */
  className: string;
}

export interface ExhibitorCheckInStatus {
  handler: string;
  armband: number;
  dogName: string;
  totalEntries: number;
  checkedInCount: number;
  notCheckedInCount: number;
  pulledCount: number;
  scoredCount: number;
  /** Classes they're NOT checked into (with entry IDs for check-in) */
  pendingClasses: PendingClassEntry[];
  /** List of class names they ARE checked into (but not yet scored) */
  checkedInClasses: string[];
  /** List of class names they've been pulled/withdrawn from */
  pulledClasses: string[];
  /** List of class names that have been scored */
  scoredClasses: string[];
}

export interface CheckInReportData {
  /** Exhibitors not checked into ANY class */
  notCheckedIn: ExhibitorCheckInStatus[];
  /** Exhibitors checked into SOME but not ALL classes */
  partialCheckIn: ExhibitorCheckInStatus[];
  /** Exhibitors checked into ALL their classes (but not all scored) */
  fullyCheckedIn: ExhibitorCheckInStatus[];
  /** Exhibitors with at least one pulled/withdrawn entry */
  pulled: ExhibitorCheckInStatus[];
  /** Exhibitors with ALL entries scored (done for the show) */
  scored: ExhibitorCheckInStatus[];
  /** Summary statistics */
  stats: {
    totalExhibitors: number;
    fullyCheckedInCount: number;
    partialCheckInCount: number;
    notCheckedInCount: number;
    pulledCount: number;
    scoredCount: number;
    totalEntries: number;
    checkedInEntries: number;
    pulledEntries: number;
    scoredEntries: number;
  };
}

// Raw entry data from Supabase - we'll extract what we need
interface RawEntryData {
  id: number;
  armband_number: number;
  handler_name: string;
  dog_call_name: string;
  entry_status: string | null;
  is_scored: boolean;
  class_id: number;
  classes: {
    element: string;
    level: string;
    section: string | null;
    trials: {
      trial_date: string;
      trial_number: number;
    };
  };
}

/**
 * Get short day name from date string (e.g., "2024-03-15" -> "Sat")
 */
function getShortDayName(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00'); // Add time to avoid timezone issues
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Build a display-friendly class name with trial context
 * Format: "Sat T1: Buried Novice" or "Buried Novice" if no trial info
 */
function buildClassDisplayName(
  element: string,
  level: string,
  section: string | null,
  trialDate?: string,
  trialNumber?: number
): string {
  const classParts = [element, level];
  if (section && section !== '-' && section.trim()) {
    classParts.push(section);
  }
  const className = classParts.join(' ');

  // Add trial context if available
  if (trialDate && trialNumber !== undefined) {
    const dayName = getShortDayName(trialDate);
    return `${dayName} T${trialNumber}: ${className}`;
  }

  return className;
}

/**
 * Fetch all entries for a show and aggregate by exhibitor
 */
async function fetchCheckInData(licenseKey: string): Promise<CheckInReportData> {
  // Fetch all entries across all classes for this show
  const { data, error } = await supabase
    .from('view_entry_with_results')
    .select(`
      id,
      armband_number,
      handler_name,
      dog_call_name,
      entry_status,
      is_scored,
      class_id,
      classes!inner (
        element,
        level,
        section,
        trials!inner (
          trial_date,
          trial_number,
          shows!inner (
            license_key
          )
        )
      )
    `)
    .eq('classes.trials.shows.license_key', licenseKey)
    .order('armband_number', { ascending: true });

  if (error) {
    logger.error('[CheckInReport] Error fetching entries:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    return {
      notCheckedIn: [],
      partialCheckIn: [],
      fullyCheckedIn: [],
      pulled: [],
      scored: [],
      stats: {
        totalExhibitors: 0,
        fullyCheckedInCount: 0,
        partialCheckInCount: 0,
        notCheckedInCount: 0,
        pulledCount: 0,
        scoredCount: 0,
        totalEntries: 0,
        checkedInEntries: 0,
        pulledEntries: 0,
        scoredEntries: 0,
      },
    };
  }

  // Group entries by handler + armband (unique exhibitor identifier)
  const exhibitorMap = new Map<string, ExhibitorCheckInStatus>();

  // Cast through unknown to handle Supabase's complex nested type inference
  const entries = data as unknown as RawEntryData[];

  for (const row of entries) {
    const key = `${row.armband_number}-${row.handler_name}`;
    const isPulled = row.entry_status === 'pulled';
    const isScored = row.is_scored === true;
    const isCheckedIn = row.entry_status !== null && row.entry_status !== 'no-status' && !isPulled;
    const className = row.classes
      ? buildClassDisplayName(
          row.classes.element,
          row.classes.level,
          row.classes.section,
          row.classes.trials?.trial_date,
          row.classes.trials?.trial_number
        )
      : `Class ${row.class_id}`;

    if (!exhibitorMap.has(key)) {
      exhibitorMap.set(key, {
        handler: row.handler_name,
        armband: row.armband_number,
        dogName: row.dog_call_name || '',
        totalEntries: 0,
        checkedInCount: 0,
        notCheckedInCount: 0,
        pulledCount: 0,
        scoredCount: 0,
        pendingClasses: [],
        checkedInClasses: [],
        pulledClasses: [],
        scoredClasses: [],
      });
    }

    const exhibitor = exhibitorMap.get(key)!;
    exhibitor.totalEntries++;

    if (isPulled) {
      exhibitor.pulledCount++;
      exhibitor.pulledClasses.push(className);
    } else if (isScored) {
      // Scored entries are done - separate from checked-in
      exhibitor.scoredCount++;
      exhibitor.scoredClasses.push(className);
    } else if (isCheckedIn) {
      // Checked in but not yet scored
      exhibitor.checkedInCount++;
      exhibitor.checkedInClasses.push(className);
    } else {
      exhibitor.notCheckedInCount++;
      exhibitor.pendingClasses.push({
        entryId: row.id,
        className,
      });
    }
  }

  // Categorize exhibitors
  const notCheckedIn: ExhibitorCheckInStatus[] = [];
  const partialCheckIn: ExhibitorCheckInStatus[] = [];
  const fullyCheckedIn: ExhibitorCheckInStatus[] = [];
  const pulled: ExhibitorCheckInStatus[] = [];
  const scored: ExhibitorCheckInStatus[] = [];

  for (const exhibitor of exhibitorMap.values()) {
    // Pulled tab shows anyone with at least one pulled entry
    if (exhibitor.pulledCount > 0) {
      pulled.push(exhibitor);
    }

    // Scored tab shows anyone with at least one scored entry
    if (exhibitor.scoredCount > 0) {
      scored.push(exhibitor);
    }

    // Categorize by check-in status (excluding pulled entries from counts)
    const activeEntries = exhibitor.totalEntries - exhibitor.pulledCount;
    if (activeEntries === 0) {
      // All entries are pulled - only show in pulled tab
      continue;
    }

    // Categorize by check-in status for remaining entries
    if (exhibitor.checkedInCount === 0 && exhibitor.scoredCount === 0) {
      notCheckedIn.push(exhibitor);
    } else if (exhibitor.notCheckedInCount > 0) {
      partialCheckIn.push(exhibitor);
    } else {
      // Fully checked in OR all entries scored - no pending action needed
      fullyCheckedIn.push(exhibitor);
    }
  }

  // Sort by armband number
  const sortByArmband = (a: ExhibitorCheckInStatus, b: ExhibitorCheckInStatus) =>
    a.armband - b.armband;

  notCheckedIn.sort(sortByArmband);
  partialCheckIn.sort(sortByArmband);
  fullyCheckedIn.sort(sortByArmband);
  pulled.sort(sortByArmband);
  scored.sort(sortByArmband);

  // Calculate stats
  const totalEntries = entries.length;
  const scoredEntries = entries.filter((row) => row.is_scored === true).length;
  const checkedInEntries = entries.filter(
    (row) => row.entry_status !== null && row.entry_status !== 'no-status' && row.entry_status !== 'pulled' && !row.is_scored
  ).length;
  const pulledEntries = entries.filter((row) => row.entry_status === 'pulled').length;

  return {
    notCheckedIn,
    partialCheckIn,
    fullyCheckedIn,
    pulled,
    scored,
    stats: {
      totalExhibitors: exhibitorMap.size,
      fullyCheckedInCount: fullyCheckedIn.length,
      partialCheckInCount: partialCheckIn.length,
      notCheckedInCount: notCheckedIn.length,
      pulledCount: pulled.length,
      scoredCount: scored.length,
      totalEntries,
      checkedInEntries,
      pulledEntries,
      scoredEntries,
    },
  };
}

/**
 * React Query hook for check-in report data
 */
export function useCheckInReportData(licenseKey: string | undefined) {
  return useQuery({
    queryKey: ['checkInReport', licenseKey],
    queryFn: () => fetchCheckInData(licenseKey!),
    enabled: !!licenseKey,
    staleTime: 30 * 1000, // 30 seconds - check-in status changes frequently
    refetchInterval: 60 * 1000, // Auto-refresh every minute
  });
}
