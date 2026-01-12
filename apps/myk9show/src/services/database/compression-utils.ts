import { logger } from '@/services/LoggingService';

/**
 * Smart compression utilities for storage adapters
 * 
 * Automatically determines whether compression is beneficial based on data size
 * and characteristics to avoid unnecessary overhead for small datasets.
 */

/**
 * Configuration for smart compression
 */
interface CompressionConfig {
  /**
   * Minimum size in bytes before compression is considered
   * @default 1024 (1KB)
   */
  minSizeForCompression?: number;
  
  /**
   * Minimum compression ratio to justify overhead
   * @default 0.8 (20% reduction)
   */
  minCompressionRatio?: number;
  
  /**
   * Maximum time in ms to spend on compression/decompression
   * @default 50
   */
  maxCompressionTime?: number;
}

const DEFAULT_CONFIG: Required<CompressionConfig> = {
  minSizeForCompression: 1024,
  minCompressionRatio: 0.8,
  maxCompressionTime: 50,
};

/**
 * Simple compression using built-in browser APIs
 * Uses TextEncoder/TextDecoder with basic compression
 */
class SmartCompression {
  private config: Required<CompressionConfig>;
  private compressionCache = new Map<string, { compressed: string; ratio: number }>();
  
  constructor(config: CompressionConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Determines if data should be compressed based on size and characteristics
   */
  shouldCompress(data: string): boolean {
    // Skip compression for small data
    if (data.length < this.config.minSizeForCompression) {
      return false;
    }
    
    // Skip compression for highly entropic data (likely already compressed/random)
    if (this.estimateEntropy(data) > 0.85) {
      return false;
    }
    
    // Check cache for similar data patterns
    const hash = this.simpleHash(data.substring(0, 100));
    const cached = this.compressionCache.get(hash);
    if (cached && cached.ratio > this.config.minCompressionRatio) {
      return false; // Previous attempts yielded poor compression
    }
    
    return true;
  }
  
  /**
   * Compress data if beneficial, otherwise return original
   */
  compress(data: string): string {
    if (!this.shouldCompress(data)) {
      return data;
    }
    
    const startTime = performance.now();
    
    try {
      // Simple run-length encoding for JSON-like data
      const compressed = this.simpleCompress(data);
      const compressionTime = performance.now() - startTime;
      
      // Check if compression was worth it
      const ratio = compressed.length / data.length;
      const hash = this.simpleHash(data.substring(0, 100));
      
      // Cache the result for future decisions
      this.compressionCache.set(hash, { compressed, ratio });
      
      // Only use compressed version if it's beneficial and fast
      if (ratio < this.config.minCompressionRatio && compressionTime < this.config.maxCompressionTime) {
        return `__COMPRESSED__${compressed}`;
      }
      
      return data;
    } catch (error) {
      logger.warn('Compression failed, using original data:', 'database', {}, error as Error);
      return data;
    }
  }
  
  /**
   * Decompress data if it was compressed
   */
  decompress(data: string): string {
    if (!data.startsWith('__COMPRESSED__')) {
      return data;
    }
    
    try {
      const compressed = data.substring('__COMPRESSED__'.length);
      return this.simpleDecompress(compressed);
    } catch (error) {
      logger.error('Decompression failed:', 'database', {}, error as Error);
      // Return the data without the prefix as fallback
      return data.substring('__COMPRESSED__'.length);
    }
  }
  
  /**
   * Simple compression using run-length encoding for JSON data
   */
  private simpleCompress(data: string): string {
    // Simple run-length encoding for repeated patterns common in JSON
    let result = data;
    
    // Compress repeated whitespace
    result = result.replace(/[ ]{2,}/g, match => `<WS${match.length}>`);
    
    // Compress repeated characters (common in JSON)
    result = result.replace(/(.)\1{3,}/g, (match, char) => `<RPT${match.length}:${char}>`);
    
    // Compress common JSON patterns
    result = result.replace(/","(\w+)":/g, '<PROP$1>');
    result = result.replace(/":null,/g, '<NULL>');
    result = result.replace(/":true,/g, '<TRUE>');
    result = result.replace(/":false,/g, '<FALSE>');
    
    return result;
  }
  
  /**
   * Decompress run-length encoded data
   */
  private simpleDecompress(data: string): string {
    let result = data;
    
    // Decompress common JSON patterns
    result = result.replace(/<FALSE>/g, '":false,');
    result = result.replace(/<TRUE>/g, '":true,');
    result = result.replace(/<NULL>/g, '":null,');
    result = result.replace(/<PROP(\w+)>/g, '","$1":');
    
    // Decompress repeated characters
    result = result.replace(/<RPT(\d+):(.?)>/g, (_, count, char) => char.repeat(parseInt(count)));
    
    // Decompress whitespace
    result = result.replace(/<WS(\d+)>/g, (_, count) => ' '.repeat(parseInt(count)));
    
    return result;
  }
  
  /**
   * Estimate entropy of string (0 = very repetitive, 1 = very random)
   */
  private estimateEntropy(data: string): number {
    const chars = new Map<string, number>();
    
    // Count character frequencies
    for (const char of data) {
      chars.set(char, (chars.get(char) || 0) + 1);
    }
    
    // Calculate Shannon entropy
    let entropy = 0;
    const length = data.length;
    
    for (const count of chars.values()) {
      const probability = count / length;
      if (probability > 0) {
        entropy -= probability * Math.log2(probability);
      }
    }
    
    // Normalize to 0-1 range (divide by max possible entropy for this length)
    const maxEntropy = Math.log2(Math.min(length, 256)); // Max 256 different chars
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }
  
  /**
   * Simple hash function for caching compression decisions
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
  
  /**
   * Get compression statistics
   */
  getStats() {
    return {
      cacheSize: this.compressionCache.size,
      config: this.config,
      avgCompressionRatio: Array.from(this.compressionCache.values())
        .reduce((sum, { ratio }) => sum + ratio, 0) / this.compressionCache.size || 0,
    };
  }
  
  /**
   * Clear compression cache
   */
  clearCache() {
    this.compressionCache.clear();
  }
}

// Global instance for reuse
const globalCompression = new SmartCompression();

/**
 * Smart compress function that only compresses when beneficial
 */
export function smartCompress(data: string, config?: CompressionConfig): string {
  if (config) {
    const compression = new SmartCompression(config);
    return compression.compress(data);
  }
  return globalCompression.compress(data);
}

/**
 * Smart decompress function
 */
export function smartDecompress(data: string): string {
  return globalCompression.decompress(data);
}

/**
 * Check if compression would be beneficial without actually compressing
 */
export function shouldUseCompression(data: string, config?: CompressionConfig): boolean {
  if (config) {
    const compression = new SmartCompression(config);
    return compression.shouldCompress(data);
  }
  return globalCompression.shouldCompress(data);
}

/**
 * Get compression statistics
 */
export function getCompressionStats() {
  return globalCompression.getStats();
}

/**
 * Configure compression for development vs production
 */
export function createEnvironmentCompression(): SmartCompression {
  if (import.meta.env.DEV) {
    // Development: Skip compression for faster iteration
    return new SmartCompression({
      minSizeForCompression: 10240, // 10KB minimum (higher threshold)
      minCompressionRatio: 0.7,     // Require 30% reduction
      maxCompressionTime: 25,        // Faster timeout
    });
  } else {
    // Production: More aggressive compression
    return new SmartCompression({
      minSizeForCompression: 512,    // 512B minimum (lower threshold)
      minCompressionRatio: 0.85,     // Accept 15% reduction
      maxCompressionTime: 100,       // Allow more time
    });
  }
}

export { SmartCompression };