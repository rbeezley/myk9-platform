import { logger } from '@/services/LoggingService';

/**
 * Data compression service for IndexedDB storage optimization
 * Implements intelligent compression for large datasets while maintaining performance
 */

export interface CompressionOptions {
  threshold: number; // Minimum size in bytes before compression
  algorithm: 'lz4' | 'gzip' | 'json-minify';
  level?: number; // Compression level (1-9)
}

export interface CompressedData {
  data: string | ArrayBuffer;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  algorithm?: string;
  timestamp: number;
}

export class DataCompressionService {
  private readonly defaultOptions: CompressionOptions = {
    threshold: 1024, // 1KB threshold
    algorithm: 'json-minify',
    level: 6
  };

  /**
   * Compresses data if it exceeds the size threshold
   * @param data - Data to potentially compress
   * @param options - Compression options
   * @returns Compressed data wrapper
   */
  async compress<T>(data: T, options?: Partial<CompressionOptions>): Promise<CompressedData> {
    const opts = { ...this.defaultOptions, ...options };
    const jsonString = JSON.stringify(data);
    const originalSize = new TextEncoder().encode(jsonString).length;
    
    // Don't compress if below threshold
    if (originalSize < opts.threshold) {
      return {
        data: jsonString,
        compressed: false,
        originalSize,
        compressedSize: originalSize,
        timestamp: Date.now()
      };
    }

    try {
      let compressedData: string;
      let algorithm: string;

      switch (opts.algorithm) {
        case 'json-minify':
          compressedData = this.minifyJson(jsonString);
          algorithm = 'json-minify';
          break;
        case 'gzip':
          compressedData = await this.gzipCompress(jsonString);
          algorithm = 'gzip';
          break;
        case 'lz4':
          compressedData = await this.lz4Compress(jsonString);
          algorithm = 'lz4';
          break;
        default:
          throw new Error(`Unsupported compression algorithm: ${opts.algorithm}`);
      }

      const compressedSize = new TextEncoder().encode(compressedData).length;

      // Only use compression if it actually reduces size significantly
      const savings = (originalSize - compressedSize) / originalSize;
      if (savings < 0.1) { // Less than 10% savings
        return {
          data: jsonString,
          compressed: false,
          originalSize,
          compressedSize: originalSize,
          timestamp: Date.now()
        };
      }

      return {
        data: compressedData,
        compressed: true,
        originalSize,
        compressedSize,
        algorithm,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.warn('Compression failed, storing uncompressed:', 'database', {}, error as Error);
      return {
        data: jsonString,
        compressed: false,
        originalSize,
        compressedSize: originalSize,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Decompresses data if it was compressed
   * @param compressedData - Compressed data wrapper
   * @returns Original data
   */
  async decompress<T>(compressedData: CompressedData): Promise<T> {
    if (!compressedData.compressed) {
      return JSON.parse(compressedData.data as string);
    }

    try {
      let decompressedString: string;

      switch (compressedData.algorithm) {
        case 'json-minify':
          decompressedString = compressedData.data as string;
          break;
        case 'gzip':
          decompressedString = await this.gzipDecompress(compressedData.data as string);
          break;
        case 'lz4':
          decompressedString = await this.lz4Decompress(compressedData.data as string);
          break;
        default:
          throw new Error(`Unsupported decompression algorithm: ${compressedData.algorithm}`);
      }

      return JSON.parse(decompressedString);
    } catch (error) {
      logger.error('Decompression failed:', 'database', {}, error as Error);
      throw new Error(`Failed to decompress data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyzes potential compression savings for a dataset
   * @param data - Data to analyze
   * @returns Compression analysis
   */
  async analyzeCompression<T>(data: T): Promise<CompressionAnalysis> {
    const jsonString = JSON.stringify(data);
    const originalSize = new TextEncoder().encode(jsonString).length;
    
    const results: CompressionResult[] = [];

    // Test different algorithms
    const algorithms: CompressionOptions['algorithm'][] = ['json-minify', 'gzip', 'lz4'];
    
    for (const algorithm of algorithms) {
      try {
        const compressed = await this.compress(data, { algorithm, threshold: 0 });
        results.push({
          algorithm,
          originalSize,
          compressedSize: compressed.compressedSize,
          savings: (originalSize - compressed.compressedSize) / originalSize,
          compressionRatio: compressed.compressedSize / originalSize
        });
      } catch (error) {
        results.push({
          algorithm,
          originalSize,
          compressedSize: originalSize,
          savings: 0,
          compressionRatio: 1,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const bestResult = results
      .filter(r => !r.error)
      .sort((a, b) => b.savings - a.savings)[0];

    return {
      originalSize,
      results,
      bestAlgorithm: bestResult?.algorithm,
      maxSavings: bestResult?.savings || 0,
      recommendation: this.getCompressionRecommendation(originalSize, bestResult)
    };
  }

  /**
   * Batch compression for multiple records
   * @param records - Array of records to compress
   * @param options - Compression options
   * @returns Array of compressed records
   */
  async batchCompress<T>(
    records: T[], 
    options?: Partial<CompressionOptions>
  ): Promise<CompressedData[]> {
    const batchSize = 100; // Process in batches to avoid blocking
    const results: CompressedData[] = [];
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const batchPromises = batch.map(record => this.compress(record, options));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Yield control to prevent blocking
      if (i + batchSize < records.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    return results;
  }

  // Private compression methods

  private minifyJson(jsonString: string): string {
    // Remove unnecessary whitespace while preserving structure
    return JSON.stringify(JSON.parse(jsonString));
  }

  private async gzipCompress(data: string): Promise<string> {
    // Use CompressionStream API if available (modern browsers)
    if (typeof CompressionStream !== 'undefined') {
      const stream = new CompressionStream('gzip');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      writer.write(new TextEncoder().encode(data));
      writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) chunks.push(value);
      }

      const compressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
      }

      return btoa(String.fromCharCode(...compressed));
    }
    
    // Fallback to simple base64 encoding (not actual compression)
    return btoa(data);
  }

  private async gzipDecompress(compressedData: string): Promise<string> {
    // Use DecompressionStream API if available
    if (typeof DecompressionStream !== 'undefined') {
      const compressed = Uint8Array.from(atob(compressedData), c => c.charCodeAt(0));
      const stream = new DecompressionStream('gzip');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      writer.write(compressed);
      writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) chunks.push(value);
      }

      const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
      }

      return new TextDecoder().decode(decompressed);
    }
    
    // Fallback
    return atob(compressedData);
  }

  private async lz4Compress(data: string): Promise<string> {
    // Simplified LZ4-like compression using repetition detection
    let compressed = '';
    let i = 0;
    
    while (i < data.length) {
      let bestMatch = { length: 0, distance: 0 };
      
      // Look for matches in the previous 64KB window
      const windowStart = Math.max(0, i - 65536);
      const maxLength = Math.min(255, data.length - i);
      
      for (let j = windowStart; j < i; j++) {
        let length = 0;
        while (length < maxLength && 
               data[i + length] === data[j + length] && 
               j + length < i) {
          length++;
        }
        
        if (length > bestMatch.length && length >= 4) {
          bestMatch = { length, distance: i - j };
        }
      }
      
      if (bestMatch.length >= 4) {
        // Encode as reference
        compressed += `\x00${String.fromCharCode(bestMatch.distance & 0xFF)}${String.fromCharCode((bestMatch.distance >> 8) & 0xFF)}${String.fromCharCode(bestMatch.length)}`;
        i += bestMatch.length;
      } else {
        // Encode as literal
        compressed += data[i];
        i++;
      }
    }
    
    return btoa(compressed);
  }

  private async lz4Decompress(compressedData: string): Promise<string> {
    const compressed = atob(compressedData);
    let decompressed = '';
    let i = 0;
    
    while (i < compressed.length) {
      if (compressed[i] === '\x00' && i + 3 < compressed.length) {
        // Reference
        const distance = compressed.charCodeAt(i + 1) | (compressed.charCodeAt(i + 2) << 8);
        const length = compressed.charCodeAt(i + 3);
        
        const start = decompressed.length - distance;
        for (let j = 0; j < length; j++) {
          decompressed += decompressed[start + j];
        }
        
        i += 4;
      } else {
        // Literal
        decompressed += compressed[i];
        i++;
      }
    }
    
    return decompressed;
  }

  private getCompressionRecommendation(
    originalSize: number, 
    bestResult?: CompressionResult
  ): string {
    if (originalSize < 1024) {
      return 'No compression needed for small data';
    }
    
    if (!bestResult || bestResult.savings < 0.1) {
      return 'Data not suitable for compression';
    }
    
    if (bestResult.savings > 0.5) {
      return `Excellent compression candidate - ${(bestResult.savings * 100).toFixed(1)}% savings with ${bestResult.algorithm}`;
    }
    
    if (bestResult.savings > 0.2) {
      return `Good compression candidate - ${(bestResult.savings * 100).toFixed(1)}% savings with ${bestResult.algorithm}`;
    }
    
    return `Marginal compression benefits - ${(bestResult.savings * 100).toFixed(1)}% savings with ${bestResult.algorithm}`;
  }
}

// Type definitions
export interface CompressionAnalysis {
  originalSize: number;
  results: CompressionResult[];
  bestAlgorithm?: string;
  maxSavings: number;
  recommendation: string;
}

export interface CompressionResult {
  algorithm: string;
  originalSize: number;
  compressedSize: number;
  savings: number;
  compressionRatio: number;
  error?: string;
}

// Export singleton instance
export const compressionService = new DataCompressionService();