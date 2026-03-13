/**
 * Types for GateStewardInterface and related components.
 */

import type { CheckInStatus } from '@myk9/core';

export interface GateEntry {
  id: string;
  entryNumber: string;
  armband: string;
  dogName: string;
  handlerName: string;
  ownerName: string;
  className: string;
  classNumber: string;
  ring: string;
  checkInStatus: CheckInStatus;
  checkInTime?: Date;
  runOrder?: number;
  estimatedRunTime?: Date;
  judgeAssigned: string;
  isUrgent?: boolean;
}

export interface GateStewardInterfaceProps {
  assignedRings?: string[];
  className?: string;
  gateId?: string;
  showId?: string;
}

export interface GateStats {
  total: number;
  needsAttention: number;
  atGate: number;
  conflicts: number;
  ready: number;
}
