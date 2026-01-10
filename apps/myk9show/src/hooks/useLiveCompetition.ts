/**
 * Live Competition Hook
 * Phase 6.2: Live Competition Features
 * 
 * React hook for managing live competition features including real-time
 * entry status, check-ins, results, collaborative judging, and presence tracking.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { errorMonitor } from '../lib/errorMonitoring';

// Import services
import LiveCompetitionService, { 
  type LiveCompetitionConfig,
  type EntryStatus,
  type CompetitionMetrics 
} from '../services/competition/liveCompetitionService';
import EntryStatusBroadcaster, {
  type RingStatusEvent,
  type CallToRingNotification
} from '../services/competition/entryStatusBroadcaster';
import CheckInNotificationService, {
  type CheckInEvent,
  type CheckInNotification,
  type CheckInQueueStatus
} from '../services/competition/checkinNotificationService';
import ResultsBroadcaster, {
  type ScoreResult,
  type PlacementResult,
  type AwardResult,
  type ResultsNotification
} from '../services/competition/resultsBroadcaster';
import CollaborativeJudging, {
  type JudgeSession,
  type CollaborativeScore,
  type ScoringConflict,
  type JudgeActivity
} from '../services/competition/collaborativeJudging';
import PresenceService, {
  type UserPresence,
  type PresenceGroup,
  type ActivityIndicator,
  type PresenceAnalytics
} from '../services/competition/presenceService';

export interface LiveCompetitionState {
  // Service states
  isActive: boolean;
  isInitialized: boolean;
  error: string | null;
  
  // Entry status
  entryStatuses: Map<string, EntryStatus>;
  ringEvents: RingStatusEvent[];
  callNotifications: CallToRingNotification[];
  
  // Check-ins
  recentCheckIns: CheckInEvent[];
  checkInNotifications: CheckInNotification[];
  queueStatuses: Map<string, CheckInQueueStatus>;
  
  // Results
  recentScores: ScoreResult[];
  placementResults: Map<string, PlacementResult>;
  awardResults: AwardResult[];
  resultsNotifications: ResultsNotification[];
  
  // Collaborative judging
  judgeSessions: JudgeSession[];
  collaborativeScores: Map<string, CollaborativeScore[]>;
  scoringConflicts: ScoringConflict[];
  judgeActivities: JudgeActivity[];
  
  // Presence
  onlineUsers: UserPresence[];
  presenceGroups: PresenceGroup[];
  activityIndicators: ActivityIndicator[];
  presenceAnalytics: PresenceAnalytics;
  currentUser: UserPresence | null;
  
  // Metrics
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
  // Service management
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  
  // Entry status actions
  updateEntryRingStatus: (entryId: string, status: EntryStatus['ringStatus']) => Promise<void>;
  broadcastCallToRing: (entryId: string, callType: CallToRingNotification['callType']) => Promise<void>;
  
  // Check-in actions
  triggerCheckInNotification: (entryId: string, message?: string) => Promise<void>;
  acknowledgeNotification: (notificationId: string) => Promise<void>;
  
  // Results actions
  broadcastScore: (score: ScoreResult) => Promise<void>;
  broadcastPlacements: (placements: PlacementResult) => Promise<void>;
  
  // Collaborative judging actions
  resolveConflict: (conflictId: string, resolution: ScoringConflict['resolution']) => Promise<void>;
  addConflictDiscussion: (conflictId: string, note: string) => Promise<void>;
  trackJudgeActivity: (activity: JudgeActivity['activity'], metadata?: Record<string, unknown>) => Promise<void>;
  
  // Presence actions
  updateLocation: (location: UserPresence['location']) => Promise<void>;
  updateActivity: (activity: UserPresence['activity']) => Promise<void>;
  updateStatus: (status: UserPresence['status']) => Promise<void>;
  createActivityIndicator: (type: ActivityIndicator['type'], context: string) => Promise<void>;
  removeActivityIndicator: () => Promise<void>;
  
  // Utility actions
  refreshData: () => Promise<void>;
  exportMetrics: () => Promise<Record<string, unknown>>;
}

/**
 * Hook for managing live competition features
 */
