/**
 * GateCoordinator Helpers
 *
 * Extracted persistence, statistics, and load-calculation logic
 * from GateCoordinator to keep the main file under 500 lines.
 */

import { logger } from '@/services/LoggingService';
import type { StateStorage } from 'zustand/middleware';
import type {
  Gate,
  GateSteward,
  GateSession,
  GateActivity,
  GateStatistics,
  GateCoordinatorConfig,
} from '@/types/offline-checkin-types';
import type { StewardStatistics, CoordinatorOverview } from './GateCoordinator.types';
import { generateId } from '@/utils/idUtils';

const STORAGE_KEY = 'gate-coordinator-data';

/** Calculate the current load for a gate based on recent check-in activity */
export function calculateGateLoad(gateId: string, sessions: Map<string, GateSession>): number {
  const session = Array.from(sessions.values()).find(s => s.gateId === gateId && s.isActive);
  if (!session) return 0;

  const recentActivities = session.activities.filter(
    a => Date.now() - a.timestamp.getTime() < 10 * 60 * 1000 // Last 10 minutes
  );

  const checkInActivities = recentActivities.filter(a => a.type === 'check_in');
  return Math.min(checkInActivities.length / 10, 1);
}

/** Compute statistics for a single gate */
export function computeGateStatistics(
  gateId: string,
  gate: Gate,
  sessions: Map<string, GateSession>
): GateStatistics {
  const gateSessions = Array.from(sessions.values()).filter(s => s.gateId === gateId);
  const totalCheckIns = gateSessions.reduce((sum, s) => sum + s.totalCheckIns, 0);
  const totalErrors = gateSessions.reduce((sum, s) => sum + s.failedCheckIns, 0);
  const totalConflicts = gateSessions.reduce((sum, s) => sum + s.conflictsResolved, 0);

  const avgTime =
    gateSessions.length > 0
      ? gateSessions.reduce((sum, s) => sum + s.averageCheckInTime, 0) / gateSessions.length
      : 0;

  return {
    gateId,
    totalCheckIns,
    averageTime: avgTime,
    errorCount: totalErrors,
    conflictCount: totalConflicts,
    currentLoad: gate.currentLoad,
    efficiency: totalCheckIns > 0 ? (totalCheckIns - totalErrors) / totalCheckIns : 1,
  };
}

/** Compute statistics for a single steward */
export function computeStewardStatistics(
  stewardId: string,
  sessions: Map<string, GateSession>
): StewardStatistics {
  const stewardSessions = Array.from(sessions.values()).filter(s => s.stewardId === stewardId);
  const totalCheckIns = stewardSessions.reduce((sum, s) => sum + s.totalCheckIns, 0);
  const totalErrors = stewardSessions.reduce((sum, s) => sum + s.failedCheckIns, 0);
  const avgTime =
    stewardSessions.length > 0
      ? stewardSessions.reduce((sum, s) => sum + s.averageCheckInTime, 0) / stewardSessions.length
      : 0;

  return {
    stewardId,
    totalCheckIns,
    averageTime: avgTime,
    efficiency: totalCheckIns > 0 ? (totalCheckIns - totalErrors) / totalCheckIns : 1,
  };
}

/** Compute the coordinator-wide overview */
export function computeOverview(
  gates: Map<string, Gate>,
  stewards: Map<string, GateSteward>,
  sessions: Map<string, GateSession>
): CoordinatorOverview {
  return {
    totalGates: gates.size,
    activeGates: Array.from(gates.values()).filter(g => g.isActive).length,
    totalStewards: stewards.size,
    activeStewards: Array.from(stewards.values()).filter(s => s.isActive).length,
    totalCheckIns: Array.from(sessions.values()).reduce((sum, s) => sum + s.totalCheckIns, 0),
  };
}

/** Build an updated steward with fresh sync metadata */
export function buildStewardUpdate(
  steward: GateSteward,
  updates: Partial<GateSteward>,
  modifiedBy: string
): GateSteward {
  return {
    ...steward,
    ...updates,
    updatedAt: new Date(),
    _sync: {
      _version: (steward._sync?._version || 0) + 1,
      _lastModified: new Date().toISOString(),
      _lastModifiedBy: modifiedBy,
      _syncStatus: 'pending' as const,
    },
  };
}

