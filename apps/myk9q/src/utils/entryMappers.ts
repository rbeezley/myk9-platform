/**
 * Entry Mapping Utilities
 *
 * Factory functions for mapping database rows to Entry objects.
 * Centralizes the repetitive object mapping logic found throughout entryService.ts
 */

import type { Entry, EntryStatus } from '../stores/entryStore';

/**
 * Database row shape from entry-related queries
 * Represents the common fields returned from Supabase queries
 */
export interface EntryDatabaseRow {
  id: number;
  armband?: number | null;
  armband_number?: number | null; // Alternative column name in some views
  call_name?: string | null;
  dog_call_name?: string | null; // Alternative column name in some views
  breed?: string | null;
  dog_breed?: string | null; // Alternative column name in some views
  handler?: string | null;
  handler_name?: string | null; // Alternative column name in some views
  jump_height?: string | null;
  preferred_time?: string | null;
  is_scored?: boolean | null;
  entry_status?: string | null;
  result_status?: string | null;
  result_text?: string | null;
  search_time?: string | null;
  search_time_seconds?: number | null;
  fault_count?: number | null;
  total_faults?: number | null;
  placement?: number | null;
  final_placement?: number | null;
  class_id?: number | null;
  element?: string | null;
  level?: string | null;
  section?: string | null;
  total_correct_finds?: number | null;
  total_incorrect_finds?: number | null;
  no_finish_count?: number | null;
  results?: Array<{ is_in_ring?: boolean }> | null;
}

/**
 * Maps a database row to an Entry object with consistent field transformations
 *
 * **Design Pattern**: Factory function for Entry object creation
 * - Handles multiple database schema variations (armband vs armband_number, etc.)
 * - Applies consistent defaults for missing values
 * - Includes deprecated fields for backward compatibility
 * - Normalizes data types (booleans, numbers, strings)
 *
 * **Usage**: Use this in all entryService.ts functions that map database rows to Entry objects
 *
 * @param row - Database row from Supabase query
 * @param status - Computed EntryStatus (use determineEntryStatus() to calculate)
 * @param className - Formatted class name (use buildClassName() to generate)
 * @returns Fully-formed Entry object ready for application use
 *
 * @example
 * ```typescript
 * // In a Supabase query handler
 * const rows = await supabase.from('entries').select('*');
 * const entries = rows.data.map(row => {
 *   const status = determineEntryStatus(row.entry_status, row.results?.[0]?.is_in_ring);
 *   const className = buildClassName(row.element, row.level, row.section);
 *   return mapDatabaseRowToEntry(row, status, className);
 * });
 * ```
 */
export function mapDatabaseRowToEntry(
  row: EntryDatabaseRow,
  status: EntryStatus,
  className: string
): Entry {
  return {
    // Core identification
    id: row.id,
    classId: row.class_id ?? 0,

    // Dog/Handler information (handle schema variations)
    armband: (row.armband ?? row.armband_number) ?? 0,
    callName: (row.call_name ?? row.dog_call_name) ?? '',
    breed: (row.breed ?? row.dog_breed) ?? '',
    handler: (row.handler ?? row.handler_name) ?? '',
    jumpHeight: row.jump_height ?? '',
    preferredTime: row.preferred_time ?? '',

    // Scoring status
    isScored: row.is_scored ?? false,

    // Status fields (new unified + deprecated backward compatibility)
    status,
    inRing: status === 'in-ring',
    checkedIn: status !== 'no-status',
    checkinStatus: status,

    // Results data (handle schema variations)
    resultText: (row.result_text ?? row.result_status) ?? 'pending',
    searchTime: row.search_time ?? row.search_time_seconds?.toString() ?? '0.00',
    faultCount: (row.fault_count ?? row.total_faults) ?? 0,
    placement: (row.placement ?? row.final_placement) ?? undefined,

    // Class information
    className,
    section: row.section ?? undefined,
    element: row.element ?? undefined,
    level: row.level ?? undefined,

    // Additional scoring fields (optional, may not be present in all queries)
    correctFinds: row.total_correct_finds ?? undefined,
    incorrectFinds: row.total_incorrect_finds ?? undefined,
    noFinishCount: row.no_finish_count ?? undefined,
  };
}

/**
 * Simplified Entry mapper for basic queries without class information
 *
 * Use when className is not available or needed (e.g., entry-specific queries)
 *
 * @param row - Database row from Supabase query
 * @param status - Computed EntryStatus
 * @returns Entry object with minimal class information
 *
 * @example
 * ```typescript
 * const row = await supabase.from('entries').select('*').eq('id', entryId).single();
 * const status = determineEntryStatus(row.entry_status);
 * const entry = mapDatabaseRowToEntrySimple(row, status);
 * ```
 */
export function mapDatabaseRowToEntrySimple(
  row: EntryDatabaseRow,
  status: EntryStatus
): Entry {
  // Use empty string for className when not available
  return mapDatabaseRowToEntry(row, status, '');
}
