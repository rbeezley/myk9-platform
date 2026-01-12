/**
 * Offline Scoring Services Index
 * 
 * Centralized export point for all offline scoring services and utilities.
 * Provides easy imports and service coordination.
 */

// Core Services
export { OfflineScoringService, offlineScoringService } from './OfflineScoringService';
export { PlacementCalculatorService, placementCalculatorService } from './PlacementCalculatorService';
export { ScoreValidatorService, scoreValidatorService } from './ScoreValidatorService';
export { JudgeWorkflowManager, judgeWorkflowManager } from './JudgeWorkflowManager';

// Import for internal use
import { offlineScoringService } from './OfflineScoringService';
import { placementCalculatorService } from './PlacementCalculatorService';
import { judgeWorkflowManager } from './JudgeWorkflowManager';
import { logger } from '@/services/LoggingService';

// Service Types
export type {
  OfflineScoringServiceConfig
} from './OfflineScoringService';

export type {
  PlacementCalculatorConfig
} from './PlacementCalculatorService';

export type {
  ValidatorConfig
} from './ScoreValidatorService';

export type {
  JudgeCredentials,
  JudgeSession,
  WorkflowStep,
  AssignmentStrategy,
  EntryAssignment,
  WorkflowTemplate,
  WorkflowStepDefinition,
  JudgePerformanceMetrics,
  WorkflowAction,
  JudgeRole
} from './JudgeWorkflowManager';

// Store Exports
export {
  useOfflineScoringStore,
  useCurrentScoringSession,
  useJudgeAuth,
  useClassScoring,
  useScoringValidation,
  useSyncStatus,
  useScoringEvents
} from '@/store/offlineScoringStore';

export type { OfflineScoringStore as OfflineScoringState } from '@/store/offlineScoringStore';

// Utility Functions
export {
  DEFAULT_SCORING_CONFIGS,
  isAgilityScore,
  isObedienceScore,
  isRallyScore,
  isConformationScore,
  isScentWorkScore
} from '@/types/scoring-types';

/**
 * Initialize all offline scoring services
 * Call this once during application startup
 */
export async function initializeOfflineScoring(): Promise<void> {
  try {
    // Services auto-initialize on import, but we can force initialization here if needed
    logger.debug('Offline scoring services initialized', 'scoring', {});
  } catch (error) {
    logger.error('Failed to initialize offline scoring services:', 'scoring', {}, error as Error);
    throw error;
  }
}

/**
 * Cleanup all offline scoring services
 * Call this during application shutdown
 */
export async function cleanupOfflineScoring(): Promise<void> {
  try {
    await Promise.all([
      offlineScoringService.destroy(),
      placementCalculatorService.cleanup(),
      judgeWorkflowManager.cleanup()
    ]);
    logger.debug('Offline scoring services cleaned up', 'scoring', {});
  } catch (error) {
    logger.error('Failed to cleanup offline scoring services:', 'scoring', {}, error as Error);
  }
}

/**
 * Get overall system status for debugging and monitoring
 */
export function getOfflineScoringStatus(): {
  scoring: ReturnType<typeof offlineScoringService.getStatistics>;
  placements: ReturnType<typeof placementCalculatorService.getStatistics>;
  workflow: ReturnType<typeof judgeWorkflowManager.getStatistics>;
  isOnline: boolean;
} {
  return {
    scoring: offlineScoringService.getStatistics(),
    placements: placementCalculatorService.getStatistics(),
    workflow: judgeWorkflowManager.getStatistics(),
    isOnline: navigator.onLine
  };
}