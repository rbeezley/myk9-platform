/**
 * Deployment Manager Service
 *
 * Comprehensive deployment management system for handling database migrations,
 * feature flags, rollbacks, and production deployment coordination.
 */

import { logger } from '@/services/LoggingService';
import type {
  DeploymentConfig,
  DeploymentChecklist,
  MigrationTask,
  FeatureFlagConfig,
  ChecklistTask,
  DeploymentEvent,
  HealthCheckConfig,
  HealthCheckResult,
  RollbackStep
} from '../../types/deployment-types';
import type { FeatureFlagEvalContext } from './deployment-manager-types';
import {
  generateId,
  hashContext,
  evaluateCondition,
  sortMigrationsByDependencies,
  generatePreDeploymentTasks,
  generateMigrationTasks,
  generateDeploymentTasks,
  generatePostDeploymentTasks,
  generateRollbackPlan,
  getDefaultMigrations,
  getDefaultFeatureFlags,
  getDefaultHealthChecks
} from './deployment-manager-helpers';

// Re-export types for backward compatibility
export type { FeatureFlagEvalContext } from './deployment-manager-types';

/**
 * Main deployment manager class
 */
export class DeploymentManager {
  private static instance: DeploymentManager;
  private deployments: Map<string, DeploymentConfig> = new Map();
  private checklists: Map<string, DeploymentChecklist> = new Map();
  private migrations: Map<string, MigrationTask> = new Map();
  private featureFlags: Map<string, FeatureFlagConfig> = new Map();
  private events: DeploymentEvent[] = [];
  private healthChecks: Map<string, HealthCheckConfig> = new Map();

  private constructor() {
    this.initializeDefaultMigrations();
    this.initializeDefaultFeatureFlags();
    this.initializeHealthChecks();
  }

  public static getInstance(): DeploymentManager {
    if (!DeploymentManager.instance) {
      DeploymentManager.instance = new DeploymentManager();
    }
    return DeploymentManager.instance;
  }

  // === Deployment Lifecycle Management ===

  /**
   * Create a new deployment configuration
   */
  public async createDeployment(config: Omit<DeploymentConfig, 'deploymentId' | 'timestamp'>): Promise<string> {
    const deploymentId = generateId('deploy');
    const deployment: DeploymentConfig = {
      ...config,
      deploymentId,
      timestamp: new Date()
    };

    this.deployments.set(deploymentId, deployment);

    // Create deployment checklist
    const checklist = this.createDeploymentChecklist(deployment);
    this.checklists.set(deploymentId, checklist);

    this.recordEvent({
      id: generateId('event'),
      deploymentId,
      type: 'deployment_started',
      timestamp: new Date(),
      message: `Deployment ${config.version} created for ${config.environment}`,
      metadata: { version: config.version, environment: config.environment },
      severity: 'info',
      source: 'DeploymentManager'
    });

    return deploymentId;
  }

  /**
   * Execute deployment with full checklist validation
   */
  public async executeDeployment(deploymentId: string): Promise<boolean> {
    const deployment = this.deployments.get(deploymentId);
    const checklist = this.checklists.get(deploymentId);

    if (!deployment || !checklist) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    try {
      // Execute pre-deployment tasks
      await this.executeTaskGroup(checklist.preDeploymentTasks, deploymentId);

      // Execute database migrations
      await this.executeMigrations(deployment.migrations, deploymentId);

      // Execute deployment tasks
      await this.executeTaskGroup(checklist.deploymentTasks, deploymentId);

      // Execute post-deployment tasks
      await this.executeTaskGroup(checklist.postDeploymentTasks, deploymentId);

      // Run health checks
      await this.runHealthChecks(deploymentId);

      // Update deployment status
      checklist.status = 'completed';
      checklist.completedAt = new Date();

      this.recordEvent({
        id: generateId('event'),
        deploymentId,
        type: 'deployment_completed',
        timestamp: new Date(),
        message: `Deployment ${deployment.version} completed successfully`,
        metadata: { version: deployment.version },
        severity: 'info',
        source: 'DeploymentManager'
      });

      return true;
    } catch (error) {
      checklist.status = 'failed';

      this.recordEvent({
        id: generateId('event'),
        deploymentId,
        type: 'deployment_failed',
        timestamp: new Date(),
        message: `Deployment ${deployment.version} failed: ${error}`,
        metadata: { version: deployment.version, error: String(error) },
        severity: 'error',
        source: 'DeploymentManager'
      });

      throw error;
    }
  }

  // === Database Migration Management ===

  /**
   * Execute database migrations with proper ordering and validation
   */
  private async executeMigrations(migrations: MigrationTask[], deploymentId: string): Promise<void> {
    const sortedMigrations = sortMigrationsByDependencies(migrations);

    for (const migration of sortedMigrations) {
      await this.executeSingleMigration(migration, deploymentId);
    }
  }