/** Increment steward check-in count and update sync metadata */
export function incrementStewardCheckIn(steward: GateSteward): void {
  steward.totalCheckIns++;
  steward.lastActivity = new Date();
  if (!steward._sync) {
    steward._sync = {
      _version: 1,
      _lastModified: new Date().toISOString(),
      _lastModifiedBy: 'system',
      _syncStatus: 'pending',
    };
  } else {
    steward._sync._version++;
    steward._sync._lastModified = new Date().toISOString();
    steward._sync._syncStatus = 'pending';
  }
}

/** Create initial sync metadata for a new entity */
export function createInitialSyncMetadata(modifiedBy = 'system') {
  return {
    _version: 1,
    _lastModified: new Date().toISOString(),
    _lastModifiedBy: modifiedBy,
    _syncStatus: 'pending' as const,
  };
}

/** Create a new GateSession object */
export function createGateSession(gateId: string, stewardId: string, showId: string): GateSession {
  return {
    id: generateId(),
    gateId,
    stewardId,
    showId,
    startTime: new Date(),
    totalCheckIns: 0,
    successfulCheckIns: 0,
    failedCheckIns: 0,
    conflictsResolved: 0,
    averageCheckInTime: 0,
    activities: [],
    isActive: true,
  };
}

/** Update session statistics after a check-in */
export function updateSessionCheckInStats(
  session: GateSession,
  success: boolean,
  duration: number
): void {
  session.totalCheckIns++;
  if (success) {
    session.successfulCheckIns++;
  } else {
    session.failedCheckIns++;
  }
  if (session.totalCheckIns > 0) {
    session.averageCheckInTime =
      (session.averageCheckInTime * (session.totalCheckIns - 1) + duration) / session.totalCheckIns;
  }
}

/** Find gates that are overloaded and need steward assignment */
export function findOverloadedGates(
  gates: Map<string, Gate>,
  sessions: Map<string, GateSession>,
  stewards: Map<string, GateSteward>
): Array<{ gate: Gate; load: number }> {
  const activeGates = Array.from(gates.values()).filter(g => g.isActive);
  const hasAvailableStewards = Array.from(stewards.values()).some(s => s.isActive);

  return activeGates
    .map(gate => ({
      gate,
      load: calculateGateLoad(gate.id, sessions),
      currentSteward: gate.currentSteward,
    }))
    .sort((a, b) => b.load - a.load)
    .filter(gl => gl.load > 0.8 && !gl.currentSteward && hasAvailableStewards);
}

/** Persist coordinator data to storage */
export async function persistCoordinatorData(
  storage: StateStorage,
  gates: Map<string, Gate>,
  stewards: Map<string, GateSteward>,
  sessions: Map<string, GateSession>,
  activities: Map<string, GateActivity[]>,
  config: GateCoordinatorConfig
): Promise<void> {
  try {
    const data = {
      gates: Array.from(gates.entries()),
      stewards: Array.from(stewards.entries()),
      sessions: Array.from(sessions.entries()),
      activities: Array.from(activities.entries()),
      config,
    };

    await storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    logger.error('Failed to persist gate coordinator data', 'checkin', {}, error as Error);
  }
}

/** Load persisted coordinator data from storage */
export async function loadCoordinatorData(
  storage: StateStorage,
  config: GateCoordinatorConfig
): Promise<{
  gates: Map<string, Gate>;
  stewards: Map<string, GateSteward>;
  sessions: Map<string, GateSession>;
  activities: Map<string, GateActivity[]>;
  config: GateCoordinatorConfig;
} | null> {
  try {
    const dataStr = await storage.getItem(STORAGE_KEY);
    if (!dataStr) return null;

    const data = JSON.parse(dataStr);

    return {
      gates: data.gates ? new Map(data.gates) : new Map(),
      stewards: data.stewards ? new Map(data.stewards) : new Map(),
      sessions: data.sessions ? new Map(data.sessions) : new Map(),
      activities: data.activities ? new Map(data.activities) : new Map(),
      config: data.config ? { ...config, ...data.config } : config,
    };
  } catch (error) {
    logger.error('Failed to load persisted gate coordinator data', 'checkin', {}, error as Error);
    return null;
  }
}
