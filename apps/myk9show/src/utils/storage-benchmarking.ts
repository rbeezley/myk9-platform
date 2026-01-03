/**
 * Storage adapter benchmarking utility
 * Profiles performance differences between enhanced and basic storage adapters
 */

import { StateStorage } from 'zustand/middleware';
import { createEnhancedStorage } from '@/services/database/enhanced-storage-adapter';
import { getOptimalStorage } from '@/services/database/storage-adapter';

interface BenchmarkResult {
  operation: string;
  basicAdapter: number;
  enhancedAdapter: number;
  difference: number;
  percentageChange: number;
}

interface BenchmarkSuite {
  results: BenchmarkResult[];
  summary: {
    totalBasic: number;
    totalEnhanced: number;
    totalDifference: number;
    averagePercentageChange: number;
  };
}

export class StorageBenchmarker {
  private basicAdapter: StateStorage;
  private enhancedAdapter: StateStorage;
  private testData: Array<[string, string]> = [];
  
  constructor() {
    // Use a single storage instance for benchmarking to avoid multiple instantiations
    const benchmarkStorage = getOptimalStorage('benchmark-storage');
    this.basicAdapter = {
      getItem: (key: string) => benchmarkStorage.getItem(key),
      setItem: (key: string, value: string) => benchmarkStorage.setItem(key, value),
      removeItem: (key: string) => benchmarkStorage.removeItem(key),
    };
    
    this.enhancedAdapter = createEnhancedStorage({
      maxSize: 50,
      ttl: 5 * 60 * 1000, // 5 minutes for testing
      enableMetrics: true,
    });
    
    this.generateTestData();
  }
  
  private generateTestData() {
    const stores = ['userStore', 'dogStore', 'showStore', 'clubStore', 'templateStore'];
    
    // Generate realistic test data
    for (const store of stores) {
      const data = {
        version: 1,
        state: this.generateMockStoreData(store),
        timestamp: Date.now(),
      };
      
      this.testData.push([store, JSON.stringify(data)]);
    }
    
    // Add some additional keys for bulk operations
    for (let i = 0; i < 20; i++) {
      this.testData.push([`test-key-${i}`, JSON.stringify({ data: `test-value-${i}`, index: i })]);
    }
  }
  
  private generateMockStoreData(store: string): Record<string, unknown> {
    const baseData = {
      items: [],
      isLoading: false,
      error: null,
      lastUpdated: Date.now(),
    };
    
    // Generate different sized datasets
    const itemCount = store === 'userStore' ? 100 : store === 'dogStore' ? 50 : 20;
    
    for (let i = 0; i < itemCount; i++) {
      baseData.items.push({
        id: `${store}-item-${i}`,
        name: `Test Item ${i}`,
        createdAt: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(),
        updatedAt: new Date().toISOString(),
        data: `Mock data for ${store} item ${i}`,
      });
    }
    
    return baseData;
  }
  
  async benchmarkOperation(
    operation: string,
    basicOp: () => Promise<unknown>,
    enhancedOp: () => Promise<unknown>,
    iterations: number = 10
  ): Promise<BenchmarkResult> {
    // Warm up
    await basicOp();
    await enhancedOp();
    
    // Benchmark basic adapter
    const basicStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await basicOp();
    }
    const basicTime = performance.now() - basicStart;
    
