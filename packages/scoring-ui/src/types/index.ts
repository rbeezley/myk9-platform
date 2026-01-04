/**
 * Shared types for scoring UI hooks
 */

/**
 * Base entry type for scoring operations.
 * Apps can extend this with additional fields.
 */
export interface BaseEntry {
  id: number;
  armband?: number;
  callName?: string;
  handler?: string;
  breed?: string;
  section?: string;
  status?: string;
  inRing?: boolean;
  isScored?: boolean;
  exhibitorOrder?: number;
  placement?: number;
}

/**
 * Timer formatting options
 */
export interface TimerFormatOptions {
  /** Include hundredths of seconds (default: true) */
  showHundredths?: boolean;
  /** Pad minutes with leading zero (default: false) */
  padMinutes?: boolean;
}

/**
 * Stopwatch configuration options
 */
export interface StopwatchOptions {
  /** Maximum time in "MM:SS" format (e.g., "3:00", "4:00") */
  maxTime?: string;
  /** Current level (e.g., "Novice", "Master") - Master excludes 30-second warning */
  level?: string;
  /** Enable voice announcements including 30-second warning */
  enableVoiceAnnouncements?: boolean;
  /** Callback when timer expires (auto-stop) */
  onTimeExpired?: (formattedTime: string) => void;
  /** Optional callback for 30-second warning chime */
  onWarningChime?: () => void;
  /** Optional callback for voice announcement */
  onVoiceAnnouncement?: (secondsRemaining: number) => void;
  /** Optional callback for scoring active state change */
  onScoringActiveChange?: (isActive: boolean) => void;
}

/**
 * Stopwatch return type
 */
export interface StopwatchReturn {
  /** Current time in milliseconds */
  time: number;
  /** Whether timer is currently running */
  isRunning: boolean;
  /** Format time as "M:SS.ss" */
  formatTime: (milliseconds: number) => string;
  /** Get remaining time as "M:SS.ss" (or empty string if no max time) */
  getRemainingTime: () => string;
  /** Get max time in milliseconds (for progress calculations) */
  getMaxTimeMs: () => number;
  /** Get remaining time in milliseconds */
  getRemainingTimeMs: () => number;
  /** Start/resume the timer */
  start: () => void;
  /** Pause the timer (keeps current time) */
  pause: () => void;
  /** Stop and reset to zero */
  reset: () => void;
  /** Check if 30-second warning should show (non-Master only) */
  shouldShow30SecondWarning: () => boolean;
  /** Check if time has expired */
  isTimeExpired: () => boolean;
  /** Get warning message: "Time Expired" | "30 Second Warning" | null */
  getWarningMessage: () => string | null;
}

/**
 * Element timer return type (for UKC Nosework)
 */
export interface ElementTimerReturn {
  /** Current elapsed time in milliseconds */
  time: number;
  /** Whether the timer is currently running */
  isRunning: boolean;
  /** Start the timer (records start timestamp) */
  start: () => void;
  /** Stop the timer (freezes current time) */
  stop: () => void;
  /** Resume the timer after stop */
  resume: () => void;
  /** Reset timer to zero */
  reset: () => void;
  /** Format milliseconds as "M:SS.ss" */
  formatTime: (milliseconds: number) => string;
}

/**
 * Entry list filter types
 */
export type TabType = 'pending' | 'completed';
export type SortType = 'armband' | 'name' | 'handler' | 'breed' | 'manual' | 'run' | 'placement';
export type SectionFilter = 'all' | 'A' | 'B';

/**
 * Entry list filter options
 */
export interface EntryListFiltersOptions<T extends BaseEntry> {
  entries: T[];
  /** Enable manual sort option (default: false) */
  supportManualSort?: boolean;
  /** Enable section filter for combined views (default: false) */
  supportSectionFilter?: boolean;
  /** Sort in-ring dogs first (default: false) */
  prioritizeInRing?: boolean;
  /** Sort pulled dogs last (default: false) */
  deprioritizePulled?: boolean;
  /** External manual order array (for drag-and-drop state) */
  manualOrder?: T[];
  /** Default sort type (default: 'armband') */
  defaultSort?: SortType;
}

/**
 * Entry list filters return type
 */
export interface EntryListFiltersReturn<T extends BaseEntry> {
  // State
  activeTab: TabType;
  sortBy: SortType;
  searchTerm: string;
  sectionFilter: SectionFilter;

  // Setters
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;
  setSortBy: React.Dispatch<React.SetStateAction<SortType>>;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  setSectionFilter: React.Dispatch<React.SetStateAction<SectionFilter>>;

  // Computed
  filteredEntries: T[];
  pendingEntries: T[];
  completedEntries: T[];
  entryCounts: { pending: number; completed: number };
  sectionCounts: { all: number; A: number; B: number } | null;

  // Actions
  resetFilters: () => void;

  // Helpers
  supportManualSort: boolean;
  supportSectionFilter: boolean;
}

/**
 * Drag and drop options
 */
export interface DragAndDropOptions<T extends BaseEntry> {
  /** All local entries (for merging after drag) */
  localEntries: T[];
  /** Setter for local entries state */
  setLocalEntries: React.Dispatch<React.SetStateAction<T[]>>;
  /** Current filtered/sorted entries being displayed */
  currentEntries: T[];
  /** External isDraggingRef - if provided, hook uses it instead of creating its own */
  isDraggingRef?: React.MutableRefObject<boolean>;
  /** External manualOrder state setter */
  setManualOrder?: React.Dispatch<React.SetStateAction<T[]>>;
  /** Grace period in ms before accepting new sync data after drag (default: 1500) */
  gracePeriodMs?: number;
  /** Callback to persist order to database */
  onUpdateOrder?: (entries: T[]) => Promise<void>;
  /** Optional logger instance */
  logger?: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

/**
 * Drag and drop return type
 */
export interface DragAndDropReturn {
  /** DnD-kit sensors configuration */
  sensors: unknown; // ReturnType<typeof useSensors> - keeping as unknown to avoid circular deps
  /** Handler for drag start event */
  handleDragStart: (event: unknown) => void;
  /** Handler for drag end event */
  handleDragEnd: (event: unknown) => Promise<void>;
  /** Whether a database update is in progress */
  isUpdatingOrder: boolean;
  /** Whether currently dragging (for external use) */
  isDragging: boolean;
  /** Ref to check drag state (for sync protection) */
  isDraggingRef: React.MutableRefObject<boolean>;
}
