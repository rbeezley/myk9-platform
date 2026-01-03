import { DifferentialSyncService } from './DifferentialSyncService';
import { CompressionService } from '../compression/CompressionService';
import { BatchProcessor as BatchProcessorClass } from './BatchProcessor';
import { eventEmitter } from './eventEmitter';
import { SyncEvents } from './types';

interface FieldMetadata {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'binary' | 'image' | 'document';
  size: number;
  lastModified: number;
  accessCount: number;
  lastAccessTime: number;
  syncPriority: number;
  compressionRatio?: number;
  isLargeField: boolean;
  isFrequentlyAccessed: boolean;
  isDirty: boolean;
}

interface FieldSyncConfig {
  includedFields?: string[];
  excludedFields?: string[];
  priorityFields?: string[];
  compressionThreshold: number;
  largeFieldThreshold: number;
  accessFrequencyThreshold: number;
  bandwidthLimit?: number;
  syncScope: string;
}

interface FieldChangeEvent {
  entityType: string;
  entityId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
  userId: string;
  deviceId: string;
}

interface FieldAccessPattern {
  fieldName: string;
  accessCount: number;
  readCount: number;
  writeCount: number;
  averageAccessInterval: number;
  lastAccessTime: number;
  predictedNextAccess?: number;
  accessHeatmap: Map<number, number>; // hour of day -> access count
}

interface FieldSyncScope {
  name: string;
  description: string;
  includedFields: Set<string>;
  excludedFields: Set<string>;
  priorityFields: Set<string>;
  conditions?: {
    userRole?: string[];
    deviceType?: string[];
    networkType?: string[];
    timeOfDay?: { start: number; end: number };
  };
}

interface BandwidthUsage {
  fieldName: string;
  bytesTransferred: number;
  compressedBytes: number;
  syncCount: number;
  averageSize: number;
  totalTime: number;
  bandwidthSaved: number;
}

interface FieldSyncResult {
  syncedFields: string[];
  skippedFields: string[];
  bytesTransferred: number;
  bytesSaved: number;
  compressionRatio: number;
  syncDuration: number;
  conflicts: Array<{ fieldName: string; conflict: unknown }>;
}

export class FieldLevelSyncService {
  private static instance: FieldLevelSyncService;
  private fieldMetadata: Map<string, Map<string, FieldMetadata>> = new Map();
  private fieldAccessPatterns: Map<string, Map<string, FieldAccessPattern>> = new Map();
  private fieldChanges: Map<string, FieldChangeEvent[]> = new Map();
  private syncScopes: Map<string, FieldSyncScope> = new Map();
  private bandwidthUsage: Map<string, BandwidthUsage> = new Map();
  private config: FieldSyncConfig;
  
  private differentialSync: DifferentialSyncService;
  private compressionService: CompressionService;
  private batchProcessor: BatchProcessorClass;

  private constructor() {
    this.config = {
      compressionThreshold: 1024, // 1KB
      largeFieldThreshold: 10240, // 10KB
      accessFrequencyThreshold: 10, // accesses per hour
      syncScope: 'standard'
    };

    this.differentialSync = DifferentialSyncService.getInstance();
    this.compressionService = CompressionService.getInstance();
    this.batchProcessor = new BatchProcessorClass();

    this.initializeDefaultScopes();
    this.startPatternAnalysis();
  }

  static getInstance(): FieldLevelSyncService {
    if (!FieldLevelSyncService.instance) {
      FieldLevelSyncService.instance = new FieldLevelSyncService();
    }
    return FieldLevelSyncService.instance;
  }

