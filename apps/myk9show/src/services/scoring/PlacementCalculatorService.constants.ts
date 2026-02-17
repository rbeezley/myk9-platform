/**
 * Placement Calculator Service Constants
 *
 * Default configuration and constant values for the PlacementCalculatorService.
 */

import type { PlacementCalculatorConfig } from './PlacementCalculatorService.types';

export const DEFAULT_CONFIG: PlacementCalculatorConfig = {
  enableRealTimeUpdates: true,
  cacheResults: true,
  maxCacheSize: 100,
  enablePerformanceOptimization: true,
};
