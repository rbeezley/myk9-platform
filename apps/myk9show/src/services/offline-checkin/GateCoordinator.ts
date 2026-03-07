/**
 * Gate Coordinator
 *
 * Manages multiple gate stewards, coordinates check-in operations
 * across gates, and handles load balancing and conflict escalation.
 */

import { EventEmitter } from '../sync/eventEmitter';
import { getOptimalStorage } from '../database/storage-adapter';
import { logger } from '@/services/LoggingService';
import type { StateStorage } from 'zustand/middleware';
import type {
  Gate,
  GateSteward,
  GateSession,
  GateActivity,
  GateStatistics,
  GateCoordinatorConfig,
  CheckInEvent,
  CheckInEventType,
  CheckInConflict,
} from '@/types/offline-checkin-types';
import { generateId } from '@/utils/idUtils';
import { DEFAULT_CONFIG } from './GateCoordinator.types';
import type { StewardStatistics, CoordinatorOverview } from './GateCoordinator.types';
import {
  calculateGateLoad,
  computeGateStatistics,
  computeStewardStatistics,
  computeOverview,
  persistCoordinatorData,
  loadCoordinatorData,
  buildStewardUpdate,
  incrementStewardCheckIn,
  updateSessionCheckInStats,
  findOverloadedGates,
  createInitialSyncMetadata,
} from './GateCoordinator.helpers';

export class GateCoordinator extends EventEmitter {
  private config: GateCoordinatorConfig;
  private storage: StateStorage;
  private gates: Map<string, Gate> = new Map();
  private stewards: Map<string, GateSteward> = new Map();
  private sessions: Map<string, GateSession> = new Map();
  private activities: Map<string, GateActivity[]> = new Map();
  private isInitialized = false;
  private loadBalanceInterval: NodeJS.Timeout | undefined;
  private sessionTimeoutInterval: NodeJS.Timeout | undefined;

  constructor(config: Partial<GateCoordinatorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storage = getOptimalStorage('gates');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const persisted = await loadCoordinatorData(this.storage, this.config);
      if (persisted) {
        this.gates = persisted.gates;
        this.stewards = persisted.stewards;
        this.sessions = persisted.sessions;
        this.activities = persisted.activities;
        this.config = persisted.config;
      }

      if (this.config.autoBalanceLoad) {
        this.startLoadBalancing();
      }

      this.startSessionMonitoring();

      this.isInitialized = true;
      this.emit('initialized', {});
      logger.info('GateCoordinator initialized successfully', 'checkin');
    } catch (error) {
      logger.error('Failed to initialize GateCoordinator', 'checkin', {}, error as Error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.loadBalanceInterval) {
      clearInterval(this.loadBalanceInterval);
      this.loadBalanceInterval = undefined;
    }

    if (this.sessionTimeoutInterval) {
      clearInterval(this.sessionTimeoutInterval);
      this.sessionTimeoutInterval = undefined;
    }

    for (const session of this.sessions.values()) {
      if (session.isActive) {
        await this.endSession(session.id, 'system');
      }
    }

    await this.persistData();
    this.isInitialized = false;
    this.emit('shutdown', {});
  }

