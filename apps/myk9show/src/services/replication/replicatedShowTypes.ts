import type { ShowExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import type { ShowCloseRecord } from './showCloseRecordColumns';

/**
 * App-level Show type with camelCase fields and sync metadata
 */
export interface ReplicatedShow extends ShowCloseRecord {
  id: string;
  name: string;
  organization: string;
  startDate: string;
  endDate: string;
  location?: string | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  venueName?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  status?: string | undefined;
  deletedAt?: string | null | undefined;
  entryOpenDate?: string | undefined;
  entryCloseDate?: string | undefined;
  preEntryFee?: number | undefined;
  dayOfShowFee?: number | undefined;
  juniorHandlerFee?: number | null | undefined;
  startingArmbandNumber?: number | undefined;
  clubId?: string | undefined;
  maxEntriesPerDog?: number | undefined;
  maxTotalEntries?: number | undefined;
  defaultJudgeDayCapacity?: number | undefined;
  allowsNonOwnerHandlers?: boolean | undefined;
  isNationals?: boolean | undefined;
  acceptCheckPayments?: boolean | undefined;
  acceptCashPayments?: boolean | undefined;
  onlineEntriesEnabled?: boolean | undefined;
  /** MYK9-1685 "This show uses…" switches (shows.uses_* / publishes_own_premium). */
  usesDeviceScoring?: boolean | undefined;
  usesPaperPacket?: boolean | undefined;
  usesVolunteers?: boolean | undefined;
  usesLandingPage?: boolean | undefined;
  publishesOwnPremium?: boolean | undefined;
  /**
   * shows.allow_waitlist (MYK9-1019), read-only here: the Waitlist tab's settings card writes it
   * directly, so a rebuilt row never carries a cached copy back over it.
   */
  allowsWaitlist?: boolean | undefined;
  /** shows.version as last read from the server (read-only; never written). */
  serverVersion?: number | undefined;
  logoUrl?: string | undefined;
  coverImageUrl?: string | undefined;
  accentColor?: string | undefined;
  style?: string | undefined;
  experienceIsPublished?: boolean | undefined;
  experiencePublishedAt?: string | null | undefined;
  experiencePublishedStyle?: string | null | undefined;
  experiencePublishedContent?: ShowExperienceSnapshot | null | undefined;
  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

/** A new show: no id yet, and a club is required (MYK9-1008). */
export type ReplicatedShowCreateInput = Omit<ReplicatedShow, 'id' | 'clubId'> & { clubId: string };
