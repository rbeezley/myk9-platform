import type { MutableRefObject } from 'react';

import type LiveCompetitionService from '../../services/competition/liveCompetitionService';
import type { EntryStatus, CompetitionMetrics } from '../../services/competition/liveCompetitionService';
import type EntryStatusBroadcaster from '../../services/competition/entryStatusBroadcaster';
import type { RingStatusEvent, CallToRingNotification } from '../../services/competition/entryStatusBroadcaster';
import type CheckInNotificationService from '../../services/competition/checkinNotificationService';
import type { CheckInEvent, CheckInNotification, CheckInQueueStatus } from '../../services/competition/checkinNotificationService';
import type ResultsBroadcaster from '../../services/competition/resultsBroadcaster';
import type { ScoreResult, PlacementResult, AwardResult, ResultsNotification } from '../../services/competition/resultsBroadcaster';
import type CollaborativeJudging from '../../services/competition/collaborativeJudging';
import type { JudgeSession, CollaborativeScore, ScoringConflict, JudgeActivity } from '../../services/competition/collaborativeJudging';
import type PresenceService from '../../services/competition/presenceService';
import type { UserPresence, PresenceGroup, ActivityIndicator, PresenceAnalytics } from '../../services/competition/presenceService';

export type {
  EntryStatus,
  CompetitionMetrics,
  RingStatusEvent,
  CallToRingNotification,
  CheckInEvent,
  CheckInNotification,
  CheckInQueueStatus,
  ScoreResult,
  PlacementResult,
  AwardResult,
  ResultsNotification,
  JudgeSession,
  CollaborativeScore,
  ScoringConflict,
  JudgeActivity,
  UserPresence,
  PresenceGroup,
  ActivityIndicator,
  PresenceAnalytics,
};

export interface LiveCompetitionState {
  isActive: boolean;
  isInitialized: boolean;
  error: string | null;

  entryStatuses: Map<string, EntryStatus>;
  ringEvents: RingStatusEvent[];
  callNotifications: CallToRingNotification[];

  recentCheckIns: CheckInEvent[];
  checkInNotifications: CheckInNotification[];
  queueStatuses: Map<string, CheckInQueueStatus>;

  recentScores: ScoreResult[];
  placementResults: Map<string, PlacementResult>;
  awardResults: AwardResult[];
  resultsNotifications: ResultsNotification[];

  judgeSessions: JudgeSession[];
  collaborativeScores: Map<string, CollaborativeScore[]>;
  scoringConflicts: ScoringConflict[];
  judgeActivities: JudgeActivity[];

  onlineUsers: UserPresence[];
  presenceGroups: PresenceGroup[];
  activityIndicators: ActivityIndicator[];
  presenceAnalytics: PresenceAnalytics;
  currentUser: UserPresence | null;

  competitionMetrics: CompetitionMetrics;
}

export interface UseLiveCompetitionOptions {
  showId: string;
  classId?: string;
  autoStart?: boolean;
  enableEntryStatus?: boolean;
  enableCheckIns?: boolean;
  enableResults?: boolean;
  enableCollaborativeJudging?: boolean;
  enablePresence?: boolean;
  currentUser?: Partial<UserPresence>;
}

export interface LiveCompetitionActions {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;

  updateEntryRingStatus: (entryId: string, status: EntryStatus['ringStatus']) => Promise<void>;
  broadcastCallToRing: (entryId: string, callType: CallToRingNotification['callType']) => Promise<void>;

  triggerCheckInNotification: (entryId: string, message?: string) => Promise<void>;
  acknowledgeNotification: (notificationId: string) => Promise<void>;

  broadcastScore: (score: ScoreResult) => Promise<void>;
  broadcastPlacements: (placements: PlacementResult) => Promise<void>;

  resolveConflict: (conflictId: string, resolution: ScoringConflict['resolution']) => Promise<void>;
  addConflictDiscussion: (conflictId: string, note: string) => Promise<void>;
  trackJudgeActivity: (activity: JudgeActivity['activity'], metadata?: Record<string, unknown>) => Promise<void>;

  updateLocation: (location: UserPresence['location']) => Promise<void>;
  updateActivity: (activity: UserPresence['activity']) => Promise<void>;
  updateStatus: (status: UserPresence['status']) => Promise<void>;
  createActivityIndicator: (type: ActivityIndicator['type'], context: string) => Promise<void>;
  removeActivityIndicator: () => Promise<void>;

  refreshData: () => Promise<void>;
  exportMetrics: () => Promise<Record<string, unknown>>;
}

export interface ServiceInstances {
  liveCompetition?: LiveCompetitionService;
  entryStatus?: EntryStatusBroadcaster;
  checkIns?: CheckInNotificationService;
  results?: ResultsBroadcaster;
  collaborativeJudging?: CollaborativeJudging;
  presence?: PresenceService;
}

export type ServicesRef = MutableRefObject<ServiceInstances>;
export type CleanupRef = MutableRefObject<Array<() => void>>;
export type SetState = React.Dispatch<React.SetStateAction<LiveCompetitionState>>;

export function createInitialState(showId: string): LiveCompetitionState {
  return {
    isActive: false,
    isInitialized: false,
    error: null,
    entryStatuses: new Map(),
    ringEvents: [],
    callNotifications: [],
    recentCheckIns: [],
    checkInNotifications: [],
    queueStatuses: new Map(),
    recentScores: [],
    placementResults: new Map(),
    awardResults: [],
    resultsNotifications: [],
    judgeSessions: [],
    collaborativeScores: new Map(),
    scoringConflicts: [],
    judgeActivities: [],
    onlineUsers: [],
    presenceGroups: [],
    activityIndicators: [],
    presenceAnalytics: {
      showId,
      totalUsers: 0,
      activeUsers: 0,
      usersByRole: {},
      usersByStatus: {},
      usersByDevice: {},
      peakConcurrentUsers: 0,
      averageSessionDuration: 0,
      popularPages: [],
      activityHeatmap: [],
      lastUpdated: new Date(),
    },
    currentUser: null,
    competitionMetrics: {
      activeUsers: 0,
      activeJudges: 0,
      totalEntries: 0,
      checkedInEntries: 0,
      completedEntries: 0,
      activeRings: 0,
      notificationsSent: 0,
      averageProcessingTime: 0,
      lastUpdate: new Date(),
    },
  };
}