  // Gate management
  async createGate(
    gateData: Omit<Gate, 'id' | 'createdAt' | 'updatedAt' | '_sync'>
  ): Promise<Gate> {
    const gate: Gate = {
      ...gateData,
      id: generateId(),
      totalCheckIns: 0,
      currentLoad: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.gates.set(gate.id, gate);
    await this.persistData();

    this.emitEvent('gate_created', {
      gateId: gate.id,
      name: gate.name,
      ringNumbers: gate.ringNumbers,
    });

    return gate;
  }

  async updateGate(gateId: string, updates: Partial<Gate>): Promise<Gate> {
    const gate = this.gates.get(gateId);
    if (!gate) throw new Error(`Gate ${gateId} not found`);

    const updatedGate = { ...gate, ...updates, updatedAt: new Date() };
    this.gates.set(gateId, updatedGate);
    await this.persistData();

    this.emitEvent('gate_updated', { gateId, updates });
    return updatedGate;
  }

  async activateGate(gateId: string): Promise<void> {
    await this.updateGate(gateId, { isActive: true });
    this.emitEvent('gate_activated', { gateId });
  }

  async deactivateGate(gateId: string): Promise<void> {
    const activeSessions = Array.from(this.sessions.values()).filter(
      s => s.gateId === gateId && s.isActive
    );

    for (const session of activeSessions) {
      await this.endSession(session.id, 'system');
    }

    await this.updateGate(gateId, { isActive: false, currentSteward: undefined });
    this.emitEvent('gate_deactivated', { gateId });
  }

  // Steward management
  async registerSteward(
    stewardData: Omit<GateSteward, 'id' | 'createdAt' | 'updatedAt' | 'totalCheckIns' | '_sync'>
  ): Promise<GateSteward> {
    const steward: GateSteward = {
      ...stewardData,
      id: generateId(),
      totalCheckIns: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      _sync: createInitialSyncMetadata(),
    };

    this.stewards.set(steward.id, steward);
    await this.persistData();

    this.emitEvent('steward_registered', {
      stewardId: steward.id,
      name: steward.name,
      assignedRings: steward.assignedRings,
    });

    return steward;
  }

  async assignStewardToGate(
    stewardId: string,
    gateId: string,
    assignedBy: string
  ): Promise<GateSession> {
    const steward = this.stewards.get(stewardId);
    const gate = this.gates.get(gateId);

    if (!steward) throw new Error(`Steward ${stewardId} not found`);
    if (!gate) throw new Error(`Gate ${gateId} not found`);
    if (!gate.isActive) throw new Error(`Gate ${gateId} is not active`);

    const activeSessions = this.getActiveSessionsForSteward(stewardId);
    if (activeSessions.length >= this.config.maxGatesPerSteward) {
      throw new Error(
        `Steward ${stewardId} is already at maximum capacity (${this.config.maxGatesPerSteward} gates)`
      );
    }

    const existingSession = this.getActiveSessionForGate(gateId);
    if (existingSession) {
      await this.endSession(existingSession.id, assignedBy);
    }

    const session = await this.startSession(stewardId, gateId, assignedBy);

    await this.updateGate(gateId, { currentSteward: stewardId, lastActivity: new Date() });

    this.stewards.set(
      stewardId,
      buildStewardUpdate(
        steward,
        {
          isActive: true,
          lastActivity: new Date(),
          currentShift: {
            id: session.id,
            stewardId,
            showId: session.showId,
            startTime: session.startTime,
            assignedRings: gate.ringNumbers,
            assignedGates: [gateId],
            checkInCount: 0,
            isActive: true,
          },
        },
        assignedBy
      )
    );
    await this.persistData();

    this.emitEvent('steward_assigned', { stewardId, gateId, sessionId: session.id, assignedBy });
    return session;
  }

  async removeStewardFromGate(gateId: string, removedBy: string): Promise<void> {
    const gate = this.gates.get(gateId);
    if (!gate || !gate.currentSteward) return;

    const stewardId = gate.currentSteward;
    const activeSession = this.getActiveSessionForGate(gateId);

    if (activeSession) {
      await this.endSession(activeSession.id, removedBy);
    }

    await this.updateGate(gateId, { currentSteward: undefined, lastActivity: new Date() });

    const steward = this.stewards.get(stewardId);
    if (steward) {
      this.stewards.set(
        stewardId,
        buildStewardUpdate(
          steward,
          { isActive: false, currentShift: undefined, lastActivity: new Date() },
          removedBy
        )
      );
    }

    await this.persistData();
    this.emitEvent('steward_removed', { stewardId, gateId, removedBy });
  }

  // Session management
  async startSession(stewardId: string, gateId: string, startedBy: string): Promise<GateSession> {
    const gate = this.gates.get(gateId);
    if (!gate) throw new Error(`Gate ${gateId} not found`);

    const session: GateSession = {
      id: generateId(),
      gateId,
      stewardId,
      showId: gate.showId,
      startTime: new Date(),
      totalCheckIns: 0,
      successfulCheckIns: 0,
      failedCheckIns: 0,
      conflictsResolved: 0,
      averageCheckInTime: 0,
      activities: [],
      isActive: true,
    };

    this.sessions.set(session.id, session);
    this.activities.set(session.id, []);

    await this.logActivity(session.id, {
      type: 'steward_change',
      details: { action: 'session_started', startedBy },
      severity: 'info',
    });

    await this.persistData();
    this.emitEvent('session_started', { sessionId: session.id, stewardId, gateId, startedBy });
    return session;
  }

  async endSession(sessionId: string, endedBy: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return;

    session.endTime = new Date();
    session.isActive = false;

    await this.logActivity(sessionId, {
      type: 'steward_change',
      details: { action: 'session_ended', endedBy },
      severity: 'info',
    });

    this.sessions.set(sessionId, session);
    await this.persistData();

    this.emitEvent('session_ended', {
      sessionId,
      stewardId: session.stewardId,
      gateId: session.gateId,
      duration: session.endTime.getTime() - session.startTime.getTime(),
      endedBy,
    });
  }

  // Activity logging
  async logActivity(
    sessionId: string,
    activityData: {
      type: GateActivity['type'];
      entryId?: string;
      details: Record<string, unknown>;
      severity: GateActivity['severity'];
    }
  ): Promise<GateActivity> {
    const activity: GateActivity = {
      id: generateId(),
      sessionId,
      timestamp: new Date(),
      ...activityData,
    };

    const activities = this.activities.get(sessionId) || [];
    activities.push(activity);
    this.activities.set(sessionId, activities);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.activities = activities;
      this.sessions.set(sessionId, session);
    }

    await this.persistData();
    return activity;
  }

