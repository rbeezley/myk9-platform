import { CompressionMetrics, CompressionAlgorithm, CompressionOptions, CompressionResult } from '../../types/performance-types';
import { inflate, deflate } from 'pako';
import { compress as lz4Compress, decompress as lz4Decompress } from 'lz4js';
import { logger } from '@/services/LoggingService';

/**
 * Compression Service for optimizing sync payload sizes
 * Supports multiple algorithms with adaptive selection
 */
export class CompressionService {
  private static instance: CompressionService;
  private metrics: Map<string, CompressionMetrics[]> = new Map();
  private customDictionaries: Map<string, string[]> = new Map();
  private algorithmStats: Map<CompressionAlgorithm, { totalSize: number; compressedSize: number; count: number }> = new Map();

  // Domain-specific terms for dog shows
  private readonly dogShowDictionary = [
    'breed', 'handler', 'judge', 'ring', 'class', 'entry', 'points', 'champion',
    'obedience', 'agility', 'conformation', 'rally', 'tracking', 'scent', 'work',
    'novice', 'open', 'utility', 'excellent', 'master', 'premier', 'grand',
    'best', 'show', 'match', 'trial', 'test', 'competition', 'placement',
    'qualifying', 'score', 'time', 'fault', 'error', 'perfect', 'leg', 'title',
    'registration', 'number', 'call', 'name', 'kennel', 'club', 'organization',
    'akc', 'ukc', 'ckc', 'fci', 'asca', 'nacsw', 'usdaa', 'nadac', 'cpec'
  ];

  private constructor() {
    this.initializeDictionaries();
    this.initializeAlgorithmStats();
  }

  static getInstance(): CompressionService {
    if (!CompressionService.instance) {
      CompressionService.instance = new CompressionService();
    }
    return CompressionService.instance;
  }

  private initializeDictionaries(): void {
    // Initialize custom dictionaries for different data types
    this.customDictionaries.set('dogShow', this.dogShowDictionary);
    this.customDictionaries.set('json', ['id', 'name', 'type', 'status', 'created', 'updated', 'deleted']);
    this.customDictionaries.set('sync', ['version', 'timestamp', 'changes', 'operations', 'conflicts']);
  }

  private initializeAlgorithmStats(): void {
    const algorithms: CompressionAlgorithm[] = ['gzip', 'brotli', 'lz4', 'custom'];
    algorithms.forEach(algo => {
      this.algorithmStats.set(algo, { totalSize: 0, compressedSize: 0, count: 0 });
    });
  }

