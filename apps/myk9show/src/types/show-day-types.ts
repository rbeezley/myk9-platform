/**
 * Types for show day detection and live ring progress.
 * Used by useShowDayData hook for exhibitor dashboard progressive disclosure.
 */

/** Top-level return type from useShowDayData */
export interface ShowDayData {
  /** Whether the exhibitor has a show today */
  isShowDay: boolean;
  /** All active shows today (for multi-show support) */
  activeShows: ActiveShowInfo[];
  /** Currently selected show (first by default) */
  activeShow: ActiveShowInfo | null;
  /** Exhibitor's classes today, sorted by running order */
  myClasses: ShowDayClass[];
  /** Next unscored class */
  nextUp: ShowDayClass | null;
  /** Already scored classes */
  completedToday: ShowDayClass[];
  /** Summary stats */
  stats: ShowDayStats;
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Error from initial fetch */
  error: Error | null;
  /** True when last poll failed but cached data exists */
  isStale: boolean;
  /** Timestamp of last successful poll */
  lastUpdated: Date | null;
}

export interface ShowDayStats {
  total: number;
  completed: number;
  qualified: number;
}

/** Info about a show the exhibitor is entered in today */
export interface ActiveShowInfo {
  showId: string;
  showName: string;
  location: string;
  clubName: string;
  trialDate: string;
  showStatus: string;
}

/** A single class entry for the exhibitor on show day */
export interface ShowDayClass {
  classId: string;
  className: string;
  element: string | null;
  level: string | null;
  dogCallName: string;
  dogId: string;
  armband: string | null;
  entryId: string;
  // Ring progress
  totalEntries: number;
  scoredEntries: number;
  currentDogInRing: string | null;
  myRunningOrder: number | null;
  estimatedTimeMinutes: number | null;
  // Status
  entryStatus: string;
  isScored: boolean;
  resultStatus: string | null;
  classStatus: string;
  // Show context (for multi-show)
  showId: string;
  showName: string;
  trialDate: string;
}

/** Raw entry row shape from the showDayCheck query */
export interface ShowDayCheckRow {
  id: string;
  trial: {
    id: string;
    date: string;
    show: {
      id: string;
      name: string;
      location: string | null;
      status: string;
      start_date: string;
      end_date: string;
      club: { name: string } | null;
    };
  };
}

/** Raw entry row shape from the showDayDetails query */
export interface ShowDayDetailRow {
  id: string;
  entry_status: string;
  armband: string | null;
  run_order: number | null;
  is_scored: boolean;
  result_status: string | null;
  is_in_ring: boolean;
  dog: { id: string; call_name: string };
  class: {
    id: string;
    name: string;
    element: string | null;
    level: string | null;
    status: string;
    total_entries_count: number;
    scored_count: number;
  };
  trial: {
    id: string;
    date: string;
    show: {
      id: string;
      name: string;
      location: string | null;
      status: string;
      club: { name: string } | null;
    };
  };
}

/** Raw entry row for ring progress (other entries in user's classes) */
export interface RingProgressRow {
  class_id: string;
  is_in_ring: boolean;
  is_scored: boolean;
  scoring_completed_at: string | null;
  run_order: number | null;
  dog: { call_name: string };
}

/** Default minutes per dog before enough data for adaptive timing */
export const DEFAULT_MINUTES_PER_DOG = 3;

/** Minimum scored entries before switching to adaptive timing */
export const MIN_SCORED_FOR_ADAPTIVE = 3;
