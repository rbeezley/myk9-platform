/**
 * Gate Coordinator
 * 
 * Manages multiple gate stewards, coordinates check-in operations
 * across gates, and handles load balancing and conflict escalation.
 */

import { EventEmitter } from '../sync/eventEmitter';
import { getOptimalStorage } from '../database/storage-adapter';
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
  CheckInConflict
} from '@/types/offline-checkin-types';
import { generateId } from '@/utils/idUtils';

const DEFAULT_CONFIG: GateCoordinatorConfig = {
  maxGatesPerSteward: 2,
  autoBalanceLoad: true,
  enableCrossGateValidation: true,
  conflictEscalationThreshold: 3,
  sessionTimeoutMinutes: 480 // 8 hours
};

export class GateCoordinator extends EventEmitter {
  private config: GateCoordinatorConfig;
  private storage: StateStorage;
  private gates: Map<string, Gate> = new Map();
  private stewards: Map<string, GateSteward> = new Map();
  private sessions: Map<string, GateSession> = new Map();
  private activities: Map<string, GateActivity[]> = new Map();
  private isInitialized = false;
  private loadBalanceInterval?: NodeJS.Timeout;
  private sessionTimeoutInterval?: NodeJS.Timeout;

  constructor(config: Partial<GateCoordinatorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storage = getOptimalStorage('gates');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadPersistedData();
      
      // Start periodic tasks
      if (this.config.autoBalanceLoad) {
        this.startLoadBalancing();
      }
      
      this.startSessionMonitoring();
      
      this.isInitialized = true;
      this.emit('initialized', {});
      console.log('GateCoordinator initialized successfully');
    } catch (error) {
      console.error('Failed to initialize GateCoordinator:', error);
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
    
    // End all active sessions
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
  async createGate(gateData: Omit<Gate, 'id' | 'createdAt' | 'updatedAt' | '_sync'>): Promise<Gate> {
    const gate: Gate = {
      ...gateData,
      id: generateId(),
      totalCheckIns: 0,
      currentLoad: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.gates.set(gate.id, gate);
    await this.persistData();

    this.emitEvent('gate_created', {
      gateId: gate.id,
      name: gate.name,
      ringNumbers: gate.ringNumbers
    });

    return gate;
  }

  async updateGate(gateId: string, updates: Partial<Gate>): Promise<Gate> {
    const gate = this.gates.get(gateId);
    if (!gate) {
      throw new Error(`Gate ${gateId} not found`);
    }

    const updatedGate = {
      ...gate,
      ...updates,
      updatedAt: new Date()
    };

    this.gates.set(gateId, updatedGate);
    await this.persistData();

    this.emitEvent('gate_updated', {
      gateId,
      updates
    });

    return updatedGate;
  }

  async activateGate(gateId: string): Promise<void> {
    await this.updateGate(gateId, { isActive: true });
    this.emitEvent('gate_activated', { gateId });
  }

  async deactivateGate(gateId: string): Promise<void> {
    // End any active sessions on this gate
    const activeSessions = Array.from(this.sessions.values())
      .filter(s => s.gateId === gateId && s.isActive);
    
    for (const session of activeSessions) {
      await this.endSession(session.id, 'system');
    }

    await this.updateGate(gateId, { isActive: false, currentSteward: undefined });
    this.emitEvent('gate_deactivated', { gateId });
  }

  // Steward management
  async registerSteward(stewardData: Omit<GateSteward, 'id' | 'createdAt' | 'updatedAt' | 'totalCheckIns' | '_sync'>): Promise<GateSteward> {
    const steward: GateSteward = {
      ...stewardData,
      id: generateId(),
      totalCheckIns: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      _sync: {
        _version: 1,
        _lastModified: new Date().toISOString(),
        _lastModifiedBy: 'system',
        _syncStatus: 'pending'
      }
    };

    this.stewards.set(steward.id, steward);
    await this.persistData();

    this.emitEvent('steward_registered', {
      stewardId: steward.id,
      name: steward.name,
      assignedRings: steward.assignedRings
    });

    return steward;
  }

  async assignStewardToGate(stewardId: string, gateId: string, assignedBy: string): Promise<GateSession> {
    const steward = this.stewards.get(stewardId);
    const gate = this.gates.get(gateId);

    if (!steward) {
      throw new Error(`Steward ${stewardId} not found`);
    }

    if (!gate) {
      throw new Error(`Gate ${gateId} not found`);
    }

    if (!gate.isActive) {
      throw new Error(`Gate ${gateId} is not active`);
    }

    // Check if steward is already at maximum capacity
    const activeSessions = this.getActiveSessionsForSteward(stewardId);
    if (activeSessions.length >= this.config.maxGatesPerSteward) {
      throw new Error(`Steward ${stewardId} is already at maximum capacity (${this.config.maxGatesPerSteward} gates)`);
    }

    // End any existing session on this gate
    const existingSession = this.getActiveSessionForGate(gateId);
    if (existingSession) {
      await this.endSession(existingSession.id, assignedBy);
    }

    // Create new session
    const session = await this.startSession(stewardId, gateId, assignedBy);

    // Update gate and steward
    await this.updateGate(gateId, { 
      currentSteward: stewardId,
      lastActivity: new Date()
    });

    const updatedSteward = {
      ...steward,
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
        isActive: true
      },
      updatedAt: new Date(),
      _sync: {
        _version: (steward._sync?._version || 0) + 1,
        _lastModified: new Date().toISOString(),
        _lastModifiedBy: assignedBy,
        _syncStatus: 'pending' as const
      }
    };

    this.stewards.set(stewardId, updatedSteward);
    await this.persistData();

    this.emitEvent('steward_assigned', {
      stewardId,
      gateId,
      sessionId: session.id,
      assignedBy
    });

    return session;
  }

  async removeStewardFromGate(gateId: string, removedBy: string): Promise<void> {
    const gate = this.gates.get(gateId);
    if (!gate || !gate.currentSteward) {
      return;
    }

    const stewardId = gate.currentSteward;
    const activeSession = this.getActiveSessionForGate(gateId);
    
    if (activeSession) {
      await this.endSession(activeSession.id, removedBy);
    }

    await this.updateGate(gateId, { 
      currentSteward: undefined,
      lastActivity: new Date()
    });

    const steward = this.stewards.get(stewardId);
    if (steward) {
      const updatedSteward = {
        ...steward,
        isActive: false,
        currentShift: undefined,
        lastActivity: new Date(),
        updatedAt: new Date(),
        _sync: {
          _version: (steward._sync?._version || 0) + 1,
          _lastModified: new Date().toISOString(),
          _lastModifiedBy: removedBy,
          _syncStatus: 'pending' as const
        }
      };

      this.stewards.set(stewardId, updatedSteward);
    }

    await this.persistData();

    this.emitEvent('steward_removed', {
      stewardId,
      gateId,
      removedBy
    });
  }

  // Session management
  async startSession(stewardId: string, gateId: string, startedBy: string): Promise<GateSession> {
    const gate = this.gates.get(gateId);
    if (!gate) {
      throw new Error(`Gate ${gateId} not found`);
    }

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
      isActive: true
    };

    this.sessions.set(session.id, session);
    this.activities.set(session.id, []);

    await this.logActivity(session.id, {
      type: 'steward_change',
      details: { action: 'session_started', startedBy },
      severity: 'info'
    });

    await this.persistData();

    this.emitEvent('session_started', {
      sessionId: session.id,
      stewardId,
      gateId,
      startedBy
    });

    return session;
  }

