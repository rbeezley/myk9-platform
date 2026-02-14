/**
 * Live Competition Hook
 * Phase 6.2: Live Competition Features
 *
 * React hook for managing live competition features including real-time
 * entry status, check-ins, results, collaborative judging, and presence tracking.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { errorMonitor } from '../lib/errorMonitoring';

// Import services (constructors needed for initialization)
import LiveCompetitionService from '../services/competition/liveCompetitionService';
import type { LiveCompetitionConfig } from '../services/competition/liveCompetitionService';
import EntryStatusBroadcaster from '../services/competition/entryStatusBroadcaster';
import CheckInNotificationService from '../services/competition/checkinNotificationService';
import ResultsBroadcaster from '../services/competition/resultsBroadcaster';
import CollaborativeJudging from '../services/competition/collaborativeJudging';
import PresenceService from '../services/competition/presenceService';

// Import from extracted modules
import type {
  LiveCompetitionState,
  UseLiveCompetitionOptions,
  LiveCompetitionActions,
  ServiceInstances,
} from './live-competition/types';
import { createInitialState } from './live-competition/types';
import { setupAllEventListeners } from './live-competition/eventListeners';
import {
  createUpdateEntryRingStatus,
  createBroadcastCallToRing,
  createTriggerCheckInNotification,
  createAcknowledgeNotification,
  createBroadcastScore,
  createBroadcastPlacements,
  createResolveConflict,
  createAddConflictDiscussion,
  createTrackJudgeActivity,
  createUpdateLocation,
  createUpdateActivity,
  createUpdateStatus,
  createCreateActivityIndicator,
  createRemoveActivityIndicator,
  createRefreshData,
  createExportMetrics,
} from './live-competition/serviceActions';

// Re-export types for backward compatibility
export type { LiveCompetitionState, UseLiveCompetitionOptions, LiveCompetitionActions };

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
  const [state, setState] = useState<LiveCompetitionState>(() => createInitialState(showId));

  // Service instances
  const servicesRef = useRef<ServiceInstances>({});

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

      if (enableEntryStatus) {
        services.entryStatus = new EntryStatusBroadcaster(showId);
      }

      if (enableCheckIns) {
        services.checkIns = new CheckInNotificationService(showId);
      }

      if (enableResults) {
        services.results = new ResultsBroadcaster(showId);
      }

      if (enableCollaborativeJudging && classId) {
        services.collaborativeJudging = new CollaborativeJudging(showId, classId);
      }

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
          enablePresence,
        },
      });
    }
  }, [showId, classId, autoStart, enableEntryStatus, enableCheckIns, enableResults, enableCollaborativeJudging, enablePresence]);

  /**
   * Setup event listeners using the extracted module
   */
  const setupEventListeners = useCallback(() => {
    cleanupFunctionsRef.current = setupAllEventListeners(servicesRef.current, setState);
  }, []);

  /**
   * Start live competition services
   */
  const start = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      const services = servicesRef.current;
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
        additionalData: { showId, classId },
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
        additionalData: { showId, classId },
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

  /* eslint-disable react-hooks/refs -- servicesRef is a stable ref object; .current is only read at call time in the returned closures, not during render */

  // Build action context as a plain memoized value.
  // servicesRef is the stable ref object (never changes), so including it here
  // does NOT read .current during render. The create* factories capture servicesRef
  // and only dereference .current when the returned action is invoked.
  const actionCtx = useMemo(() => ({
    servicesRef,
    showId,
    classId,
  }), [showId, classId]);

  // Refresh data action (needs setState access)
  const refreshData = useCallback(async () => {
    const refreshFn = createRefreshData(actionCtx);
    await refreshFn(setState);
  }, [actionCtx]);

  // Create actions object using memoized factories.
  // Each factory receives actionCtx which holds the ref object itself (not .current),
  // so no ref value is read during render. Ref dereferencing happens at call time.
  const actions: LiveCompetitionActions = useMemo(() => ({
    start,
    stop,
    restart,
    updateEntryRingStatus: createUpdateEntryRingStatus(actionCtx),
    broadcastCallToRing: createBroadcastCallToRing(actionCtx),
    triggerCheckInNotification: createTriggerCheckInNotification(actionCtx),
    acknowledgeNotification: createAcknowledgeNotification(actionCtx),
    broadcastScore: createBroadcastScore(actionCtx),
    broadcastPlacements: createBroadcastPlacements(actionCtx),
    resolveConflict: createResolveConflict(actionCtx),
    addConflictDiscussion: createAddConflictDiscussion(actionCtx),
    trackJudgeActivity: createTrackJudgeActivity(actionCtx),
    updateLocation: createUpdateLocation(actionCtx),
    updateActivity: createUpdateActivity(actionCtx),
    updateStatus: createUpdateStatus(actionCtx),
    createActivityIndicator: createCreateActivityIndicator(actionCtx),
    removeActivityIndicator: createRemoveActivityIndicator(actionCtx),
    refreshData,
    exportMetrics: createExportMetrics(actionCtx),
  }), [start, stop, restart, refreshData, actionCtx]);

  /* eslint-enable react-hooks/refs */

  // Initialize services on mount
  useEffect(() => {
    queueMicrotask(() => {
      initializeServices();
    });
  }, [initializeServices]);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && state.isInitialized && !state.isActive) {
      queueMicrotask(() => {
        start();
      });
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

  return {
    state,
    actions,
    isLoading: !state.isInitialized,
    hasError: !!state.error,
    error: state.error,
  };
}

export default useLiveCompetition;
