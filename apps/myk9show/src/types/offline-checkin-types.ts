/**
 * Types for Offline Check-In System
 * 
 * Comprehensive types for managing offline check-in operations,
 * armband assignments, gate coordination, and conflict resolution
 */

import type { CheckInStatus } from './check-in-types';
import type { SyncableEntity } from './sync-types';

// Core check-in types
export interface CheckInEntry extends SyncableEntity {
  id: string;
  showId: string;
  classId: string;
  trialId: string;
  dogId: string;
  handlerId: string;
  
  // Entry details
  armband: string;
  runOrder: number;
  entryNumber: string;
  
  // Dog information
  dogName: string;
  dogCallName: string;
  dogBreed: string;
  dogRegistrationNumber?: string;
  
  // Handler information
  handlerName: string;
  handlerEmail?: string;
  handlerPhone?: string;
  
  // Class information
  className: string;
  classNumber: string;
  ringNumber: number;
  judgeName: string;
  estimatedStartTime?: Date;
  
  // Check-in status
  checkInStatus: CheckInStatus;
  checkInTime?: Date;
  checkInGate?: string;
  checkInStewardId?: string;
  
  // Special requirements
  specialRequests?: string;
  handlerChange?: string;
  needsCallToRing?: boolean;
  isAbsent?: boolean;
  isScratched?: boolean;
  scratchReason?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Armband management
export interface ArmbandAssignment extends SyncableEntity {
  id: string;
  showId: string;
  classId: string;
  armband: string;
  entryId?: string;
  status: 'available' | 'assigned' | 'used' | 'conflict' | 'reserved';
  assignedAt?: Date;
  assignedBy?: string;
  
  // Conflict resolution
  conflictResolution?: 'reassign' | 'duplicate' | 'manual';
  originalEntryId?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface ArmbandConflict {
  id: string;
  armband: string;
  classId: string;
  conflictingEntries: CheckInEntry[];
  conflictType: 'duplicate_assignment' | 'manual_override' | 'system_error';
  detectedAt: Date;
  resolvedAt?: Date;
  resolution?: ArmbandConflictResolution;
  resolvedBy?: string;
}

export interface ArmbandConflictResolution {
  strategy: 'reassign_duplicates' | 'keep_first' | 'manual_assignment' | 'new_armbands';
  newAssignments: { entryId: string; armband: string }[];
  notes?: string;
}

// Gate steward coordination
export interface GateSteward extends SyncableEntity {
  id: string;
  userId: string;
  name: string;
  assignedRings: string[];
  assignedGates: string[];
  isActive: boolean;
  currentShift?: GateStewardShift;
  capabilities: GateStewardCapabilities;
  
  // Session tracking
  sessionStart?: Date;
  lastActivity?: Date;
  totalCheckIns: number;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface GateStewardShift {
  id: string;
  stewardId: string;
  showId: string;
  startTime: Date;
  endTime?: Date;
  assignedRings: string[];
  assignedGates: string[];
  checkInCount: number;
  isActive: boolean;
}

export interface GateStewardCapabilities {
  canScanQR: boolean;
  canManualEntry: boolean;
  canResolveConflicts: boolean;
  canAssignArmbands: boolean;
  canHandleSpecialCases: boolean;
  maxConcurrentRings: number;
}

// Check-in operations
export interface CheckInOperation {
  id: string;
  entryId: string;
  operationType: 'check_in' | 'scratch' | 'absent' | 'handler_change' | 'special_request';
  previousStatus?: CheckInStatus;
  newStatus: CheckInStatus;
  
  // Operation details
  performedBy: string;
  performedAt: Date;
  method: 'qr_scan' | 'manual_entry' | 'bulk_operation' | 'automatic';
  gateId?: string;
  deviceId?: string;
  
  // Additional data
  handlerChange?: string;
  specialRequests?: string;
  scratchReason?: string;
  notes?: string;
  
  // Validation
  validationChecks: CheckInValidationResult[];
  hasWarnings: boolean;
  hasErrors: boolean;
  
  // Sync status
  isSynced: boolean;
  syncedAt?: Date;
  syncError?: string;
}

export interface CheckInValidationResult {
  check: 'entry_exists' | 'armband_unique' | 'time_window' | 'handler_eligible' | 'dog_eligible' | 'class_open' | 'duplicate_checkin' | 'status_transition' | 'special_requirements' | 'data_integrity';
  status: 'pass' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

// QR/Barcode scanning
export interface QRScanResult {
  success: boolean;
  data?: string;
  error?: string;
  entryId?: string;
  armband?: string;
  scannedAt: Date;
  scannerType: 'camera' | 'barcode_reader' | 'manual';
}

export interface QRCode {
  entryId: string;
  armband: string;
  showId: string;
  classId: string;
  dogName: string;
  handlerName: string;
  checksum: string;
  generatedAt: Date;
  isValid: boolean;
}

// Gate coordination
export interface Gate {
  id: string;
  name: string;
  ringNumbers: string[];
  showId: string;
  isActive: boolean;
  currentSteward?: string;
  capabilities: GateCapabilities;
  
  // Status tracking
  totalCheckIns: number;
  currentLoad: number;
  lastActivity?: Date;
  
  // Equipment
  hasQRScanner: boolean;
  hasBarcodeReader: boolean;
  hasTablet: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface GateCapabilities {
  maxConcurrentRings: number;
  supportsQRScanning: boolean;
  supportsBarcodeScanning: boolean;
  supportsManualEntry: boolean;
  supportsConflictResolution: boolean;
}

export interface GateSession {
  id: string;
  gateId: string;
  stewardId: string;
  showId: string;
  startTime: Date;
  endTime?: Date;
  
