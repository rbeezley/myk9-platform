/**
 * Deployment Manager Helpers
 *
 * Pure helper functions and default data constants used by DeploymentManager.
 * These are stateless utilities that do not depend on class instance state.
 */

import type {
  ChecklistTask,
  DeploymentConfig,
  FeatureFlagConfig,
  HealthCheckConfig,
  MigrationTask,
  RollbackPlan
} from '../../types/deployment-types';
import type { FeatureFlagEvalContext } from './deployment-manager-types';

// === ID Generation ===

/**
 * Generate a unique ID with a given prefix.
 */
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// === Hashing & Evaluation ===

/**
 * Hash a feature flag ID and user context to a deterministic number
 * for consistent percentage-based rollout.
 */
export function hashContext(flagId: string, context: FeatureFlagEvalContext | Record<string, unknown>): number {
  const str = `${flagId}:${(context as Record<string, unknown>).userId || 'anonymous'}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Evaluate a single feature-flag condition against a user context.
 * Currently a simplified stub that always returns true.
 */
export function evaluateCondition(_condition: Record<string, unknown>, _context: Record<string, unknown>): boolean {
  return true;
}

// === Migration Dependency Sorting ===

/**
 * Topologically sort migrations by their declared dependencies.
 * Throws if a circular dependency is detected.
 */
export function sortMigrationsByDependencies(migrations: MigrationTask[]): MigrationTask[] {
  const sorted: MigrationTask[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (migration: MigrationTask) => {
    if (visiting.has(migration.id)) {
      throw new Error(`Circular dependency detected in migration ${migration.id}`);
    }
    if (visited.has(migration.id)) {
      return;
    }

    visiting.add(migration.id);

    // Visit dependencies first
    for (const depId of migration.dependencies) {
      const dependency = migrations.find(m => m.id === depId);
      if (dependency) {
        visit(dependency);
      }
    }

    visiting.delete(migration.id);
    visited.add(migration.id);
    sorted.push(migration);
  };

  for (const migration of migrations) {
    visit(migration);
  }

  return sorted;
}

// === Checklist Task Generators ===

/**
 * Generate the standard pre-deployment checklist tasks.
 */
export function generatePreDeploymentTasks(): ChecklistTask[] {
  return [
    {
      id: 'pre_001',
      name: 'Backup Database',
      description: 'Create full database backup before deployment',
      category: 'database',
      required: true,
      automated: true,
      estimatedDuration: 300,
      status: 'pending',
      artifacts: [],
      dependencies: []
    },
    {
      id: 'pre_002',
      name: 'Run Pre-deployment Tests',
      description: 'Execute pre-deployment test suite',
      category: 'testing',
      required: true,
      automated: true,
      estimatedDuration: 600,
      status: 'pending',
      artifacts: [],
      dependencies: []
    }
  ];
}

/**
 * Generate migration checklist tasks from a list of migration definitions.
 */
export function generateMigrationTasks(migrations: MigrationTask[]): ChecklistTask[] {
  return migrations.map(migration => ({
    id: `migration_${migration.id}`,
    name: `Execute Migration: ${migration.name}`,
    description: migration.description,
    category: 'database' as const,
    required: true,
    automated: true,
    estimatedDuration: migration.estimatedDuration,
    status: 'pending' as const,
    artifacts: [],
    dependencies: migration.dependencies.map(dep => `migration_${dep}`)
  }));
}

/**
 * Generate the standard deployment checklist tasks.
 */
export function generateDeploymentTasks(): ChecklistTask[] {
  return [
    {
      id: 'deploy_001',
      name: 'Deploy Application Code',
      description: 'Deploy new application version to production',
      category: 'application',
      required: true,
      automated: true,
      estimatedDuration: 180,
      status: 'pending',
      artifacts: [],
      dependencies: []
    },
    {
      id: 'deploy_002',
      name: 'Update Feature Flags',
      description: 'Update feature flag configurations',
      category: 'application',
      required: false,
      automated: true,
      estimatedDuration: 30,
      status: 'pending',
      artifacts: [],
      dependencies: ['deploy_001']
    }
  ];
}

/**
 * Generate the standard post-deployment checklist tasks.
 */
export function generatePostDeploymentTasks(): ChecklistTask[] {
  return [
    {
      id: 'post_001',
      name: 'Smoke Tests',
      description: 'Run post-deployment smoke tests',
      category: 'testing',
      required: true,
      automated: true,
      estimatedDuration: 300,
      status: 'pending',
      artifacts: [],
      dependencies: []
    },
    {
      id: 'post_002',
      name: 'Monitor Application Health',
      description: 'Monitor application health for 15 minutes',
      category: 'monitoring',
      required: true,
      automated: false,
      estimatedDuration: 900,
      status: 'pending',
      artifacts: [],
      dependencies: ['post_001']
    }
  ];
}

/**
 * Generate a rollback plan for a given deployment configuration.
 */
export function generateRollbackPlan(deployment: DeploymentConfig): RollbackPlan {
  return {
    id: generateId('rollback'),
    deploymentId: deployment.deploymentId,
    strategy: 'blue_green',
    steps: [
      {
        id: 'rollback_001',
        order: 1,
        name: 'Revert Application Code',
        description: 'Revert to previous application version',
        type: 'code_deployment',
        automated: true,
        estimatedDuration: 120,
        dependencies: []
      },
      {
        id: 'rollback_002',
        order: 2,
        name: 'Rollback Database Migrations',
        description: 'Execute rollback SQL for database changes',
        type: 'database_migration',
        automated: true,
        estimatedDuration: 300,
        dependencies: ['rollback_001']
      }
    ],
    estimatedDuration: 420,
    dataBackups: [],
    riskAssessment: 'Low risk rollback with automated procedures',
    approvalRequired: false
  };
}

// === Default Data Constants ===

/**
 * Default migration tasks loaded at initialization.
 */
export function getDefaultMigrations(): MigrationTask[] {
  return [
    {
      id: 'migration_001',
      name: 'Create Analytics Tables',
      description: 'Create tables for sync analytics and monitoring',
      type: 'schema_change',
      sql: `
        CREATE TABLE IF NOT EXISTS sync_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_type TEXT NOT NULL,
          collection_name TEXT,
          operation TEXT,
          status TEXT NOT NULL,
          timestamp TIMESTAMPTZ DEFAULT NOW(),
          duration_ms INTEGER,
          record_count INTEGER,
          error_message TEXT,
          metadata JSONB
        );

        CREATE INDEX idx_sync_events_timestamp ON sync_events(timestamp);
        CREATE INDEX idx_sync_events_collection ON sync_events(collection_name);
      `,
      rollbackSql: 'DROP TABLE IF EXISTS sync_events;',
      dependencies: [],
      estimatedDuration: 30,
      riskLevel: 'low',
      status: 'pending'
    },
    {
      id: 'migration_002',
      name: 'Update RLS Policies',
      description: 'Update Row Level Security policies for new analytics tables',
      type: 'rls_policy',
      sql: `
        ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Users can view their own sync events" ON sync_events
          FOR SELECT USING (auth.uid()::text = (metadata->>'user_id'));

        CREATE POLICY "Admins can view all sync events" ON sync_events
          FOR SELECT USING (auth.jwt() ->> 'role' = 'admin');
      `,
      rollbackSql: `
        DROP POLICY IF EXISTS "Users can view their own sync events" ON sync_events;
        DROP POLICY IF EXISTS "Admins can view all sync events" ON sync_events;
        ALTER TABLE sync_events DISABLE ROW LEVEL SECURITY;
      `,
      dependencies: ['migration_001'],
      estimatedDuration: 15,
      riskLevel: 'medium',
      status: 'pending'
    }
  ];
}

/**
 * Default feature flags loaded at initialization.
 */
export function getDefaultFeatureFlags(): FeatureFlagConfig[] {
  return [
    {
      id: 'realtime_sync',
      name: 'Real-time Sync',
      description: 'Enable real-time synchronization features',
      enabled: false,
      rolloutPercentage: 0,
      targetAudience: {
        userTypes: ['admin'],
        organizations: [],
        betaUsers: true,
        newUsers: false,
        regions: []
      },
      conditions: [],
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'performance_monitoring',
      name: 'Performance Monitoring',
      description: 'Enable advanced performance monitoring and analytics',
      enabled: true,
      rolloutPercentage: 100,
      targetAudience: {
        userTypes: [],
        organizations: [],
        betaUsers: false,
        newUsers: true,
        regions: []
      },
      conditions: [],
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
}

/**
 * Default health check configurations loaded at initialization.
 */
export function getDefaultHealthChecks(): HealthCheckConfig[] {
  return [
    {
      id: 'database_connection',
      name: 'Database Connection',
      description: 'Check if database is accessible and responsive',
      type: 'database_connection',
      timeout: 5000,
      interval: 30000,
      retries: 3,
      severity: 'critical',
      enabled: true
    },
    {
      id: 'api_health',
      name: 'API Health',
      description: 'Check if main API endpoints are responding',
      type: 'http_endpoint',
      endpoint: '/api/health',
      expectedResponse: { status: 'ok' },
      timeout: 3000,
      interval: 15000,
      retries: 2,
      severity: 'critical',
      enabled: true
    },
    {
      id: 'sync_service',
      name: 'Sync Service',
      description: 'Check if sync service is operational',
      type: 'external_service',
      timeout: 10000,
      interval: 60000,
      retries: 3,
      severity: 'error',
      enabled: true
    }
  ];
}
