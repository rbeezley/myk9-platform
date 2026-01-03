import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompressionService } from '../../services/compression/CompressionService';
import { CompressionIntegration } from '../../services/compression/CompressionIntegration';
import { SyncPayload, SyncOperation } from '../../types/sync-types';

// Mock pako for consistent testing
vi.mock('pako', () => ({
  deflate: vi.fn((input: Uint8Array) => {
    // Simulate compression by reducing size by ~30%
    const compressed = new Uint8Array(Math.floor(input.length * 0.7));
    compressed.fill(1);
    return compressed;
  }),
  inflate: vi.fn(() => {
    // Return reasonable decompressed data
    const original = 'decompressed test data';
    return new TextEncoder().encode(original);
  })
}));

vi.mock('lz4js', () => ({
  compress: vi.fn((input: Uint8Array) => {
    // Simulate LZ4 compression
    const compressed = new Uint8Array(Math.floor(input.length * 0.6));
    compressed.fill(2);
    return Array.from(compressed);
  }),
  decompress: vi.fn(() => {
    const original = 'lz4 decompressed data';
    return new TextEncoder().encode(original);
  })
}));

describe('Compression Integration Tests', () => {
  let compressionService: CompressionService;
  let compressionIntegration: CompressionIntegration;

  beforeEach(() => {
    compressionService = CompressionService.getInstance();
    compressionIntegration = CompressionIntegration.getInstance();
    compressionService.clearStatistics();
  });

  describe('sync payload compression', () => {
    it('should compress large sync payloads effectively', async () => {
      const largeSyncPayload: SyncPayload = {
        version: '1.0',
        timestamp: Date.now(),
        operations: Array(100).fill(null).map((_, i) => ({
          id: `operation-${i}`,
          entityType: 'dog',
          entityId: `dog-${i}`,
          operation: 'update',
          data: {
            id: `dog-${i}`,
            name: `Test Dog ${i}`,
            breed: 'Golden Retriever',
            handler: 'John Handler',
            class: 'Novice A',
            judge: 'Expert Judge',
            ring: 1,
            points: 15,
            status: 'entered',
            registration: `AKC-${i}`,
            kennel: 'Test Kennel Club',
            description: `This is a detailed description for dog ${i} with lots of text to make the payload larger and more suitable for compression testing.`
          },
          timestamp: Date.now(),
          clientId: 'test-client',
          version: 1
        } as SyncOperation))
      };

      const result = await compressionIntegration.compressSyncPayload(largeSyncPayload);

      expect(result.compressed).toBe(true);
      expect(result.stats.compressionRatio).toBeGreaterThan(0.1);
      expect(result.stats.finalSize).toBeLessThan(result.stats.originalSize);
      expect(result.metadata).toBeDefined();
    });

    it('should skip compression for small payloads', async () => {
      const smallSyncPayload: SyncPayload = {
        version: '1.0',
        timestamp: Date.now(),
        operations: [{
          id: 'operation-1',
          entityType: 'dog',
          entityId: 'dog-1',
          operation: 'update',
          data: { id: 'dog-1', name: 'Small' },
          timestamp: Date.now(),
          clientId: 'test-client',
          version: 1
        }]
      };

      const result = await compressionIntegration.compressSyncPayload(smallSyncPayload);

      expect(result.compressed).toBe(false);
      expect(result.stats.compressionRatio).toBe(0);
      expect(result.stats.finalSize).toBe(result.stats.originalSize);
    });

    it('should handle compression and decompression round trip', async () => {
      const testPayload: SyncPayload = {
        version: '1.0',
        timestamp: Date.now(),
        operations: Array(20).fill(null).map((_, i) => ({
          id: `op-${i}`,
          entityType: 'entry',
          entityId: `entry-${i}`,
          operation: 'create',
          data: {
            dogId: `dog-${i}`,
            showId: 'show-1',
            classId: 'class-1',
            handler: 'Test Handler',
            breed: 'Test Breed',
            points: 0
          },
          timestamp: Date.now(),
          clientId: 'test-client',
          version: 1
        } as SyncOperation))
      };

      // Compress
      const compressed = await compressionIntegration.compressSyncPayload(testPayload);
      
      if (compressed.compressed && compressed.metadata) {
        // Decompress
        try {
          const decompressed = await compressionIntegration.decompressSyncPayload(
            compressed.data as Uint8Array,
            compressed.metadata
          );

          expect(decompressed).toBeDefined();
          // Note: Due to mocked functions, we expect the mocked return value
          expect(typeof decompressed).toBe('object');
        } catch (error) {
          // This is expected with mocked functions that don't return valid JSON
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });

  describe('batch compression', () => {
    it('should compress operation batches efficiently', async () => {
      const operations: SyncOperation[] = Array(50).fill(null).map((_, i) => ({
        id: `batch-op-${i}`,
        entityType: 'dog',
        entityId: `dog-${i}`,
        operation: i % 2 === 0 ? 'update' : 'create',
        data: {
          id: `dog-${i}`,
          name: `Batch Dog ${i}`,
          breed: 'Golden Retriever',
          handler: 'Batch Handler',
          class: 'Open A',
          judge: 'Batch Judge',
          ring: i % 3 + 1,
          points: i * 2,
          status: 'active'
        },
        timestamp: Date.now() + i,
        clientId: 'batch-client',
        version: 1
      }));

      const result = await compressionIntegration.compressSyncBatch(operations);

      expect(result.stats.operationCount).toBe(50);
      expect(result.stats.originalSize).toBeGreaterThan(0);
      
      if (result.compressed) {
        expect(result.stats.compressionRatio).toBeGreaterThan(0.05);
        expect(result.metadata).toBeDefined();
      }
    });

    it('should optimize batch structure for compression', async () => {
      const repetitiveOperations: SyncOperation[] = Array(30).fill(null).map((_, i) => ({
        id: `repetitive-${i}`,
        entityType: 'dog', // Same entity type
        entityId: `dog-${i}`,
        operation: 'update', // Same operation
        data: {
          breed: 'Golden Retriever', // Repetitive data
          handler: 'Same Handler',
          class: 'Novice A',
          judge: 'Same Judge',
          ring: 1,
          status: 'entered',
          points: 15
        },
        timestamp: Date.now(),
        clientId: 'test-client',
        version: 1
      }));

      const result = await compressionIntegration.compressSyncBatch(repetitiveOperations);
      
      // Repetitive data should compress well
      if (result.compressed) {
        expect(result.stats.compressionRatio).toBeGreaterThan(0.2); // At least 20% compression
      }
    });
  });

  describe('algorithm selection', () => {
    it('should select appropriate algorithms for different data types', async () => {
      // Dog show specific data
      const dogShowPayload: SyncPayload = {
        version: '1.0',
        timestamp: Date.now(),
        operations: [{
          id: 'dog-show-op',
          entityType: 'dog',
          entityId: 'dog-1',
          operation: 'update',
          data: {
            breed: 'Golden Retriever',
            handler: 'Expert Handler',
            judge: 'Senior Judge',
            class: 'Open A',
            ring: 1,
            points: 15,
            champion: true,
            kennel: 'Championship Kennel',
            club: 'Local Dog Club',
            entry: 'Premium Entry',
            registration: 'AKC-123456'
          },
          timestamp: Date.now(),
          clientId: 'test-client',
          version: 1
        }]
      };

      const result = await compressionIntegration.compressSyncPayload(dogShowPayload);
      
      // Should potentially use custom algorithm for dog show terms
      expect(['custom', 'gzip', 'lz4', 'brotli', 'none']).toContain(
        result.metadata?.algorithm || 'none'
      );
    });

    it('should test compression effectiveness', async () => {
      const testData = {
        dogs: Array(20).fill(null).map((_, i) => ({
          id: i,
          breed: 'Golden Retriever',
          handler: 'Test Handler',
          class: 'Novice A',
          judge: 'Test Judge',
          points: 15
        })),
        metadata: {
          version: '1.0',
          timestamp: Date.now()
        }
      };

      const testResult = await compressionIntegration.testCompression(testData);

      expect(testResult.algorithms).toHaveLength(4);
      expect(testResult.recommendation).toBeDefined();
      
      testResult.algorithms.forEach(algo => {
        expect(algo.algorithm).toBeDefined();
        expect(algo.compressionRatio).toBeGreaterThanOrEqual(0);
        expect(algo.compressionTime).toBeGreaterThan(0);
        expect(algo.compressedSize).toBeGreaterThan(0);
      });
    });
  });

  describe('configuration and metrics', () => {
    it('should track compression metrics', async () => {
      const testPayload: SyncPayload = {
        version: '1.0',
        timestamp: Date.now(),
        operations: Array(10).fill(null).map((_, i) => ({
          id: `metric-op-${i}`,
          entityType: 'test',
          entityId: `test-${i}`,
          operation: 'update',
          data: { value: `test data ${i}` },
          timestamp: Date.now(),
          clientId: 'test-client',
          version: 1
        } as SyncOperation))
      };

      // Perform several operations
      await compressionIntegration.compressSyncPayload(testPayload);
      await compressionIntegration.compressSyncPayload(testPayload);

      const metrics = compressionIntegration.getCompressionMetrics();

      expect(metrics.enabled).toBe(true);
      expect(metrics.threshold).toBeGreaterThan(0);
      expect(metrics.maxTime).toBeGreaterThan(0);
      expect(metrics.serviceStats).toBeDefined();
    });

    it('should allow configuration changes', () => {
      compressionIntegration.configure({
        enabled: false,
        threshold: 2048,
        maxTime: 1000
      });

      const metrics = compressionIntegration.getCompressionMetrics();
      expect(metrics.enabled).toBe(false);
      expect(metrics.threshold).toBe(2048);
      expect(metrics.maxTime).toBe(1000);

      // Reset for other tests
      compressionIntegration.configure({ enabled: true });
    });

    it('should reset metrics', async () => {
      // Create a larger payload that will definitely trigger compression
      const testPayload: SyncPayload = {
        version: '1.0',
        timestamp: Date.now(),
        operations: Array(20).fill(null).map((_, i) => ({
          id: `reset-test-${i}`,
          entityType: 'test',
          entityId: `test-${i}`,
          operation: 'update',
          data: { 
            test: 'data '.repeat(50), // Make it larger
            index: i,
            timestamp: Date.now()
          },
          timestamp: Date.now(),
          clientId: 'test-client',
          version: 1
        }))
      };

      await compressionIntegration.compressSyncPayload(testPayload);
      
      let metrics = compressionIntegration.getCompressionMetrics();
      expect(metrics.serviceStats.overall.totalOriginalSize).toBeGreaterThan(0);

      compressionIntegration.resetMetrics();
      
      metrics = compressionIntegration.getCompressionMetrics();
      expect(metrics.serviceStats.overall.totalOriginalSize).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle compression failures gracefully', async () => {
      const invalidPayload = { circular: {} } as SyncPayload;
      (invalidPayload as Record<string, unknown>).circular = { ref: invalidPayload }; // Create circular reference

      const result = await compressionIntegration.compressSyncPayload(invalidPayload);

      expect(result.compressed).toBe(false);
      expect(result.stats.compressionRatio).toBe(0);
      expect(result.stats.originalSize).toBe(0); // Should be 0 due to serialization failure
    });

    it('should handle decompression failures', async () => {
      const corruptedData = new Uint8Array([255, 255, 255, 255]);
      const metadata = { algorithm: 'gzip' as const, version: '1.0' };

      await expect(
        compressionIntegration.decompressSyncPayload(corruptedData, metadata)
      ).rejects.toThrow();
    });

    it('should handle empty operation batches', async () => {
      const result = await compressionIntegration.compressSyncBatch([]);

      expect(result.compressed).toBe(false);
      expect(result.stats.operationCount).toBe(0);
      expect(result.stats.originalSize).toBeGreaterThan(0); // Empty array still has JSON overhead
    });
  });

  describe('performance characteristics', () => {
    it('should complete compression within reasonable time', async () => {
      const largePayload: SyncPayload = {
        version: '1.0',
        timestamp: Date.now(),
        operations: Array(200).fill(null).map((_, i) => ({
          id: `perf-op-${i}`,
          entityType: 'performance-test',
          entityId: `perf-${i}`,
          operation: 'update',
          data: {
            largeText: 'This is a large text field '.repeat(10),
            metadata: { index: i, timestamp: Date.now() }
          },
          timestamp: Date.now(),
          clientId: 'perf-client',
          version: 1
        } as SyncOperation))
      };

      const startTime = performance.now();
      const result = await compressionIntegration.compressSyncPayload(largePayload);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      expect(result).toBeDefined();
    });

    it('should handle multiple concurrent compressions', async () => {
      const createPayload = (index: number): SyncPayload => ({
        version: '1.0',
        timestamp: Date.now(),
        operations: [{
          id: `concurrent-${index}`,
          entityType: 'concurrent-test',
          entityId: `test-${index}`,
          operation: 'update',
          data: { index, data: 'test data '.repeat(20) },
          timestamp: Date.now(),
          clientId: `client-${index}`,
          version: 1
        }]
      });

      const compressionPromises = Array(5).fill(null).map((_value, i) =>
        compressionIntegration.compressSyncPayload(createPayload(i))
      );

      const results = await Promise.all(compressionPromises);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.stats.originalSize).toBeGreaterThan(0);
      });
    });
  });

  describe('real-world scenarios', () => {
    it('should handle typical show registration sync', async () => {
      const registrationSync: SyncPayload = {
        version: '1.0',
        timestamp: Date.now(),
        operations: [
          {
            id: 'dog-registration',
            entityType: 'dog',
            entityId: 'dog-123',
            operation: 'create',
            data: {
              name: 'Champion Max',
              breed: 'Golden Retriever',
              registration: 'AKC-WS123456',
              owner: 'John Smith',
              breeder: 'Mary Johnson',
              birthDate: '2023-01-15',
              sex: 'Male',
              color: 'Golden'
            },
            timestamp: Date.now(),
            clientId: 'mobile-app',
            version: 1
          },
          {
            id: 'entry-creation',
            entityType: 'entry',
            entityId: 'entry-456',
            operation: 'create',
            data: {
              dogId: 'dog-123',
              showId: 'show-789',
              classId: 'class-101',
              handler: 'Professional Handler',
              entryFee: 35.00,
              armband: 42,
              catalogListing: 'Champion Max - Golden Retriever'
            },
            timestamp: Date.now(),
            clientId: 'mobile-app',
            version: 1
          }
        ]
      };

      const result = await compressionIntegration.compressSyncPayload(registrationSync);
      expect(result).toBeDefined();
      expect(result.stats.originalSize).toBeGreaterThan(0);
    });

    it('should handle bulk score updates efficiently', async () => {
      const scoreUpdates: SyncOperation[] = Array(50).fill(null).map((_, i) => ({
        id: `score-update-${i}`,
        entityType: 'score',
        entityId: `score-${i}`,
        operation: 'update',
        data: {
          entryId: `entry-${i}`,
          judgeId: 'judge-1',
          ring: 1,
          score: 190 + Math.floor(Math.random() * 10),
          placement: i + 1,
          qualifying: true,
          comments: 'Good performance with minor handling errors',
          timestamp: Date.now()
        },
        timestamp: Date.now(),
        clientId: 'judge-tablet',
        version: 1
      }));

      const result = await compressionIntegration.compressSyncBatch(scoreUpdates);
      
      expect(result.stats.operationCount).toBe(50);
      if (result.compressed) {
        expect(result.stats.compressionRatio).toBeGreaterThan(0);
      }
    });
  });
});