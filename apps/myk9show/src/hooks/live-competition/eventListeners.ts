/**
 * Live Competition Event Listeners
 *
 * Sets up all real-time event listeners for live competition services.
 * Handles entry status, check-ins, results, collaborative judging, and presence updates.
 */

import type { CheckInEvent, CheckInNotification } from '../../services/competition/checkinNotificationService';
import type { UserPresence } from '../../services/competition/presenceService';
import type { ScoreResult } from '../../services/competition/resultsBroadcaster';
import type { ServiceInstances, SetState } from './types';

/**
 * Setup event listeners for the live competition service (core service).
 * Returns an empty array since the core service manages its own listener lifecycle.
 */
function setupLiveCompetitionListeners(
  services: ServiceInstances,
  setState: SetState,
): Array<() => void> {
  if (!services.liveCompetition) return [];

  services.liveCompetition.onEntryStatusChange((status) => {
    setState(prev => ({
      ...prev,
      entryStatuses: new Map(prev.entryStatuses.set(status.entryId, status)),
    }));
  });

  services.liveCompetition.onCheckInChange((notification) => {
    const checkInNotification: CheckInNotification = {
      id: notification.id,
      type: 'status-change',
      priority: notification.priority,
      title: notification.title,
      message: notification.message,
      checkInEvent: {} as CheckInEvent,
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
    const userPresences: UserPresence[] = presences.map(presence => ({
      userId: presence.user_id,
      userName: presence.user_name,
      displayName: presence.user_name,
      role: presence.role,
      status: presence.status,
      lastSeen: new Date(presence.last_seen),
      joinedAt: new Date(),
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

  // Core service manages its own listener lifecycle
  return [];
}

/**
 * Setup event listeners for the entry status broadcaster.
 */
function setupEntryStatusListeners(
  services: ServiceInstances,
  setState: SetState,
): Array<() => void> {
  if (!services.entryStatus) return [];

  const cleanups: Array<() => void> = [];

  cleanups.push(services.entryStatus.onStatusUpdate((update) => {
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
  }));

  cleanups.push(services.entryStatus.onRingEvent((event) => {
    setState(prev => ({
      ...prev,
      ringEvents: [...prev.ringEvents.slice(-20), event],
    }));
  }));

  cleanups.push(services.entryStatus.onCallNotification((notification) => {
    setState(prev => ({
      ...prev,
      callNotifications: [...prev.callNotifications.slice(-10), notification],
    }));
  }));

  return cleanups;
}

/**
 * Setup event listeners for the check-in notification service.
 */
function setupCheckInListeners(
  services: ServiceInstances,
  setState: SetState,
): Array<() => void> {
  if (!services.checkIns) return [];

  const cleanups: Array<() => void> = [];

  cleanups.push(services.checkIns.onCheckInEvent((event) => {
    setState(prev => ({
      ...prev,
      recentCheckIns: [...prev.recentCheckIns.slice(-50), event],
    }));
  }));

  cleanups.push(services.checkIns.onNotification((notification) => {
    setState(prev => ({
      ...prev,
      checkInNotifications: [...prev.checkInNotifications, notification],
    }));
  }));

  cleanups.push(services.checkIns.onQueueUpdate((status) => {
    setState(prev => ({
      ...prev,
      queueStatuses: new Map(prev.queueStatuses.set(status.classId, status)),
    }));
  }));

  return cleanups;
}

/**
 * Setup event listeners for the results broadcaster.
 */
function setupResultsListeners(
  services: ServiceInstances,
  setState: SetState,
): Array<() => void> {
  if (!services.results) return [];

  const cleanups: Array<() => void> = [];

  cleanups.push(services.results.onScoreResult((result) => {
    setState(prev => ({
      ...prev,
      recentScores: [...prev.recentScores.slice(-100), result],
    }));
  }));

  cleanups.push(services.results.onPlacementResult((result) => {
    setState(prev => ({
      ...prev,
      placementResults: new Map(prev.placementResults.set(result.classId, result)),
    }));
  }));

  cleanups.push(services.results.onAwardResult((result) => {
    setState(prev => ({
      ...prev,
      awardResults: [...prev.awardResults, result],
    }));
  }));

  cleanups.push(services.results.onNotification((notification) => {
    setState(prev => ({
      ...prev,
      resultsNotifications: [...prev.resultsNotifications, notification],
    }));
  }));

  return cleanups;
}

/**
 * Setup event listeners for the collaborative judging service.
 */
function setupCollaborativeJudgingListeners(
  services: ServiceInstances,
  setState: SetState,
): Array<() => void> {
  if (!services.collaborativeJudging) return [];

  const cleanups: Array<() => void> = [];

  cleanups.push(services.collaborativeJudging.onSessionUpdate((session) => {
    setState(prev => ({
      ...prev,
      judgeSessions: prev.judgeSessions.filter(s => s.judgeId !== session.judgeId).concat(session),
    }));
  }));

  cleanups.push(services.collaborativeJudging.onScoreUpdate((score) => {
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
  }));

  cleanups.push(services.collaborativeJudging.onConflictDetected((conflict) => {
    setState(prev => ({
      ...prev,
      scoringConflicts: [...prev.scoringConflicts, conflict],
    }));
  }));

  cleanups.push(services.collaborativeJudging.onJudgeActivity((activity) => {
    setState(prev => ({
      ...prev,
      judgeActivities: prev.judgeActivities.filter(a => a.judgeId !== activity.judgeId).concat(activity),
    }));
  }));

  return cleanups;
}

/**
 * Setup event listeners for the presence service.
 */
function setupPresenceListeners(
  services: ServiceInstances,
  setState: SetState,
): Array<() => void> {
  if (!services.presence) return [];

  const cleanups: Array<() => void> = [];

  cleanups.push(services.presence.onUserJoined((user) => {
    setState(prev => ({
      ...prev,
      onlineUsers: [...prev.onlineUsers.filter(u => u.userId !== user.userId), user],
    }));
  }));

  cleanups.push(services.presence.onUserLeft((userId) => {
    setState(prev => ({
      ...prev,
      onlineUsers: prev.onlineUsers.filter(u => u.userId !== userId),
    }));
  }));

  cleanups.push(services.presence.onUserUpdated((user) => {
    setState(prev => ({
      ...prev,
      onlineUsers: prev.onlineUsers.map(u => u.userId === user.userId ? user : u),
    }));
  }));

  cleanups.push(services.presence.onActivityIndicator((indicator) => {
    setState(prev => ({
      ...prev,
      activityIndicators: [...prev.activityIndicators.filter(a => a.userId !== indicator.userId), indicator],
    }));
  }));

  cleanups.push(services.presence.onGroupUpdate((group) => {
    setState(prev => ({
      ...prev,
      presenceGroups: prev.presenceGroups.map(g => g.id === group.id ? group : g),
    }));
  }));

  return cleanups;
}

/**
 * Setup all event listeners for live competition services.
 * Returns an array of cleanup functions to remove all listeners.
 */
export function setupAllEventListeners(
  services: ServiceInstances,
  setState: SetState,
): Array<() => void> {
  return [
    ...setupLiveCompetitionListeners(services, setState),
    ...setupEntryStatusListeners(services, setState),
    ...setupCheckInListeners(services, setState),
    ...setupResultsListeners(services, setState),
    ...setupCollaborativeJudgingListeners(services, setState),
    ...setupPresenceListeners(services, setState),
  ];
}