  private initializeDefaultScopes(): void {
    // Minimal scope - only essential fields
    this.syncScopes.set('minimal', {
      name: 'minimal',
      description: 'Sync only essential fields for basic functionality',
      includedFields: new Set(['id', 'updatedAt', 'status', 'name', 'type']),
      excludedFields: new Set(['largeContent', 'images', 'documents', 'metadata']),
      priorityFields: new Set(['id', 'status'])
    });

    // Standard scope - common fields
    this.syncScopes.set('standard', {
      name: 'standard',
      description: 'Sync commonly used fields',
      includedFields: new Set(),
      excludedFields: new Set(['images', 'documents', 'binaryData']),
      priorityFields: new Set(['id', 'name', 'status', 'updatedAt'])
    });

    // Full scope - all fields
    this.syncScopes.set('full', {
      name: 'full',
      description: 'Sync all fields including large content',
      includedFields: new Set(),
      excludedFields: new Set(),
      priorityFields: new Set()
    });

    // Mobile scope - optimized for mobile devices
    this.syncScopes.set('mobile', {
      name: 'mobile',
      description: 'Optimized sync scope for mobile devices',
      includedFields: new Set(['id', 'name', 'status', 'summary', 'thumbnail']),
      excludedFields: new Set(['fullImage', 'documents', 'detailedMetadata']),
      priorityFields: new Set(['id', 'name', 'status']),
      conditions: {
        deviceType: ['mobile', 'tablet']
      }
    });

    // Offline scope - critical fields for offline functionality
    this.syncScopes.set('offline', {
      name: 'offline',
      description: 'Critical fields for offline functionality',
      includedFields: new Set(['id', 'name', 'status', 'localData', 'syncStatus']),
      excludedFields: new Set(['remoteOnly', 'analytics', 'logs']),
      priorityFields: new Set(['id', 'syncStatus']),
      conditions: {
        networkType: ['offline', 'slow-2g', '2g']
      }
    });
  }

  private startPatternAnalysis(): void {
    // Analyze access patterns every 5 minutes
    setInterval(() => {
      this.analyzeAccessPatterns();
      this.predictFieldAccess();
      this.optimizeSyncScopes();
    }, 5 * 60 * 1000);
  }

  // Track field changes
  trackFieldChange(change: FieldChangeEvent): void {
    const key = `${change.entityType}:${change.entityId}`;
    if (!this.fieldChanges.has(key)) {
      this.fieldChanges.set(key, []);
    }
    this.fieldChanges.get(key)!.push(change);

    // Update field metadata
    this.updateFieldMetadata(change);

    // Track access pattern
    this.trackFieldAccess(change.entityType, change.fieldName, 'write');

    // Emit change event
    eventEmitter.emit(SyncEvents.FIELD_CHANGED, {
      entityType: change.entityType,
      entityId: change.entityId,
      fieldName: change.fieldName,
      timestamp: change.timestamp
    });
  }

  // Track field access for pattern analysis
  trackFieldAccess(entityType: string, fieldName: string, accessType: 'read' | 'write'): void {
    if (!this.fieldAccessPatterns.has(entityType)) {
      this.fieldAccessPatterns.set(entityType, new Map());
    }

    const patterns = this.fieldAccessPatterns.get(entityType)!;
    if (!patterns.has(fieldName)) {
      patterns.set(fieldName, {
        fieldName,
        accessCount: 0,
        readCount: 0,
        writeCount: 0,
        averageAccessInterval: 0,
        lastAccessTime: Date.now(),
        accessHeatmap: new Map()
      });
    }

    const pattern = patterns.get(fieldName)!;
    pattern.accessCount++;
    if (accessType === 'read') {
      pattern.readCount++;
    } else {
      pattern.writeCount++;
    }

    // Update access interval
    const now = Date.now();
    if (pattern.lastAccessTime > 0) {
      const interval = now - pattern.lastAccessTime;
      pattern.averageAccessInterval = 
        (pattern.averageAccessInterval * (pattern.accessCount - 1) + interval) / pattern.accessCount;
    }
    pattern.lastAccessTime = now;

    // Update heatmap
    const hour = new Date().getHours();
    pattern.accessHeatmap.set(hour, (pattern.accessHeatmap.get(hour) || 0) + 1);
  }

