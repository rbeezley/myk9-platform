/**
 * Exhibitor-specific type definitions for the mobile experience
 */

import { Dog } from './dog-types';

// Define User interface with role
export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
}

// Define ShowClass interface
export interface ShowClass {
  id: string;
  showId: string;
  trialId: string;
  name: string;
  className?: string;
  classNumber?: string;
  element: string;
  level: string;
  maxEntries: number;
  judgeName: string;
  judgeId?: string;
  startTime: string;
  scheduledTime?: string;
  ringNumber: number;
  ring?: string | number;
  entries?: unknown[];
}

// Define Trial interface
export interface Trial {
  id: string;
  showId: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  organization: string;
}

// Define ClassEntry interface
export interface ClassEntry {
  id: string;
  classId: string;
  dogId: string;
  handlerId: string;
  status: string;
  checkInTime?: Date;
}

// Define CompetitionResult interface
export interface CompetitionResult {
  id?: string;
  entryId?: string;
  qualified?: boolean;
  time?: string;
  placement?: string;
  score?: string;
  searchTime?: number; // milliseconds
  faults?: number;
  recordedBy: string;
  recordedAt: string;
}

/**
 * Exhibitor's view of a class entry with additional mobile-specific data
 */
export interface ExhibitorEntry {
  id: string;
  classId: string;
  dogId?: string;
  handlerId?: string;
  armband: string;
  runningOrder?: number;
  checkInStatus: CheckInStatus;
  estimatedRingTime?: Date;
  ringPosition?: number;
  conflictWarning?: ConflictInfo;
  handler?: User;
  dog?: Dog;

  // Additional fields for mobile interface
  dogCallName: string;
  dogRegistrationNumber: string;
  breed: string;
  handlerName: string;
  className: string;
  ringNumber: number;
  judgeName: string;
  scheduledTime?: Date;
  checkInTime?: Date;
  result?: CompetitionResult;
}

/**
 * Check-in status for exhibitor entries.
 * Superset of @myk9/core CheckInStatus — includes both the ringside state
 * machine values (no-status, at-gate, pulled, in-ring, conflict) and the
 * exhibitor-display values (not-opened, pending, scratched, absent).
 * Unifying these in @myk9/core is a follow-up task.
 */
export type CheckInStatus =
  | 'no-status' // not yet visible to exhibitor
  | 'not-opened' // check-in window not yet open
  | 'pending' // window open, not checked in
  | 'checked-in' // present and ready
  | 'at-gate' // called to gate
  | 'come-to-gate' // urgent gate call
  | 'in-ring' // currently running
  | 'conflict' // scheduling conflict flagged
  | 'pulled' // pulled from ring
  | 'scratched' // withdrawn by exhibitor
  | 'absent' // no-show
  | 'completed'; // judged

/**
 * Conflict information for scheduling
 */
export interface ConflictInfo {
  type: 'time' | 'ring' | 'handler' | 'dog';
  severity: 'warning' | 'critical';
  description: string;
  conflictingClass?: ExhibitorClassInfo;
}

/**
 * Exhibitor's view of a class with real-time status
 */
export interface ExhibitorClassInfo {
  class: ShowClass;
  trial: Trial;
  entry: ExhibitorEntry;
  ringStatus: RingStatus;
  results?: CompetitionResult;
}

/**
 * Real-time ring status information
 */
export interface RingStatus {
  classId: string;
  className: string;
  ringNumber: number;
  judgeName: string;
  currentDog?: {
    armband: string;
    dogName: string;
    breed: string;
    handlerName: string;
    startTime?: Date;
    elapsedTime?: number;
  };
  onDeck: OnDeckEntry[];
  userPosition?: number;
  isPaused?: boolean;
  pauseReason?: string;
  delayMinutes?: number;
  estimatedTimeMinutes?: number;
  estimatedDelay?: number; // minutes
  judgeStatus?: 'active' | 'break' | 'delayed' | 'not-started';
  totalEntries?: number;
  completedEntries?: number;
  lastUpdated?: Date;
}

/**
 * Entry that's coming up soon
 */
export interface OnDeckEntry {
  armband: string;
  dogName: string;
  breed: string;
  handlerName: string;
  position?: number;
  estimatedMinutes?: number;
}

/**
 * Notification preferences for exhibitors
 */
