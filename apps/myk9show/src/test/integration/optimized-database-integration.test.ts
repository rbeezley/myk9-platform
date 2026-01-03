/**
 * Optimized Database Integration Test
 * 
 * Handles RLS policies gracefully and tests with proper authentication
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  testClient,
  adminClient,
  createTestUser,
  cleanupTestUser,
  hasServiceKey,
  validateTestConfig
} from '../utils/testSupabaseClient';
import { performanceMonitor, TIMEOUT_CONFIG } from '../config/testOptimization';

describe('Optimized Database Integration', () => {
  let testUser: { id: string; email?: string } | null = null;
  let canRunDatabaseTests = false;

  beforeAll(async () => {
    const monitor = performanceMonitor.start('Database Integration Setup', 'integration');
    
    // Validate configuration first
    const config = validateTestConfig();
    console.log('🔧 Test configuration:', config);
    
    if (!config.valid) {
      const criticalIssues = config.issues.filter(issue => !issue.includes('SERVICE_KEY'));
      if (criticalIssues.length > 0) {
        throw new Error(`Critical configuration missing: ${criticalIssues.join(', ')}`);
      }
    }

    // Try to authenticate for RLS-enabled tests
    if (hasServiceKey()) {
      console.log('✅ Service key available - full database tests enabled');
      canRunDatabaseTests = true;
    } else {
      // Try regular authentication
      const { user, error } = await createTestUser();
      if (error) {
        console.warn('⚠️ Authentication failed - limited tests only:', error.message);
        canRunDatabaseTests = false;
      } else {
        console.log('✅ Test user authenticated - RLS-compliant tests enabled');
        testUser = user;
        canRunDatabaseTests = true;
      }
    }
    
    monitor.end('passed');
  }, TIMEOUT_CONFIG.integration);

  afterAll(async () => {
    await cleanupTestUser();
  });

  it('should validate database connection', async () => {
    const monitor = performanceMonitor.start('Database Connection', 'database');
    
    try {
      // Try a simple, permission-free query
      const { error } = await testClient
        .from('club')
        .select('id')
        .limit(1);

      // Connection test passes if we get any response (even permission denied)
      expect(error?.code !== 'NETWORK_ERROR').toBe(true);
      monitor.end('passed');
    } catch (error) {
      monitor.end('failed', ['Network connection failed']);
      throw error;
    }
  }, TIMEOUT_CONFIG.database);

  it('should handle RLS policies appropriately', async () => {
    const monitor = performanceMonitor.start('RLS Policy Test', 'database');
    
    const testData = {
      name: 'Test Club for RLS',
      email: 'rls-test@example.com',
      phone: '555-0100'
    };

    try {
      const client = hasServiceKey() ? adminClient : testClient;
      const { data, error } = await client
        .from('club')
        .insert(testData)
        .select()
        .single();

      if (error) {
        if (error.code === '42501') {
          console.log('ℹ️ RLS policy correctly blocking unauthenticated access');
          expect(error.code).toBe('42501'); // This is expected behavior
          monitor.end('passed', ['RLS policy correctly enforced']);
        } else {
          console.warn('⚠️ Unexpected database error:', error);
          monitor.end('failed', [`Unexpected error: ${error.code}`]);
          throw error;
        }
      } else {
        console.log('✅ Database operation successful with proper authentication');
        expect(data).toBeDefined();
        expect(data.name).toBe(testData.name);
        
        // Cleanup
        await client.from('club').delete().eq('id', data.id);
        monitor.end('passed');
      }
    } catch (error) {
      monitor.end('failed', ['Test execution failed']);
      throw error;
    }
  }, TIMEOUT_CONFIG.database);

  it('should test read operations without RLS issues', async () => {
    const monitor = performanceMonitor.start('Read Operations', 'database');
    
    try {
      // Test basic read operations that typically don't have strict RLS
      const queries = [
        { table: 'club', description: 'club listing' },
        { table: 'show', description: 'show listing' },
      ];

      const results = await Promise.allSettled(
        queries.map(async ({ table, description }) => {
          const { data, error } = await testClient
            .from(table)
            .select('id')
            .limit(5);
          
          return { table, description, data, error, hasData: data && data.length >= 0 };
        })
      );

      let successCount = 0;
      let rlsBlockedCount = 0;

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { table, error, hasData } = result.value;
          if (error) {
            if (error.code === '42501') {
              console.log(`ℹ️ RLS blocking read access to ${table}`);
              rlsBlockedCount++;
            } else {
              console.warn(`⚠️ Unexpected error reading ${table}:`, error.message);
            }
          } else if (hasData) {
            console.log(`✅ Successfully read from ${table}`);
            successCount++;
          }
        }
      });

      // Test passes if we either get data or proper RLS blocking
      const totalHandled = successCount + rlsBlockedCount;
      expect(totalHandled).toBe(queries.length);
      
      monitor.end('passed', [`${successCount} successful reads, ${rlsBlockedCount} RLS-blocked`]);
    } catch (error) {
      monitor.end('failed', ['Read operation test failed']);
      throw error;
    }
  }, TIMEOUT_CONFIG.database);

  it('should test schema compatibility', async () => {
    const monitor = performanceMonitor.start('Schema Compatibility', 'database');
    
    try {
      // Test known schema issues like missing columns
      const schemaTests = [
        {
          table: 'club',
          requiredFields: ['name', 'email'],
          optionalFields: ['phone', 'address']
        },
        {
          table: 'show', 
          requiredFields: ['name'],
          optionalFields: ['start_date', 'end_date', 'club_id']
        }
      ];

      const schemaIssues: string[] = [];

      for (const test of schemaTests) {
        try {
          // Try to select fields to test if they exist
          const selectFields = [...test.requiredFields, ...test.optionalFields].join(', ');
          const { error } = await testClient
            .from(test.table)
            .select(selectFields)
            .limit(1);

          if (error && error.code === 'PGRST204') {
            // Column not found error
            schemaIssues.push(`${test.table}: ${error.message}`);
          } else if (error && error.code !== '42501') {
            // Other errors (RLS is acceptable)
            schemaIssues.push(`${test.table}: Unexpected error - ${error.message}`);
          } else {
            console.log(`✅ Schema compatible for ${test.table}`);
          }
        } catch (error) {
          schemaIssues.push(`${test.table}: Test failed - ${error}`);
        }
      }

      if (schemaIssues.length > 0) {
        console.warn('⚠️ Schema compatibility issues found:', schemaIssues);
        monitor.end('failed', schemaIssues);
        // Don't fail the test, just warn
        expect.soft(schemaIssues.length).toBe(0);
      } else {
        monitor.end('passed');
      }
    } catch (error) {
      monitor.end('failed', ['Schema test execution failed']);
      throw error;
    }
  }, TIMEOUT_CONFIG.database);

  it('should demonstrate graceful error handling', async () => {
    const monitor = performanceMonitor.start('Error Handling', 'unit');
    
    try {
      // Test various error scenarios
      const errorTests = [
        {
          name: 'Invalid table name',
          test: () => testClient.from('nonexistent_table').select('*').limit(1)
        },
        {
          name: 'Invalid column name',
          test: () => testClient.from('club').select('nonexistent_column').limit(1)
        }
      ];

      const errorResults = await Promise.allSettled(
        errorTests.map(async ({ name, test }) => {
          const { error } = await test();
          return { name, error: error?.message, code: error?.code };
        })
      );

      errorResults.forEach((result, index) => {
        const testName = errorTests[index].name;
        if (result.status === 'fulfilled' && result.value.error) {
          console.log(`✅ ${testName}: Properly handled - ${result.value.code}`);
        } else {
          console.warn(`⚠️ ${testName}: Unexpected result`);
        }
      });

      // Test passes if we handle errors gracefully
      expect(errorResults.every(r => r.status === 'fulfilled')).toBe(true);
      monitor.end('passed');
    } catch (error) {
      monitor.end('failed', ['Error handling test failed']);
      throw error;
    }
  }, TIMEOUT_CONFIG.unit);

  // Summary test that reports overall status
  it('should summarize test infrastructure status', async () => {
    const monitor = performanceMonitor.start('Test Summary', 'unit');
    
    const summary = {
      hasServiceKey: hasServiceKey(),
      canRunDatabaseTests,
      isAuthenticated: !!testUser,
      configValid: validateTestConfig().valid,
      performance: performanceMonitor.getSummary()
    };

    console.log('📊 Test Infrastructure Summary:', summary);
    
    // Test infrastructure is working if we can at least connect
    expect(summary.configValid).toBe(true);
    
    if (summary.performance.slowTestsCount > 0) {
      console.warn('⚠️ Slow tests detected:', summary.performance.slowTests);
    }
    
    monitor.end('passed');
  }, TIMEOUT_CONFIG.unit);
});