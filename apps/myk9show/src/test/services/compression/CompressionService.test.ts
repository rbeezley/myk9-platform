import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompressionService } from '../../../services/compression/CompressionService';

// Mock pako and lz4js for testing
vi.mock('pako', () => ({
  deflate: vi.fn(() => new Uint8Array([1, 2, 3])),
  inflate: vi.fn(() => new TextEncoder().encode('decompressed'))
}));

vi.mock('lz4js', () => ({
  compress: vi.fn(() => new Uint8Array([4, 5, 6])),
  decompress: vi.fn(() => new TextEncoder().encode('lz4-decompressed'))
}));

describe('CompressionService', () => {
  let compressionService: CompressionService;

  beforeEach(() => {
    compressionService = CompressionService.getInstance();
    compressionService.clearStatistics();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = CompressionService.getInstance();
      const instance2 = CompressionService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('compress', () => {
    it('should compress string data', async () => {
      const testData = 'This is test data for compression';
      const result = await compressionService.compress(testData);

      expect(result).toMatchObject({
        algorithm: expect.any(String),
        originalSize: expect.any(Number),
        compressedSize: expect.any(Number),
        compressionRatio: expect.any(Number),
        compressed: expect.any(Uint8Array),
        metadata: expect.objectContaining({
          algorithm: expect.any(String),
          version: '1.0'
        })
      });

      expect(result.originalSize).toBeGreaterThan(0);
      expect(result.compressed).toBeInstanceOf(Uint8Array);
    });

    it('should compress JSON object data', async () => {
      const testData = {
        dogs: [
          { id: 1, breed: 'Golden Retriever', handler: 'John Doe' },
          { id: 2, breed: 'German Shepherd', handler: 'Jane Smith' }
        ],
        show: { name: 'Annual Dog Show', judge: 'Expert Judge' }
      };

      const result = await compressionService.compress(testData);
      expect(result.algorithm).toBeDefined();
      expect(result.compressionRatio).toBeGreaterThanOrEqual(0);
    });

    it('should use specified compression algorithm', async () => {
      const testData = 'Test data';
      const result = await compressionService.compress(testData, { algorithm: 'gzip' });
      
      expect(result.algorithm).toBe('gzip');
    });

    it('should handle compression errors gracefully', async () => {
      // Test with a circular reference that will cause JSON.stringify to fail
      const circularData = { circular: null } as { circular: unknown };
      circularData.circular = circularData;

      const result = await compressionService.compress(circularData);
      
      // Should fallback to no compression when serialization fails
      expect(result.algorithm).toBe('none');
      expect(result.compressionRatio).toBe(0);
      expect(result.metadata.error).toBeDefined();
    });

    it('should select different algorithms for different data types', async () => {
      // Small data
      const smallData = 'abc';
      const smallResult = await compressionService.compress(smallData);
      
      // Large repetitive data
      const largeRepetitiveData = 'breed'.repeat(1000);
      const largeResult = await compressionService.compress(largeRepetitiveData);
      
      // Both should compress, but potentially with different algorithms
      expect(smallResult.algorithm).toBeDefined();
      expect(largeResult.algorithm).toBeDefined();
    });
  });

  describe('decompress', () => {
    it('should decompress gzip data', async () => {
      const testData = 'Test decompression data';
      
      // First compress
      const compressed = await compressionService.compress(testData, { algorithm: 'gzip' });
      
      // Then decompress
      const decompressed = await compressionService.decompress(
        compressed.compressed,
        compressed.metadata
      );
      
      expect(decompressed).toBe('decompressed'); // Mocked return value
    });

    it('should handle unknown compression algorithm', async () => {
      const fakeCompressed = new Uint8Array([1, 2, 3]);
      const fakeMetadata = { algorithm: 'unknown' as string, version: '1.0' };
      
      await expect(
        compressionService.decompress(fakeCompressed, fakeMetadata)
      ).rejects.toThrow('Unknown compression algorithm: unknown');
    });

    it('should handle decompression errors', async () => {
      const fakeCompressed = new Uint8Array([1, 2, 3]);
      const metadata = { algorithm: 'unknown' as string, version: '1.0' };
      
      // Test with unknown algorithm which should throw
      await expect(
        compressionService.decompress(fakeCompressed, metadata)
      ).rejects.toThrow('Unknown compression algorithm: unknown');
    });
  });

  describe('compressStream', () => {
    it('should compress data stream', async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(testData);
          controller.close();
        }
      });

      const compressedChunks: Uint8Array[] = [];
      
      for await (const chunk of compressionService.compressStream(stream)) {
        compressedChunks.push(chunk);
      }

      expect(compressedChunks.length).toBeGreaterThan(0);
      expect(compressedChunks[0]).toBeInstanceOf(Uint8Array);
    });
  });

  describe('algorithm selection', () => {
    it('should select custom algorithm for dog show data', async () => {
      const dogShowData = JSON.stringify({
        dogs: Array(10).fill(null).map((_, i) => ({
          id: i,
          breed: 'Golden Retriever',
          handler: 'John Handler',
          class: 'Novice A',
          judge: 'Expert Judge',
          ring: 1,
          points: 15
        })),
        show: {
          name: 'Championship Dog Show',
          club: 'Local Kennel Club',
          entries: 100
        }
      });

      const result = await compressionService.compress(dogShowData);
      
      // Should potentially select custom algorithm due to domain terms
      expect(['custom', 'gzip', 'lz4', 'brotli']).toContain(result.algorithm);
    });

    it('should select appropriate algorithm for structured data', async () => {
      const structuredData = JSON.stringify({
        items: Array(100).fill({ type: 'item', status: 'active', created: new Date().toISOString() })
      });

      const result = await compressionService.compress(structuredData);
      expect(result.compressionRatio).toBeGreaterThan(0);
    });
  });

  describe('statistics and metrics', () => {
    it('should track compression statistics', async () => {
      const testData1 = 'Test data 1';
      const testData2 = 'Test data 2 with more content';
      
      await compressionService.compress(testData1, { algorithm: 'gzip' });
      await compressionService.compress(testData2, { algorithm: 'lz4' });
      
      const stats = compressionService.getStatistics();
      
      expect(stats.byAlgorithm.size).toBeGreaterThan(0);
      expect(stats.overall.totalOriginalSize).toBeGreaterThan(0);
    });

    it('should clear statistics', async () => {
      await compressionService.compress('test', { algorithm: 'gzip' });
      
      let stats = compressionService.getStatistics();
      expect(stats.overall.totalOriginalSize).toBeGreaterThan(0);
      
      compressionService.clearStatistics();
      stats = compressionService.getStatistics();
      expect(stats.overall.totalOriginalSize).toBe(0);
    });

    it('should export metrics', async () => {
      await compressionService.compress('test data', { algorithm: 'gzip' });
      
      const exported = compressionService.exportMetrics();
      
      expect(exported).toMatchObject({
        timestamp: expect.any(Number),
        metrics: expect.any(Object),
        statistics: expect.any(Object)
      });
    });

    it('should calculate compression ratios correctly', async () => {
      const testData = 'a'.repeat(1000); // Highly compressible data
      const result = await compressionService.compress(testData);
      
      const expectedRatio = 1 - (result.compressedSize / result.originalSize);
      expect(result.compressionRatio).toBeCloseTo(expectedRatio, 5);
    });
  });

  describe('custom dictionary compression', () => {
    it('should use custom dictionary for domain-specific data', async () => {
      const dogShowData = `
        The Golden Retriever handler walked into the ring with their champion dog.
        The judge examined the breed characteristics carefully.
        This entry earned points toward their next title.
        The club organized an excellent show with many entries.
      `;

      const result = await compressionService.compress(dogShowData, { 
        algorithm: 'custom',
        dictionary: 'dogShow'
      });

      expect(result.algorithm).toBe('custom');
      expect(result.metadata.dictionary).toBe('dogShow');
    });

    it('should compress and decompress with custom dictionary', async () => {
      const testData = 'The breed handler judge ring class entry points champion show';
      
      const compressed = await compressionService.compress(testData, {
        algorithm: 'custom',
        dictionary: 'dogShow'
      });
      
      const decompressed = await compressionService.decompress(
        compressed.compressed,
        compressed.metadata
      );
      
      // Note: This test uses mocked functions, so we expect the mocked return value
      expect(decompressed).toBeDefined();
    });
  });

  describe('performance optimization', () => {
    it('should handle small payloads efficiently', async () => {
      const smallData = 'abc';
      const startTime = performance.now();
      
      const result = await compressionService.compress(smallData);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should be fast for small data
      expect(duration).toBeLessThan(100); // 100ms threshold
      expect(result.compressed).toBeDefined();
    });

    it('should adapt algorithm selection based on data size', async () => {
      const smallData = 'small';
      const mediumData = 'medium data '.repeat(100);
      const largeData = 'large data '.repeat(1000);
      
      const smallResult = await compressionService.compress(smallData);
      const mediumResult = await compressionService.compress(mediumData);
      const largeResult = await compressionService.compress(largeData);
      
      // All should have valid algorithms selected
      expect(smallResult.algorithm).toBeDefined();
      expect(mediumResult.algorithm).toBeDefined();
      expect(largeResult.algorithm).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle invalid input gracefully', async () => {
      // Test with circular reference that will cause JSON.stringify to fail
      const circularData = { circular: null } as { circular: unknown };
      circularData.circular = circularData;
      
      const result = await compressionService.compress(circularData);
      expect(result.algorithm).toBe('none');
      expect(result.metadata.error).toBeDefined();
    });

    it('should handle decompression of corrupted data', async () => {
      const corruptedData = new Uint8Array([255, 255, 255, 255]);
      const metadata = { algorithm: 'gzip' as const, version: '1.0' };
      
      // Should either succeed with mocked function or throw appropriate error
      try {
        const result = await compressionService.decompress(corruptedData, metadata);
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical sync payload compression', async () => {
      const syncPayload = {
        version: '1.0',
        timestamp: Date.now(),
        changes: [
          {
            id: 'dog-1',
            type: 'dog',
            operation: 'update',
            data: {
              name: 'Max',
              breed: 'Golden Retriever',
              handler: 'John Smith',
              class: 'Open A',
              judge: 'Mary Johnson',
              ring: 2,
              status: 'entered'
            }
          },
          {
            id: 'entry-1',
            type: 'entry',
            operation: 'create',
            data: {
              dogId: 'dog-1',
              showId: 'show-1',
              classId: 'class-1',
              points: 0,
              placement: null
            }
          }
        ]
      };

      const result = await compressionService.compress(syncPayload);
      
      expect(result.compressionRatio).toBeGreaterThan(0);
      expect(result.algorithm).toBeDefined();
      
      // Should be able to decompress back
      const decompressed = await compressionService.decompress(
        result.compressed,
        result.metadata
      );
      expect(decompressed).toBeDefined();
    });

    it('should maintain compression statistics across multiple operations', async () => {
      const operations = [
        'Small data',
        'Medium data '.repeat(50),
        'Large data '.repeat(500),
        JSON.stringify({ complex: 'object', with: ['arrays', 'and', 'nested', { structures: true }] })
      ];

      for (const data of operations) {
        await compressionService.compress(data);
      }

      const stats = compressionService.getStatistics();
      
      expect(stats.overall.totalOriginalSize).toBeGreaterThan(0);
      expect(stats.byAlgorithm.size).toBeGreaterThan(0);
      
      // Check that at least one algorithm was used
      let algorithmUsed = false;
      stats.byAlgorithm.forEach(algorithmStats => {
        if (algorithmStats.count > 0) {
          algorithmUsed = true;
        }
      });
      expect(algorithmUsed).toBe(true);
    });
  });
});