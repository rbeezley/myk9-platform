/** Shared display-status types for live show-day components. */

// ---------------------------------------------------------------------------
// Entry statuses (per-dog in a class run order)
// ---------------------------------------------------------------------------

export type EntryDisplayStatus =
  'checked_in' | 'not_checked_in' | 'at_gate' | 'in_ring' | 'completed' | 'pulled';

export type ClassDisplayStatus = 'not_started' | 'in_progress' | 'completed' | 'paused';
