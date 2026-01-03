/**
 * Shared TypeScript definitions for myK9Q scoring system
 * These types are used by both the mobile app and web interface
 */

// ============================================
// Core Scoring Types
// ============================================

/**
 * Represents a scoring session for a judge
 */
export interface ScoringSession {
  id: string;
  judgeId: string;
  judgeName: string;
  classId: string;
  className: string;
  showId: string;
  showName: string;
  ringNumber: number;
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'completed' | 'paused' | 'abandoned';
  offlineMode: boolean;
  deviceId?: string;
  lastActivityAt: Date;
}

/**
 * Individual exercise or scoring criteria
 */
export interface Exercise {
  id: string;
  name: string;
  description?: string;
  maxPoints: number;
  minPoints?: number;
  step?: number; // Point increment (e.g., 0.5 for half points)
  required: boolean;
  order: number;
  category?: string; // For grouped exercises
  scoringType: 'points' | 'time' | 'faults' | 'qualifying';
}

/**
 * Score for a single exercise
 */
export interface Score {
  exerciseId: string;
  exerciseName?: string;
  points?: number;
  time?: number; // In milliseconds
  faults?: number;
  qualifying?: 'NQ' | 'Q' | 'Q+';
  notes?: string;
}

/**
 * Complete score for a competitor
 */
export interface CompetitorScore {
  id?: string;
  competitorId: string;
  entryId: string;
  sessionId: string;
  classId: string;
  dogId: string;
  armband: string;
  scores: Score[];
  totalPoints: number;
  totalTime?: number;
  totalFaults?: number;
  placement?: number;
  status: 'pending' | 'scoring' | 'completed' | 'reviewed';
  notes?: string;
  voiceNoteUrl?: string;
  photos?: string[];
  disqualified?: boolean;
  disqualificationReason?: string;
  absent?: boolean;
  excused?: boolean;
  excusedReason?: string;
  scoredAt: Date;
  scoredBy: string; // Judge ID
  modifiedAt?: Date;
  modifiedBy?: string;
  syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  syncError?: string;
}

/**
 * Entry information for scoring
 */
export interface ScoringEntry {
  id: string;
  entryId: string;
  armband: string;
  dog: {
    id: string;
    name: string;
    breed: string;
    variety?: string;
    sex: 'male' | 'female';
    age?: number;
    height?: string;
    registrationNumber?: string;
    photoUrl?: string;
  };
  owner: {
    id: string;
    name: string;
    city?: string;
    state?: string;
  };
  handler?: {
    id: string;
    name: string;
  };
  status: 'checked_in' | 'absent' | 'excused' | 'completed' | 'pending';
  runningOrder?: number;
  moveUpFrom?: string; // Previous class if moved up
  specialInstructions?: string;
}

// ============================================
// Judge Assignment Types
// ============================================

/**
 * Judge assignment to a class
 */
export interface JudgeAssignment {
  id: string;
  judgeId: string;
  judgeName: string;
  showId: string;
  showName: string;
  showDate: Date;
  classes: AssignedClass[];
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  notes?: string;
}

/**
 * Class assigned to a judge
 */
export interface AssignedClass {
  id: string;
  classId: string;
  className: string;
  ringNumber: number;
  scheduledTime: string; // "09:00"
  estimatedDuration: number; // Minutes
  entryCount: number;
  level?: string;
  division?: string;
  scoringType: 'points' | 'time' | 'qualifying';
  exercises?: Exercise[];
  status: 'pending' | 'in_progress' | 'completed';
}

// ============================================
// Offline Sync Types
// ============================================

/**
 * Offline score storage
 */
export interface OfflineScore {
  id: string; // Local UUID
  score: CompetitorScore;
  createdAt: Date;
  synced: boolean;
  syncAttempts: number;
  lastSyncAttempt?: Date;
  lastSyncError?: string;
  requiresReview?: boolean;
  deviceId: string;
}

/**
 * Sync status for the application
 */
export interface SyncStatus {
  isOnline: boolean;
  pendingScores: number;
  lastSyncTime?: Date;
  syncInProgress: boolean;
  syncErrors: SyncError[];
  nextSyncAttempt?: Date;
}

/**
 * Sync error information
 */
export interface SyncError {
  id: string;
  scoreId: string;
  error: string;
  code?: string;
  timestamp: Date;
  retryable: boolean;
}

/**
 * Conflict resolution data
 */
export interface ScoreConflict {
  id: string;
  localScore: CompetitorScore;
  remoteScore: CompetitorScore;
  detectedAt: Date;
  resolution?: 'local' | 'remote' | 'merged';
  resolvedAt?: Date;
  resolvedBy?: string;
}

// ============================================
// Placement and Results Types
// ============================================

/**
 * Placement calculation result
 */
export interface PlacementResult {
  entryId: string;
  armband: string;
  dogName: string;
  totalScore: number;
  placement: number;
  tied: boolean;
  tieBreaker?: string; // How tie was broken
  qualified: boolean;
  awards?: Award[];
}

/**
 * Award or title earned
 */
export interface Award {
  id: string;
  name: string;
  type: 'placement' | 'title' | 'qualification' | 'special';
  description?: string;
  icon?: string;
}

/**
 * Class results summary
 */
export interface ClassResults {
  classId: string;
  className: string;
  judgeId: string;
  judgeName: string;
  completedAt: Date;
  placements: PlacementResult[];
  statistics: {
    totalEntries: number;
    completed: number;
    absent: number;
    excused: number;
    disqualified: number;
    averageScore: number;
    highScore: number;
    lowScore: number;
    qualifyingRate: number; // Percentage
  };
}

// ============================================
// Timer and Performance Types
// ============================================

/**
 * Timer state for timed events
 */
export interface TimerState {
  startTime?: Date;
  endTime?: Date;
  elapsed: number; // Milliseconds
  running: boolean;
  paused: boolean;
  faults: Fault[];
  totalTime: number; // Including penalties
}

/**
 * Fault in timed events
 */
export interface Fault {
  id: string;
  type: 'refusal' | 'knocked_bar' | 'off_course' | 'time' | 'other';
  penalty: number; // Time penalty in milliseconds or points
  timestamp: Date;
  description?: string;
}

// ============================================
// UI State Types
// ============================================

/**
 * Scoring interface state
 */
export interface ScoringUIState {
  currentEntryIndex: number;
  totalEntries: number;
  isDirty: boolean; // Has unsaved changes
  autoSaveEnabled: boolean;
  lastAutoSave?: Date;
  viewMode: 'scoring' | 'review' | 'placements';
  expandedSections: string[];
  quickActionsVisible: boolean;
}

/**
 * Navigation state between competitors
 */
export interface NavigationState {
  canGoPrevious: boolean;
  canGoNext: boolean;
  previousArmband?: string;
  nextArmband?: string;
  history: string[]; // Entry IDs in order visited
}

// ============================================
// API Response Types
// ============================================

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  metadata?: {
    timestamp: Date;
    version: string;
  };
}

/**
 * Batch operation result
 */
export interface BatchResult {
  processed: number;
  failed: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
  results: Record<string, unknown>[];
}

// ============================================
// Export convenience type aliases
// ============================================

// Note: Import these types directly from this file to avoid naming conflicts