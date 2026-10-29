/**
 * Scoring Services Index
 *
 * Centralized export point for the scoring services and utilities.
 */

// Core Services
export {
  PlacementCalculatorService,
  placementCalculatorService,
} from './PlacementCalculatorService';
export { ScoreValidatorService, scoreValidatorService } from './ScoreValidatorService';

// Service Types
export type { PlacementCalculatorConfig } from './PlacementCalculatorService';

export type { ValidatorConfig } from './ScoreValidatorService';

// Store Exports
export {
  useOfflineScoringStore,
  useCurrentScoringSession,
  useJudgeAuth,
  useClassScoring,
  useScoringValidation,
  useSyncStatus,
} from '@/store/offlineScoringStore';

export type { OfflineScoringStore as OfflineScoringState } from '@/store/offlineScoringStore';

// Utility Functions
export {
  DEFAULT_SCORING_CONFIGS,
  isAgilityScore,
  isObedienceScore,
  isRallyScore,
  isConformationScore,
  isScentWorkScore,
} from '@/types/scoring-types';
