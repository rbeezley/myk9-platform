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
import type {
import { logger } from '@/services/LoggingService';
  BaseScore,
  ScoringFormat,
  PlacementCalculation,
  PlacementEntry,
  TieBreakingRule,
  AppliedTieBreaker,
  PlacementRule
} from '@/types/scoring-types';
import {
  DEFAULT_SCORING_CONFIGS,
  isAgilityScore,
  isObedienceScore,
  isRallyScore,
  isConformationScore
} from '@/types/scoring-types';
import type { ScentWorkResult, MultiAreaScentWorkResult } from '@/types/scent-work-types';
import { getOptimalStorage } from '@/services/database/storage-adapter';

export interface PlacementCalculatorConfig {
  enableRealTimeUpdates: boolean;
  cacheResults: boolean;
  maxCacheSize: number;
  enablePerformanceOptimization: boolean;
}

const DEFAULT_CONFIG: PlacementCalculatorConfig = {
  enableRealTimeUpdates: true,
  cacheResults: true,
  maxCacheSize: 100,
  enablePerformanceOptimization: true
};

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
      this.storage = await getOptimalStorage('placements') as Storage;
      await this.loadCachedPlacements();
    } catch (error) {
      logger.error('Failed to initialize placement calculator:', 'scoring', {}, error as Error);
    }
  }

  private async loadCachedPlacements(): Promise<void> {
    try {
      const cached = await this.storage.getItem('placement_cache') || '{}';
      const placements = JSON.parse(cached);
      
      Object.entries(placements).forEach(([key, data]: [string, unknown]) => {
        this.placementCache.set(key, this.deserializePlacementCalculation(data));
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
      // Get format-specific configuration
      const config = DEFAULT_SCORING_CONFIGS[format];
      if (!config) {
        throw new Error(`Unsupported format: ${format}`);
      }

      // Filter to qualified scores only for placement calculation
      const qualifiedScores = scores.filter(score => 
        score.qualification === 'Qualified'
      );

      if (qualifiedScores.length === 0) {
        return this.createEmptyPlacementCalculation(classId, format);
      }

      // Create placement entries
      const placementEntries = qualifiedScores.map(score => 
        this.createPlacementEntry(score, entryMetadata?.get(score.entryId))
      );

      // Sort entries based on format-specific rules
      const sortedEntries = this.sortEntriesByFormat(placementEntries, format, config.placementRules);

      // Apply tie-breaking rules
      const entriesWithPlacements = await this.applyTieBreaking(
        sortedEntries,
        config.tieBreakingRules,
        format
      );

      // Create placement calculation result
      const calculation: PlacementCalculation = {
        classId,
        format,
        placements: entriesWithPlacements,
        calculatedAt: new Date(),
        calculatedBy: 'system',
        tieBreakingRules: config.tieBreakingRules,
        appliedTieBreakers: this.getAppliedTieBreakers()
      };

      // Cache result
      if (this.config.cacheResults) {
        await this.cachePlacementCalculation(classId, calculation);
      }

      // Store in history
      this.addToHistory(classId, calculation);

      this.emit('placements_calculated', {
        classId,
        format,
        totalEntries: scores.length,
        qualifiedEntries: qualifiedScores.length,
        placedEntries: entriesWithPlacements.filter(e => e.placement).length
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
    // Filter qualified entries
    const qualifiedResults = results.filter(result => 
      result.qualification === 'Qualified'
    );

    if (qualifiedResults.length === 0) {
      return this.createEmptyPlacementCalculation(classId, 'scent_work');
    }

    // Create placement entries for scent work
    const placementEntries = qualifiedResults.map(result => {
      const metadata = entryMetadata?.get(result.entryId);
      const searchTime = 'totalSearchTime' in result ? result.totalSearchTime : result.searchTime;
      const faults = 'totalFaults' in result ? result.totalFaults : result.faults;

      // Convert ScentWorkResult to BaseScore format for placement entry
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
        faults: faults
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
        rawScore: baseScore
      };
    });

    // Sort by time (ascending), then by faults (ascending)
    placementEntries.sort((a, b) => {
      // Primary: search time (faster wins)
      if (a.primaryScore !== b.primaryScore) {
        return (a.primaryScore as number) - (b.primaryScore as number);
      }
      
      // Secondary: faults (fewer wins)
      return (a.secondaryScore || 0) - (b.secondaryScore || 0);
    });

    // Assign placements and handle ties
    const entriesWithPlacements = this.assignPlacementsWithTieHandling(placementEntries);

    const calculation: PlacementCalculation = {
      classId,
      format: 'scent_work',
      placements: entriesWithPlacements,
      calculatedAt: new Date(),
      calculatedBy: 'system',
      tieBreakingRules: DEFAULT_SCORING_CONFIGS.scent_work.tieBreakingRules,
      appliedTieBreakers: this.getAppliedTieBreakers()
    };

    if (this.config.cacheResults) {
      await this.cachePlacementCalculation(classId, calculation);
    }

    this.addToHistory(classId, calculation);

    return calculation;
  }

  // ========================================================================
  // Format-Specific Sorting Methods
  // ========================================================================

  private sortEntriesByFormat(
    entries: PlacementEntry[],
    format: ScoringFormat,
    placementRules: PlacementRule[]
  ): PlacementEntry[] {
    return entries.sort((a, b) => {
      for (const rule of placementRules.sort((r1, r2) => r2.weight - r1.weight)) {
        const comparison = this.compareByRule(a, b, rule, format);
        if (comparison !== 0) {
          return comparison;
        }
      }
      return 0;
    });
  }

  private compareByRule(
    a: PlacementEntry,
    b: PlacementEntry,
    rule: PlacementRule,
    format: ScoringFormat
  ): number {
    const aValue = this.extractValue(a, rule.criteria, format);
    const bValue = this.extractValue(b, rule.criteria, format);

    if (aValue === bValue) return 0;

    const comparison = aValue < bValue ? -1 : 1;
    return rule.direction === 'ascending' ? comparison : -comparison;
  }

  private extractValue(entry: PlacementEntry, criteria: string, format: ScoringFormat): number {
    const score = entry.rawScore;

    // Common criteria
    switch (criteria) {
      case 'primaryScore':
        return typeof entry.primaryScore === 'number' ? entry.primaryScore : 0;
      case 'secondaryScore':
        return entry.secondaryScore || 0;
      case 'qualification':
        return score.qualification === 'Qualified' ? 1 : 0;
    }

    // Format-specific criteria
    if (isAgilityScore(score)) {
      switch (criteria) {
        case 'totalFaults':
          return score.totalFaults;
        case 'courseTime':
          return score.courseTime;
        case 'jumpFaults':
          return score.jumpFaults;
        case 'refusals':
          return score.refusals;
        case 'yardagePerSecond':
          return score.yardagePerSecond || 0;
      }
    }

    if (isObedienceScore(score)) {
      switch (criteria) {
        case 'totalScore':
          return score.totalScore;
        case 'maximumScore':
          return score.maximumScore;
        case 'qualifyingScore':
          return score.qualifyingScore;
      }
    }

    if (isRallyScore(score)) {
      switch (criteria) {
        case 'finalScore':
          return score.finalScore;
        case 'courseTime':
          return score.courseTime;
        case 'totalDeductions':
          return score.totalDeductions;
        case 'stationDeductions':
          return score.stationDeductions;
      }
    }

    if (isConformationScore(score)) {
      switch (criteria) {
        case 'placement':
          return score.placement || 999;
        case 'pointsAwarded':
          return score.pointsAwarded;
        case 'gaitScore':
          return score.gaitScore || 0;
        case 'typeScore':
          return score.typeScore || 0;
      }
    }

    // Scent work specific (when score is ScentWorkResult)
    if (format === 'scent_work') {
      switch (criteria) {
        case 'searchTime':
          return (score as BaseScore & { searchTime?: number; totalSearchTime?: number }).searchTime || (score as BaseScore & { searchTime?: number; totalSearchTime?: number }).totalSearchTime || 0;
        case 'faults':
          return (score as BaseScore & { totalFaults?: number }).faults || (score as BaseScore & { totalFaults?: number }).totalFaults || 0;
        case 'time':
          return (score as BaseScore & { searchTime?: number; totalSearchTime?: number }).searchTime || (score as BaseScore & { searchTime?: number; totalSearchTime?: number }).totalSearchTime || 0;
      }
    }

    logger.warn(`Unknown criteria '${criteria}' for format '${format}'`, 'scoring', {});
    return 0;
  }

  // ========================================================================
  // Tie-Breaking Logic
  // ========================================================================

  private async applyTieBreaking(
    sortedEntries: PlacementEntry[],
    tieBreakingRules: TieBreakingRule[],
    format: ScoringFormat
  ): Promise<PlacementEntry[]> {
    if (sortedEntries.length === 0) return sortedEntries;

    // First, assign initial placements
    const entriesWithPlacements = this.assignPlacementsWithTieHandling(sortedEntries);

    // Apply additional tie-breaking rules if needed
    if (tieBreakingRules.length > 0) {
      return this.resolveTiesWithRules(entriesWithPlacements, tieBreakingRules, format);
    }

    return entriesWithPlacements;
  }

  private assignPlacementsWithTieHandling(entries: PlacementEntry[]): PlacementEntry[] {
    if (entries.length === 0) return entries;

    let currentPlacement = 1;
    let lastPrimaryScore = entries[0].primaryScore;
    let lastSecondaryScore = entries[0].secondaryScore;
    let tiedEntries: PlacementEntry[] = [];

    entries.forEach((entry, index) => {
      const samePrimary = entry.primaryScore === lastPrimaryScore;
      const sameSecondary = entry.secondaryScore === lastSecondaryScore;

      if (samePrimary && sameSecondary) {
        // This entry ties with previous entries
        tiedEntries.push(entry);
        entry.placement = currentPlacement;
        entry.isTied = tiedEntries.length > 1;
      } else {
        // Mark previous tied entries
        if (tiedEntries.length > 1) {
          tiedEntries.forEach(tiedEntry => {
            tiedEntry.isTied = true;
            tiedEntry.tiedWith = tiedEntries
              .filter(te => te.entryId !== tiedEntry.entryId)
              .map(te => te.entryId);
          });
        }

        // Start new placement group
        currentPlacement = index + 1;
        entry.placement = currentPlacement;
        entry.isTied = false;
        tiedEntries = [entry];
        
        lastPrimaryScore = entry.primaryScore;
        lastSecondaryScore = entry.secondaryScore;
      }
    });

    // Handle final tied group
    if (tiedEntries.length > 1) {
      tiedEntries.forEach(entry => {
        entry.isTied = true;
        entry.tiedWith = tiedEntries
          .filter(te => te.entryId !== entry.entryId)
          .map(te => te.entryId);
      });
    }

    return entries;
  }

  private resolveTiesWithRules(
    entries: PlacementEntry[],
    tieBreakingRules: TieBreakingRule[],
    format: ScoringFormat
  ): PlacementEntry[] {
    // Find groups of tied entries
    const tiedGroups = this.findTiedGroups(entries);

    tiedGroups.forEach(group => {
      if (group.length <= 1) return;

      // Apply tie-breaking rules in priority order
      let resolvedGroup = [...group];
      
      for (const rule of tieBreakingRules.sort((a, b) => a.priority - b.priority)) {
        resolvedGroup = this.applyTieBreakingRule(resolvedGroup, rule, format);
        
        // Check if tie is fully resolved
        if (this.isTieFullyResolved(resolvedGroup)) {
          break;
        }
      }

      // Update placements based on tie-breaking result
      this.updatePlacementsAfterTieBreaking(entries, group, resolvedGroup);
    });

    return entries;
  }

  private findTiedGroups(entries: PlacementEntry[]): PlacementEntry[][] {
    const groups: PlacementEntry[][] = [];
    const processed = new Set<string>();

    entries.forEach(entry => {
      if (processed.has(entry.entryId) || !entry.isTied) return;

      const tiedGroup = entries.filter(e => 
        e.placement === entry.placement && e.isTied
      );

      tiedGroup.forEach(e => processed.add(e.entryId));
      groups.push(tiedGroup);
    });

    return groups;
  }

  private applyTieBreakingRule(
    tiedEntries: PlacementEntry[],
    rule: TieBreakingRule,
    format: ScoringFormat
  ): PlacementEntry[] {
    return tiedEntries.sort((a, b) => {
      const aValue = this.extractValue(a, rule.criteria, format);
      const bValue = this.extractValue(b, rule.criteria, format);

      if (aValue === bValue) return 0;

      const comparison = aValue < bValue ? -1 : 1;
      return rule.direction === 'ascending' ? comparison : -comparison;
    });
  }

  private isTieFullyResolved(entries: PlacementEntry[]): boolean {
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].primaryScore === entries[i-1].primaryScore &&
          entries[i].secondaryScore === entries[i-1].secondaryScore) {
        return false;
      }
    }
    return true;
  }

  private updatePlacementsAfterTieBreaking(
    allEntries: PlacementEntry[],
    originalTiedGroup: PlacementEntry[],
    resolvedGroup: PlacementEntry[]
  ): void {
    const originalPlacement = originalTiedGroup[0].placement!;
    
    resolvedGroup.forEach((entry, index) => {
      entry.placement = originalPlacement + index;
      entry.isTied = false;
      entry.tiedWith = undefined;
    });

    // Update placements of entries that come after this group
    const maxOriginalPlacement = originalPlacement + originalTiedGroup.length - 1;
    const maxNewPlacement = originalPlacement + resolvedGroup.length - 1;
    const placementShift = maxNewPlacement - maxOriginalPlacement;

    if (placementShift !== 0) {
      allEntries.forEach(entry => {
        if (entry.placement && entry.placement > maxOriginalPlacement) {
          entry.placement += placementShift;
        }
      });
    }
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  private createPlacementEntry(
    score: BaseScore,
    metadata?: { dogName: string; handlerName: string; armband: string }
  ): PlacementEntry {
    // Extract primary and secondary scoring values based on format
    let primaryScore: number | string = 0;
    let secondaryScore: number | undefined;

    if (isAgilityScore(score)) {
      primaryScore = score.totalFaults;
      secondaryScore = score.courseTime;
    } else if (isObedienceScore(score)) {
      primaryScore = score.totalScore;
    } else if (isRallyScore(score)) {
      primaryScore = score.finalScore;
      secondaryScore = score.courseTime;
    } else if (isConformationScore(score)) {
      primaryScore = score.placement || 999;
      secondaryScore = score.pointsAwarded;
    } else if (score.format === 'scent_work') {
      // Handle scent work scores
      primaryScore = score.time || 0;
      secondaryScore = score.faults || 0;
    }

    return {
      entryId: score.entryId,
      dogName: metadata?.dogName || 'Unknown Dog',
      handlerName: metadata?.handlerName || 'Unknown Handler',
      armband: metadata?.armband || '000',
      primaryScore,
      secondaryScore,
      qualification: score.qualification,
      isTied: false,
      rawScore: score
    };
  }

  private createEmptyPlacementCalculation(classId: string, format: ScoringFormat): PlacementCalculation {
    return {
      classId,
      format,
      placements: [],
      calculatedAt: new Date(),
      calculatedBy: 'system',
      tieBreakingRules: DEFAULT_SCORING_CONFIGS[format]?.tieBreakingRules || [],
      appliedTieBreakers: []
    };
  }

  private getAppliedTieBreakers(): AppliedTieBreaker[] {
    // This would track which tie-breaking rules were actually applied
    // For now, return empty array - could be enhanced to track applied rules
    return [];
  }

  // ========================================================================
  // Caching and Persistence
  // ========================================================================

  private async cachePlacementCalculation(classId: string, calculation: PlacementCalculation): Promise<void> {
    try {
      this.placementCache.set(classId, calculation);

      // Limit cache size
      if (this.placementCache.size > this.config.maxCacheSize) {
        const oldestKey = this.placementCache.keys().next().value;
        if (oldestKey) this.placementCache.delete(oldestKey);
      }

      // Persist to storage
      if (this.storage) {
        const cacheData = Object.fromEntries(
          Array.from(this.placementCache.entries()).map(([key, calc]) => [
            key,
            this.serializePlacementCalculation(calc)
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
    
    // Keep only last 10 calculations
    if (history.length > 10) {
      history.shift();
    }
    
    this.calculationHistory.set(classId, history);
  }

  private serializePlacementCalculation(calc: PlacementCalculation): Record<string, unknown> {
    return {
      ...calc,
      calculatedAt: calc.calculatedAt.toISOString(),
      placements: calc.placements.map(p => ({
        ...p,
        rawScore: {
          ...p.rawScore,
          timestamp: p.rawScore.timestamp.toISOString(),
          recordedAt: p.rawScore.recordedAt.toISOString(),
          lastModified: p.rawScore.lastModified.toISOString()
        }
      }))
    };
  }

  private deserializePlacementCalculation(data: unknown): PlacementCalculation {
    const calcData = data as Record<string, unknown>;
    return {
      ...calcData,
      calculatedAt: new Date(calcData.calculatedAt as string),
      placements: (calcData.placements as Record<string, unknown>[]).map((p) => ({
        ...p,
        rawScore: {
          ...(p.rawScore as Record<string, unknown>),
          timestamp: new Date((p.rawScore as Record<string, unknown>).timestamp as string),
          recordedAt: new Date((p.rawScore as Record<string, unknown>).recordedAt as string),
          lastModified: new Date((p.rawScore as Record<string, unknown>).lastModified as string)
        }
      }))
    } as PlacementCalculation;
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
          this.serializePlacementCalculation(calc)
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
    const lastCalculation = allHistory.sort((a, b) => 
      b.calculatedAt.getTime() - a.calculatedAt.getTime()
    )[0];

    return {
      cachedCalculations: this.placementCache.size,
      totalHistoryEntries: allHistory.length,
      lastCalculationTime: lastCalculation?.calculatedAt
    };
  }

  /**
   * Cleanup old calculations and optimize cache
   */
  async cleanup(): Promise<void> {
    // Remove calculations older than 7 days
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

    // Persist cleanup changes
    if (this.storage) {
      const cacheData = Object.fromEntries(
        Array.from(this.placementCache.entries()).map(([key, calc]) => [
          key,
          this.serializePlacementCalculation(calc)
        ])
      );
      await this.storage.setItem('placement_cache', JSON.stringify(cacheData));
    }

    this.emit('cache_cleaned', {
      remainingCalculations: this.placementCache.size,
      remainingHistory: Array.from(this.calculationHistory.values()).flat().length
    });
  }
}

// Singleton instance
export const placementCalculatorService = new PlacementCalculatorService();