    // Benchmark enhanced adapter
    const enhancedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await enhancedOp();
    }
    const enhancedTime = performance.now() - enhancedStart;
    
    const difference = enhancedTime - basicTime;
    const percentageChange = ((enhancedTime - basicTime) / basicTime) * 100;
    
    return {
      operation,
      basicAdapter: basicTime,
      enhancedAdapter: enhancedTime,
      difference,
      percentageChange,
    };
  }
  
  async runFullBenchmark(): Promise<BenchmarkSuite> {
    const results: BenchmarkResult[] = [];
    
    console.log('🚀 Starting storage adapter benchmark...');
    
    // Test single item operations
    const [key, value] = this.testData[0];
    
    // Set item benchmark
    results.push(await this.benchmarkOperation(
      'setItem',
      async () => await this.basicAdapter.setItem(key, value),
      async () => await this.enhancedAdapter.setItem(key, value)
    ));
    
    // Get item benchmark
    results.push(await this.benchmarkOperation(
      'getItem',
      async () => await this.basicAdapter.getItem(key),
      async () => await this.enhancedAdapter.getItem(key)
    ));
    
    // Multiple operations benchmark
    results.push(await this.benchmarkOperation(
      'multipleWrites',
      async () => {
        for (let i = 0; i < 5; i++) {
          const [k, v] = this.testData[i];
          await this.basicAdapter.setItem(k, v);
        }
      },
      async () => {
        for (let i = 0; i < 5; i++) {
          const [k, v] = this.testData[i];
          await this.enhancedAdapter.setItem(k, v);
        }
      }
    ));
    
    // Multiple reads benchmark
    results.push(await this.benchmarkOperation(
      'multipleReads',
      async () => {
        for (let i = 0; i < 5; i++) {
          const [k] = this.testData[i];
          await this.basicAdapter.getItem(k);
        }
      },
      async () => {
        for (let i = 0; i < 5; i++) {
          const [k] = this.testData[i];
          await this.enhancedAdapter.getItem(k);
        }
      }
    ));
    
    // Cache hit benchmark (if enhanced adapter supports it)
    if ('getMany' in this.enhancedAdapter) {
      results.push(await this.benchmarkOperation(
        'cacheHits',
        async () => {
          for (let i = 0; i < 5; i++) {
            const [k] = this.testData[i];
            await this.basicAdapter.getItem(k);
          }
        },
        async () => {
          for (let i = 0; i < 5; i++) {
            const [k] = this.testData[i];
            await this.enhancedAdapter.getItem(k);
          }
        },
        20 // More iterations for cache hit testing
      ));
    }
    
    // Calculate summary
    const totalBasic = results.reduce((sum, r) => sum + r.basicAdapter, 0);
    const totalEnhanced = results.reduce((sum, r) => sum + r.enhancedAdapter, 0);
    const totalDifference = totalEnhanced - totalBasic;
    const averagePercentageChange = results.reduce((sum, r) => sum + r.percentageChange, 0) / results.length;
    
    const summary = {
      totalBasic,
      totalEnhanced,
      totalDifference,
      averagePercentageChange,
    };
    
    return { results, summary };
  }
  
  formatResults(benchmark: BenchmarkSuite): string {
    const lines: string[] = [];
    lines.push('🔍 Storage Adapter Performance Benchmark Results');
    lines.push('='.repeat(50));
    lines.push('');
    
    // Individual operations
    lines.push('📊 Individual Operations:');
    benchmark.results.forEach(result => {
      const arrow = result.percentageChange > 0 ? '📈' : '📉';
      const sign = result.percentageChange > 0 ? '+' : '';
      lines.push(`${arrow} ${result.operation}:`);
      lines.push(`   Basic: ${result.basicAdapter.toFixed(2)}ms`);
      lines.push(`   Enhanced: ${result.enhancedAdapter.toFixed(2)}ms`);
      lines.push(`   Difference: ${sign}${result.difference.toFixed(2)}ms (${sign}${result.percentageChange.toFixed(1)}%)`);
      lines.push('');
    });
    
    // Summary
    lines.push('📋 Summary:');
    lines.push(`   Total Basic: ${benchmark.summary.totalBasic.toFixed(2)}ms`);
    lines.push(`   Total Enhanced: ${benchmark.summary.totalEnhanced.toFixed(2)}ms`);
    lines.push(`   Total Difference: ${benchmark.summary.totalDifference.toFixed(2)}ms`);
    lines.push(`   Average Change: ${benchmark.summary.averagePercentageChange.toFixed(1)}%`);
    
    if (benchmark.summary.averagePercentageChange > 10) {
      lines.push('');
      lines.push('⚠️  WARNING: Enhanced adapter is significantly slower than basic adapter');
      lines.push('   Consider optimizing cache initialization or using basic adapter in production');
    }
    
    return lines.join('\n');
  }
  
  async profileInitializationOverhead(): Promise<{
    basicInit: number;
    enhancedInit: number;
    difference: number;
    percentageIncrease: number;
  }> {
    console.log('🔍 Profiling initialization overhead...');
    
    // Profile basic adapter initialization
    const basicStart = performance.now();
    const basicAdapter = {
      getItem: (key: string) => getOptimalStorage('benchmark').getItem(key),
      setItem: (key: string, value: string) => getOptimalStorage('benchmark').setItem(key, value),
      removeItem: (key: string) => getOptimalStorage('benchmark').removeItem(key),
    };
    await basicAdapter.getItem('test'); // First access
    const basicInit = performance.now() - basicStart;
    
    // Profile enhanced adapter initialization
    const enhancedStart = performance.now();
    const enhancedAdapter = createEnhancedStorage({
      maxSize: 100,
      ttl: 30 * 60 * 1000,
      enableMetrics: true,
    });
    await enhancedAdapter.getItem('test'); // First access
    const enhancedInit = performance.now() - enhancedStart;
    
    const difference = enhancedInit - basicInit;
    const percentageIncrease = ((enhancedInit - basicInit) / basicInit) * 100;
    
    return {
      basicInit,
      enhancedInit,
      difference,
      percentageIncrease,
    };
  }
}

// Development-only benchmarking
export async function runStorageBenchmark(): Promise<void> {
  if (import.meta.env.DEV) {
    const benchmarker = new StorageBenchmarker();
    
    // Profile initialization overhead
    const initResults = await benchmarker.profileInitializationOverhead();
    console.log('🏁 Initialization Overhead:');
    console.log(`   Basic: ${initResults.basicInit.toFixed(2)}ms`);
    console.log(`   Enhanced: ${initResults.enhancedInit.toFixed(2)}ms`);
    console.log(`   Difference: +${initResults.difference.toFixed(2)}ms (+${initResults.percentageIncrease.toFixed(1)}%)`);
    
    // Run full benchmark
    const benchmark = await benchmarker.runFullBenchmark();
    console.log(benchmarker.formatResults(benchmark));
    
    // Store results in sessionStorage for debugging
    sessionStorage.setItem('storageBenchmark', JSON.stringify({ initResults, benchmark }));
  }
}

// Utility to get benchmark results
export function getBenchmarkResults(): unknown {
  if (import.meta.env.DEV) {
    const results = sessionStorage.getItem('storageBenchmark');
    return results ? JSON.parse(results) : null;
  }
  return null;
}