  // Session statistics
  totalCheckIns: number;
  successfulCheckIns: number;
  failedCheckIns: number;
  conflictsResolved: number;
  averageCheckInTime: number;
  
  // Activity log
  activities: GateActivity[];
  
  isActive: boolean;
}

export interface GateActivity {
  id: string;
  sessionId: string;
  timestamp: Date;
  type: 'check_in' | 'conflict' | 'error' | 'steward_change' | 'equipment_issue';
  entryId?: string;
  details: Record<string, unknown>;
  severity: 'info' | 'warning' | 'error';
}

// Time synchronization
export interface TimeSyncStatus {
  lastSyncAt: Date;
  serverTimeOffset: number;
  isAccurate: boolean;
  accuracy: number; // milliseconds
  syncSource: 'ntp' | 'server' | 'manual';
}

export interface CheckInTimeWindow {
  classId: string;
  openTime: Date;
  closeTime: Date;
  warningTime: Date; // When to show late check-in warnings
  isOpen: boolean;
  isLateCheckIn: boolean;
}

// Offline operation handling
export interface OfflineCheckInQueue extends SyncableEntity {
  id: string;
  operations: CheckInOperation[];
  queuedAt: Date;
  lastProcessedAt?: Date;
  processingErrors: string[];
  retryCount: number;
  maxRetries: number;
  isProcessing: boolean;
}

export interface CheckInConflict {
  id: string;
  type: 'duplicate_checkin' | 'armband_conflict' | 'time_conflict' | 'handler_conflict' | 'data_mismatch';
  entryId: string;
  conflictingData: Record<string, unknown>;
  detectedAt: Date;
  resolvedAt?: Date;
  resolution?: ConflictResolution;
  
  // Context
  gateId?: string;
  stewardId?: string;
  originalOperation: CheckInOperation;
  conflictingOperation?: CheckInOperation;
  
  // Status
  status: 'pending' | 'resolved' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface ConflictResolution {
  strategy: 'accept_local' | 'accept_remote' | 'merge' | 'manual' | 'escalate';
  resolvedData?: Record<string, unknown>;
  resolvedBy: string;
  resolvedAt: Date;
  notes?: string;
}

// Service interfaces
export interface OfflineCheckInServiceConfig {
  enableQRScanning: boolean;
  enableBarcodeScanning: boolean;
  enableManualEntry: boolean;
  autoResolveConflicts: boolean;
  conflictResolutionStrategy: 'local_wins' | 'remote_wins' | 'timestamp' | 'manual';
  maxRetries: number;
  retryDelay: number;
  syncInterval: number;
  validationStrict: boolean;
  enableTimeSync: boolean;
  timeSyncInterval: number;
}

export interface ArmbandManagerConfig {
  autoAssignArmbands: boolean;
  allowDuplicates: boolean;
  conflictResolutionStrategy: 'reassign' | 'manual' | 'first_wins';
  armbandRanges: { start: number; end: number; class?: string }[];
  reservedArmbands: string[];
}

export interface GateCoordinatorConfig {
  maxGatesPerSteward: number;
  autoBalanceLoad: boolean;
  enableCrossGateValidation: boolean;
  conflictEscalationThreshold: number;
  sessionTimeoutMinutes: number;
}

// Events and notifications
export type CheckInEventType = 
  | 'check_in_completed'
  | 'check_in_failed'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'armband_assigned'
  | 'armband_assignment_failed'
  | 'armband_reassigned'
  | 'armband_released'
  | 'armband_conflict'
  | 'armband_conflict_resolved'
  | 'gate_opened'
  | 'gate_closed'
  | 'gate_created'
  | 'gate_updated'
  | 'gate_activated'
  | 'gate_deactivated'
  | 'steward_registered'
  | 'steward_assigned'
  | 'steward_removed'
  | 'session_started'
  | 'session_ended'
  | 'conflict_escalated'
  | 'bulk_operation_completed'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'validation_warning'
  | 'validation_error';

export interface CheckInEvent {
  type: CheckInEventType;
  timestamp: Date;
  data: Record<string, unknown>;
  source: 'gate' | 'service' | 'sync' | 'system';
  priority: 'low' | 'medium' | 'high' | 'critical';
  gateId?: string;
  stewardId?: string;
  entryId?: string;
}

// Statistics and monitoring
export interface CheckInStatistics {
  totalEntries: number;
  checkedInCount: number;
  scratchedCount: number;
  absentCount: number;
  conflictCount: number;
  averageCheckInTime: number;
  checkInRate: number; // entries per minute
  
  // By gate
  gateStatistics: Record<string, GateStatistics>;
  
  // Time-based
  timeSeriesData: TimeSeriesPoint[];
  
  // Quality metrics
  errorRate: number;
  conflictRate: number;
  syncSuccessRate: number;
  
  lastUpdated: Date;
}

export interface GateStatistics {
  gateId: string;
  totalCheckIns: number;
  averageTime: number;
  errorCount: number;
  conflictCount: number;
  currentLoad: number;
  efficiency: number; // 0-1 scale
}

export interface TimeSeriesPoint {
  timestamp: Date;
  checkIns: number;
  errors: number;
  conflicts: number;
}

// Export commonly used types
export type {
  CheckInStatus,
  SyncableEntity
};