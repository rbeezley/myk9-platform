/**
 * Compression Service Usage Examples
 * Demonstrates how to use the compression system with sync operations
 */

import { CompressionService } from '../services/compression/CompressionService';
import { CompressionIntegration } from '../services/compression/CompressionIntegration';
import { SyncPayload, SyncOperation } from '../types/sync-types';

/**
 * Example 1: Basic compression service usage
 */
export async function basicCompressionExample() {
  const compressionService = CompressionService.getInstance();

  // Simple string compression
  const testData = 'This is test data that will be compressed';
  const result = await compressionService.compress(testData);
  
  console.log('Compression Result:', {
    algorithm: result.algorithm,
    originalSize: result.originalSize,
    compressedSize: result.compressedSize,
    ratio: result.compressionRatio
  });

  // Decompress back to original
  const decompressed = await compressionService.decompress(
    result.compressed,
    result.metadata
  );
  console.log('Decompressed:', decompressed);
}

/**
 * Example 2: Sync payload compression
 */
export async function syncPayloadCompressionExample() {
  const compressionIntegration = CompressionIntegration.getInstance();

  // Create a realistic sync payload
  const syncPayload: SyncPayload = {
    version: '1.0',
    timestamp: Date.now(),
    operations: [
      {
        id: 'dog-update-1',
        entityType: 'dog',
        entityId: 'dog-123',
        operation: 'update',
        data: {
          name: 'Champion Bella',
          breed: 'Golden Retriever',
          handler: 'Sarah Johnson',
          class: 'Open A',
          judge: 'Expert Judge Smith',
          ring: 2,
          points: 15,
          status: 'entered',
          registration: 'AKC-WS789012',
          kennel: 'Golden Valley Kennels'
        },
        timestamp: Date.now(),
        clientId: 'mobile-app-1',
        version: 1
      },
      {
        id: 'entry-create-1',
        entityType: 'entry',
        entityId: 'entry-456',
        operation: 'create',
        data: {
          dogId: 'dog-123',
          showId: 'show-789',
          classId: 'class-101',
          entryFee: 35.00,
          armband: 42
        },
        timestamp: Date.now(),
        clientId: 'mobile-app-1',
        version: 1
      }
    ]
  };

  // Compress the sync payload
  const compressed = await compressionIntegration.compressSyncPayload(syncPayload);
  
  console.log('Sync Payload Compression:', {
    wasCompressed: compressed.compressed,
    originalSize: compressed.stats.originalSize,
    finalSize: compressed.stats.finalSize,
    compressionRatio: compressed.stats.compressionRatio,
    algorithm: compressed.metadata?.algorithm
  });

  // If compressed, decompress back
  if (compressed.compressed && compressed.metadata) {
    const decompressed = await compressionIntegration.decompressSyncPayload(
      compressed.data as Uint8Array,
      compressed.metadata
    );
    console.log('Decompressed payload operations:', decompressed.operations?.length);
  }
}

/**
 * Example 3: Batch operation compression
 */
export async function batchCompressionExample() {
  const compressionIntegration = CompressionIntegration.getInstance();

  // Create a batch of similar operations (typical for bulk updates)
  const batchOperations: SyncOperation[] = Array(25).fill(null).map((_, i) => ({
    id: `batch-score-${i}`,
    entityType: 'score',
    entityId: `score-${i}`,
    operation: 'update',
    data: {
      entryId: `entry-${i}`,
      judgeId: 'judge-1',
      ring: 1,
      score: 185 + Math.floor(Math.random() * 15), // Scores between 185-200
      placement: i + 1,
      qualifying: true,
      comments: 'Good performance with minor deductions for handling',
      timestamp: Date.now()
    },
    timestamp: Date.now() + i, // Slightly different timestamps
    clientId: 'judge-tablet',
    version: 1
  }));

  const batchResult = await compressionIntegration.compressSyncBatch(batchOperations);
  
  console.log('Batch Compression Result:', {
    operationCount: batchResult.stats.operationCount,
    wasCompressed: batchResult.compressed,
    originalSize: batchResult.stats.originalSize,
    finalSize: batchResult.stats.finalSize,
    compressionRatio: batchResult.stats.compressionRatio
  });
}

/**
 * Example 4: Algorithm comparison and testing
 */
export async function algorithmComparisonExample() {
  const compressionIntegration = CompressionIntegration.getInstance();

  // Create dog show specific data with repetitive patterns
  const dogShowData = {
    show: {
      name: 'Annual Championship Dog Show',
      club: 'Metro Kennel Club',
      judge: 'Patricia Williams',
      date: '2024-07-15'
    },
    entries: Array(15).fill(null).map((_, i) => ({
      id: i + 1,
      dog: {
        name: `Champion Dog ${i + 1}`,
        breed: i % 3 === 0 ? 'Golden Retriever' : i % 3 === 1 ? 'German Shepherd' : 'Labrador',
        handler: i % 2 === 0 ? 'Professional Handler A' : 'Professional Handler B',
        registration: `AKC-WS${String(i + 1).padStart(6, '0')}`
      },
      class: 'Open A',
      ring: (i % 3) + 1,
      armband: i + 1,
      fee: 35.00,
      status: 'entered'
    }))
  };

  // Test different compression algorithms
  const testResult = await compressionIntegration.testCompression(dogShowData);
  
  console.log('Algorithm Comparison:');
  testResult.algorithms.forEach(algo => {
    console.log(`${algo.algorithm}: ${(algo.compressionRatio * 100).toFixed(1)}% compression, ${algo.compressionTime.toFixed(2)}ms`);
  });
  console.log(`Recommended algorithm: ${testResult.recommendation}`);
}

/**
 * Example 5: Performance monitoring and metrics
 */
