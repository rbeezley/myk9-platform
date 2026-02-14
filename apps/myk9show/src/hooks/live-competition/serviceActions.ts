/**
 * Live Competition Service Actions
 *
 * Action callbacks for interacting with live competition services.
 * Includes entry status, check-in, results, collaborative judging,
 * presence, and utility actions.
 */

import { errorMonitor } from '../../lib/errorMonitoring';
import type { EntryStatus } from '../../services/competition/liveCompetitionService';
import type { CallToRingNotification } from '../../services/competition/entryStatusBroadcaster';
import type { ScoreResult, PlacementResult } from '../../services/competition/resultsBroadcaster';
import type { ScoringConflict, JudgeActivity } from '../../services/competition/collaborativeJudging';
import type { UserPresence, ActivityIndicator } from '../../services/competition/presenceService';
import type { ServicesRef, SetState } from './types';

interface ActionContext {
  servicesRef: ServicesRef;
  showId: string;
  classId?: string | undefined;
}

// --- Entry Status Actions ---

export function createUpdateEntryRingStatus(ctx: ActionContext) {
  return async (entryId: string, status: EntryStatus['ringStatus']): Promise<void> => {
    try {
      await ctx.servicesRef.current.liveCompetition?.updateEntryRingStatus(entryId, status);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, status, showId: ctx.showId },
      });
      throw error;
    }
  };
}

export function createBroadcastCallToRing(ctx: ActionContext) {
  return async (entryId: string, callType: CallToRingNotification['callType']): Promise<void> => {
    try {
      // This would be implemented based on specific requirements
      void entryId;
      void callType;
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, callType, showId: ctx.showId },
      });
      throw error;
    }
  };
}

// --- Check-in Actions ---

export function createTriggerCheckInNotification(ctx: ActionContext) {
  return async (entryId: string, message?: string): Promise<void> => {
    try {
      await ctx.servicesRef.current.checkIns?.triggerCheckInNotification(entryId, message);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, message, showId: ctx.showId },
      });
      throw error;
    }
  };
}

export function createAcknowledgeNotification(ctx: ActionContext) {
  return async (notificationId: string): Promise<void> => {
    try {
      const userId = ctx.servicesRef.current.presence?.getCurrentUser()?.userId || 'unknown';
      await ctx.servicesRef.current.checkIns?.acknowledgeNotification(notificationId, userId);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { notificationId, showId: ctx.showId },
      });
      throw error;
    }
  };
}

// --- Results Actions ---

export function createBroadcastScore(ctx: ActionContext) {
  return async (score: ScoreResult): Promise<void> => {
    try {
      await ctx.servicesRef.current.results?.broadcastScore(score);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { score, showId: ctx.showId },
      });
      throw error;
    }
  };
}

export function createBroadcastPlacements(ctx: ActionContext) {
  return async (placements: PlacementResult): Promise<void> => {
    try {
      await ctx.servicesRef.current.results?.broadcastPlacements(placements);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { placements, showId: ctx.showId },
      });
      throw error;
    }
  };
}

// --- Collaborative Judging Actions ---

export function createResolveConflict(ctx: ActionContext) {
  return async (conflictId: string, resolution: ScoringConflict['resolution']): Promise<void> => {
    try {
      const userId = ctx.servicesRef.current.presence?.getCurrentUser()?.userId || 'unknown';
      await ctx.servicesRef.current.collaborativeJudging?.resolveConflict(conflictId, resolution, userId);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { conflictId, resolution, showId: ctx.showId },
      });
      throw error;
    }
  };
}

export function createAddConflictDiscussion(ctx: ActionContext) {
  return async (conflictId: string, note: string): Promise<void> => {
    try {
      const userId = ctx.servicesRef.current.presence?.getCurrentUser()?.userId || 'unknown';
      await ctx.servicesRef.current.collaborativeJudging?.addConflictDiscussion(conflictId, userId, note);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { conflictId, note, showId: ctx.showId },
      });
      throw error;
    }
  };
}

export function createTrackJudgeActivity(ctx: ActionContext) {
  return async (activity: JudgeActivity['activity'], metadata?: Record<string, unknown>): Promise<void> => {
    try {
      const userId = ctx.servicesRef.current.presence?.getCurrentUser()?.userId || 'unknown';
      await ctx.servicesRef.current.collaborativeJudging?.trackJudgeActivity(userId, activity, metadata);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { activity, metadata, showId: ctx.showId },
      });
      throw error;
    }
  };
}

// --- Presence Actions ---

export function createUpdateLocation(ctx: ActionContext) {
  return async (location: UserPresence['location']): Promise<void> => {
    try {
      await ctx.servicesRef.current.presence?.updateUserLocation(location);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { location, showId: ctx.showId },
      });
      throw error;
    }
  };
}

export function createUpdateActivity(ctx: ActionContext) {
  return async (activity: UserPresence['activity']): Promise<void> => {
    try {
      await ctx.servicesRef.current.presence?.updateUserActivity(activity);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { activity, showId: ctx.showId },
      });
      throw error;
    }
  };
}

export function createUpdateStatus(ctx: ActionContext) {
  return async (status: UserPresence['status']): Promise<void> => {
    try {
      await ctx.servicesRef.current.presence?.updateUserStatus(status);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { status, showId: ctx.showId },
      });
      throw error;
    }
  };
}

export function createCreateActivityIndicator(ctx: ActionContext) {
  return async (type: ActivityIndicator['type'], context: string): Promise<void> => {
    try {
      await ctx.servicesRef.current.presence?.createActivityIndicator(type, context);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { type, context, showId: ctx.showId },
      });
      throw error;
    }
  };
}

export function createRemoveActivityIndicator(ctx: ActionContext) {
  return async (): Promise<void> => {
    try {
      await ctx.servicesRef.current.presence?.removeActivityIndicator();
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: ctx.showId },
      });
      throw error;
    }
  };
}

// --- Utility Actions ---

export function createRefreshData(ctx: ActionContext) {
  return async (setState: SetState): Promise<void> => {
    try {
      const services = ctx.servicesRef.current;
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
        additionalData: { showId: ctx.showId },
      });
    }
  };
}

export function createExportMetrics(ctx: ActionContext) {
  return async (): Promise<Record<string, unknown>> => {
    try {
      const services = ctx.servicesRef.current;
      return {
        showId: ctx.showId,
        classId: ctx.classId,
        timestamp: new Date().toISOString(),
        competitionMetrics: services.liveCompetition?.getMetrics(),
        entryStatusMetrics: services.entryStatus?.getMetrics(),
        checkInMetrics: services.checkIns?.getMetrics(),
        resultsMetrics: services.results?.getMetrics(),
        judgingMetrics: services.collaborativeJudging?.getMetrics(),
        presenceAnalytics: services.presence?.getAnalytics(),
      };
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: ctx.showId },
      });
      return {};
    }
  };
}
