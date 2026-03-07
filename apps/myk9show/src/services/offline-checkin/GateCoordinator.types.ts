/**
 * GateCoordinator Types and Configuration
 */

import type { GateCoordinatorConfig } from '@/types/offline-checkin-types';

export const DEFAULT_CONFIG: GateCoordinatorConfig = {
  maxGatesPerSteward: 2,
  autoBalanceLoad: true,
  enableCrossGateValidation: true,
  conflictEscalationThreshold: 3,
  sessionTimeoutMinutes: 480, // 8 hours
};

export interface StewardStatistics {
  stewardId: string;
  totalCheckIns: number;
  averageTime: number;
  efficiency: number;
}

export interface CoordinatorOverview {
  totalGates: number;
  activeGates: number;
  totalStewards: number;
  activeStewards: number;
  totalCheckIns: number;
}
