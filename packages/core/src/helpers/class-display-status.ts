export type ClassDisplayStatus = 'not-started' | 'in-progress' | 'completed';

export interface ClassDisplayStatusInput {
  status?: string;
  is_scoring_finalized?: boolean;
  entry_count: number;
  scored_count: number;
  has_active_entries?: boolean;
}

export function getClassDisplayStatus(input: ClassDisplayStatusInput): ClassDisplayStatus {
  // Priority 1: Finalized flag
  if (input.is_scoring_finalized === true) {
    return 'completed';
  }

  // Priority 2: Canonical status
  if (input.status === 'Completed') {
    return 'completed';
  }

  // Priority 3: All entries scored
  if (input.scored_count === input.entry_count && input.entry_count > 0) {
    return 'completed';
  }

  // Priority 4: In Progress status or active scoring
  if (input.status === 'In Progress') {
    return 'in-progress';
  }

  if (input.has_active_entries || input.scored_count > 0) {
    return 'in-progress';
  }

  // Default
  return 'not-started';
}
