/**
 * Placement Calculator Service
 *
 * Advanced placement calculation algorithms for all competition formats.
 * Handles complex tie-breaking rules, multi-format scoring, and real-time
 * placement updates with full offline support.
 *
 * Key Features:
 * - Multi-format placement algorithms (Scent Work, Agility, Obedience, etc.)
 * - Complex tie-breaking logic with customizable rules
 * - Real-time placement updates
 * - Historical placement tracking
 * - Performance optimized for large entry counts
 * - Offline-first design with sync capabilities
 */

import { EventEmitter } from '../sync/eventEmitter';
import { logger } from '@/services/LoggingService';
import type {
  BaseScore,
  ScoringFormat,
  PlacementCalculation,
  PlacementEntry,
} from '@/types/scoring-types';
import { DEFAULT_SCORING_CONFIGS } from '@/types/scoring-types';
import type { ScentWorkResult, MultiAreaScentWorkResult } from '@/types/scent-work-types';
import { getOptimalStorage } from '@/services/database/storage-adapter';

// Import from sibling modules
import type { PlacementCalculatorConfig } from './PlacementCalculatorService.types';
import { DEFAULT_CONFIG } from './PlacementCalculatorService.constants';
import {
  createPlacementEntry,
  createEmptyPlacementCalculation,
  getAppliedTieBreakers,
  sortEntriesByFormat,
  assignPlacementsWithTieHandling,
  resolveTiesWithRules,
  serializePlacementCalculation,
  deserializePlacementCalculation,
} from './PlacementCalculatorService.helpers';

// Re-export types and config for backward compatibility
export type { PlacementCalculatorConfig } from './PlacementCalculatorService.types';

/**
 * Advanced placement calculation service
 */
export class PlacementCalculatorService extends EventEmitter {
  private config: PlacementCalculatorConfig;
  private storage!: Storage;

  // Placement cache for performance
  private placementCache = new Map<string, PlacementCalculation>();
  private calculationHistory = new Map<string, PlacementCalculation[]>();