export async function performanceMonitoringExample() {
  const compressionService = CompressionService.getInstance();
  const compressionIntegration = CompressionIntegration.getInstance();

  // Perform several compression operations
  const testData = [
    'Small test data',
    'Medium test data '.repeat(50),
    'Large test data '.repeat(200),
    JSON.stringify({
      dogs: Array(20).fill({ breed: 'Golden Retriever', handler: 'Test Handler' })
    })
  ];

  for (const data of testData) {
    await compressionService.compress(data);
  }

  // Get detailed statistics
  const stats = compressionService.getStatistics();
  console.log('Compression Statistics:');
  console.log('Overall compression ratio:', (stats.overall.overallCompressionRatio * 100).toFixed(1) + '%');
  console.log('Total original size:', stats.overall.totalOriginalSize, 'bytes');
  console.log('Total compressed size:', stats.overall.totalCompressedSize, 'bytes');

  stats.byAlgorithm.forEach((algorithmStats, algorithm) => {
    console.log(`${algorithm}:`, {
      avgRatio: (algorithmStats.avgCompressionRatio * 100).toFixed(1) + '%',
      avgTime: algorithmStats.avgCompressionTime.toFixed(2) + 'ms',
      count: algorithmStats.count
    });
  });

  // Get integration metrics
  const integrationMetrics = compressionIntegration.getCompressionMetrics();
  console.log('Integration Settings:', {
    enabled: integrationMetrics.enabled,
    threshold: integrationMetrics.threshold + ' bytes',
    maxTime: integrationMetrics.maxTime + 'ms'
  });
}

/**
 * Example 6: Configuration and customization
 */
export async function configurationExample() {
  const compressionIntegration = CompressionIntegration.getInstance();

  // Configure compression settings
  compressionIntegration.configure({
    enabled: true,
    threshold: 2048, // Only compress payloads larger than 2KB
    maxTime: 300 // Maximum 300ms for compression
  });

  // Test with custom compression options
  const testPayload: SyncPayload = {
    version: '1.0',
    timestamp: Date.now(),
    operations: [{
      id: 'custom-test',
      entityType: 'dog',
      entityId: 'dog-1',
      operation: 'update',
      data: {
        breed: 'Golden Retriever',
        handler: 'Expert Handler',
        judge: 'Senior Judge',
        class: 'Open A',
        ring: 1
      },
      timestamp: Date.now(),
      clientId: 'test-client',
      version: 1
    }]
  };

  // Compress with specific algorithm
  const result = await compressionIntegration.compressSyncPayload(testPayload, {
    algorithm: 'custom',
    dictionary: 'dogShow'
  });

  console.log('Custom compression result:', {
    algorithm: result.metadata?.algorithm,
    dictionary: result.metadata?.dictionary,
    ratio: result.stats.compressionRatio
  });
}

/**
 * Example 7: Streaming compression for large files
 */
export async function streamingCompressionExample() {
  const compressionService = CompressionService.getInstance();

  // Create a large data stream (simulated)
  const largeData = 'This is large streaming data '.repeat(1000);
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  
  // Split into chunks of 1KB each
  for (let i = 0; i < largeData.length; i += 1024) {
    chunks.push(encoder.encode(largeData.slice(i, i + 1024)));
  }

  // Create a readable stream
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      controller.close();
    }
  });

  console.log('Starting streaming compression...');
  const compressedChunks: Uint8Array[] = [];
  
  for await (const compressedChunk of compressionService.compressStream(stream, 'lz4')) {
    compressedChunks.push(compressedChunk);
  }

  console.log(`Streaming compression complete: ${chunks.length} chunks -> ${compressedChunks.length} compressed chunks`);
}

/**
 * Example 8: Error handling and recovery
 */
export async function errorHandlingExample() {
  const compressionIntegration = CompressionIntegration.getInstance();

  try {
    // Test with invalid data
    const invalidPayload = { circular: null } as { circular: unknown };
    invalidPayload.circular = invalidPayload; // Create circular reference

    const result = await compressionIntegration.compressSyncPayload({
      ...invalidPayload,
      version: '1.0',
      timestamp: Date.now()
    });
    console.log('Handled invalid payload gracefully:', result.compressed === false);

    // Test decompression with corrupted data
    const corruptedData = new Uint8Array([255, 255, 255, 255]);
    const metadata = { algorithm: 'gzip' as const, version: '1.0' };

    try {
      await compressionIntegration.decompressSyncPayload(corruptedData, metadata);
    } catch (error) {
      console.log('Properly caught decompression error:', error instanceof Error ? error.message : 'Unknown error');
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

/**
 * Run all examples
 */
export async function runAllCompressionExamples() {
  console.log('=== Compression Service Examples ===\n');

  try {
    console.log('1. Basic Compression:');
    await basicCompressionExample();
    console.log('\n');

    console.log('2. Sync Payload Compression:');
    await syncPayloadCompressionExample();
    console.log('\n');

    console.log('3. Batch Compression:');
    await batchCompressionExample();
    console.log('\n');

    console.log('4. Algorithm Comparison:');
    await algorithmComparisonExample();
    console.log('\n');

    console.log('5. Performance Monitoring:');
    await performanceMonitoringExample();
    console.log('\n');

    console.log('6. Configuration:');
    await configurationExample();
    console.log('\n');

    console.log('7. Streaming Compression:');
    await streamingCompressionExample();
    console.log('\n');

    console.log('8. Error Handling:');
    await errorHandlingExample();
    console.log('\n');

    console.log('=== All examples completed successfully ===');
  } catch (error) {
    console.error('Example execution failed:', error);
  }
}

// Export for use in other files
export {
  CompressionService,
  CompressionIntegration
};