  async endSession(sessionId: string, endedBy: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return;
    }

    session.endTime = new Date();
    session.isActive = false;

    await this.logActivity(sessionId, {
      type: 'steward_change',
      details: { action: 'session_ended', endedBy },
      severity: 'info'
    });

    this.sessions.set(sessionId, session);
    await this.persistData();

    this.emitEvent('session_ended', {
      sessionId,
      stewardId: session.stewardId,
      gateId: session.gateId,
      duration: session.endTime.getTime() - session.startTime.getTime(),
      endedBy
    });
  }

  // Activity logging
  async logActivity(sessionId: string, activityData: {
    type: GateActivity['type'];
    entryId?: string;
    details: Record<string, unknown>;
    severity: GateActivity['severity'];
  }): Promise<GateActivity> {
    const activity: GateActivity = {
      id: generateId(),
      sessionId,
      timestamp: new Date(),
      ...activityData
    };

    const activities = this.activities.get(sessionId) || [];
    activities.push(activity);
    this.activities.set(sessionId, activities);

    // Update session activities
    const session = this.sessions.get(sessionId);
    if (session) {
      session.activities = activities;
      this.sessions.set(sessionId, session);
    }

    await this.persistData();

    return activity;
  }

  async logCheckIn(sessionId: string, entryId: string, success: boolean, duration: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Update session statistics
    session.totalCheckIns++;
    if (success) {
      session.successfulCheckIns++;
    } else {
      session.failedCheckIns++;
    }

    // Update average check-in time
    if (session.totalCheckIns > 0) {
      session.averageCheckInTime = 
        (session.averageCheckInTime * (session.totalCheckIns - 1) + duration) / session.totalCheckIns;
    }

    // Update gate statistics
    const gate = this.gates.get(session.gateId);
    if (gate) {
      gate.totalCheckIns++;
      gate.currentLoad = this.calculateGateLoad(session.gateId);
      gate.lastActivity = new Date();
      this.gates.set(session.gateId, gate);
    }

    // Update steward statistics
    const steward = this.stewards.get(session.stewardId);
    if (steward) {
      steward.totalCheckIns++;
      steward.lastActivity = new Date();
      if (!steward._sync) {
        steward._sync = {
          _version: 1,
          _lastModified: new Date().toISOString(),
          _lastModifiedBy: 'system',
          _syncStatus: 'pending'
        };
      } else {
        steward._sync._version++;
        steward._sync._lastModified = new Date().toISOString();
        steward._sync._syncStatus = 'pending';
      }
      this.stewards.set(session.stewardId, steward);
    }

    await this.logActivity(sessionId, {
      type: 'check_in',
      entryId,
      details: { success, duration },
      severity: success ? 'info' : 'warning'
    });

    this.sessions.set(sessionId, session);
    await this.persistData();
  }

  // Load balancing
  async balanceLoad(): Promise<void> {
    if (!this.config.autoBalanceLoad) {
      return;
    }

    const activeGates = Array.from(this.gates.values()).filter(g => g.isActive);
    const availableStewards = Array.from(this.stewards.values()).filter(s => s.isActive);

    // Calculate load distribution
    const gateLoads = activeGates.map(gate => ({
      gate,
      load: this.calculateGateLoad(gate.id),
      currentSteward: gate.currentSteward
    }));

    // Sort by load (highest first)
    gateLoads.sort((a, b) => b.load - a.load);

    // Check for overloaded gates
    const overloadedGates = gateLoads.filter(gl => 
      gl.load > 0.8 && !gl.currentSteward && availableStewards.length > 0
    );

    // Assign stewards to overloaded gates
    for (const overloadedGate of overloadedGates) {
      const availableSteward = availableStewards.find(s => 
        this.getActiveSessionsForSteward(s.id).length < this.config.maxGatesPerSteward
      );

      if (availableSteward) {
        try {
          await this.assignStewardToGate(availableSteward.id, overloadedGate.gate.id, 'auto-balance');
        } catch (error) {
          console.warn('Auto-balance assignment failed:', error);
        }
      }
    }
  }

  // Conflict management
  async escalateConflict(conflict: CheckInConflict, escalatedBy: string): Promise<void> {
    // Log conflict escalation
    const sessionId = this.findSessionForGate(conflict.gateId || '');
    if (sessionId) {
      await this.logActivity(sessionId, {
        type: 'conflict',
        entryId: conflict.entryId,
        details: { 
          conflictId: conflict.id,
          conflictType: conflict.type,
          escalatedBy,
          action: 'escalated'
        },
        severity: 'error'
      });
    }

    this.emitEvent('conflict_escalated', {
      conflictId: conflict.id,
      conflictType: conflict.type,
      entryId: conflict.entryId,
      gateId: conflict.gateId,
      escalatedBy
    });
  }

  // Statistics and monitoring
  async getGateStatistics(gateId: string): Promise<GateStatistics> {
    const gate = this.gates.get(gateId);
    if (!gate) {
      throw new Error(`Gate ${gateId} not found`);
    }

    const sessions = Array.from(this.sessions.values()).filter(s => s.gateId === gateId);
    const totalCheckIns = sessions.reduce((sum, s) => sum + s.totalCheckIns, 0);
    const totalErrors = sessions.reduce((sum, s) => sum + s.failedCheckIns, 0);
    const totalConflicts = sessions.reduce((sum, s) => sum + s.conflictsResolved, 0);
    
    const avgTime = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + s.averageCheckInTime, 0) / sessions.length
      : 0;

    return {
      gateId,
      totalCheckIns,
      averageTime: avgTime,
      errorCount: totalErrors,
      conflictCount: totalConflicts,
      currentLoad: gate.currentLoad,
      efficiency: totalCheckIns > 0 ? (totalCheckIns - totalErrors) / totalCheckIns : 1
    };
  }

  async getAllStatistics(): Promise<{
    gates: Map<string, GateStatistics>;
    stewards: Map<string, { stewardId: string; totalCheckIns: number; averageTime: number; efficiency: number }>;
    overview: { totalGates: number; activeGates: number; totalStewards: number; activeStewards: number; totalCheckIns: number };
  }> {
    const gateStats = new Map<string, GateStatistics>();
    const stewardStats = new Map<string, { stewardId: string; totalCheckIns: number; averageTime: number; efficiency: number }>();

    // Calculate gate statistics
    for (const gate of this.gates.values()) {
      gateStats.set(gate.id, await this.getGateStatistics(gate.id));
    }

    // Calculate steward statistics
    for (const steward of this.stewards.values()) {
      const sessions = Array.from(this.sessions.values()).filter(s => s.stewardId === steward.id);
      const totalCheckIns = sessions.reduce((sum, s) => sum + s.totalCheckIns, 0);
      const totalErrors = sessions.reduce((sum, s) => sum + s.failedCheckIns, 0);
      const avgTime = sessions.length > 0 
        ? sessions.reduce((sum, s) => sum + s.averageCheckInTime, 0) / sessions.length
        : 0;

      stewardStats.set(steward.id, {
        stewardId: steward.id,
        totalCheckIns,
        averageTime: avgTime,
        efficiency: totalCheckIns > 0 ? (totalCheckIns - totalErrors) / totalCheckIns : 1
      });
    }

    const overview = {
      totalGates: this.gates.size,
      activeGates: Array.from(this.gates.values()).filter(g => g.isActive).length,
      totalStewards: this.stewards.size,
      activeStewards: Array.from(this.stewards.values()).filter(s => s.isActive).length,
      totalCheckIns: Array.from(this.sessions.values()).reduce((sum, s) => sum + s.totalCheckIns, 0)
    };

    return { gates: gateStats, stewards: stewardStats, overview };
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
  private calculateGateLoad(gateId: string): number {
    const session = this.getActiveSessionForGate(gateId);
    if (!session) {
      return 0;
    }

    // Simple load calculation based on recent activity
    const recentActivities = session.activities.filter(
      a => Date.now() - a.timestamp.getTime() < 10 * 60 * 1000 // Last 10 minutes
    );

    const checkInActivities = recentActivities.filter(a => a.type === 'check_in');
    return Math.min(checkInActivities.length / 10, 1); // Max 10 check-ins per 10 minutes = 100% load
  }

  private startLoadBalancing(): void {
    this.loadBalanceInterval = setInterval(async () => {
      try {
        await this.balanceLoad();
      } catch (error) {
        console.error('Load balancing failed:', error);
      }
    }, 60000); // Every minute
  }

  private startSessionMonitoring(): void {
    this.sessionTimeoutInterval = setInterval(async () => {
      const now = new Date();
      const timeoutMs = this.config.sessionTimeoutMinutes * 60 * 1000;

      for (const session of this.sessions.values()) {
        if (session.isActive && (now.getTime() - session.startTime.getTime()) > timeoutMs) {
          await this.endSession(session.id, 'auto-timeout');
        }
      }
    }, 300000); // Every 5 minutes
  }

  private emitEvent(type: CheckInEventType, data: Record<string, unknown>): void {
    const event: CheckInEvent = {
      type: type,
      timestamp: new Date(),
      data,
      source: 'gate',
      priority: 'medium'
    };
    
    this.emit('gate-event', event);
  }

  // Persistence
  private async persistData(): Promise<void> {
    try {
      const data = {
        gates: Array.from(this.gates.entries()),
        stewards: Array.from(this.stewards.entries()),
        sessions: Array.from(this.sessions.entries()),
        activities: Array.from(this.activities.entries()),
        config: this.config
      };
      
      await this.storage.setItem('gate-coordinator-data', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to persist gate coordinator data:', error);
    }
  }

  private async loadPersistedData(): Promise<void> {
    try {
      const dataStr = await this.storage.getItem('gate-coordinator-data');
      if (!dataStr) return;

      const data = JSON.parse(dataStr);
      
      if (data.gates) {
        this.gates = new Map(data.gates);
      }
      
      if (data.stewards) {
        this.stewards = new Map(data.stewards);
      }
      
      if (data.sessions) {
        this.sessions = new Map(data.sessions);
      }
      
      if (data.activities) {
        this.activities = new Map(data.activities);
      }
      
      if (data.config) {
        this.config = { ...this.config, ...data.config };
      }
    } catch (error) {
      console.error('Failed to load persisted gate coordinator data:', error);
    }
  }
}

// Export singleton instance
export const gateCoordinator = new GateCoordinator();