  /**
   * Compress data using adaptive algorithm selection
   */
  async compress(
    data: unknown,
    options: CompressionOptions = {}
  ): Promise<CompressionResult> {
    const startTime = performance.now();
    
    let serialized: string;
    try {
      serialized = typeof data === 'string' ? data : JSON.stringify(data);
    } catch (error) {
      // Handle serialization errors (like circular references)
      const fallbackData = 'Serialization failed';
      return {
        compressed: new TextEncoder().encode(fallbackData),
        algorithm: 'none',
        originalSize: new TextEncoder().encode(fallbackData).length,
        compressedSize: new TextEncoder().encode(fallbackData).length,
        compressionRatio: 0,
        metadata: {
          algorithm: 'none',
          version: '1.0',
          error: error instanceof Error ? error.message : 'Serialization error'
        }
      };
    }
    
    const originalSize = new TextEncoder().encode(serialized).length;

    try {
      // Select best algorithm based on data characteristics
      const algorithm = options.algorithm || this.selectOptimalAlgorithm(serialized, originalSize);
      
      let compressed: Uint8Array;

      switch (algorithm) {
        case 'brotli':
          compressed = await this.compressBrotli(serialized, options.quality);
          break;
        case 'lz4':
          compressed = this.compressLZ4(serialized);
          break;
        case 'custom':
          compressed = this.compressCustom(serialized, options.dictionary);
          break;
        case 'gzip':
        default:
          compressed = this.compressGzip(serialized, options.level);
      }

      const compressionRatio = 1 - (compressed.length / originalSize);
      const duration = performance.now() - startTime;

      // Update statistics
      this.updateAlgorithmStats(algorithm, originalSize, compressed.length);

      // Record metrics
      const metrics: CompressionMetrics = {
        algorithm,
        originalSize,
        compressedSize: compressed.length,
        compressionRatio,
        compressionTime: duration,
        timestamp: Date.now()
      };

      this.recordMetrics(algorithm, metrics);

      return {
        compressed,
        algorithm,
        originalSize,
        compressedSize: compressed.length,
        compressionRatio,
        metadata: {
          algorithm,
          version: '1.0',
          dictionary: options.dictionary
        }
      };
    } catch (error) {
      logger.error('Compression failed:', 'services', {}, error as Error);
      // Fallback to no compression
      const uncompressed = new TextEncoder().encode(serialized);
      return {
        compressed: uncompressed,
        algorithm: 'none',
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 0,
        metadata: {
          algorithm: 'none',
          version: '1.0',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Decompress data based on metadata
   */
  async decompress(
    compressed: Uint8Array,
    metadata: CompressionResult['metadata']
  ): Promise<string> {
    try {
      switch (metadata.algorithm) {
        case 'brotli':
          return await this.decompressBrotli(compressed);
        case 'lz4':
          return this.decompressLZ4(compressed);
        case 'custom':
          return this.decompressCustom(compressed);
        case 'gzip':
          return this.decompressGzip(compressed);
        case 'none':
          return new TextDecoder().decode(compressed);
        default:
          throw new Error(`Unknown compression algorithm: ${metadata.algorithm}`);
      }
    } catch (error) {
      logger.error('Decompression failed:', 'services', {}, error as Error);
      throw error;
    }
  }

  /**
   * Stream compression for large payloads
   */
  async *compressStream(
    stream: ReadableStream<Uint8Array>,
    algorithm: CompressionAlgorithm = 'gzip'
  ): AsyncGenerator<Uint8Array> {
    const reader = stream.getReader();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Compress chunk
        const compressed = await this.compressChunk(value, algorithm);
        yield compressed;
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Select optimal compression algorithm based on data characteristics
   */
  private selectOptimalAlgorithm(data: string, size: number): CompressionAlgorithm {
    // For very small payloads, compression overhead might not be worth it
    if (size < 1024) {
      return 'gzip'; // Fastest for small data
    }

    // Analyze data characteristics
    const hasHighRepetition = this.analyzeRepetition(data);
    const isStructured = this.isStructuredData(data);
    const containsDomainTerms = this.containsDomainTerms(data);

    // For highly repetitive, structured data (like JSON arrays)
    if (hasHighRepetition && isStructured) {
      return size > 10240 ? 'brotli' : 'lz4'; // Brotli for larger, LZ4 for medium
    }

    // For domain-specific data with common terms
    if (containsDomainTerms) {
      return 'custom';
    }

    // For general data, use adaptive selection based on historical performance
    return this.selectByHistoricalPerformance();
  }

  /**
   * Gzip compression (browser-compatible using pako)
   */
  private compressGzip(data: string, level: number = 6): Uint8Array {
    const input = new TextEncoder().encode(data);
    const validLevel = Math.max(1, Math.min(9, level)) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    return deflate(input, { level: validLevel });
  }

  private decompressGzip(compressed: Uint8Array): string {
    const decompressed = inflate(compressed);
    return new TextDecoder().decode(decompressed);
  }

  /**
   * Brotli compression (using Web Streams API where available)
   */
  private async compressBrotli(data: string, _quality: number = 6): Promise<Uint8Array> {
    if ('CompressionStream' in globalThis) {
      const input = new TextEncoder().encode(data);
      const stream = new Response(input).body!
        .pipeThrough(new CompressionStream('deflate-raw'));
      
      const compressed = await new Response(stream).arrayBuffer();
      return new Uint8Array(compressed);
    }
    
    // Fallback to gzip if Brotli not available
    return this.compressGzip(data, _quality);
  }

  private async decompressBrotli(compressed: Uint8Array): Promise<string> {
    if ('DecompressionStream' in globalThis) {
      const stream = new Response(new Blob([compressed as BlobPart])).body!
        .pipeThrough(new DecompressionStream('deflate-raw'));
      
      const decompressed = await new Response(stream).arrayBuffer();
      return new TextDecoder().decode(decompressed);
    }
    
    // Fallback to gzip decompression
    return this.decompressGzip(compressed);
  }

  /**
   * LZ4 compression for speed-critical scenarios
   */
  private compressLZ4(data: string): Uint8Array {
    const input = new TextEncoder().encode(data);
    const compressed = lz4Compress(input);
    return new Uint8Array(compressed);
  }

  private decompressLZ4(compressed: Uint8Array): string {
    const decompressed = lz4Decompress(compressed);
    return new TextDecoder().decode(decompressed);
  }

  /**
   * Custom compression with domain-specific dictionary
   */
  private compressCustom(data: string, dictionaryName?: string): Uint8Array {
    // Simple dictionary-based replacement for demonstration
    let processed = data;
    const dictionary = this.customDictionaries.get(dictionaryName || 'dogShow') || [];
    const replacements: Array<[number, string]> = [];

    // Replace common terms with indices
    dictionary.forEach((term, index) => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      processed = processed.replace(regex, () => {
        replacements.push([index, term]);
        return `\x00${index}\x00`;
      });
    });

    // Compress the processed data
    const compressed = this.compressGzip(processed, 9);
    
    // Prepend dictionary info
    const header = new TextEncoder().encode(JSON.stringify({
      dict: dictionaryName || 'dogShow',
      replacements: replacements.length
    }));
    
    const result = new Uint8Array(4 + header.length + compressed.length);
    const view = new DataView(result.buffer);
    view.setUint32(0, header.length, true);
    result.set(header, 4);
    result.set(compressed, 4 + header.length);
    
    return result;
  }

  private decompressCustom(compressed: Uint8Array): string {
    const view = new DataView(compressed.buffer);
    const headerLength = view.getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(compressed.slice(4, 4 + headerLength)));
    
    const compressedData = compressed.slice(4 + headerLength);
    let decompressed = this.decompressGzip(compressedData);
    
    const dictionary = this.customDictionaries.get(header.dict) || [];
    
    // Restore dictionary terms
    const nullChar = String.fromCharCode(0);
    const pattern = new RegExp(`${nullChar}(\\d+)${nullChar}`, 'g');
    decompressed = decompressed.replace(pattern, (match, index) => {
      return dictionary[parseInt(index)] || match;
    });
    
    return decompressed;
  }

  /**
   * Compress a single chunk for streaming
   */
  private async compressChunk(chunk: Uint8Array, algorithm: CompressionAlgorithm): Promise<Uint8Array> {
    const data = new TextDecoder().decode(chunk);
    const result = await this.compress(data, { algorithm });
    return result.compressed;
  }

  /**
   * Analyze data for repetition patterns
   */
  private analyzeRepetition(data: string): boolean {
    const sample = data.slice(0, 1000); // Analyze first 1KB
    const tokens = sample.split(/\s+/);
    const uniqueTokens = new Set(tokens);
    const repetitionRatio = 1 - (uniqueTokens.size / tokens.length);
    return repetitionRatio > 0.5;
  }

  /**
   * Check if data is structured (JSON, XML, etc.)
   */
  private isStructuredData(data: string): boolean {
    const trimmed = data.trim();
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
           (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
           (trimmed.startsWith('<') && trimmed.endsWith('>'));
  }

  /**
   * Check if data contains domain-specific terms
   */
  private containsDomainTerms(data: string): boolean {
    const lowerData = data.toLowerCase();
    let matchCount = 0;
    
    for (const term of this.dogShowDictionary.slice(0, 20)) {
      if (lowerData.includes(term)) {
        matchCount++;
        if (matchCount >= 5) return true;
      }
    }
    
    return false;
  }

  /**
   * Select algorithm based on historical performance
   */
  private selectByHistoricalPerformance(): CompressionAlgorithm {
    let bestAlgorithm: CompressionAlgorithm = 'gzip';
    let bestRatio = 0;

    this.algorithmStats.forEach((stats: { totalSize: number; compressedSize: number; count: number }, algorithm: CompressionAlgorithm) => {
      if (stats.count > 0) {
        const avgRatio = 1 - (stats.compressedSize / stats.totalSize);
        if (avgRatio > bestRatio) {
          bestRatio = avgRatio;
          bestAlgorithm = algorithm;
        }
      }
    });

    return bestAlgorithm;
  }

  /**
   * Update algorithm statistics
   */
  private updateAlgorithmStats(
    algorithm: CompressionAlgorithm,
    originalSize: number,
    compressedSize: number
  ): void {
    const stats = this.algorithmStats.get(algorithm);
    if (stats) {
      stats.totalSize += originalSize;
      stats.compressedSize += compressedSize;
      stats.count++;
    }
  }

  /**
   * Record compression metrics
   */
  private recordMetrics(algorithm: CompressionAlgorithm, metrics: CompressionMetrics): void {
    if (!this.metrics.has(algorithm)) {
      this.metrics.set(algorithm, []);
    }
    
    const algorithmMetrics = this.metrics.get(algorithm)!;
    algorithmMetrics.push(metrics);
    
    // Keep only last 100 metrics per algorithm
    if (algorithmMetrics.length > 100) {
      algorithmMetrics.shift();
    }
  }

  /**
   * Get compression statistics
   */
  getStatistics(): {
    byAlgorithm: Map<CompressionAlgorithm, {
      avgCompressionRatio: number;
      avgCompressionTime: number;
      totalBytes: number;
      totalCompressedBytes: number;
      count: number;
    }>;
    overall: {
      totalOriginalSize: number;
      totalCompressedSize: number;
      overallCompressionRatio: number;
    };
  } {
    const byAlgorithm = new Map<CompressionAlgorithm, {
      avgCompressionRatio: number;
      avgCompressionTime: number;
      totalBytes: number;
      totalCompressedBytes: number;
      count: number;
    }>();
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;

    this.algorithmStats.forEach((stats, algorithm) => {
      const metrics = this.metrics.get(algorithm) || [];
      const avgCompressionTime = metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.compressionTime, 0) / metrics.length
        : 0;

      byAlgorithm.set(algorithm, {
        avgCompressionRatio: stats.count > 0 ? 1 - (stats.compressedSize / stats.totalSize) : 0,
        avgCompressionTime,
        totalBytes: stats.totalSize,
        totalCompressedBytes: stats.compressedSize,
        count: stats.count
      });

      totalOriginalSize += stats.totalSize;
      totalCompressedSize += stats.compressedSize;
    });

    return {
      byAlgorithm,
      overall: {
        totalOriginalSize,
        totalCompressedSize,
        overallCompressionRatio: totalOriginalSize > 0 
          ? 1 - (totalCompressedSize / totalOriginalSize) 
          : 0
      }
    };
  }

  /**
   * Clear all metrics and statistics
   */
  clearStatistics(): void {
    this.metrics.clear();
    this.initializeAlgorithmStats();
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): {
    timestamp: number;
    metrics: Record<string, CompressionMetrics[]>;
    statistics: ReturnType<CompressionService['getStatistics']>;
  } {
    return {
      timestamp: Date.now(),
      metrics: Object.fromEntries(this.metrics),
      statistics: this.getStatistics()
    };
  }
}