  constructor(config: Partial<PlacementCalculatorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      this.storage = (await getOptimalStorage('placements')) as Storage;
      await this.loadCachedPlacements();
    } catch (error) {
      logger.error('Failed to initialize placement calculator:', 'scoring', {}, error as Error);
    }
  }

  private async loadCachedPlacements(): Promise<void> {
    try {
      const cached = (await this.storage.getItem('placement_cache')) || '{}';
      const placements = JSON.parse(cached);

      Object.entries(placements).forEach(([key, data]: [string, unknown]) => {
        this.placementCache.set(key, deserializePlacementCalculation(data));
      });
    } catch (error) {
      logger.error('Failed to load cached placements:', 'scoring', {}, error as Error);
    }
  }

  // ========================================================================
  // Main Placement Calculation Methods
  // ========================================================================

  /**
   * Calculate placements for a class with given scores
   */
  async calculatePlacements(
    classId: string,
    format: ScoringFormat,
    scores: BaseScore[],
    entryMetadata?: Map<string, { dogName: string; handlerName: string; armband: string }>
  ): Promise<PlacementCalculation> {
    try {
      const config = DEFAULT_SCORING_CONFIGS[format];
      if (!config) {
        throw new Error(`Unsupported format: ${format}`);
      }

      const qualifiedScores = scores.filter(score => score.qualification === 'Qualified');

      if (qualifiedScores.length === 0) {
        return createEmptyPlacementCalculation(classId, format);
      }

      const placementEntries = qualifiedScores.map(score =>
        createPlacementEntry(score, entryMetadata?.get(score.entryId))
      );

      const sortedEntries = sortEntriesByFormat(placementEntries, format, config.placementRules);

      const entriesWithPlacements = this.applyTieBreaking(
        sortedEntries,
        config.tieBreakingRules,
        format
      );

      const calculation: PlacementCalculation = {
        classId,
        format,
        placements: entriesWithPlacements,
        calculatedAt: new Date(),
        calculatedBy: 'system',
        tieBreakingRules: config.tieBreakingRules,
        appliedTieBreakers: getAppliedTieBreakers(),
      };

      if (this.config.cacheResults) {
        await this.cachePlacementCalculation(classId, calculation);
      }

      this.addToHistory(classId, calculation);

      this.emit('placements_calculated', {
        classId,
        format,
        totalEntries: scores.length,
        qualifiedEntries: qualifiedScores.length,
        placedEntries: entriesWithPlacements.filter(e => e.placement).length,
      });

      return calculation;
    } catch (error) {
      logger.error('Failed to calculate placements:', 'scoring', {}, error as Error);
      throw error;
    }
  }

  /**
   * Calculate placements for Scent Work (specialized method)
   */
  async calculateScentWorkPlacements(
    classId: string,
    results: (ScentWorkResult | MultiAreaScentWorkResult)[],
    entryMetadata?: Map<string, { dogName: string; handlerName: string; armband: string }>
  ): Promise<PlacementCalculation> {
    const qualifiedResults = results.filter(result => result.qualification === 'Qualified');

    if (qualifiedResults.length === 0) {
      return createEmptyPlacementCalculation(classId, 'scent_work');
    }

    const placementEntries: PlacementEntry[] = qualifiedResults.map(result => {
      const metadata = entryMetadata?.get(result.entryId);
      const searchTime = 'totalSearchTime' in result ? result.totalSearchTime : result.searchTime;
      const faults = 'totalFaults' in result ? result.totalFaults : result.faults;

      const baseScore: BaseScore = {
        id: result.entryId + '_score',
        entryId: result.entryId,
        classId: result.classId,
        judgeId: result.recordedBy,
        format: 'scent_work' as const,
        qualification: result.qualification,
        timestamp: result.recordedAt,
        recordedBy: result.recordedBy,
        recordedAt: result.recordedAt,
        version: 1,
        lastModified: result.recordedAt,
        syncStatus: 'synced',
        time: searchTime,
        faults: faults,
      };

      return {
        entryId: result.entryId,
        dogName: metadata?.dogName || 'Unknown Dog',
        handlerName: metadata?.handlerName || 'Unknown Handler',
        armband: metadata?.armband || '000',
        primaryScore: searchTime,
        secondaryScore: faults,
        qualification: result.qualification,
        isTied: false,
        rawScore: baseScore,
      };
    });

    placementEntries.sort((a, b) => {
      if (a.primaryScore !== b.primaryScore) {
        return (a.primaryScore as number) - (b.primaryScore as number);
      }
      return (a.secondaryScore || 0) - (b.secondaryScore || 0);
    });

    const entriesWithPlacements = assignPlacementsWithTieHandling(placementEntries);

    const calculation: PlacementCalculation = {
      classId,
      format: 'scent_work',
      placements: entriesWithPlacements,
      calculatedAt: new Date(),
      calculatedBy: 'system',
      tieBreakingRules: DEFAULT_SCORING_CONFIGS.scent_work.tieBreakingRules,
      appliedTieBreakers: getAppliedTieBreakers(),
    };

    if (this.config.cacheResults) {
      await this.cachePlacementCalculation(classId, calculation);
    }

    this.addToHistory(classId, calculation);

    return calculation;
  }

  // ========================================================================
  // Tie-Breaking (delegates to helpers)
  // ========================================================================

  private applyTieBreaking(
    sortedEntries: PlacementEntry[],
    tieBreakingRules: import('@/types/scoring-types').TieBreakingRule[],
    format: ScoringFormat
  ): PlacementEntry[] {
    if (sortedEntries.length === 0) return sortedEntries;

    const entriesWithPlacements = assignPlacementsWithTieHandling(sortedEntries);

    if (tieBreakingRules.length > 0) {
      return resolveTiesWithRules(entriesWithPlacements, tieBreakingRules, format);
    }

    return entriesWithPlacements;
  }

  // ========================================================================
  // Caching and Persistence
  // ========================================================================

  private async cachePlacementCalculation(
    classId: string,
    calculation: PlacementCalculation
  ): Promise<void> {
    try {
      this.placementCache.set(classId, calculation);

      if (this.placementCache.size > this.config.maxCacheSize) {
        const oldestKey = this.placementCache.keys().next().value;
        if (oldestKey) this.placementCache.delete(oldestKey);
      }

      if (this.storage) {
        const cacheData = Object.fromEntries(
          Array.from(this.placementCache.entries()).map(([key, calc]) => [
            key,
            serializePlacementCalculation(calc),
          ])
        );
        await this.storage.setItem('placement_cache', JSON.stringify(cacheData));
      }
    } catch (error) {
      logger.error('Failed to cache placement calculation:', 'scoring', {}, error as Error);
    }
  }

  private addToHistory(classId: string, calculation: PlacementCalculation): void {
    const history = this.calculationHistory.get(classId) || [];
    history.push(calculation);

    if (history.length > 10) {
      history.shift();
    }

    this.calculationHistory.set(classId, history);
  }

  // ========================================================================
  // Public API Methods
  // ========================================================================

  /**
   * Get cached placement calculation for a class
   */
  getCachedPlacements(classId: string): PlacementCalculation | null {
    return this.placementCache.get(classId) || null;
  }

  /**
   * Get placement history for a class
   */
  getPlacementHistory(classId: string): PlacementCalculation[] {
    return this.calculationHistory.get(classId) || [];
  }

  /**
   * Clear cache for a specific class
   */
  async clearClassCache(classId: string): Promise<void> {
    this.placementCache.delete(classId);
    this.calculationHistory.delete(classId);

    if (this.storage) {
      const cacheData = Object.fromEntries(
        Array.from(this.placementCache.entries()).map(([key, calc]) => [
          key,
          serializePlacementCalculation(calc),
        ])
      );
      await this.storage.setItem('placement_cache', JSON.stringify(cacheData));
    }
  }

  /**
   * Get service statistics
   */
  getStatistics(): {
    cachedCalculations: number;
    totalHistoryEntries: number;
    lastCalculationTime?: Date;
  } {
    const allHistory = Array.from(this.calculationHistory.values()).flat();
    const lastCalculation = allHistory.sort(
      (a, b) => b.calculatedAt.getTime() - a.calculatedAt.getTime()
    )[0];

    return {
      cachedCalculations: this.placementCache.size,
      totalHistoryEntries: allHistory.length,
      lastCalculationTime: lastCalculation?.calculatedAt,
    };
  }

  /**
   * Cleanup old calculations and optimize cache
   */
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const [classId, history] of this.calculationHistory.entries()) {
      const filteredHistory = history.filter(calc => calc.calculatedAt > cutoff);
      if (filteredHistory.length === 0) {
        this.calculationHistory.delete(classId);
        this.placementCache.delete(classId);
      } else {
        this.calculationHistory.set(classId, filteredHistory);
      }
    }

    if (this.storage) {
      const cacheData = Object.fromEntries(
        Array.from(this.placementCache.entries()).map(([key, calc]) => [
          key,
          serializePlacementCalculation(calc),
        ])
      );
      await this.storage.setItem('placement_cache', JSON.stringify(cacheData));
    }

    this.emit('cache_cleaned', {
      remainingCalculations: this.placementCache.size,
      remainingHistory: Array.from(this.calculationHistory.values()).flat().length,
    });
  }
}

// Singleton instance
export const placementCalculatorService = new PlacementCalculatorService();
