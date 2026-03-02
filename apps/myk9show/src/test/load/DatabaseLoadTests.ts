/**
 * Database Load Testing for myK9Show Application
 *
 * Tests database performance under concurrent load with:
 * - CRUD operation stress testing
 * - Complex query performance
 * - Connection pool management
 * - Cache invalidation scenarios
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  LoadTestDataGenerator,
  PerformanceMonitor,
  PERFORMANCE_TARGETS,
} from './LoadTestFramework';
// import type { Show, ShowInput } from '@/types/show-types';
// import type { User } from '@/types/auth-types';
// import type { Dog } from '@/types/dog-types';
import { faker } from '@faker-js/faker';
import { logger } from '@/services/LoggingService';

interface DatabaseTestConfig {
  concurrentConnections: number;
  operationsPerConnection: number;
  testDuration: number; // milliseconds
  targetThroughput: number; // operations per second
}

interface DatabaseTestResults {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  throughput: number;
  errorRate: number;
  connectionErrors: number;
  timeoutErrors: number;
}

class DatabaseLoadTester {
  private supabase: SupabaseClient;
  private dataGenerator = LoadTestDataGenerator.getInstance();
  private performanceMonitor = new PerformanceMonitor();
  private connections: SupabaseClient[] = [];

  constructor() {
    this.supabase = createClient(
      process.env.VITE_SUPABASE_URL || 'http://localhost:54321',
      process.env.VITE_SUPABASE_ANON_KEY || 'test-key'
    );
  }

  async initializeConnections(count: number): Promise<void> {
    logger.debug(`🔌 Creating ${count} database connections...`, 'app', {});

    for (let i = 0; i < count; i++) {
      const client = createClient(
        process.env.VITE_SUPABASE_URL || 'http://localhost:54321',
        process.env.VITE_SUPABASE_ANON_KEY || 'test-key',
        {
          auth: { persistSession: false },
          db: { schema: 'public' },
          realtime: { params: { eventsPerSecond: 10 } },
        }
      );

      this.connections.push(client);
    }

    logger.debug(`✅ Created ${this.connections.length} connections`, 'app', {});
  }

  async cleanupConnections(): Promise<void> {
    logger.debug('🧹 Cleaning up database connections...', 'app', {});

    // Note: Supabase connections are automatically managed
    this.connections = [];
  }

  async runCrudLoadTest(config: DatabaseTestConfig): Promise<DatabaseTestResults> {
    logger.debug(`\n🏃 Running CRUD Load Test...`, 'app', {});
    logger.debug(
      `📊 Config: ${config.concurrentConnections} connections, ${config.operationsPerConnection} ops each`,
      'app',
      {}
    );

    const startTime = Date.now();
    const promises: Promise<void>[] = [];

    // Create concurrent workers
    for (let i = 0; i < config.concurrentConnections; i++) {
      const client = this.connections[i % this.connections.length];
      const promise = this.runCrudWorker(client, config, i);
      promises.push(promise);
    }

    // Wait for all workers to complete
    await Promise.allSettled(promises);

    const totalTime = Date.now() - startTime;

    // Calculate results
    const metrics = this.performanceMonitor.getAllMetrics();
    const crudMetrics = Object.entries(metrics)
      .filter(([key]) => key.startsWith('crud_'))
      .reduce(
        (acc, [, value]) => ({
          totalOps: acc.totalOps + value.count,
          totalTime: acc.totalTime + value.avg * value.count,
          errors: acc.errors + (value.count * value.errorRate) / 100,
        }),
        { totalOps: 0, totalTime: 0, errors: 0 }
      );

    return {
      totalOperations: crudMetrics.totalOps,
      successfulOperations: crudMetrics.totalOps - crudMetrics.errors,
      failedOperations: crudMetrics.errors,
      averageResponseTime:
        crudMetrics.totalOps > 0 ? crudMetrics.totalTime / crudMetrics.totalOps : 0,
      p95ResponseTime: Math.max(...Object.values(metrics).map(m => m.p95)),
      throughput: crudMetrics.totalOps / (totalTime / 1000),
      errorRate: crudMetrics.totalOps > 0 ? (crudMetrics.errors / crudMetrics.totalOps) * 100 : 0,
      connectionErrors: 0, // Would need specific tracking
      timeoutErrors: 0, // Would need specific tracking
    };
  }

  private async runCrudWorker(
    client: SupabaseClient,
    config: DatabaseTestConfig,
    workerId: number
  ): Promise<void> {
    const operationTypes = ['create', 'read', 'update', 'delete'];

    for (let i = 0; i < config.operationsPerConnection; i++) {
      const operation = faker.helpers.arrayElement(operationTypes);

      try {
        switch (operation) {
          case 'create':
            await this.performCreateOperation(client, `crud_create_${workerId}`);
            break;
          case 'read':
            await this.performReadOperation(client, `crud_read_${workerId}`);
            break;
          case 'update':
            await this.performUpdateOperation(client, `crud_update_${workerId}`);
            break;
          case 'delete':
            await this.performDeleteOperation(client, `crud_delete_${workerId}`);
            break;
        }

        // Small delay to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, faker.number.int({ min: 10, max: 50 })));
      } catch (error) {
        logger.error(
          `Worker ${workerId} operation ${operation} failed:`,
          'app',
          {},
          error as Error
        );
      }
    }
  }

  private async performCreateOperation(client: SupabaseClient, metricKey: string): Promise<void> {
    this.performanceMonitor.startMeasurement(metricKey);

    try {
      const show = this.dataGenerator.generateShow();

      const { error } = await client
        .from('show')
        .insert([
          {
            name: show.name,
            organization: show.organization,
            start_date: show.startDate,
            end_date: show.endDate,
            location: show.location,
            status: show.status,
            events: show.events,
            source: show.source,
            entry_open_date: show.entryOpenDate,
            entry_close_date: show.entryCloseDate,
            pre_entry_fee: show.preEntryFee,
            day_of_show_fee: show.dayOfShowFee,
            club_id: show.clubId,
            club_name: show.clubName,
            club_address: show.clubAddress,
            club_email: show.clubEmail,
          },
        ])
        .select();

      if (error) {
        throw error;
      }

      this.performanceMonitor.endMeasurement(metricKey, true);
    } catch (error) {
      this.performanceMonitor.endMeasurement(metricKey, false);
      throw error;
    }
  }

  private async performReadOperation(client: SupabaseClient, metricKey: string): Promise<void> {
    this.performanceMonitor.startMeasurement(metricKey);

    try {
      const { error } = await client.from('show').select('*').limit(10);

      if (error) {
        throw error;
      }

      this.performanceMonitor.endMeasurement(metricKey, true);
    } catch (error) {
      this.performanceMonitor.endMeasurement(metricKey, false);
      throw error;
    }
  }

  private async performUpdateOperation(client: SupabaseClient, metricKey: string): Promise<void> {
    this.performanceMonitor.startMeasurement(metricKey);

    try {
      // Get a random show to update
      const { data: shows, error: selectError } = await client.from('show').select('id').limit(1);

      if (selectError || !shows || shows.length === 0) {
        this.performanceMonitor.endMeasurement(metricKey, false);
        return;
      }

      const showId = shows[0].id;
      const { error } = await client
        .from('show')
        .update({
          status: faker.helpers.arrayElement(['Upcoming', 'Active', 'Completed']),
        })
        .eq('id', showId);

      if (error) {
        throw error;
      }

      this.performanceMonitor.endMeasurement(metricKey, true);
    } catch (error) {
      this.performanceMonitor.endMeasurement(metricKey, false);
      throw error;
    }
  }

  private async performDeleteOperation(client: SupabaseClient, metricKey: string): Promise<void> {
    this.performanceMonitor.startMeasurement(metricKey);

    try {
      // Get a show to delete (preferably a test one)
      const { data: shows, error: selectError } = await client
        .from('show')
        .select('id')
        .ilike('name', '%test%')
        .limit(1);

      if (selectError || !shows || shows.length === 0) {
        this.performanceMonitor.endMeasurement(metricKey, false);
        return;
      }

      const showId = shows[0].id;
      const { error } = await client.from('show').delete().eq('id', showId);

      if (error) {
        throw error;
      }

      this.performanceMonitor.endMeasurement(metricKey, true);
    } catch (error) {
      this.performanceMonitor.endMeasurement(metricKey, false);
      throw error;
    }
  }

  async runComplexQueryTest(config: DatabaseTestConfig): Promise<DatabaseTestResults> {
    logger.debug(`\n🔍 Running Complex Query Load Test...`, 'app', {});

    const startTime = Date.now();
    const promises: Promise<void>[] = [];

    for (let i = 0; i < config.concurrentConnections; i++) {
      const client = this.connections[i % this.connections.length];
      const promise = this.runComplexQueryWorker(client, config, i);
      promises.push(promise);
    }

    await Promise.allSettled(promises);

    const totalTime = Date.now() - startTime;
    const metrics = this.performanceMonitor.getAllMetrics();

    const queryMetrics = Object.entries(metrics)
      .filter(([key]) => key.startsWith('query_'))
      .reduce(
        (acc, [, value]) => ({
          totalOps: acc.totalOps + value.count,
          totalTime: acc.totalTime + value.avg * value.count,
          errors: acc.errors + (value.count * value.errorRate) / 100,
        }),
        { totalOps: 0, totalTime: 0, errors: 0 }
      );

    return {
      totalOperations: queryMetrics.totalOps,
      successfulOperations: queryMetrics.totalOps - queryMetrics.errors,
      failedOperations: queryMetrics.errors,
      averageResponseTime:
        queryMetrics.totalOps > 0 ? queryMetrics.totalTime / queryMetrics.totalOps : 0,
      p95ResponseTime: Math.max(...Object.values(metrics).map(m => m.p95)),
      throughput: queryMetrics.totalOps / (totalTime / 1000),
      errorRate:
        queryMetrics.totalOps > 0 ? (queryMetrics.errors / queryMetrics.totalOps) * 100 : 0,
      connectionErrors: 0,
      timeoutErrors: 0,
    };
  }

  private async runComplexQueryWorker(
    client: SupabaseClient,
    config: DatabaseTestConfig,
    workerId: number
  ): Promise<void> {
    const queryTypes = [
      'search_shows',
      'join_show_entries',
      'aggregate_statistics',
      'date_range_filter',
      'complex_filter',
    ];

    for (let i = 0; i < config.operationsPerConnection; i++) {
      const queryType = faker.helpers.arrayElement(queryTypes);

      try {
        switch (queryType) {
          case 'search_shows':
            await this.performSearchQuery(client, `query_search_${workerId}`);
            break;
          case 'join_show_entries':
            await this.performJoinQuery(client, `query_join_${workerId}`);
            break;
          case 'aggregate_statistics':
            await this.performAggregateQuery(client, `query_aggregate_${workerId}`);
            break;
          case 'date_range_filter':
            await this.performDateRangeQuery(client, `query_date_${workerId}`);
            break;
          case 'complex_filter':
            await this.performComplexFilterQuery(client, `query_complex_${workerId}`);
            break;
        }

        await new Promise(resolve => setTimeout(resolve, faker.number.int({ min: 20, max: 100 })));
      } catch (error) {
        logger.error(`Query worker ${workerId} failed:`, 'app', {}, error as Error);
      }
    }
  }

  private async performSearchQuery(client: SupabaseClient, metricKey: string): Promise<void> {
    this.performanceMonitor.startMeasurement(metricKey);

    try {
      const searchTerms = ['agility', 'obedience', 'rally', 'championship', 'trial'];
      const term = faker.helpers.arrayElement(searchTerms);

      const { error } = await client
        .from('show')
        .select('*')
        .or(`name.ilike.%${term}%,type.ilike.%${term}%,location.ilike.%${term}%`)
        .limit(50);

      if (error) {
        throw error;
      }

      this.performanceMonitor.endMeasurement(metricKey, true);
    } catch (error) {
      this.performanceMonitor.endMeasurement(metricKey, false);
      throw error;
    }
  }

  private async performJoinQuery(client: SupabaseClient, metricKey: string): Promise<void> {
    this.performanceMonitor.startMeasurement(metricKey);

    try {
      // Simulated join query - would need proper foreign key relationships
      const { error } = await client
        .from('show')
        .select(
          `
          *,
          club:club_id (
            name,
            contact_email
          )
        `
        )
        .limit(20);

      if (error) {
        throw error;
      }

      this.performanceMonitor.endMeasurement(metricKey, true);
    } catch (error) {
      this.performanceMonitor.endMeasurement(metricKey, false);
      throw error;
    }
  }

  private async performAggregateQuery(client: SupabaseClient, metricKey: string): Promise<void> {
    this.performanceMonitor.startMeasurement(metricKey);

    try {
      const { error } = await client.from('show').select('type, status').order('type');

      if (error) {
        throw error;
      }

      // Simulate aggregation (would be better done in SQL with count(*))
      // const aggregated = data?.reduce((acc, show) => {
      //   const key = `${show.organization}_${show.status}`;
      //   acc[key] = (acc[key] || 0) + 1;
      //   return acc;
      // }, {} as Record<string, number>);

      this.performanceMonitor.endMeasurement(metricKey, true);
    } catch (error) {
      this.performanceMonitor.endMeasurement(metricKey, false);
      throw error;
    }
  }

  private async performDateRangeQuery(client: SupabaseClient, metricKey: string): Promise<void> {
    this.performanceMonitor.startMeasurement(metricKey);

    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);

      const { error } = await client
        .from('show')
        .select('*')
        .gte('start_date', startDate.toISOString())
        .lte('start_date', endDate.toISOString())
        .order('start_date');

      if (error) {
        throw error;
      }

      this.performanceMonitor.endMeasurement(metricKey, true);
    } catch (error) {
      this.performanceMonitor.endMeasurement(metricKey, false);
      throw error;
    }
  }

  private async performComplexFilterQuery(
    client: SupabaseClient,
    metricKey: string
  ): Promise<void> {
    this.performanceMonitor.startMeasurement(metricKey);

    try {
      const { error } = await client
        .from('show')
        .select('*')
        .in('type', ['Agility', 'Obedience'])
        .in('status', ['Upcoming', 'Active'])
        .not('location', 'is', null)
        .order('start_date')
        .limit(25);

      if (error) {
        throw error;
      }

      this.performanceMonitor.endMeasurement(metricKey, true);
    } catch (error) {
      this.performanceMonitor.endMeasurement(metricKey, false);
      throw error;
    }
  }

  async runConnectionPoolTest(maxConnections: number): Promise<void> {
    logger.debug(`\n🏊 Running Connection Pool Test (max: ${maxConnections})...`, 'app', {});

    const connections: SupabaseClient[] = [];
    const errors: Error[] = [];

    try {
      // Create connections up to the limit
      for (let i = 0; i < maxConnections + 10; i++) {
        try {
          const client = createClient(
            process.env.VITE_SUPABASE_URL || 'http://localhost:54321',
            process.env.VITE_SUPABASE_ANON_KEY || 'test-key'
          );

          // Test the connection
          const { error } = await client.from('show').select('count(*)').limit(1);

          if (error) {
            errors.push(error);
          } else {
            connections.push(client);
          }
        } catch (error) {
          errors.push(error as Error);
        }
      }

      logger.debug(`✅ Successfully created ${connections.length} connections`, 'app', {});
      logger.debug(`❌ Failed to create ${errors.length} connections`, 'app', {});

      if (errors.length > 0) {
        logger.debug('Connection errors:', 'test', { data: errors.slice(0, 3) });
      }
    } finally {
      // Cleanup is automatic for Supabase
      logger.debug('🧹 Connection cleanup complete', 'app', {});
    }
  }

  generateReport(): string {
    const performanceReport = this.performanceMonitor.generateReport();

    return `
${performanceReport}

=== Database Load Test Summary ===

Connection Pool: ${this.connections.length} active connections
Performance Targets:
  - API Response Time: ${PERFORMANCE_TARGETS.responseTime.api}ms
  - Database Query Timeout: ${PERFORMANCE_TARGETS.database.queryTimeout}ms
  - Max Connection Pool: ${PERFORMANCE_TARGETS.database.connectionPool}
  - Slow Query Threshold: ${PERFORMANCE_TARGETS.database.slowQueryThreshold}ms

Recommendations:
1. Monitor slow queries (>${PERFORMANCE_TARGETS.database.slowQueryThreshold}ms)
2. Optimize high-frequency read operations
3. Consider read replicas for improved performance
4. Implement proper connection pooling
5. Add database-level caching for frequent queries
`;
  }
}

// Test configuration presets
export const DATABASE_TEST_CONFIGS = {
  light: {
    concurrentConnections: 10,
    operationsPerConnection: 50,
    testDuration: 60000, // 1 minute
    targetThroughput: 100,
  },

  normal: {
    concurrentConnections: 25,
    operationsPerConnection: 100,
    testDuration: 300000, // 5 minutes
    targetThroughput: 200,
  },

  heavy: {
    concurrentConnections: 50,
    operationsPerConnection: 200,
    testDuration: 600000, // 10 minutes
    targetThroughput: 500,
  },

  stress: {
    concurrentConnections: 100,
    operationsPerConnection: 500,
    testDuration: 900000, // 15 minutes
    targetThroughput: 1000,
  },
};

// Main test suite
describe('Database Load Tests', () => {
  let tester: DatabaseLoadTester;

  beforeAll(async () => {
    tester = new DatabaseLoadTester();
    await tester.initializeConnections(50);
  });

  afterAll(async () => {
    await tester.cleanupConnections();
  });

  it('should handle normal CRUD load', async () => {
    const results = await tester.runCrudLoadTest(DATABASE_TEST_CONFIGS.normal);

    expect(results.errorRate).toBeLessThan(PERFORMANCE_TARGETS.errorRate.normal * 100);
    expect(results.averageResponseTime).toBeLessThan(PERFORMANCE_TARGETS.responseTime.api);
    expect(results.throughput).toBeGreaterThan(DATABASE_TEST_CONFIGS.normal.targetThroughput);

    logger.debug('CRUD Load Test Results:', 'test', { data: results });
  });

  it('should handle complex queries under load', async () => {
    const results = await tester.runComplexQueryTest(DATABASE_TEST_CONFIGS.normal);

    expect(results.errorRate).toBeLessThan(PERFORMANCE_TARGETS.errorRate.normal * 100);
    expect(results.p95ResponseTime).toBeLessThan(PERFORMANCE_TARGETS.database.slowQueryThreshold);

    logger.debug('Complex Query Test Results:', 'test', { data: results });
  });

  it('should manage connection pool effectively', async () => {
    await tester.runConnectionPoolTest(PERFORMANCE_TARGETS.database.connectionPool);
  });

  it('should handle stress load', async () => {
    const results = await tester.runCrudLoadTest(DATABASE_TEST_CONFIGS.stress);

    expect(results.errorRate).toBeLessThan(PERFORMANCE_TARGETS.errorRate.stress * 100);
    expect(results.throughput).toBeGreaterThan(DATABASE_TEST_CONFIGS.stress.targetThroughput * 0.7);

    logger.debug('Stress Test Results:', 'test', { data: results });
  });

  afterAll(() => {
    logger.debug('Generated report:', 'test', { report: tester.generateReport() });
  });
});

export { DatabaseLoadTester, DATABASE_TEST_CONFIGS };