  // Sync only changed fields
  async syncChangedFields(
    entityType: string,
    entityId: string,
    entity: Record<string, unknown>,
    config?: Partial<FieldSyncConfig>
  ): Promise<FieldSyncResult> {
    const startTime = Date.now();
    const mergedConfig = { ...this.config, ...config };
    const key = `${entityType}:${entityId}`;
    
    // Get field changes
    const changes = this.fieldChanges.get(key) || [];
    if (changes.length === 0 && !config?.syncScope) {
      return {
        syncedFields: [],
        skippedFields: [],
        bytesTransferred: 0,
        bytesSaved: 0,
        compressionRatio: 1,
        syncDuration: 0,
        conflicts: []
      };
    }

    // Determine fields to sync
    const fieldsToSync = await this.determineFieldsToSync(
      entityType,
      entity,
      changes,
      mergedConfig
    );

    // Prepare field data
    const fieldData: Record<string, unknown> = {};
    const skippedFields: string[] = [];
    let originalSize = 0;
    let compressedSize = 0;

    for (const field of Object.keys(entity)) {
      if (fieldsToSync.has(field)) {
        const fieldValue = entity[field];
        const metadata = this.getFieldMetadata(entityType, field);
        
        // Handle large fields
        if (metadata.isLargeField) {
          const optimized = await this.optimizeLargeField(field, fieldValue, metadata);
          fieldData[field] = optimized.value;
          originalSize += optimized.originalSize;
          compressedSize += optimized.compressedSize;
        } else {
          fieldData[field] = fieldValue;
          const size = JSON.stringify(fieldValue).length;
          originalSize += size;
          compressedSize += size;
        }
      } else {
        skippedFields.push(field);
      }
    }

    // Apply compression if beneficial
    if (originalSize > mergedConfig.compressionThreshold) {
      const compressed = await this.compressionService.compress(fieldData);
      compressedSize = compressed.compressedSize;
    }

    // Track bandwidth usage
    this.trackBandwidthUsage(entityType, fieldsToSync, compressedSize);

    // Clear processed changes
    this.fieldChanges.delete(key);

    const syncDuration = Date.now() - startTime;
    
    return {
      syncedFields: Array.from(fieldsToSync),
      skippedFields,
      bytesTransferred: compressedSize,
      bytesSaved: originalSize - compressedSize,
      compressionRatio: originalSize / compressedSize,
      syncDuration,
      conflicts: []
    };
  }

  // Determine which fields to sync based on configuration and patterns
  private async determineFieldsToSync(
    entityType: string,
    entity: Record<string, unknown>,
    changes: FieldChangeEvent[],
    config: FieldSyncConfig
  ): Promise<Set<string>> {
    const fieldsToSync = new Set<string>();
    const scope = this.getSyncScope(config.syncScope);

    // Add changed fields
    changes.forEach(change => {
      if (!scope.excludedFields.has(change.fieldName)) {
        fieldsToSync.add(change.fieldName);
      }
    });

    // Add priority fields
    scope.priorityFields.forEach(field => {
      if (field in entity) {
        fieldsToSync.add(field);
      }
    });

    // Add frequently accessed fields
    const patterns = this.fieldAccessPatterns.get(entityType);
    if (patterns) {
      patterns.forEach((pattern, fieldName) => {
        if (this.isFrequentlyAccessed(pattern) && 
            !scope.excludedFields.has(fieldName) &&
            fieldName in entity) {
          fieldsToSync.add(fieldName);
        }
      });
    }

    // Apply included fields filter
    if (config.includedFields && config.includedFields.length > 0) {
      const included = new Set(config.includedFields);
      fieldsToSync.forEach(field => {
        if (!included.has(field)) {
          fieldsToSync.delete(field);
        }
      });
    }

    // Apply excluded fields filter
    if (config.excludedFields) {
      config.excludedFields.forEach(field => fieldsToSync.delete(field));
    }

    return fieldsToSync;
  }