  /**
   * Execute a single migration with full error handling
   */
  private async executeSingleMigration(migration: MigrationTask, deploymentId: string): Promise<void> {
    try {
      migration.status = 'running';
      migration.executedAt = new Date();

      this.recordEvent({
        id: generateId('event'),
        deploymentId,
        type: 'migration_started',
        timestamp: new Date(),
        message: `Migration ${migration.name} started`,
        metadata: { migrationId: migration.id, type: migration.type },
        severity: 'info',
        source: 'MigrationExecutor'
      });

      // Simulate migration execution (in real implementation, this would execute SQL)
      await this.simulateMigrationExecution(migration);

      migration.status = 'completed';

      this.recordEvent({
        id: generateId('event'),
        deploymentId,
        type: 'migration_completed',
        timestamp: new Date(),
        message: `Migration ${migration.name} completed successfully`,
        metadata: { migrationId: migration.id, duration: migration.estimatedDuration },
        severity: 'info',
        source: 'MigrationExecutor'
      });

    } catch (error) {
      migration.status = 'failed';
      migration.errorMessage = String(error);

      this.recordEvent({
        id: generateId('event'),
        deploymentId,
        type: 'migration_failed',
        timestamp: new Date(),
        message: `Migration ${migration.name} failed: ${error}`,
        metadata: { migrationId: migration.id, error: String(error) },
        severity: 'error',
        source: 'MigrationExecutor'
      });

      throw error;
    }
  }

  // === Feature Flag Management ===

  /**
   * Update feature flag configuration
   */
  public async updateFeatureFlag(flagId: string, updates: Partial<FeatureFlagConfig>): Promise<void> {
    const flag = this.featureFlags.get(flagId);
    if (!flag) {
      throw new Error(`Feature flag ${flagId} not found`);
    }

    const updatedFlag: FeatureFlagConfig = {
      ...flag,
      ...updates,
      updatedAt: new Date()
    };

    this.featureFlags.set(flagId, updatedFlag);

    this.recordEvent({
      id: generateId('event'),
      deploymentId: 'system',
      type: 'feature_flag_updated',
      timestamp: new Date(),
      message: `Feature flag ${flag.name} updated`,
      metadata: { flagId, updates },
      severity: 'info',
      source: 'FeatureFlagManager'
    });
  }

  /**
   * Check if a feature is enabled for a specific user/context
   */
  public isFeatureEnabled(flagId: string, context: FeatureFlagEvalContext): boolean {
    const flag = this.featureFlags.get(flagId);
    if (!flag || !flag.enabled) {
      return false;
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = hashContext(flagId, context);
      if (hash % 100 >= flag.rolloutPercentage) {
        return false;
      }
    }

    // Check target audience
    if (context.userType && flag.targetAudience.userTypes.length > 0) {
      if (!flag.targetAudience.userTypes.includes(context.userType as 'admin' | 'secretary' | 'judge' | 'exhibitor')) {
        return false;
      }
    }

    // Check organization targeting
    if (context.organizationId && flag.targetAudience.organizations.length > 0) {
      if (!flag.targetAudience.organizations.includes(context.organizationId)) {
        return false;
      }
    }

    // Check feature conditions
    for (const condition of flag.conditions) {
      if (!evaluateCondition(condition as unknown as Record<string, unknown>, context as unknown as Record<string, unknown>)) {
        return false;
      }
    }

    return true;
  }

  // === Health Check Management ===