  async logCheckIn(
    sessionId: string,
    entryId: string,
    success: boolean,
    duration: number
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    updateSessionCheckInStats(session, success, duration);

    const gate = this.gates.get(session.gateId);
    if (gate) {
      gate.totalCheckIns++;
      gate.currentLoad = calculateGateLoad(session.gateId, this.sessions);
      gate.lastActivity = new Date();
      this.gates.set(session.gateId, gate);
    }

    const steward = this.stewards.get(session.stewardId);
    if (steward) {
      incrementStewardCheckIn(steward);
      this.stewards.set(session.stewardId, steward);
    }

    await this.logActivity(sessionId, {
      type: 'check_in',
      entryId,
      details: { success, duration },
      severity: success ? 'info' : 'warning',
    });

    this.sessions.set(sessionId, session);
    await this.persistData();
  }

  // Load balancing
  async balanceLoad(): Promise<void> {
    if (!this.config.autoBalanceLoad) return;

    const overloaded = findOverloadedGates(this.gates, this.sessions, this.stewards);
    const availableStewards = Array.from(this.stewards.values()).filter(s => s.isActive);

    for (const { gate } of overloaded) {
      const steward = availableStewards.find(
        s => this.getActiveSessionsForSteward(s.id).length < this.config.maxGatesPerSteward
      );
      if (steward) {
        try {
          await this.assignStewardToGate(steward.id, gate.id, 'auto-balance');
        } catch (error) {
          logger.warn('Auto-balance assignment failed', 'checkin', {}, error as Error);
        }
      }
    }
  }

  // Conflict management
  async escalateConflict(conflict: CheckInConflict, escalatedBy: string): Promise<void> {
    const sessionId = this.findSessionForGate(conflict.gateId || '');
    if (sessionId) {
      await this.logActivity(sessionId, {
        type: 'conflict',
        entryId: conflict.entryId,
        details: {
          conflictId: conflict.id,
          conflictType: conflict.type,
          escalatedBy,
          action: 'escalated',
        },
        severity: 'error',
      });
    }

    this.emitEvent('conflict_escalated', {
      conflictId: conflict.id,
      conflictType: conflict.type,
      entryId: conflict.entryId,
      gateId: conflict.gateId,
      escalatedBy,
    });
  }

  // Statistics and monitoring
  async getGateStatistics(gateId: string): Promise<GateStatistics> {
    const gate = this.gates.get(gateId);
    if (!gate) throw new Error(`Gate ${gateId} not found`);
    return computeGateStatistics(gateId, gate, this.sessions);
  }

  async getAllStatistics(): Promise<{
    gates: Map<string, GateStatistics>;
    stewards: Map<string, StewardStatistics>;
    overview: CoordinatorOverview;
  }> {
    const gateStats = new Map<string, GateStatistics>();
    const stewardStats = new Map<string, StewardStatistics>();

    for (const gate of this.gates.values()) {
      gateStats.set(gate.id, computeGateStatistics(gate.id, gate, this.sessions));
    }

    for (const steward of this.stewards.values()) {
      stewardStats.set(steward.id, computeStewardStatistics(steward.id, this.sessions));
    }

    return {
      gates: gateStats,
      stewards: stewardStats,
      overview: computeOverview(this.gates, this.stewards, this.sessions),
    };
  }

  // Query methods
  getGates(): Gate[] {
    return Array.from(this.gates.values());
  }

  getActiveGates(): Gate[] {
    return Array.from(this.gates.values()).filter(g => g.isActive);
  }

  getStewards(): GateSteward[] {
    return Array.from(this.stewards.values());
  }

  getActiveStewards(): GateSteward[] {
    return Array.from(this.stewards.values()).filter(s => s.isActive);
  }

  getActiveSessionsForSteward(stewardId: string): GateSession[] {
    return Array.from(this.sessions.values()).filter(s => s.stewardId === stewardId && s.isActive);
  }

  getActiveSessionForGate(gateId: string): GateSession | null {
    return Array.from(this.sessions.values()).find(s => s.gateId === gateId && s.isActive) || null;
  }

  findSessionForGate(gateId: string): string | null {
    const session = this.getActiveSessionForGate(gateId);
    return session ? session.id : null;
  }

  // Private helper methods
  private startLoadBalancing(): void {
    this.loadBalanceInterval = setInterval(async () => {
      try {
        await this.balanceLoad();
      } catch (error) {
        logger.error('Load balancing failed', 'checkin', {}, error as Error);
      }
    }, 60000);
  }

  private startSessionMonitoring(): void {
    this.sessionTimeoutInterval = setInterval(async () => {
      const now = new Date();
      const timeoutMs = this.config.sessionTimeoutMinutes * 60 * 1000;

      for (const session of this.sessions.values()) {
        if (session.isActive && now.getTime() - session.startTime.getTime() > timeoutMs) {
          await this.endSession(session.id, 'auto-timeout');
        }
      }
    }, 300000);
  }

  private emitEvent(type: CheckInEventType, data: Record<string, unknown>): void {
    const event: CheckInEvent = {
      type: type,
      timestamp: new Date(),
      data,
      source: 'gate',
      priority: 'medium',
    };
    this.emit('gate-event', event);
  }

  private async persistData(): Promise<void> {
    await persistCoordinatorData(
      this.storage,
      this.gates,
      this.stewards,
      this.sessions,
      this.activities,
      this.config
    );
  }
}

// Export singleton instance
export const gateCoordinator = new GateCoordinator();
