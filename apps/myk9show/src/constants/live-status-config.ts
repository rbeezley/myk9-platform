/**
 * Shared status types, labels, and styles for live show-day components.
 * Used by EntryRow, LiveClassCard, ClassesTab, and useClassEntries.
 */

// ---------------------------------------------------------------------------
// Entry statuses (per-dog in a class run order)
// ---------------------------------------------------------------------------

export type EntryDisplayStatus =
  | 'checked_in'
  | 'not_checked_in'
  | 'at_gate'
  | 'in_ring'
  | 'completed'
  | 'pulled';

export const ENTRY_STATUS_LABELS: Record<EntryDisplayStatus, string> = {
  checked_in: 'Checked In',
  not_checked_in: 'Not Checked In',
  at_gate: 'At Gate',
  in_ring: 'In Ring',
  completed: 'Completed',
  pulled: 'Pulled',
};

export const ENTRY_STATUS_BORDER: Record<EntryDisplayStatus, string> = {
  checked_in: 'border-l-green-500',
  not_checked_in: 'border-l-gray-300',
  at_gate: 'border-l-yellow-500',
  in_ring: 'border-l-primary',
  completed: 'border-l-transparent',
  pulled: 'border-l-red-500',
};

export const ENTRY_STATUS_BADGE: Record<EntryDisplayStatus, string> = {
  checked_in: 'bg-green-500/10 text-green-600',
  not_checked_in: 'bg-muted text-muted-foreground',
  at_gate: 'bg-yellow-500/10 text-yellow-600',
  in_ring: 'bg-primary/10 text-primary',
  completed: 'bg-muted text-muted-foreground',
  pulled: 'bg-red-500/10 text-red-600',
};

// ---------------------------------------------------------------------------
// Class statuses (overall class progress)
// ---------------------------------------------------------------------------

export type ClassDisplayStatus = 'not_started' | 'in_progress' | 'completed' | 'paused';

export const CLASS_STATUS_CONFIG: Record<ClassDisplayStatus, { label: string; style: string }> = {
  not_started: { label: 'Not Started', style: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', style: 'bg-green-500/10 text-green-600 animate-pulse' },
  completed: { label: 'Completed', style: 'bg-primary/10 text-primary' },
  paused: { label: 'Paused', style: 'bg-yellow-500/10 text-yellow-600' },
};
