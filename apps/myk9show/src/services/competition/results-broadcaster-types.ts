/**
 * Results Broadcaster Type Definitions
 * Phase 6.2: Live Competition Features
 *
 * All interfaces and type definitions used by the ResultsBroadcaster service
 * and its consumers.
 */

import type { Priority } from '../../types/realtime-types';

export interface ScoreResult {
  id: string;
  entryId: string;
  dogId: string;
  dogName: string;
  ownerName: string;
  armband: string;
  classId: string;
  className: string;
  showId: string;
  judgeId: string;
  judgeName: string;
  score: {
    points: number;
    time: number;
    faults: number;
    totalScore: number;
    qualifying: boolean;
    qualified: boolean;
  };
  placement?: {
    position: number;
    total: number;
    qualified: boolean;
    title?: string | undefined; // "1st Place", "Winner", etc.
  } | undefined;
  status: 'preliminary' | 'official' | 'final';
  timestamp: Date;
  submittedAt: Date;
  notes?: string | undefined;
  videoUrl?: string | undefined;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface PlacementResult {
  classId: string;
  className: string;
  showId: string;
  judgeId: string;
  judgeName: string;
  placements: Array<{
    position: number;
    entryId: string;
    dogId: string;
    dogName: string;
    ownerName: string;
    armband: string;
    finalScore: number;
    qualified: boolean;
    award?: string | undefined;
    specialAward?: string | undefined;
  }>;
  totalEntries: number;
  qualifyingEntries: number;
  calculatedAt: Date;
  isComplete: boolean;
  isOfficial: boolean;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface AwardResult {
  id: string;
  type: 'placement' | 'special' | 'qualification' | 'championship';
  title: string;
  description: string;
  recipient: {
    entryId: string;
    dogId: string;
    dogName: string;
    ownerName: string;
    armband: string;
  };
  classId?: string | undefined;
  className?: string | undefined;
  showId: string;
  value?: number | undefined; // Championship points, etc.
  criteria: string;
  awardedAt: Date;
  awardedBy: string;
  certificate?: {
    templateId: string;
    generatedUrl?: string | undefined;
  } | undefined;
}

export interface ResultsNotification {
  id: string;
  type: 'score-posted' | 'placement-updated' | 'award-announced' | 'results-finalized';
  priority: Priority;
  title: string;
  message: string;
  targetAudience: 'all' | 'exhibitors' | 'class-participants' | 'specific';
  targetIds?: string[] | undefined; // Entry IDs or User IDs
  data: ScoreResult | PlacementResult | AwardResult;
  showId: string;
  classId?: string | undefined;
  timestamp: Date;
  expiresAt?: Date | undefined;
  displayDuration?: number | undefined; // seconds to display on screen
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface ResultsMetrics {
  showId: string;
  scoresPosted: number;
  placementsCalculated: number;
  awardsAnnounced: number;
  notificationsSent: number;
  averageScorePostingTime: number; // ms from submission to broadcast
  peakResultsRate: number; // results per minute
  lastActivity: Date;
  judgeActivity: Map<string, {
    judgeId: string;
    judgeName: string;
    scoresSubmitted: number;
    averageSubmissionTime: number;
    lastActivity: Date;
  }>;
}

/** Configuration for the ResultsBroadcaster service */
export interface ResultsBroadcasterConfig {
  batchResultsMs: number; // Batching delay for placement calculations
  scoreDelayMs: number; // Delay before broadcasting scores
  autoCalculatePlacements: boolean;
  notificationRetentionMs: number;
  enableVideoIntegration: boolean;
  qualifyingScoreThreshold: number; // Default qualifying score
}

/** Shape of realtime subscription event payloads */
export interface RealtimeEventPayload {
  payload?: { new?: Record<string, unknown> };
  data?: Record<string, unknown>;
}