  // Get or create field metadata
  private getFieldMetadata(entityType: string, fieldName: string): FieldMetadata {
    if (!this.fieldMetadata.has(entityType)) {
      this.fieldMetadata.set(entityType, new Map());
    }

    const typeMetadata = this.fieldMetadata.get(entityType)!;
    if (!typeMetadata.has(fieldName)) {
      typeMetadata.set(fieldName, {
        name: fieldName,
        type: 'string',
        size: 0,
        lastModified: Date.now(),
        accessCount: 0,
        lastAccessTime: Date.now(),
        syncPriority: 1,
        isLargeField: false,
        isFrequentlyAccessed: false,
        isDirty: false
      });
    }

    return typeMetadata.get(fieldName)!;
  }

  // Update field metadata based on changes
  private updateFieldMetadata(change: FieldChangeEvent): void {
    const metadata = this.getFieldMetadata(change.entityType, change.fieldName);
    
    metadata.lastModified = change.timestamp;
    metadata.isDirty = true;
    
    // Detect field type
    const valueType = this.detectFieldType(change.newValue);
    metadata.type = valueType;
    
    // Calculate size
    const size = this.calculateFieldSize(change.newValue);
    metadata.size = size;
    metadata.isLargeField = size > this.config.largeFieldThreshold;
    
    // Update access count
    metadata.accessCount++;
    metadata.lastAccessTime = change.timestamp;
  }

  // Detect field type for optimization
  private detectFieldType(value: unknown): FieldMetadata['type'] {
    if (value === null || value === undefined) return 'string';
    
    if (typeof value === 'string') {
      // Check for base64 encoded data
      if (this.isBase64(value)) {
        if (this.isImageData(value)) return 'image';
        if (this.isDocumentData(value)) return 'document';
        return 'binary';
      }
      return 'string';
    }
    
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    
    return 'string';
  }

  // Calculate field size in bytes
  private calculateFieldSize(value: unknown): number {
    if (value === null || value === undefined) return 0;
    
    if (typeof value === 'string') {
      return new Blob([value]).size;
    }
    
    return new Blob([JSON.stringify(value)]).size;
  }

  // Check if string is base64 encoded
  private isBase64(str: string): boolean {
    try {
      return btoa(atob(str)) === str;
    } catch {
      return false;
    }
  }

  // Check if base64 data is an image
  private isImageData(base64: string): boolean {
    const imageHeaders = [
      'data:image/jpeg',
      'data:image/png',
      'data:image/gif',
      'data:image/webp'
    ];
    return imageHeaders.some(header => base64.startsWith(header));
  }

  // Check if base64 data is a document
  private isDocumentData(base64: string): boolean {
    const docHeaders = [
      'data:application/pdf',
      'data:application/msword',
      'data:application/vnd.openxmlformats'
    ];
    return docHeaders.some(header => base64.startsWith(header));
  }

  // Optimize large fields for transmission
  private async optimizeLargeField(
    fieldName: string,
    value: unknown,
    metadata: FieldMetadata
  ): Promise<{ value: unknown; originalSize: number; compressedSize: number }> {
    const originalSize = this.calculateFieldSize(value);

    // Handle different field types
    switch (metadata.type) {
      case 'image':
        return await this.optimizeImageField(fieldName, value as string);
      
      case 'document':
        return await this.optimizeDocumentField(fieldName, value);
      
      case 'binary':
        return await this.optimizeBinaryField(fieldName, value);
      
      case 'array':
      case 'object':
        if (originalSize > this.config.compressionThreshold) {
          const compressed = await this.compressionService.compress(value);
          return {
            value: compressed.compressed,
            originalSize,
            compressedSize: compressed.compressedSize
          };
        }
        break;
    }

    return { value, originalSize, compressedSize: originalSize };
  }

