import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FieldLevelSyncService } from '../../../services/sync/FieldLevelSyncService';
import { DifferentialSyncService } from '../../../services/sync/DifferentialSyncService';
import { CompressionService } from '../../../services/compression/CompressionService';
import { BatchProcessor } from '../../../services/sync/BatchProcessor';

// Mock dependencies
vi.mock('../../../services/sync/DifferentialSyncService');
vi.mock('../../../services/compression/CompressionService');
vi.mock('../../../services/sync/BatchProcessor');
vi.mock('../../../services/sync/eventEmitter');

describe('FieldLevelSyncService', () => {
  let service: FieldLevelSyncService;
  let mockDifferentialSync: {
    generateDiff: ReturnType<typeof vi.fn>;
    applyDiff: ReturnType<typeof vi.fn>;
  };
  let mockCompressionService: {
    compress: ReturnType<typeof vi.fn>;
    decompress: ReturnType<typeof vi.fn>;
    getCompressionStats: ReturnType<typeof vi.fn>;
  };
  let mockBatchProcessor: {
    addToBatch: ReturnType<typeof vi.fn>;
    processBatch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Setup mock instances
    mockDifferentialSync = {
      generateDiff: vi.fn(),
      applyDiff: vi.fn()
    };
    
    mockCompressionService = {
      compress: vi.fn().mockResolvedValue({
        compressed: 'compressed_data',
        compressedSize: 100,
        originalSize: 500,
        compressionRatio: 5
      })
    };
    
    mockBatchProcessor = {
      addToBatch: vi.fn(),
      processBatch: vi.fn()
    };

    // Mock getInstance methods
    (DifferentialSyncService.getInstance as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockDifferentialSync);
    (CompressionService.getInstance as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockCompressionService);
    // Mock BatchProcessor constructor
    vi.mocked(BatchProcessor).mockImplementation(() => mockBatchProcessor as typeof mockBatchProcessor);

    // Get service instance
    service = FieldLevelSyncService.getInstance();
  });

  afterEach(() => {
    service.reset();
  });

  describe('Field Change Tracking', () => {
    it('should track field changes', () => {
      const change = {
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'name',
        oldValue: 'Buddy',
        newValue: 'Max',
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      };

      service.trackFieldChange(change);

      // Verify patterns are tracked
      const patterns = service.getAccessPatterns('dogs');
      expect(patterns.has('name')).toBe(true);
      
      const pattern = patterns.get('name')!;
      expect(pattern.writeCount).toBe(1);
      expect(pattern.accessCount).toBe(1);
    });

    it('should update field metadata on change', () => {
      const change = {
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'description',
        oldValue: 'Short description',
        newValue: 'This is a much longer description that should trigger different handling',
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      };

      service.trackFieldChange(change);

      // Field should be tracked in patterns
      const patterns = service.getAccessPatterns('dogs');
      expect(patterns.has('description')).toBe(true);
    });

    it('should track multiple changes to same field', () => {
      const baseChange = {
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'status',
        userId: 'user1',
        deviceId: 'device1'
      };

      // Track multiple changes
      service.trackFieldChange({
        ...baseChange,
        oldValue: 'active',
        newValue: 'pending',
        timestamp: Date.now()
      });

      service.trackFieldChange({
        ...baseChange,
        oldValue: 'pending',
        newValue: 'approved',
        timestamp: Date.now() + 1000
      });

      const patterns = service.getAccessPatterns('dogs');
      const pattern = patterns.get('status')!;
      expect(pattern.writeCount).toBe(2);
      expect(pattern.accessCount).toBe(2);
    });
  });

  describe('Field Access Pattern Analysis', () => {
    it('should track read access patterns', () => {
      service.trackFieldAccess('dogs', 'name', 'read');
      service.trackFieldAccess('dogs', 'name', 'read');
      service.trackFieldAccess('dogs', 'name', 'write');

      const patterns = service.getAccessPatterns('dogs');
      const pattern = patterns.get('name')!;
      
      expect(pattern.readCount).toBe(2);
      expect(pattern.writeCount).toBe(1);
      expect(pattern.accessCount).toBe(3);
    });

    it('should calculate average access intervals', async () => {
      const delays = [100, 200, 150]; // milliseconds
      
      for (let i = 0; i < delays.length; i++) {
        service.trackFieldAccess('dogs', 'breed', 'read');
        if (i < delays.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delays[i]));
        }
      }

      const patterns = service.getAccessPatterns('dogs');
      const pattern = patterns.get('breed')!;
      
      expect(pattern.averageAccessInterval).toBeGreaterThan(0);
      expect(pattern.accessCount).toBe(3);
    });

    it('should track hourly access patterns', () => {
      const currentHour = new Date().getHours();
      
      // Track multiple accesses
      for (let i = 0; i < 5; i++) {
        service.trackFieldAccess('dogs', 'photos', 'read');
      }

      const patterns = service.getAccessPatterns('dogs');
      const pattern = patterns.get('photos')!;
      
      expect(pattern.accessHeatmap.get(currentHour)).toBe(5);
    });
  });

  describe('Selective Field Sync', () => {
    it('should sync only changed fields by default', async () => {
      const entity = {
        id: 'dog1',
        name: 'Buddy',
        breed: 'Golden Retriever',
        age: 3,
        status: 'active'
      };

      // Track changes to specific fields
      service.trackFieldChange({
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'name',
        oldValue: 'Max',
        newValue: 'Buddy',
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      });

      const result = await service.syncChangedFields('dogs', 'dog1', entity);
      
      expect(result.syncedFields).toContain('name');
      expect(result.syncedFields.length).toBeGreaterThanOrEqual(1);
      expect(result.skippedFields.length).toBeGreaterThan(0);
    });

    it('should respect included fields configuration', async () => {
      const entity = {
        id: 'dog1',
        name: 'Buddy',
        breed: 'Golden Retriever',
        age: 3,
        description: 'A friendly dog'
      };

      const result = await service.syncChangedFields('dogs', 'dog1', entity, {
        includedFields: ['id', 'name'],
        syncScope: 'custom'
      });

      expect(result.syncedFields).toEqual(expect.arrayContaining(['id', 'name']));
      expect(result.skippedFields).toContain('breed');
      expect(result.skippedFields).toContain('age');
    });

    it('should respect excluded fields configuration', async () => {
      const entity = {
        id: 'dog1',
        name: 'Buddy',
        largePhoto: 'base64_image_data_here',
        thumbnail: 'small_image'
      };

      // Track all fields as changed
      Object.keys(entity).forEach(fieldName => {
        if (fieldName !== 'id') {
          service.trackFieldChange({
            entityType: 'dogs',
            entityId: 'dog1',
            fieldName,
            oldValue: null,
            newValue: entity[fieldName as keyof typeof entity],
            timestamp: Date.now(),
            userId: 'user1',
            deviceId: 'device1'
          });
        }
      });

      const result = await service.syncChangedFields('dogs', 'dog1', entity, {
        excludedFields: ['largePhoto'],
        syncScope: 'custom'
      });

      expect(result.syncedFields).not.toContain('largePhoto');
      expect(result.skippedFields).toContain('largePhoto');
    });
  });

  describe('Large Field Optimization', () => {
    it('should detect and optimize image fields', async () => {
      const largeImageData = 'data:image/jpeg;base64,' + 'A'.repeat(20000);
      const entity = {
        id: 'dog1',
        name: 'Buddy',
        photo: largeImageData
      };

      service.trackFieldChange({
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'photo',
        oldValue: null,
        newValue: largeImageData,
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      });

      const result = await service.syncChangedFields('dogs', 'dog1', entity);
      
      expect(result.bytesSaved).toBeGreaterThan(0);
      expect(result.bytesTransferred).toBeLessThan(20000);
    });

    it('should compress large JSON fields', async () => {
      const largeObject = {
        data: Array(1000).fill({ name: 'test', value: 123 })
      };
      
      const entity = {
        id: 'dog1',
        metadata: largeObject
      };

      service.trackFieldChange({
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'metadata',
        oldValue: {},
        newValue: largeObject,
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      });

      const result = await service.syncChangedFields('dogs', 'dog1', entity);
      
      expect(mockCompressionService.compress).toHaveBeenCalled();
      expect(result.compressionRatio).toBeGreaterThan(1);
    });
  });

  describe('Sync Scopes', () => {
    it('should use minimal scope correctly', async () => {
      const entity = {
        id: 'dog1',
        name: 'Buddy',
        status: 'active',
        largeContent: 'A'.repeat(10000),
        images: ['image1', 'image2']
      };

      // Mark all fields as changed
      Object.keys(entity).forEach(field => {
        service.trackFieldChange({
          entityType: 'dogs',
          entityId: 'dog1',
          fieldName: field,
          oldValue: null,
          newValue: entity[field as keyof typeof entity],
          timestamp: Date.now(),
          userId: 'user1',
          deviceId: 'device1'
        });
      });

      const result = await service.syncChangedFields('dogs', 'dog1', entity, {
        syncScope: 'minimal'
      });

      expect(result.syncedFields).toContain('id');
      expect(result.syncedFields).toContain('status');
      expect(result.skippedFields).toContain('largeContent');
      expect(result.skippedFields).toContain('images');
    });

    it('should create and use custom sync scope', async () => {
      // Create custom scope
      service.createSyncScope('custom-test', {
        description: 'Test custom scope',
        includedFields: new Set(['id', 'customField']),
        excludedFields: new Set(['sensitiveData']),
        priorityFields: new Set(['id'])
      });

      const entity = {
        id: 'dog1',
        customField: 'value',
        sensitiveData: 'secret',
        normalField: 'data'
      };

      service.trackFieldChange({
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'customField',
        oldValue: null,
        newValue: 'value',
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      });

      const result = await service.syncChangedFields('dogs', 'dog1', entity, {
        syncScope: 'custom-test'
      });

      expect(result.syncedFields).toContain('customField');
      expect(result.skippedFields).toContain('sensitiveData');
    });
  });

  describe('Bandwidth Tracking and Reporting', () => {
    it('should track bandwidth usage per field', async () => {
      const entity = {
        id: 'dog1',
        name: 'Buddy',
        description: 'A friendly golden retriever'
      };

      service.trackFieldChange({
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'description',
        oldValue: '',
        newValue: entity.description,
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      });

      await service.syncChangedFields('dogs', 'dog1', entity);

      const report = service.getBandwidthReport('dogs');
      expect(report.size).toBeGreaterThan(0);
      
      const usage = Array.from(report.values())[0];
      expect(usage.bytesTransferred).toBeGreaterThan(0);
      expect(usage.syncCount).toBe(1);
    });

    it('should provide bandwidth report for all entity types', async () => {
      // Sync data for multiple entity types
      const dogEntity = { id: 'dog1', name: 'Buddy' };
      const showEntity = { id: 'show1', title: 'Dog Show 2024' };

      service.trackFieldChange({
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'name',
        oldValue: null,
        newValue: 'Buddy',
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      });

      service.trackFieldChange({
        entityType: 'shows',
        entityId: 'show1',
        fieldName: 'title',
        oldValue: null,
        newValue: 'Dog Show 2024',
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      });

      await service.syncChangedFields('dogs', 'dog1', dogEntity);
      await service.syncChangedFields('shows', 'show1', showEntity);

      const fullReport = service.getBandwidthReport();
      expect(fullReport.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Optimization Recommendations', () => {
    it('should recommend lazy loading for large rarely accessed fields', () => {
      // Track a large field with low access
      service.trackFieldChange({
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'fullHistory',
        oldValue: null,
        newValue: 'A'.repeat(15000), // Large data
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      });

      const recommendations = service.getOptimizationRecommendations('dogs');
      
      expect(recommendations.some(r => 
        r.includes('lazy loading') && r.includes('fullHistory')
      )).toBe(true);
    });

    it('should recommend batching for high-write fields', () => {
      // Simulate high write frequency
      for (let i = 0; i < 10; i++) {
        service.trackFieldAccess('dogs', 'lastModified', 'write');
      }
      
      // Low read frequency
      service.trackFieldAccess('dogs', 'lastModified', 'read');

      const recommendations = service.getOptimizationRecommendations('dogs');
      
      expect(recommendations.some(r => 
        r.includes('batching') && r.includes('lastModified')
      )).toBe(true);
    });

    it('should recommend compression for large object fields', () => {
      const largeObject = { data: Array(100).fill({ key: 'value' }) };
      
      service.trackFieldChange({
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'metadata',
        oldValue: {},
        newValue: largeObject,
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      });

      const recommendations = service.getOptimizationRecommendations('dogs');
      
      expect(recommendations.some(r => 
        r.includes('compression') && r.includes('metadata')
      )).toBe(true);
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle high-frequency field updates efficiently', async () => {
      const startTime = Date.now();
      const updateCount = 1000;

      // Simulate rapid field updates
      for (let i = 0; i < updateCount; i++) {
        service.trackFieldChange({
          entityType: 'dogs',
          entityId: `dog${i % 10}`,
          fieldName: `field${i % 5}`,
          oldValue: i,
          newValue: i + 1,
          timestamp: Date.now(),
          userId: 'user1',
          deviceId: 'device1'
        });
      }

      const duration = Date.now() - startTime;
      
      // Should process 1000 updates in under 100ms
      expect(duration).toBeLessThan(100);
      
      // Verify patterns were tracked
      const patterns = service.getAccessPatterns('dogs');
      expect(patterns.size).toBe(5); // 5 unique fields
    });

    it('should sync multiple entities efficiently', async () => {
      const entities = Array(10).fill(null).map((_, i) => ({
        id: `dog${i}`,
        name: `Dog ${i}`,
        breed: 'Mixed',
        age: i
      }));

      // Track changes for all entities
      entities.forEach(entity => {
        service.trackFieldChange({
          entityType: 'dogs',
          entityId: entity.id,
          fieldName: 'name',
          oldValue: null,
          newValue: entity.name,
          timestamp: Date.now(),
          userId: 'user1',
          deviceId: 'device1'
        });
      });

      const startTime = Date.now();
      
      // Sync all entities
      const results = await Promise.all(
        entities.map(entity => 
          service.syncChangedFields('dogs', entity.id, entity)
        )
      );

      const duration = Date.now() - startTime;
      
      // Should sync 10 entities in under 50ms
      expect(duration).toBeLessThan(50);
      expect(results).toHaveLength(10);
      expect(results.every(r => r.syncedFields.length > 0)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined field values', async () => {
      const entity = {
        id: 'dog1',
        name: null,
        breed: undefined,
        age: 0
      };

      service.trackFieldChange({
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'name',
        oldValue: 'Buddy',
        newValue: null,
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      });

      const result = await service.syncChangedFields('dogs', 'dog1', entity);
      
      expect(result.syncedFields).toContain('name');
      expect(result.bytesTransferred).toBeGreaterThanOrEqual(0);
    });

    it('should handle circular references in objects', async () => {
      const entity: Record<string, unknown> = {
        id: 'dog1',
        name: 'Buddy'
      };
      // Create circular reference
      entity.self = entity;

      service.trackFieldChange({
        entityType: 'dogs',
        entityId: 'dog1',
        fieldName: 'self',
        oldValue: null,
        newValue: entity,
        timestamp: Date.now(),
        userId: 'user1',
        deviceId: 'device1'
      });

      // Should not throw error
      await expect(
        service.syncChangedFields('dogs', 'dog1', entity)
      ).resolves.toBeDefined();
    });

    it('should handle empty sync with no changes', async () => {
      const entity = {
        id: 'dog1',
        name: 'Buddy'
      };

      // No changes tracked
      const result = await service.syncChangedFields('dogs', 'dog1', entity);
      
      expect(result.syncedFields).toHaveLength(0);
      expect(result.bytesTransferred).toBe(0);
      expect(result.syncDuration).toBe(0);
    });
  });
});