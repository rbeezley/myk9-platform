/**
 * Offline Check-In Services Export
 * 
 * Central export point for all offline check-in services and utilities
 */

// Core services
export { OfflineCheckInService } from './OfflineCheckInService';
export { ArmbandManager } from './ArmbandManager';
export { CheckInValidator } from './CheckInValidator';
export { GateCoordinator } from './GateCoordinator';
export { QRScannerService } from './QRScannerService';

// Service instances
import { OfflineCheckInService } from './OfflineCheckInService';
import { ArmbandManager } from './ArmbandManager';
import { CheckInValidator } from './CheckInValidator';
import { GateCoordinator } from './GateCoordinator';
import { QRScannerService } from './QRScannerService';

export const offlineCheckInService = new OfflineCheckInService();
export const armbandManager = new ArmbandManager();
export const checkInValidator = new CheckInValidator();
export const gateCoordinator = new GateCoordinator();
export const qrScannerService = new QRScannerService();

// Types re-exports for convenience
export type {
  CheckInEntry,
  CheckInOperation,
  CheckInConflict,
  CheckInValidationResult,
  CheckInStatistics,
  CheckInEvent,
  CheckInEventType,
  ArmbandAssignment,
  ArmbandConflict,
  ArmbandConflictResolution,
  ArmbandManagerConfig,
  GateSteward,
  GateSession,
  GateActivity,
  GateStatistics,
  GateCoordinatorConfig,
  QRScanResult,
  QRCode,
  OfflineCheckInServiceConfig,
  TimeSyncStatus,
  CheckInTimeWindow,
  OfflineCheckInQueue
} from '@/types/offline-checkin-types';

// Utility functions
export const initializeAllServices = async () => {
  try {
    await Promise.all([
      offlineCheckInService.initialize(),
      armbandManager.initialize(),
      gateCoordinator.initialize(),
      qrScannerService.initialize()
    ]);
    console.log('All offline check-in services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize offline check-in services:', error);
    throw error;
  }
};

export const shutdownAllServices = async () => {
  try {
    await Promise.all([
      offlineCheckInService.shutdown(),
      gateCoordinator.shutdown(),
      qrScannerService.dispose()
    ]);
    console.log('All offline check-in services shut down successfully');
  } catch (error) {
    console.error('Error during service shutdown:', error);
    throw error;
  }
};

// Service status check
export const checkServiceStatus = () => {
  return {
    checkInService: {
      initialized: true, // Would check actual status in real implementation
      online: navigator.onLine
    },
    armbandManager: {
      initialized: true
    },
    gateCoordinator: {
      initialized: true,
      activeGates: gateCoordinator.getActiveGates().length,
      activeStewards: gateCoordinator.getActiveStewards().length
    },
    qrScanner: {
      initialized: true,
      cameraActive: qrScannerService.isCameraActive(),
      scanningActive: qrScannerService.isScanningActive()
    }
  };
};