export function useLiveCompetition(options: UseLiveCompetitionOptions) {
  const {
    showId,
    classId,
    autoStart = false,
    enableEntryStatus = true,
    enableCheckIns = true,
    enableResults = true,
    enableCollaborativeJudging = false,
    enablePresence = true,
    currentUser,
  } = options;

  // State
  const [state, setState] = useState<LiveCompetitionState>({
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
  });

  // Service instances
  const servicesRef = useRef<{
    liveCompetition?: LiveCompetitionService;
    entryStatus?: EntryStatusBroadcaster;
    checkIns?: CheckInNotificationService;
    results?: ResultsBroadcaster;
    collaborativeJudging?: CollaborativeJudging;
    presence?: PresenceService;
  }>({});

  // Cleanup functions
  const cleanupFunctionsRef = useRef<Array<() => void>>([]);

  /**
   * Initialize services
   */
  const initializeServices = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      const services = servicesRef.current;

      // Initialize live competition service
      const config: LiveCompetitionConfig = {
        showId,
        enableEntryStatusUpdates: enableEntryStatus,
        enableCheckInNotifications: enableCheckIns,
        enableResultsBroadcasting: enableResults,
        enablePresenceTracking: enablePresence,
        enableCollaborativeJudging: enableCollaborativeJudging,
        batchUpdates: true,
        updateInterval: 1000,
      };

      services.liveCompetition = new LiveCompetitionService(config);

      // Initialize entry status broadcaster
      if (enableEntryStatus) {
        services.entryStatus = new EntryStatusBroadcaster(showId);
      }

      // Initialize check-in notification service
      if (enableCheckIns) {
        services.checkIns = new CheckInNotificationService(showId);
      }

      // Initialize results broadcaster
      if (enableResults) {
        services.results = new ResultsBroadcaster(showId);
      }

      // Initialize collaborative judging
      if (enableCollaborativeJudging && classId) {
        services.collaborativeJudging = new CollaborativeJudging(showId, classId);
      }

      // Initialize presence service
      if (enablePresence) {
        services.presence = new PresenceService(showId);
      }

      setState(prev => ({ ...prev, isInitialized: true }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize services';
      setState(prev => ({ ...prev, error: errorMessage }));
      
      errorMonitor.captureError(error as Error, {
        additionalData: { 
          showId, 
          classId, 
          autoStart,
          enableEntryStatus,
          enableCheckIns,
          enableResults,
          enableCollaborativeJudging,
          enablePresence
        }
      });
    }
  }, [showId, classId, autoStart, enableEntryStatus, enableCheckIns, enableResults, enableCollaborativeJudging, enablePresence]);

  /**
   * Setup event listeners
   */
  const setupEventListeners = useCallback(() => {
    const services = servicesRef.current;
    const cleanupFunctions: Array<() => void> = [];

    // Live competition service listeners
    if (services.liveCompetition) {
      services.liveCompetition.onEntryStatusChange((status) => {
        setState(prev => ({
          ...prev,
          entryStatuses: new Map(prev.entryStatuses.set(status.entryId, status)),
        }));
      });

      services.liveCompetition.onCheckInChange((notification) => {
        // Convert CompetitionNotification to CheckInNotification format
        // Note: This is a simplified conversion - in production, you might want to handle this differently
        const checkInNotification: CheckInNotification = {
          id: notification.id,
          type: 'status-change',
          priority: notification.priority,
          title: notification.title,
          message: notification.message,
          checkInEvent: {} as CheckInEvent, // This would need proper conversion
          targetRoles: ['secretary', 'steward'],
          expiresAt: notification.expiresAt || new Date(Date.now() + 30 * 60 * 1000),
          persistent: false,
          actionRequired: false,
          timestamp: notification.timestamp,
        };
        setState(prev => ({
          ...prev,
          checkInNotifications: [...prev.checkInNotifications, checkInNotification],
        }));
      });

      services.liveCompetition.onResultsChange((results) => {
        // Convert raw results to ScoreResult format
        const scoreResult: ScoreResult = {
          id: (results.id as string) || '',
          entryId: (results.entry_id as string) || '',
          dogId: (results.dog_id as string) || '',
          dogName: (results.dog_name as string) || '',
          ownerName: (results.owner_name as string) || '',
          armband: (results.armband as string) || '',
          classId: (results.class_id as string) || '',
          className: (results.class_name as string) || '',
          showId: (results.show_id as string) || '',
          judgeId: (results.judge_id as string) || '',
          judgeName: (results.judge_name as string) || '',
          score: {
            points: (results.points as number) || 0,
            time: (results.time as number) || 0,
            faults: (results.faults as number) || 0,
            totalScore: (results.total_score as number) || 0,
            qualifying: (results.qualifying as boolean) || false,
            qualified: (results.qualified as boolean) || false,
          },
          placement: results.placement ? {
            position: (results.placement as { position: number }).position || 0,
            total: (results.placement as { total: number }).total || 0,
            qualified: (results.placement as { qualified: boolean }).qualified || false,
            title: (results.placement as { title?: string }).title,
          } : undefined,
          status: (results.status as 'preliminary' | 'official' | 'final') || 'preliminary',
          timestamp: new Date(results.timestamp as string || Date.now()),
          submittedAt: new Date(results.submitted_at as string || Date.now()),
          notes: results.notes as string,
          videoUrl: results.video_url as string,
        };
        
        setState(prev => ({
          ...prev,
          recentScores: [...prev.recentScores, scoreResult],
        }));
      });

      services.liveCompetition.onPresenceUpdate((presences) => {
        // Convert PresenceTrackingData[] to UserPresence[]
        const userPresences: UserPresence[] = presences.map(presence => ({
          userId: presence.user_id,
          userName: presence.user_name,
          displayName: presence.user_name,
          role: presence.role,
          status: presence.status,
          lastSeen: new Date(presence.last_seen),
          joinedAt: new Date(), // Default since not provided
          location: {
            page: 'competition',
            showId: presence.show_id || '',
            classId: presence.class_id,
          },
          activity: {
            type: 'viewing',
            description: 'Viewing competition',
            startedAt: new Date(),
          },
          device: presence.device_info || {
            type: 'desktop',
            os: 'unknown',
            browser: 'unknown',
          },
          preferences: {
            showPresence: true,
            showActivity: true,
            notificationLevel: 'all',
          },
        }));
        setState(prev => ({
          ...prev,
          onlineUsers: userPresences,
        }));
      });
    }

    // Entry status broadcaster listeners
    if (services.entryStatus) {
      const removeStatusListener = services.entryStatus.onStatusUpdate((update) => {
        setState(prev => ({
          ...prev,
          entryStatuses: new Map(prev.entryStatuses.set(update.entryId, {
            entryId: update.entryId,
            dogId: update.dogId,
            checkInStatus: update.checkInStatus,
            ringStatus: update.ringStatus,
            armband: update.armband,
            classId: update.classId,
            sequence: update.sequence,
            ringAssignment: update.ringAssignment,
            callTime: update.actualCallTime,
            completedTime: update.completedTime,
            updatedAt: update.updatedAt,
            updatedBy: update.updatedBy,
          })),
        }));
      });
      cleanupFunctions.push(removeStatusListener);

      const removeRingEventListener = services.entryStatus.onRingEvent((event) => {
        setState(prev => ({
          ...prev,
          ringEvents: [...prev.ringEvents.slice(-20), event], // Keep last 20 events
        }));
      });
      cleanupFunctions.push(removeRingEventListener);

      const removeCallListener = services.entryStatus.onCallNotification((notification) => {
        setState(prev => ({
          ...prev,
          callNotifications: [...prev.callNotifications.slice(-10), notification], // Keep last 10 calls
        }));
      });
      cleanupFunctions.push(removeCallListener);
    }

    // Check-in service listeners
    if (services.checkIns) {
      const removeCheckInListener = services.checkIns.onCheckInEvent((event) => {
        setState(prev => ({
          ...prev,
          recentCheckIns: [...prev.recentCheckIns.slice(-50), event], // Keep last 50 check-ins
        }));
      });
      cleanupFunctions.push(removeCheckInListener);

      const removeNotificationListener = services.checkIns.onNotification((notification) => {
        setState(prev => ({
          ...prev,
          checkInNotifications: [...prev.checkInNotifications, notification],
        }));
      });
      cleanupFunctions.push(removeNotificationListener);

      const removeQueueListener = services.checkIns.onQueueUpdate((status) => {
        setState(prev => ({
          ...prev,
          queueStatuses: new Map(prev.queueStatuses.set(status.classId, status)),
        }));
      });
      cleanupFunctions.push(removeQueueListener);
    }

    // Results broadcaster listeners
    if (services.results) {
      const removeScoreListener = services.results.onScoreResult((result) => {
        setState(prev => ({
          ...prev,
          recentScores: [...prev.recentScores.slice(-100), result], // Keep last 100 scores
        }));
      });
      cleanupFunctions.push(removeScoreListener);

      const removePlacementListener = services.results.onPlacementResult((result) => {
        setState(prev => ({
          ...prev,
          placementResults: new Map(prev.placementResults.set(result.classId, result)),
        }));
      });
      cleanupFunctions.push(removePlacementListener);

      const removeAwardListener = services.results.onAwardResult((result) => {
        setState(prev => ({
          ...prev,
          awardResults: [...prev.awardResults, result],
        }));
      });
      cleanupFunctions.push(removeAwardListener);

      const removeResultsNotificationListener = services.results.onNotification((notification) => {
        setState(prev => ({
          ...prev,
          resultsNotifications: [...prev.resultsNotifications, notification],
        }));
      });
      cleanupFunctions.push(removeResultsNotificationListener);
    }

    // Collaborative judging listeners
    if (services.collaborativeJudging) {
      const removeSessionListener = services.collaborativeJudging.onSessionUpdate((session) => {
        setState(prev => ({
          ...prev,
          judgeSessions: prev.judgeSessions.filter(s => s.judgeId !== session.judgeId).concat(session),
        }));
      });
      cleanupFunctions.push(removeSessionListener);

      const removeScoreUpdateListener = services.collaborativeJudging.onScoreUpdate((score) => {
        setState(prev => {
          const entryScores = prev.collaborativeScores.get(score.entryId) || [];
          const existingIndex = entryScores.findIndex(s => s.judgeId === score.judgeId);
          const updatedScores = existingIndex >= 0 
            ? entryScores.map((s, i) => i === existingIndex ? score : s)
            : [...entryScores, score];
          
          return {
            ...prev,
            collaborativeScores: new Map(prev.collaborativeScores.set(score.entryId, updatedScores)),
          };
        });
      });
      cleanupFunctions.push(removeScoreUpdateListener);

      const removeConflictListener = services.collaborativeJudging.onConflictDetected((conflict) => {
        setState(prev => ({
          ...prev,
          scoringConflicts: [...prev.scoringConflicts, conflict],
        }));
      });
      cleanupFunctions.push(removeConflictListener);

      const removeActivityListener = services.collaborativeJudging.onJudgeActivity((activity) => {
        setState(prev => ({
          ...prev,
          judgeActivities: prev.judgeActivities.filter(a => a.judgeId !== activity.judgeId).concat(activity),
        }));
      });
      cleanupFunctions.push(removeActivityListener);
    }

    // Presence service listeners
    if (services.presence) {
      const removeUserJoinedListener = services.presence.onUserJoined((user) => {
        setState(prev => ({
          ...prev,
          onlineUsers: [...prev.onlineUsers.filter(u => u.userId !== user.userId), user],
        }));
      });
      cleanupFunctions.push(removeUserJoinedListener);

      const removeUserLeftListener = services.presence.onUserLeft((userId) => {
        setState(prev => ({
          ...prev,
          onlineUsers: prev.onlineUsers.filter(u => u.userId !== userId),
        }));
      });
      cleanupFunctions.push(removeUserLeftListener);

      const removeUserUpdatedListener = services.presence.onUserUpdated((user) => {
        setState(prev => ({
          ...prev,
          onlineUsers: prev.onlineUsers.map(u => u.userId === user.userId ? user : u),
        }));
      });
      cleanupFunctions.push(removeUserUpdatedListener);

      const removeActivityIndicatorListener = services.presence.onActivityIndicator((indicator) => {
        setState(prev => ({
          ...prev,
          activityIndicators: [...prev.activityIndicators.filter(a => a.userId !== indicator.userId), indicator],
        }));
      });
      cleanupFunctions.push(removeActivityIndicatorListener);

      const removeGroupUpdateListener = services.presence.onGroupUpdate((group) => {
        setState(prev => ({
          ...prev,
          presenceGroups: prev.presenceGroups.map(g => g.id === group.id ? group : g),
        }));
      });
      cleanupFunctions.push(removeGroupUpdateListener);
    }

    cleanupFunctionsRef.current = cleanupFunctions;
  }, []);

  /**
   * Start live competition services
   */
  const start = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      const services = servicesRef.current;

      // Start all enabled services
      const startPromises: Promise<void>[] = [];

      if (services.liveCompetition) {
        startPromises.push(services.liveCompetition.start());
      }

      if (services.entryStatus) {
        startPromises.push(services.entryStatus.start());
      }

      if (services.checkIns) {
        startPromises.push(services.checkIns.start());
      }

      if (services.results) {
        startPromises.push(services.results.start());
      }

      if (services.collaborativeJudging) {
        startPromises.push(services.collaborativeJudging.start());
      }

      if (services.presence && currentUser) {
        startPromises.push(services.presence.start(currentUser));
      }

      await Promise.all(startPromises);

      // Setup event listeners
      setupEventListeners();

      setState(prev => ({
        ...prev,
        isActive: true,
        currentUser: services.presence?.getCurrentUser() || null,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start live competition';
      setState(prev => ({ ...prev, error: errorMessage, isActive: false }));
      
      errorMonitor.captureError(error as Error, {
        additionalData: { showId, classId }
      });
    }
  }, [setupEventListeners, showId, classId, currentUser]);

  /**
   * Stop live competition services
   */
  const stop = useCallback(async () => {
    try {
      const services = servicesRef.current;

      // Cleanup event listeners
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];

      // Stop all services
      const stopPromises: Promise<void>[] = [];

      if (services.liveCompetition) {
        stopPromises.push(services.liveCompetition.stop());
      }

      if (services.entryStatus) {
        stopPromises.push(services.entryStatus.stop());
      }

      if (services.checkIns) {
        stopPromises.push(services.checkIns.stop());
      }

      if (services.results) {
        stopPromises.push(services.results.stop());
      }

      if (services.collaborativeJudging) {
        stopPromises.push(services.collaborativeJudging.stop());
      }

      if (services.presence) {
        stopPromises.push(services.presence.stop());
      }

      await Promise.all(stopPromises);

      setState(prev => ({ ...prev, isActive: false }));
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId, classId }
      });
    }
  }, [showId, classId]);

  /**
   * Restart live competition services
   */
  const restart = useCallback(async () => {
    await stop();
    await start();
  }, [stop, start]);

  // Actions for entry status
  const updateEntryRingStatus = useCallback(async (entryId: string, status: EntryStatus['ringStatus']) => {
    try {
      await servicesRef.current.liveCompetition?.updateEntryRingStatus(entryId, status);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, status, showId }
      });
      throw error;
    }
  }, [showId]);

  const broadcastCallToRing = useCallback(async (entryId: string, callType: CallToRingNotification['callType']) => {
    try {
      // This would be implemented based on your specific requirements
      void entryId;
      void callType;
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, callType, showId }
      });
      throw error;
    }
  }, [showId]);

  // Actions for check-ins
  const triggerCheckInNotification = useCallback(async (entryId: string, message?: string) => {
    try {
      await servicesRef.current.checkIns?.triggerCheckInNotification(entryId, message);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, message, showId }
      });
      throw error;
    }
  }, [showId]);

  const acknowledgeNotification = useCallback(async (notificationId: string) => {
    try {
      const userId = servicesRef.current.presence?.getCurrentUser()?.userId || 'unknown';
      await servicesRef.current.checkIns?.acknowledgeNotification(notificationId, userId);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { notificationId, showId }
      });
      throw error;
    }
  }, [showId]);

  // Actions for results
  const broadcastScore = useCallback(async (score: ScoreResult) => {
    try {
      await servicesRef.current.results?.broadcastScore(score);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { score, showId }
      });
      throw error;
    }
  }, [showId]);

  const broadcastPlacements = useCallback(async (placements: PlacementResult) => {
    try {
      await servicesRef.current.results?.broadcastPlacements(placements);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { placements, showId }
      });
      throw error;
    }
  }, [showId]);

  // Actions for collaborative judging
  const resolveConflict = useCallback(async (conflictId: string, resolution: ScoringConflict['resolution']) => {
    try {
      const userId = servicesRef.current.presence?.getCurrentUser()?.userId || 'unknown';
      await servicesRef.current.collaborativeJudging?.resolveConflict(conflictId, resolution, userId);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { conflictId, resolution, showId }
      });
      throw error;
    }
  }, [showId]);

  const addConflictDiscussion = useCallback(async (conflictId: string, note: string) => {
    try {
      const userId = servicesRef.current.presence?.getCurrentUser()?.userId || 'unknown';
      await servicesRef.current.collaborativeJudging?.addConflictDiscussion(conflictId, userId, note);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { conflictId, note, showId }
      });
      throw error;
    }
  }, [showId]);

  const trackJudgeActivity = useCallback(async (activity: JudgeActivity['activity'], metadata?: Record<string, unknown>) => {
    try {
      const userId = servicesRef.current.presence?.getCurrentUser()?.userId || 'unknown';
      await servicesRef.current.collaborativeJudging?.trackJudgeActivity(userId, activity, metadata);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { activity, metadata, showId }
      });
      throw error;
    }
  }, [showId]);

  // Actions for presence
  const updateLocation = useCallback(async (location: UserPresence['location']) => {
    try {
      await servicesRef.current.presence?.updateUserLocation(location);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { location, showId }
      });
      throw error;
    }
  }, [showId]);

  const updateActivity = useCallback(async (activity: UserPresence['activity']) => {
    try {
      await servicesRef.current.presence?.updateUserActivity(activity);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { activity, showId }
      });
      throw error;
    }
  }, [showId]);

  const updateStatus = useCallback(async (status: UserPresence['status']) => {
    try {
      await servicesRef.current.presence?.updateUserStatus(status);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { status, showId }
      });
      throw error;
    }
  }, [showId]);

  const createActivityIndicator = useCallback(async (type: ActivityIndicator['type'], context: string) => {
    try {
      await servicesRef.current.presence?.createActivityIndicator(type, context);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { type, context, showId }
      });
      throw error;
    }
  }, [showId]);

  const removeActivityIndicator = useCallback(async () => {
    try {
      await servicesRef.current.presence?.removeActivityIndicator();
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId }
      });
      throw error;
    }
  }, [showId]);

  // Utility actions
  const refreshData = useCallback(async () => {
    try {
      // Refresh data from all services
      const services = servicesRef.current;
      
      if (services.liveCompetition) {
        const metrics = services.liveCompetition.getMetrics();
        setState(prev => ({ ...prev, competitionMetrics: metrics }));
      }

      if (services.presence) {
        const analytics = services.presence.getAnalytics();
        setState(prev => ({ ...prev, presenceAnalytics: analytics }));
      }
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId }
      });
    }
  }, [showId]);

  const exportMetrics = useCallback(async () => {
    try {
      const services = servicesRef.current;
      const exportData: Record<string, unknown> = {
        showId,
        classId,
        timestamp: new Date().toISOString(),
        competitionMetrics: services.liveCompetition?.getMetrics(),
        entryStatusMetrics: services.entryStatus?.getMetrics(),
        checkInMetrics: services.checkIns?.getMetrics(),
        resultsMetrics: services.results?.getMetrics(),
        judgingMetrics: services.collaborativeJudging?.getMetrics(),
        presenceAnalytics: services.presence?.getAnalytics(),
      };

      return exportData;
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId }
      });
      return {};
    }
  }, [showId, classId]);

  // Initialize services on mount
  useEffect(() => {
    initializeServices();
  }, [initializeServices]);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && state.isInitialized && !state.isActive) {
      start();
    }
  }, [autoStart, state.isInitialized, state.isActive, start]);

  // Update metrics periodically
  useEffect(() => {
    if (!state.isActive) return;

    const interval = setInterval(() => {
      refreshData();
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [state.isActive, refreshData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  // Create actions object
  const actions: LiveCompetitionActions = {
    start,
    stop,
    restart,
    updateEntryRingStatus,
    broadcastCallToRing,
    triggerCheckInNotification,
    acknowledgeNotification,
    broadcastScore,
    broadcastPlacements,
    resolveConflict,
    addConflictDiscussion,
    trackJudgeActivity,
    updateLocation,
    updateActivity,
    updateStatus,
    createActivityIndicator,
    removeActivityIndicator,
    refreshData,
    exportMetrics,
  };

  return {
    state,
    actions,
    isLoading: !state.isInitialized,
    hasError: !!state.error,
    error: state.error,
  };
}

export default useLiveCompetition;