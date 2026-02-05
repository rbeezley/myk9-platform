/**
 * Types for WaitlistManagementPage
 */

import type { WaitlistEntry, ClassWithWaitlistCount } from '@/services/database/queries/waitlistQueries';

export interface Show {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface ActionDialogState {
  open: boolean;
  action: 'offer' | 'remove' | null;
  entry: WaitlistEntry | null;
}

export interface WaitlistManagementState {
  // Selection state
  shows: Show[];
  selectedShowId: string;
  classes: ClassWithWaitlistCount[];
  selectedClassId: string;
  waitlistEntries: WaitlistEntry[];
  // UI state
  isLoadingShows: boolean;
  isLoadingClasses: boolean;
  isLoadingWaitlist: boolean;
  isProcessing: boolean;
  error: string | null;
  searchTerm: string;
  // Dialog state
  actionDialog: ActionDialogState;
}

export interface WaitlistManagementActions {
  setSelectedShowId: (id: string) => void;
  setSelectedClassId: (id: string) => void;
  setSearchTerm: (term: string) => void;
  setActionDialog: (state: ActionDialogState) => void;
  handleOfferSpot: () => Promise<void>;
  handleRemoveFromWaitlist: () => Promise<void>;
  handleRefresh: () => void;
}

// Re-export for convenience
export type { WaitlistEntry, ClassWithWaitlistCount };