  /**
   * Run all configured health checks
   */
  public async runHealthChecks(deploymentId?: string): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const [checkId, config] of this.healthChecks) {
      if (!config.enabled) continue;

      try {
        const result = await this.executeHealthCheck(config);
        results.push(result);

        if (result.status === 'unhealthy' && deploymentId) {
          this.recordEvent({
            id: generateId('event'),
            deploymentId,
            type: 'health_check_failed',
            timestamp: new Date(),
            message: `Health check ${config.name} failed: ${result.errorMessage}`,
            metadata: { checkId, status: result.status },
            severity: config.severity,
            source: 'HealthChecker'
          });
        }
      } catch (error) {
        results.push({
          checkId,
          status: 'unknown',
          responseTime: 0,
          timestamp: new Date(),
          errorMessage: String(error),
          metadata: {}
        });
      }
    }

    return results;
  }

  // === Rollback Management ===

  /**
   * Execute rollback plan for a failed deployment
   */
  public async executeRollback(deploymentId: string): Promise<boolean> {
    const deployment = this.deployments.get(deploymentId);
    const checklist = this.checklists.get(deploymentId);

    if (!deployment || !checklist) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    try {
      this.recordEvent({
        id: generateId('event'),
        deploymentId,
        type: 'rollback_initiated',
        timestamp: new Date(),
        message: `Rollback initiated for deployment ${deployment.version}`,
        metadata: { version: deployment.version, strategy: checklist.rollbackPlan.strategy },
        severity: 'warning',
        source: 'RollbackManager'
      });

      // Execute rollback steps in order
      for (const step of checklist.rollbackPlan.steps.sort((a, b) => a.order - b.order)) {
        await this.executeRollbackStep(step, deploymentId);
      }

      checklist.status = 'rolled_back';

      this.recordEvent({
        id: generateId('event'),
        deploymentId,
        type: 'rollback_completed',
        timestamp: new Date(),
        message: `Rollback completed for deployment ${deployment.version}`,
        metadata: { version: deployment.version },
        severity: 'info',
        source: 'RollbackManager'
      });

      return true;
    } catch (error) {
      this.recordEvent({
        id: generateId('event'),
        deploymentId,
        type: 'rollback_completed',
        timestamp: new Date(),
        message: `Rollback failed for deployment ${deployment.version}: ${error}`,
        metadata: { version: deployment.version, error: String(error) },
        severity: 'error',
        source: 'RollbackManager'
      });

      throw error;
    }
  }

  // === Initialization ===

  /**
   * Initialize default migration tasks
   */
  private initializeDefaultMigrations(): void {
    for (const migration of getDefaultMigrations()) {
      this.migrations.set(migration.id, migration);
    }
  }

  /**
   * Initialize default feature flags
   */
  private initializeDefaultFeatureFlags(): void {
    for (const flag of getDefaultFeatureFlags()) {
      this.featureFlags.set(flag.id, flag);
    }
  }

  /**
   * Initialize health check configurations
   */
  private initializeHealthChecks(): void {
    for (const check of getDefaultHealthChecks()) {
      this.healthChecks.set(check.id, check);
    }
  }

  // === Private Helper Methods ===

  private recordEvent(event: DeploymentEvent): void {
    this.events.push(event);
    logger.debug(`[${event.severity.toUpperCase()}] ${event.message}`, 'deployment', { data: event.metadata });
  }

  /**
   * Generate deployment checklist based on deployment configuration
   */
  private createDeploymentChecklist(deployment: DeploymentConfig): DeploymentChecklist {
    const checklistId = generateId('checklist');

    return {
      id: checklistId,
      deploymentId: deployment.deploymentId,
      version: deployment.version,
      environment: deployment.environment,
      status: 'pending',
      createdAt: new Date(),
      createdBy: 'system',
      preDeploymentTasks: generatePreDeploymentTasks(),
      migrationTasks: generateMigrationTasks(deployment.migrations),
      deploymentTasks: generateDeploymentTasks(),
      postDeploymentTasks: generatePostDeploymentTasks(),
      rollbackPlan: generateRollbackPlan(deployment)
    };
  }

  private async executeTaskGroup(tasks: ChecklistTask[], deploymentId: string): Promise<void> {
    for (const task of tasks) {
      await this.executeTask(task, deploymentId);
    }
  }

  private async executeTask(task: ChecklistTask, _deploymentId: string): Promise<void> {
    task.status = 'in_progress';

    try {
      // Simulate task execution
      await new Promise(resolve => setTimeout(resolve, task.estimatedDuration * 100));

      task.status = 'completed';
      task.completedAt = new Date();
    } catch (error) {
      task.status = 'failed';
      task.errorMessage = String(error);
      throw error;
    }
  }

  private async simulateMigrationExecution(migration: MigrationTask): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, migration.estimatedDuration * 100));
  }

  private async executeHealthCheck(config: HealthCheckConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();

    // Simulate health check execution
    await new Promise(resolve => setTimeout(resolve, 100));

    const responseTime = Date.now() - startTime;
    const isHealthy = Math.random() > 0.1; // 90% success rate

    return {
      checkId: config.id,
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime,
      timestamp: new Date(),
      ...(isHealthy ? {} : { errorMessage: 'Simulated health check failure' }),
      metadata: {
        type: config.type,
        ...(config.endpoint !== undefined && { endpoint: config.endpoint })
      }
    };
  }

  private async executeRollbackStep(step: RollbackStep, _deploymentId: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, step.estimatedDuration * 100));
  }

  // === Public Getters ===

  public getDeployment(deploymentId: string): DeploymentConfig | undefined {
    return this.deployments.get(deploymentId);
  }

  public getChecklist(deploymentId: string): DeploymentChecklist | undefined {
    return this.checklists.get(deploymentId);
  }

  public getEvents(deploymentId?: string): DeploymentEvent[] {
    if (deploymentId) {
      return this.events.filter(event => event.deploymentId === deploymentId);
    }
    return [...this.events];
  }

  public getFeatureFlags(): FeatureFlagConfig[] {
    return Array.from(this.featureFlags.values());
  }

  public getMigrations(): MigrationTask[] {
    return Array.from(this.migrations.values());
  }
}
