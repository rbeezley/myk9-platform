import { UserRole, SyncProgress, RoleSyncScopes } from '@/types/sync-types';
import { SYNC_SCOPES } from '@/config/sync-scopes';
import { StorageEstimator } from './StorageEstimator';
import { SmartQueryBuilder } from './SmartQueryBuilder';

export interface InitialSyncPlan {
  totalSteps: number;
  estimatedSizeMB: number;
  estimatedTimeMinutes: number;
  steps: SyncStep[];
}

export interface SyncStep {
  entity: string;
  scope: string;
  limit: number;
  estimatedSizeMB: number;
  priority: number;
  dependencies?: string[];
}

export interface User {
  id: string;
  role: UserRole;
  email: string;
  state?: string;
  preferences?: {
    autoSync?: boolean;
    syncScope?: 'minimal' | 'standard' | 'full';
  };
}

export class InitialSyncOrchestrator {
  private storageEstimator: StorageEstimator;
  private queryBuilder: SmartQueryBuilder;
  private progressCallbacks: ((progress: SyncProgress) => void)[] = [];

  constructor() {
    this.storageEstimator = new StorageEstimator();
    this.queryBuilder = new SmartQueryBuilder();
  }

  /**
   * Perform initial sync for a new user
   */
  async performInitialSync(userId: string, role: UserRole): Promise<void> {
    try {
      // Check storage availability
      const storageInfo = await this.storageEstimator.checkQuota();
      if (storageInfo.percentage > 90) {
        throw new Error('Insufficient storage space for initial sync');
      }

      // Get optimal sync scope based on storage and role
      const { recommendedScope, reasoning } = await this.storageEstimator.getOptimalSyncScope(role);
      
      console.log(`Initial sync for ${role}:`, {
        scope: recommendedScope,
        reasoning,
        availableStorage: `${storageInfo.available - storageInfo.used}MB`
      });

      // Create sync plan
      const syncPlan = this.createSyncPlan(recommendedScope);
      
      this.emitProgress({
        entity: 'initialization',
        total: syncPlan.totalSteps,
        completed: 0,
        status: 'pending',
        message: `Starting initial sync (${syncPlan.estimatedSizeMB.toFixed(1)}MB, ~${syncPlan.estimatedTimeMinutes} min)`
      });

      // Execute sync plan
      let completedSteps = 0;
      for (const step of syncPlan.steps) {
        this.emitProgress({
          entity: step.entity,
          total: syncPlan.totalSteps,
          completed: completedSteps,
          status: 'syncing',
          message: `Syncing ${step.entity} (${step.scope})`
        });

        try {
          await this.syncEntityStep(step);
          completedSteps++;
          
          this.emitProgress({
            entity: step.entity,
            total: syncPlan.totalSteps,
            completed: completedSteps,
            status: 'completed',
            message: `Completed ${step.entity}`
          });
        } catch (error) {
          console.error(`Failed to sync ${step.entity}:`, error);
          
          this.emitProgress({
            entity: step.entity,
            total: syncPlan.totalSteps,
            completed: completedSteps,
            status: 'error',
            message: `Failed to sync ${step.entity}: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
          
          // For initial sync, we might want to continue with other entities
          // rather than failing completely
          if (step.priority <= 2) { // Critical/High priority
            throw error;
          }
        }
      }

      // Final progress update
      this.emitProgress({
        entity: 'complete',
        total: syncPlan.totalSteps,
        completed: completedSteps,
        status: 'completed',
        message: 'Initial sync completed successfully'
      });

    } catch (error) {
      this.emitProgress({
        entity: 'error',
        total: 0,
        completed: 0,
        status: 'error',
        message: `Initial sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }
  }

  /**
   * Create a sync plan based on scope configuration
   */
  createSyncPlan(scope: Record<string, { scope: string; limit: number }>): InitialSyncPlan {
    const steps: SyncStep[] = [];
    let totalEstimatedSizeMB = 0;

    // Define entity priorities and dependencies
    const entityPriorities: Record<string, number> = {
      people: 1,    // Critical - user needs their own profile
      clubs: 2,     // High - needed for shows
      shows: 3,     // Normal - main content
      dogs: 4,      // Normal - depends on people
      entries: 5    // Low - depends on dogs and shows
    };

    const entityDependencies: Record<string, string[]> = {
      dogs: ['people'],
      entries: ['dogs', 'shows'],
      shows: ['clubs']
    };

    // Create steps for each entity in scope
    for (const [entity, config] of Object.entries(scope)) {
      if (config.limit > 0) {
        const estimatedSizeMB = this.storageEstimator.estimateEntitySize(entity) * config.limit / 1024;
        
        steps.push({
          entity,
          scope: config.scope,
          limit: config.limit,
          estimatedSizeMB,
          priority: entityPriorities[entity] || 5,
          dependencies: entityDependencies[entity]
        });
        
        totalEstimatedSizeMB += estimatedSizeMB;
      }
    }

    // Sort steps by priority and dependencies
    const sortedSteps = this.sortStepsByDependencies(steps);

    // Estimate time (rough calculation based on entity count and network speed)
    const estimatedTimeMinutes = Math.max(1, Math.ceil(totalEstimatedSizeMB / 2)); // ~2MB/minute

    return {
      totalSteps: sortedSteps.length,
      estimatedSizeMB: totalEstimatedSizeMB,
      estimatedTimeMinutes,
      steps: sortedSteps
    };
  }

  /**
   * Sort sync steps by dependencies and priority
   */
  private sortStepsByDependencies(steps: SyncStep[]): SyncStep[] {
    const sorted: SyncStep[] = [];
    const remaining = [...steps];
    const processed = new Set<string>();

    while (remaining.length > 0) {
      const readySteps = remaining.filter(step => 
        !step.dependencies || 
        step.dependencies.every(dep => processed.has(dep))
      );

      if (readySteps.length === 0) {
        // No steps ready - might be circular dependency or missing entity
        // Just take the highest priority remaining step
        const highestPriority = remaining.reduce((min, step) => 
          step.priority < min.priority ? step : min
        );
        readySteps.push(highestPriority);
      }

      // Sort ready steps by priority
      readySteps.sort((a, b) => a.priority - b.priority);

      // Add first ready step to sorted list
      const nextStep = readySteps[0];
      sorted.push(nextStep);
      processed.add(nextStep.entity);
      
      // Remove from remaining
      const index = remaining.indexOf(nextStep);
      remaining.splice(index, 1);
    }

    return sorted;
  }

  /**
   * Execute a single sync step
   */
  private async syncEntityStep(step: SyncStep): Promise<void> {
    // TODO: Implement actual sync logic with Supabase
    // For now, simulate the sync process
    
    console.log(`Syncing ${step.entity} with scope ${step.scope}, limit ${step.limit}`);
    
    // Simulate network delay based on entity size
    const delay = Math.max(100, step.estimatedSizeMB * 100); // 100ms per MB
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // This will be replaced with actual Supabase queries:
    // const query = this.queryBuilder.buildQuery(step.entity, step, { id: _userId });
    // const data = await query;
    // await this.storeLocalData(step.entity, data);
  }

  /**
   * Add progress callback
   */
  onProgress(callback: (progress: SyncProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Remove progress callback
   */
  offProgress(callback: (progress: SyncProgress) => void): void {
    const index = this.progressCallbacks.indexOf(callback);
    if (index > -1) {
      this.progressCallbacks.splice(index, 1);
    }
  }

  /**
   * Emit progress update to all callbacks
   */
  private emitProgress(progress: SyncProgress): void {
    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    });
  }

  /**
   * Get recommended initial sync scope for a user role
   */
  getRecommendedScope(role: UserRole): Record<string, { scope: string; limit: number }> {
    // Check if role exists in SYNC_SCOPES, otherwise use NEW_USER
    const validRole = role in SYNC_SCOPES ? role : 'NEW_USER';
    return SYNC_SCOPES[validRole as keyof RoleSyncScopes];
  }

  /**
   * Estimate initial sync requirements
   */
  async estimateInitialSync(role: UserRole): Promise<{
    sizeMB: number;
    timeMinutes: number;
    entities: string[];
    recommendations: string[];
  }> {
    const scope = this.getRecommendedScope(role);
    const { sizeMB } = this.storageEstimator.estimateRoleStorage(role);
    const { reasoning } = await this.storageEstimator.getOptimalSyncScope(role);
    
    const entities = Object.keys(scope).filter(entity => scope[entity].limit > 0);
    const timeMinutes = Math.max(1, Math.ceil(sizeMB / 2)); // ~2MB/minute estimate
    
    return {
      sizeMB,
      timeMinutes,
      entities,
      recommendations: reasoning
    };
  }

  /**
   * Check if initial sync is needed for a user
   */
  async isInitialSyncNeeded(userId: string): Promise<boolean> {
    // Check if we have any local sync metadata for this user
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { db } = require('@/services/database/connection');
    
    try {
      const metadata = await db.instance.syncMetadata
        .where('lastModifiedBy')
        .equals(userId)
        .first();
      
      return !metadata; // If no metadata found, initial sync is needed
    } catch (error) {
      console.warn('Error checking sync metadata:', error);
      return true; // Assume initial sync is needed if we can't check
    }
  }
}