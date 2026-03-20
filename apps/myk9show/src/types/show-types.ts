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
  trialType?: string | undefined;
  classes?: Class[] | undefined;
  // Entry limits
  maxEntriesPerDog?: number | undefined;
  maxTotalEntries?: number | undefined;
  maxEntriesPerHandler?: number | undefined;
}

export interface Class {
  id: string;
  name: string;
  description?: string | undefined;
  entryFee?: number | undefined;
  jumpHeights?: string[] | undefined;
  // Entry limits and restrictions
  maxEntries?: number | undefined;
  allowWaitlist?: boolean | undefined;
  maxDogsPerHandler?: number | undefined;
  // Class restrictions
  level?: string | undefined;
  element?: string | undefined;
  competitionType?: string | undefined;
  breedRestrictions?: string[] | undefined;
  ageRestrictions?: { min?: number | undefined; max?: number | undefined } | undefined;
  heightRestrictions?: { min?: number | undefined; max?: number | undefined } | undefined;
  handlerAgeRestrictions?: { min?: number | undefined; max?: number | undefined } | undefined;
  // Schedule info
  startTime?: string | undefined;
  estimatedDuration?: number | undefined; // in minutes
}

export interface Show {
  id: string;
  name: string;
  organization: string;
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
  dayOfShowFee?: string | undefined; // Fee for registrations made on day of show
  entryDeadline?: string | undefined; // Entry deadline date
  lateEntryDeadline?: string | undefined; // Late entry deadline date
  // Club relationship - FIXED: Added proper foreign key
  clubId: string; // Proper foreign key to Club
  // Club info (denormalized for performance, but club should be source of truth)
  clubName: string;
  clubAddress: string;
  clubEmail: string;
  logoUrl: string;
  coverImageUrl: string;
  accentColor: string;
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
  maxEntriesPerDog?: number | undefined;
  maxTotalEntries?: number | undefined;
  allowNonOwnerHandlers?: boolean | undefined;
  // Optional message included in registration confirmation emails
  confirmationMessage?: string | undefined;
  // Starting armband number for auto-assignment (default 100)
  startingArmbandNumber?: number | undefined;

  // Sync metadata for Local-First architecture
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

// Export Trial interface (previously ShowTrial)
export type Trial = ShowTrial;

// Input types for creating/updating shows
export interface ShowInput {
  name: string;
  organization: string;
  startDate: string;
  endDate: string;
  location: string;
  status: string;
  events: string[];
  source: 'myK9Show' | 'external';
  entryOpenDate: string;
  entryCloseDate: string;
  preEntryFee: string;
  dayOfShowFee?: string | undefined;
  clubId: string;
  clubName: string;
  clubAddress: string;
  clubEmail: string;
  logoUrl?: string | undefined;
  coverImageUrl?: string | undefined;
  accentColor?: string | undefined;
  chairman: string;
  secretary: string;
  chiefSteward: string;
  assignedJudges?: ShowJudgeAssignment[] | undefined;
  trials?: ShowTrial[] | undefined;
  // Optional message included in registration confirmation emails
  confirmationMessage?: string | undefined;
  // Starting armband number for auto-assignment (default 100)
  startingArmbandNumber?: number | undefined;
  // Index signature for compatibility with Record<string, unknown>
  [key: string]: unknown;
}