  // Optimize image fields
  private async optimizeImageField(
    fieldName: string,
    value: string
  ): Promise<{ value: unknown; originalSize: number; compressedSize: number }> {
    const originalSize = this.calculateFieldSize(value);

    // For now, return a reference instead of the full image
    // In a real implementation, this would upload to CDN and return URL
    return {
      value: {
        type: 'image_reference',
        fieldName,
        size: originalSize,
        placeholder: value.substring(0, 100) + '...',
        fullDataUrl: '/api/fields/image/' + fieldName
      },
      originalSize,
      compressedSize: 200 // Size of reference object
    };
  }

  // Optimize document fields
  private async optimizeDocumentField(
    fieldName: string,
    value: unknown
  ): Promise<{ value: unknown; originalSize: number; compressedSize: number }> {
    const originalSize = this.calculateFieldSize(value);
    
    // Compress document data
    const compressed = await this.compressionService.compress(value);
    
    return {
      value: compressed.compressed,
      originalSize,
      compressedSize: compressed.compressedSize
    };
  }

  // Optimize binary fields
  private async optimizeBinaryField(
    fieldName: string,
    value: unknown
  ): Promise<{ value: unknown; originalSize: number; compressedSize: number }> {
    const originalSize = this.calculateFieldSize(value);
    
    // Apply aggressive compression for binary data
    const compressed = await this.compressionService.compress(value);
    
    return {
      value: compressed.compressed,
      originalSize,
      compressedSize: compressed.compressedSize
    };
  }

  // Check if field is frequently accessed
  private isFrequentlyAccessed(pattern: FieldAccessPattern): boolean {
    const hoursSinceLastAccess = (Date.now() - pattern.lastAccessTime) / (1000 * 60 * 60);
    const accessesPerHour = pattern.accessCount / Math.max(hoursSinceLastAccess, 1);
    
    return accessesPerHour > this.config.accessFrequencyThreshold;
  }

  // Analyze field access patterns
  private analyzeAccessPatterns(): void {
    this.fieldAccessPatterns.forEach((patterns, entityType) => {
      patterns.forEach((pattern, fieldName) => {
        // Update metadata based on patterns
        const metadata = this.getFieldMetadata(entityType, fieldName);
        metadata.isFrequentlyAccessed = this.isFrequentlyAccessed(pattern);
        
        // Calculate sync priority based on access patterns
        const readWriteRatio = pattern.readCount / Math.max(pattern.writeCount, 1);
        const accessFrequency = pattern.accessCount / Math.max(
          (Date.now() - pattern.lastAccessTime) / (1000 * 60 * 60), 
          1
        );
        
        metadata.syncPriority = Math.min(
          Math.round(accessFrequency * readWriteRatio),
          10
        );
      });
    });
  }

  // Predict future field access using simple heuristics
  private predictFieldAccess(): void {
    this.fieldAccessPatterns.forEach((patterns, entityType) => {
      patterns.forEach((pattern, fieldName) => {
        if (pattern.accessCount < 10) return; // Not enough data
        
        // Simple prediction based on average interval
        if (pattern.averageAccessInterval > 0) {
          pattern.predictedNextAccess = pattern.lastAccessTime + pattern.averageAccessInterval;
        }
        
        // Adjust based on time-of-day patterns
        const currentHour = new Date().getHours();
        let maxAccessHour = currentHour;
        let maxAccessCount = 0;
        
        pattern.accessHeatmap.forEach((count, hour) => {
          if (count > maxAccessCount) {
            maxAccessCount = count;
            maxAccessHour = hour;
          }
        });
        
        // If we're approaching a high-access hour, prepare for it
        if (Math.abs(currentHour - maxAccessHour) <= 1) {
          const metadata = this.getFieldMetadata(entityType, fieldName);
          metadata.syncPriority = Math.min(metadata.syncPriority * 1.5, 10);
        }
      });
    });
  }

