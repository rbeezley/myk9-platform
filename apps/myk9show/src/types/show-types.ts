import { ShowJudgeAssignment } from './judge-types';

// Re-export types from other modules that are commonly used with shows
export type { User } from './user-types';
export type { ShowClass } from './exhibitor-types';

export interface ShowStat {
  title: string;
  iconClass: string;
  iconBg: string;
  iconColor: string;
  value: string;
  trend: string;
  trendIcon: string;
  trendColor: string;
  detail1: string;
  detail2: string;
  progress: string;
  progressColor: string;
}

export interface ShowTrial {
  id: string;
  name: string;
  date: string;
  trialNumber: string;
  status: string;
  classes?: Class[];
  // Entry limits
  maxEntriesPerDog?: number;
  maxTotalEntries?: number;
  maxEntriesPerHandler?: number;
}

export interface Class {
  id: string;
  name: string;
  description?: string;
  entryFee?: number;
  jumpHeights?: string[];
  // Entry limits and restrictions
  maxEntries?: number;
  allowWaitlist?: boolean;
  maxDogsPerHandler?: number;
  // Class restrictions
  level?: string;
  breedRestrictions?: string[];
  ageRestrictions?: { min?: number; max?: number };
  heightRestrictions?: { min?: number; max?: number };
  handlerAgeRestrictions?: { min?: number; max?: number };
  // Schedule info
  startTime?: string;
  estimatedDuration?: number; // in minutes
}

export interface Show {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  status: string;
  events: string[];
  source: 'myK9Show' | 'external';
  // Entry information
  entryOpenDate: string;
  entryCloseDate: string;
  preEntryFee: string;
  dayOfShowFee?: string; // Fee for registrations made on day of show
  entryDeadline?: string; // Entry deadline date
  lateEntryDeadline?: string; // Late entry deadline date
  // Club relationship - FIXED: Added proper foreign key
  clubId: string; // ✅ Proper foreign key to Club
  // Club info (denormalized for performance, but club should be source of truth)
  clubName: string;
  clubAddress: string;
  clubEmail: string;
  // Key personnel
  chairman: string;
  secretary: string;
  chiefSteward: string;
  // Judge assignments
  assignedJudges: ShowJudgeAssignment[];
  // Show statistics
  stats: ShowStat[];
  // Associated trials
  trials: ShowTrial[];
  // Entry limits
  maxEntriesPerDog?: number;
  maxTotalEntries?: number;
  allowNonOwnerHandlers?: boolean;

  // Sync metadata for Local-First architecture
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

// Export Trial interface (previously ShowTrial)
export type Trial = ShowTrial;

// Input types for creating/updating shows
export interface ShowInput {
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  status: string;
  events: string[];
  source: 'myK9Show' | 'external';
  entryOpenDate: string;
  entryCloseDate: string;
  preEntryFee: string;
  dayOfShowFee?: string;
  clubId: string;
  clubName: string;
  clubAddress: string;
  clubEmail: string;
  chairman: string;
  secretary: string;
  chiefSteward: string;
  assignedJudges?: ShowJudgeAssignment[];
  trials?: ShowTrial[];
  // Index signature for compatibility with Record<string, unknown>
  [key: string]: unknown;
}
