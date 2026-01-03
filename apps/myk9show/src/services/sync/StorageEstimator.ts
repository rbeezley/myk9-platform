import { ENTITY_SIZE_ESTIMATES, STORAGE_LIMITS } from '@/config/sync-scopes';
import { SyncScope, StorageInfo, UserRole } from '@/types/sync-types';

export class StorageEstimator {
  /**
   * Estimate the size of an entity in KB
   */
  estimateEntitySize(entity: string): number {
    return ENTITY_SIZE_ESTIMATES[entity as keyof typeof ENTITY_SIZE_ESTIMATES] || 1;
  }

  /**
   * Estimate the total storage size for a sync scope
   */
  estimateSyncSize(scope: Record<string, { scope: string; limit: number }>): number {
    let totalKB = 0;
    
    for (const [entity, config] of Object.entries(scope)) {
      const entitySize = this.estimateEntitySize(entity);
      totalKB += entitySize * config.limit;
    }
    
    return totalKB;
  }

  /**
   * Estimate storage usage for a user role
   */
  estimateRoleStorage(role: UserRole, customScopes?: SyncScope): { sizeKB: number; sizeMB: number } {
    // Import SYNC_SCOPES dynamically to avoid circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SYNC_SCOPES } = require('@/config/sync-scopes');
    
    const scope = customScopes || SYNC_SCOPES[role];
    if (!scope) {
      throw new Error(`Unknown user role: ${role}`);
    }
    
    const sizeKB = this.estimateSyncSize(scope);
    return {
      sizeKB,
      sizeMB: sizeKB / 1024
    };
  }

  /**
   * Check current storage quota and usage
   */
  async checkQuota(): Promise<StorageInfo> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const available = estimate.quota || 0;
      
      return {
        used: used / (1024 * 1024), // Convert to MB
        available: available / (1024 * 1024), // Convert to MB
        percentage: available > 0 ? (used / available) * 100 : 0
      };
    }
    
    // Fallback for browsers without Storage API
    return {
      used: 0,
      available: STORAGE_LIMITS.MAX_STORAGE_MB,
      percentage: 0
    };
  }

  /**
   * Check if we're approaching storage limits
   */
  async isNearQuota(): Promise<boolean> {
    const quota = await this.checkQuota();
    return quota.percentage >= (STORAGE_LIMITS.WARNING_THRESHOLD * 100);
  }

  /**
   * Check if we're at critical storage levels
   */
  async isCriticalQuota(): Promise<boolean> {
    const quota = await this.checkQuota();
    return quota.percentage >= (STORAGE_LIMITS.CRITICAL_THRESHOLD * 100);
  }

  /**
   * Calculate how much storage can be allocated for new sync data
   */
  async getAvailableStorageForSync(): Promise<number> {
    const quota = await this.checkQuota();
    const reservedMB = STORAGE_LIMITS.MIN_FREE_SPACE_MB;
    const availableForSync = Math.max(0, quota.available - quota.used - reservedMB);
    
    return availableForSync;
  }

  /**
   * Recommend optimal sync scope based on available storage
   */
  async getOptimalSyncScope(role: UserRole): Promise<{ 
    recommendedScope: Record<string, { scope: string; limit: number }>;
    reasoning: string[];
  }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SYNC_SCOPES } = require('@/config/sync-scopes');
    const defaultScope = SYNC_SCOPES[role];
    const availableMB = await this.getAvailableStorageForSync();
    const defaultSizeMB = this.estimateRoleStorage(role).sizeMB;
    
    const reasoning: string[] = [];
    
    // If we have plenty of space, use default scope
    if (availableMB >= defaultSizeMB * 2) {
      reasoning.push(`Plenty of storage available (${availableMB.toFixed(1)}MB free)`);
      return { recommendedScope: defaultScope, reasoning };
    }
    
    // If we don't have enough space, reduce limits
    if (availableMB < defaultSizeMB) {
      reasoning.push(`Limited storage available (${availableMB.toFixed(1)}MB free)`);
      reasoning.push('Reducing sync limits to fit within available space');
      
      const reductionFactor = Math.max(0.1, availableMB / defaultSizeMB);
      const reducedScope = Object.fromEntries(
        Object.entries(defaultScope).map(([entity, config]) => {
          const typedConfig = config as { scope: string; limit: number };
          return [
            entity,
            {
              scope: typedConfig.scope,
              limit: Math.max(1, Math.floor(typedConfig.limit * reductionFactor))
            }
          ];
        })
      );
      
      return { recommendedScope: reducedScope, reasoning };
    }
    
    // Space is tight but workable
    reasoning.push(`Moderate storage available (${availableMB.toFixed(1)}MB free)`);
    reasoning.push('Using default scope with monitoring');
    return { recommendedScope: defaultScope, reasoning };
  }

  /**
   * Estimate how long cached data should be retained
   */
  async getOptimalCacheTTL(): Promise<number> {
    const quota = await this.checkQuota();
    
    // If we have plenty of space, keep data longer
    if (quota.percentage < 50) {
      return STORAGE_LIMITS.CACHE_TTL_DAYS;
    }
    
    // If space is limited, reduce cache time
    if (quota.percentage > 80) {
      return Math.max(7, STORAGE_LIMITS.CACHE_TTL_DAYS * 0.5);
    }
    
    // Default cache time
    return STORAGE_LIMITS.CACHE_TTL_DAYS;
  }

  /**
   * Get storage breakdown by entity type
   */
  async getStorageBreakdown(): Promise<Record<string, { count: number; sizeKB: number; sizeMB: number }>> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { db } = require('@/services/database/connection');
    const breakdown: Record<string, { count: number; sizeKB: number; sizeMB: number }> = {};
    
    for (const entityType of Object.keys(ENTITY_SIZE_ESTIMATES)) {
      try {
        const table = db.instance.table(entityType);
        const count = await table.count();
        const estimatedSize = this.estimateEntitySize(entityType);
        const totalSizeKB = count * estimatedSize;
        
        breakdown[entityType] = {
          count,
          sizeKB: totalSizeKB,
          sizeMB: totalSizeKB / 1024
        };
      } catch (error) {
        console.warn(`Failed to get count for ${entityType}:`, error);
        breakdown[entityType] = { count: 0, sizeKB: 0, sizeMB: 0 };
      }
    }
    
    return breakdown;
  }

  /**
   * Generate storage optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    const quota = await this.checkQuota();
    const breakdown = await this.getStorageBreakdown();
    
    // Check overall usage
    if (quota.percentage > 80) {
      recommendations.push('Storage usage is high - consider cleaning up old data');
    }
    
    // Check for entity types taking up a lot of space
    const sortedBySize = Object.entries(breakdown)
      .sort(([, a], [, b]) => b.sizeMB - a.sizeMB);
    
    for (const [entityType, stats] of sortedBySize.slice(0, 3)) {
      if (stats.sizeMB > 5) { // More than 5MB
        recommendations.push(
          `${entityType} is using ${stats.sizeMB.toFixed(1)}MB (${stats.count} items) - consider archiving old records`
        );
      }
    }
    
    // Check cache TTL
    const optimalTTL = await this.getOptimalCacheTTL();
    if (optimalTTL < STORAGE_LIMITS.CACHE_TTL_DAYS) {
      recommendations.push(
        `Consider reducing cache retention to ${optimalTTL} days due to storage constraints`
      );
    }
    
    return recommendations;
  }
}