  // Optimize sync scopes based on patterns
  private optimizeSyncScopes(): void {
    // Create dynamic scopes based on access patterns
    const frequentFields = new Set<string>();
    const rareFields = new Set<string>();
    
    this.fieldAccessPatterns.forEach((patterns) => {
      patterns.forEach((pattern, fieldName) => {
        if (this.isFrequentlyAccessed(pattern)) {
          frequentFields.add(fieldName);
        } else if (pattern.accessCount < 5) {
          rareFields.add(fieldName);
        }
      });
    });
    
    // Update dynamic scope
    this.syncScopes.set('dynamic', {
      name: 'dynamic',
      description: 'Dynamically optimized scope based on usage patterns',
      includedFields: frequentFields,
      excludedFields: rareFields,
      priorityFields: new Set(
        Array.from(frequentFields)
          .slice(0, 10) // Top 10 most accessed fields
      )
    });
  }

  // Get sync scope by name
  private getSyncScope(scopeName: string): FieldSyncScope {
    return this.syncScopes.get(scopeName) || this.syncScopes.get('standard')!;
  }

  // Track bandwidth usage
  private trackBandwidthUsage(
    entityType: string,
    fields: Set<string>,
    bytesTransferred: number
  ): void {
    fields.forEach(fieldName => {
      const key = `${entityType}:${fieldName}`;
      if (!this.bandwidthUsage.has(key)) {
        this.bandwidthUsage.set(key, {
          fieldName,
          bytesTransferred: 0,
          compressedBytes: 0,
          syncCount: 0,
          averageSize: 0,
          totalTime: 0,
          bandwidthSaved: 0
        });
      }
      
      const usage = this.bandwidthUsage.get(key)!;
      usage.bytesTransferred += bytesTransferred / fields.size; // Distribute evenly
      usage.syncCount++;
      usage.averageSize = usage.bytesTransferred / usage.syncCount;
    });
  }

  // Get bandwidth report
  getBandwidthReport(entityType?: string): Map<string, BandwidthUsage> {
    if (entityType) {
      const filtered = new Map<string, BandwidthUsage>();
      this.bandwidthUsage.forEach((usage, key) => {
        if (key.startsWith(entityType + ':')) {
          filtered.set(key, usage);
        }
      });
      return filtered;
    }
    return new Map(this.bandwidthUsage);
  }

  // Get field access patterns
  getAccessPatterns(entityType: string): Map<string, FieldAccessPattern> {
    return this.fieldAccessPatterns.get(entityType) || new Map();
  }

  // Configure sync behavior
  configure(config: Partial<FieldSyncConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Create custom sync scope
  createSyncScope(
    name: string,
    scope: Omit<FieldSyncScope, 'name'>
  ): void {
    this.syncScopes.set(name, {
      name,
      ...scope
    });
  }

  // Get optimization recommendations
  getOptimizationRecommendations(entityType: string): string[] {
    const recommendations: string[] = [];
    const patterns = this.fieldAccessPatterns.get(entityType);
    
    if (!patterns) return recommendations;
    
    // Analyze patterns for recommendations
    patterns.forEach((pattern, fieldName) => {
      const metadata = this.getFieldMetadata(entityType, fieldName);
      
      // Large fields that are rarely accessed
      if (metadata.isLargeField && !metadata.isFrequentlyAccessed) {
        recommendations.push(
          `Consider lazy loading field '${fieldName}' - it's large (${metadata.size} bytes) but rarely accessed`
        );
      }
      
      // Fields with high write/read ratio
      if (pattern.writeCount > pattern.readCount * 2) {
        recommendations.push(
          `Field '${fieldName}' has high write frequency - consider batching updates`
        );
      }
      
      // Fields that could benefit from compression
      if (metadata.size > this.config.compressionThreshold && 
          metadata.type === 'object' || metadata.type === 'array') {
        recommendations.push(
          `Enable compression for field '${fieldName}' to save bandwidth`
        );
      }
    });
    
    return recommendations;
  }

  // Reset service state
  reset(): void {
    this.fieldMetadata.clear();
    this.fieldAccessPatterns.clear();
    this.fieldChanges.clear();
    this.bandwidthUsage.clear();
    this.initializeDefaultScopes();
  }
}

// Export singleton instance
export const fieldLevelSync = FieldLevelSyncService.getInstance();