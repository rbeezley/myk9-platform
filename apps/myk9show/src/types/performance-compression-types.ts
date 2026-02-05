/**
 * Compression types for sync payload optimization
 * Phase 5.1.3: Compression Configuration
 */

/**
 * Configuration for data compression
 * Reduces bandwidth usage during sync
 */
export interface CompressionConfig {
  /** Compression algorithm to use */
  algorithm: 'gzip' | 'brotli' | 'lz4' | 'zstd';

  /** Compression level (1-9, higher = better compression, slower) */
  level: number;

  /** Minimum payload size to compress (bytes) */
  minSize: number;

  /** MIME types to compress */
  mimeTypes: string[];

  /** Enable streaming compression for large payloads */
  streamingEnabled: boolean;

  /** Dictionary for improved compression of domain-specific data */
  dictionary?: Uint8Array;
}

/** Supported compression algorithms */
export type CompressionAlgorithm = 'gzip' | 'brotli' | 'lz4' | 'custom' | 'none';

/** Options for compression operations */
export interface CompressionOptions {
  /** Compression algorithm to use */
  algorithm?: CompressionAlgorithm;

  /** Compression level (1-9) */
  level?: number;

  /** Quality setting for algorithms that support it */
  quality?: number;

  /** Custom dictionary name to use */
  dictionary?: string;

  /** Enable streaming compression */
  streaming?: boolean;
}

/** Result of compression operation */
export interface CompressionResult {
  /** Compressed data */
  compressed: Uint8Array;

  /** Algorithm used */
  algorithm: CompressionAlgorithm;

  /** Original data size in bytes */
  originalSize: number;

  /** Compressed data size in bytes */
  compressedSize: number;

  /** Compression ratio (0-1, higher is better compression) */
  compressionRatio: number;

  /** Metadata for decompression */
  metadata: {
    algorithm: CompressionAlgorithm;
    version: string;
    dictionary?: string;
    error?: string;
  };
}

/** Performance metrics for compression operations */
export interface CompressionMetrics {
  /** Algorithm used */
  algorithm: CompressionAlgorithm;

  /** Original data size */
  originalSize: number;

  /** Compressed data size */
  compressedSize: number;

  /** Compression ratio achieved */
  compressionRatio: number;

  /** Time taken to compress (ms) */
  compressionTime: number;

  /** Timestamp of operation */
  timestamp: number;
}
