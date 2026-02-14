/**
 * Offline Scoring Service Types
 *
 * Configuration interface and default values for the OfflineScoringService.
 */

import type { ConflictResolution } from '@/types/scoring-types';

export interface OfflineScoringServiceConfig {
  autoSaveInterval: number;    // Auto-save frequency in ms
  enableRealTimeSync: boolean; // Sync when online
  enablePlacementUpdates: boolean; // Real-time placement calculation
  conflictResolutionStrategy: ConflictResolution['strategy'];
  maxCacheSize: number;       // Maximum cached scores
}

export const DEFAULT_CONFIG: OfflineScoringServiceConfig = {
  autoSaveInterval: 30000,    // 30 seconds
  enableRealTimeSync: true,
  enablePlacementUpdates: true,
  conflictResolutionStrategy: 'manual_override',
  maxCacheSize: 1000
};