export interface NotificationPreferences {
  ringCalls: boolean; // "You're up in 2 dogs!"
  results: boolean; // "Your results are posted!"
  delays: boolean; // "Ring running 20 min late"
  scheduling: boolean; // "Class moved to Ring 2"
  titles: boolean; // "Title leg achieved!"
  advanceTime?: number; // Minutes before ring time to notify
}

/**
 * WebSocket event for exhibitor updates
 */
export interface ExhibitorEvent {
  type: 'ringUpdate' | 'resultPosted' | 'scheduleChange' | 'ringCall';
  classId: string;
  data: RingStatus | CompetitionResult | Record<string, unknown>;
  timestamp: string;
  targetExhibitors?: string[];
}

/**
 * Exhibitor dashboard data
 */
export interface ExhibitorDashboardData {
  exhibitor: User;
  todaysClasses: ExhibitorClassInfo[];
  upcomingClasses: ExhibitorClassInfo[];
  recentResults: ResultWithPlacement[];
  notifications: ExhibitorNotification[];
  stats: ExhibitorStats;
}

/**
 * Result with placement information
 */
export interface ResultWithPlacement {
  result: CompetitionResult;
  placement?: number;
  totalEntries: number;
  titleProgress?: TitleProgress;
  class: ShowClass;
  trial: Trial;
}

/**
 * Title progression tracking
 */
export interface TitleProgress {
  titleName: string;
  currentLegs: number;
  requiredLegs: number;
  isNewLeg: boolean;
  completionDate?: Date;
}

/**
 * Exhibitor notifications
 */
export interface ExhibitorNotification {
  id: string;
  type: 'ring-call' | 'result' | 'delay' | 'schedule' | 'title' | 'reminder';
  severity: 'info' | 'warning' | 'success' | 'urgent';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  classId?: string;
  entryId?: string;
}

/**
 * Exhibitor statistics
 */
export interface ExhibitorStats {
  totalEntriestoday: number;
  completedToday: number;
  qualifiedToday: number;
  upcomingToday: number;
  nextRingTime?: Date;
  activeConflicts: number;
}

/**
 * Check-in request
 */
export interface CheckInRequest {
  entryId: string;
  status: 'present' | 'scratch';
  handlerChange?: string; // New handler ID if changed
  specialRequests?: string;
  timestamp: Date;
}

/**
 * Ring monitor event for real-time updates
 */
export interface RingMonitorEvent {
  type: 'entry-started' | 'entry-completed' | 'judge-break' | 'delay-update' | 'order-change';
  ringNumber: string;
  classId: string;
  data: {
    currentEntry?: OnDeckEntry;
    completedEntry?: string;
    delayMinutes?: number;
    newOrder?: string[];
    message?: string;
  };
  timestamp: Date;
}

/**
 * Multi-dog management
 */
export interface MultiDogSchedule {
  exhibitorId: string;
  dogs: DogSchedule[];
  conflicts: ConflictInfo[];
  suggestedRoute?: RouteSuggestion;
}

/**
 * Individual dog's schedule
 */
export interface DogSchedule {
  dog: Dog;
  classes: ExhibitorClassInfo[];
  nextClass?: ExhibitorClassInfo;
  estimatedEndTime?: Date;
}

/**
 * Suggested route between rings
 */
export interface RouteSuggestion {
  stops: RouteStop[];
  totalTime: number; // minutes
  warnings: string[];
}

/**
 * Individual stop on route
 */
export interface RouteStop {
  ringNumber: string;
  arriveBy: Date;
  dogName: string;
  className: string;
  waitTime?: number; // minutes
}

/**
 * PWA installation state
 */
export interface PWAState {
  isInstalled: boolean;
  isInstallable: boolean;
  platform: 'ios' | 'android' | 'desktop' | 'unknown';
  displayMode: 'browser' | 'standalone' | 'fullscreen';
}

/**
 * Offline sync status
 */
export interface OfflineSyncStatus {
  pendingCheckIns: number;
  lastSyncTime?: Date;
  isOnline: boolean;
  syncInProgress: boolean;
  errors: SyncError[];
}

/**
 * Sync error information
 */
export interface SyncError {
  id: string;
  type: 'check-in' | 'result-fetch' | 'notification';
  message: string;
  timestamp: Date;
  retryCount: number;
  data?: Record<string, unknown>;
}
