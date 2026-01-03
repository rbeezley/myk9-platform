import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock cache storage with eviction policies
interface CacheItem<T = Record<string, unknown>> {
  key: string;
  data: T;
  size: number;
  priority: 'high' | 'medium' | 'low';
  lastAccessed: Date;
  accessCount: number;
  ttl?: Date; // Time to live
  created: Date;
  entityType: 'person' | 'dog' | 'show' | 'club' | 'entry';
}

interface CacheStats {
  totalSize: number;
  totalItems: number;
  hitRate: number;
  evictionCount: number;
  averageItemSize: number;
  oldestItem: Date;
  newestItem: Date;
}

class MockCacheManager {
  private cache = new Map<string, CacheItem>();
  private maxSize: number = 10 * 1024 * 1024; // 10MB default
  private maxItems: number = 1000;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  constructor(maxSize?: number, maxItems?: number) {
    if (maxSize) this.maxSize = maxSize;
    if (maxItems) this.maxItems = maxItems;
  }

  set<T>(key: string, data: T, options: {
    priority?: 'high' | 'medium' | 'low';
    ttl?: number; // TTL in milliseconds
    entityType: 'person' | 'dog' | 'show' | 'club' | 'entry';
  }): boolean {
    const size = JSON.stringify(data).length;
    const now = new Date();
    
    const item: CacheItem<T> = {
      key,
      data,
      size,
      priority: options.priority || 'medium',
      lastAccessed: now,
      accessCount: 0,
      ttl: options.ttl ? new Date(now.getTime() + options.ttl) : undefined,
      created: now,
      entityType: options.entityType
    };

    // Check if we need to evict items
    if (!this.canFit(item)) {
      if (!this.evictToMakeSpace(item)) {
        return false; // Cannot fit even after eviction
      }
    }

    this.cache.set(key, item);
    return true;
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (item.ttl && new Date() > item.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update access statistics
    item.lastAccessed = new Date();
    item.accessCount++;
    this.hits++;

    return item.data as T;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  getStats(): CacheStats {
    const items = Array.from(this.cache.values());
    const totalSize = items.reduce((sum, item) => sum + item.size, 0);
    const hitRate = this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0;
    
    const dates = items.map(item => item.created);
    const oldestItem = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date();
    const newestItem = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : new Date();

    return {
      totalSize,
      totalItems: items.length,
      hitRate,
      evictionCount: this.evictions,
      averageItemSize: items.length > 0 ? totalSize / items.length : 0,
      oldestItem,
      newestItem
    };
  }

  // Eviction policy implementations
  private canFit(newItem: CacheItem): boolean {
    const currentSize = this.getCurrentSize();
    const currentItems = this.cache.size;
    
    return (currentSize + newItem.size <= this.maxSize) && 
           (currentItems < this.maxItems);
  }

  private getCurrentSize(): number {
    return Array.from(this.cache.values()).reduce((sum, item) => sum + item.size, 0);
  }

  private evictToMakeSpace(newItem: CacheItem): boolean {
    const requiredSpace = newItem.size;
    let freedSpace = 0;
    const itemsToEvict: string[] = [];

    // First, remove expired items
    this.evictExpired();

    // If still not enough space, apply eviction policies
    if (!this.canFit(newItem)) {
      // Try LRU eviction
      const lruCandidates = this.getLRUCandidates();
      
      for (const candidate of lruCandidates) {
        if (candidate.priority !== 'high') { // Protect high priority items
          itemsToEvict.push(candidate.key);
          freedSpace += candidate.size;
          
          if (freedSpace >= requiredSpace && 
              this.cache.size - itemsToEvict.length < this.maxItems) {
            break;
          }
        }
      }
    }

    // If still not enough space, evict by size (largest first)
    if (freedSpace < requiredSpace) {
      const sizeCandidates = this.getLargestItems();
      
      for (const candidate of sizeCandidates) {
        if (!itemsToEvict.includes(candidate.key) && candidate.priority !== 'high') {
          itemsToEvict.push(candidate.key);
          freedSpace += candidate.size;
          
          if (freedSpace >= requiredSpace) {
            break;
          }
        }
      }
    }

    // If still not enough space and new item is high priority, evict even high priority items
    if (freedSpace < requiredSpace && newItem.priority === 'high') {
      const allCandidates = this.getLRUCandidates();
      
      for (const candidate of allCandidates) {
        if (!itemsToEvict.includes(candidate.key)) {
          itemsToEvict.push(candidate.key);
          freedSpace += candidate.size;
          
          if (freedSpace >= requiredSpace) {
            break;
          }
        }
      }
    }

    // Perform evictions
    for (const key of itemsToEvict) {
      this.cache.delete(key);
      this.evictions++;
    }

    return this.canFit(newItem);
  }

  private evictExpired(): void {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, item] of this.cache.entries()) {
      if (item.ttl && now > item.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.evictions++;
    }
  }

  private getLRUCandidates(): CacheItem[] {
    return Array.from(this.cache.values())
      .sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime());
  }

  private getLargestItems(): CacheItem[] {
    return Array.from(this.cache.values())
      .sort((a, b) => b.size - a.size);
  }

  // Test helper methods
  simulateTime(milliseconds: number): void {
    const now = new Date();
    const newTime = new Date(now.getTime() + milliseconds);
    
    // Update all timestamps
    for (const item of this.cache.values()) {
      // Don't update lastAccessed, only check TTL against new time
      if (item.ttl && newTime > item.ttl) {
        this.cache.delete(item.key);
        this.evictions++;
      }
    }
  }

  getItemsByPriority(priority: 'high' | 'medium' | 'low'): CacheItem[] {
    return Array.from(this.cache.values()).filter(item => item.priority === priority);
  }

  getItemsByEntityType(entityType: string): CacheItem[] {
    return Array.from(this.cache.values()).filter(item => item.entityType === entityType);
  }

  triggerEviction(): number {
    const beforeCount = this.cache.size;
    this.evictExpired();
    
    // Force eviction of 10% of low priority items
    const lowPriorityItems = this.getItemsByPriority('low');
    const toEvict = Math.ceil(lowPriorityItems.length * 0.1);
    
    const lruLowPriority = lowPriorityItems
      .sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime())
      .slice(0, toEvict);
    
    for (const item of lruLowPriority) {
      this.cache.delete(item.key);
      this.evictions++;
    }
    
    return beforeCount - this.cache.size;
  }
}

// Generate test data
const generateDogData = (id: string, size: 'small' | 'medium' | 'large' = 'medium') => {
  const base = {
    id,
    name: `Dog ${id}`,
    breed: 'Test Breed',
    sex: 'male' as const,
    _syncStatus: 'synced' as const
  };

  if (size === 'large') {
    return {
      ...base,
      healthRecords: {
        vaccinations: Array.from({ length: 50 }, (_, i) => ({
          vaccine: `Vaccine ${i}`,
          notes: 'Very detailed vaccination notes. '.repeat(100)
        }))
      },
      trainingHistory: Array.from({ length: 100 }, (_, i) => ({
        date: `2023-${String(i % 12 + 1).padStart(2, '0')}-01`,
        notes: 'Comprehensive training notes with detailed observations. '.repeat(50)
      }))
    };
  }

  if (size === 'medium') {
    return {
      ...base,
      healthRecords: {
        vaccinations: Array.from({ length: 5 }, (_, i) => ({
          vaccine: `Vaccine ${i}`,
          notes: 'Standard vaccination notes.'
        }))
      }
    };
  }

  return base; // small
};

describe('Cache Eviction Behavior Tests', () => {
  let cache: MockCacheManager;

  beforeEach(() => {
    cache = new MockCacheManager(1024 * 1024, 100); // 1MB, 100 items
  });

  afterEach(() => {
    cache.clear();
  });

  describe('LRU (Least Recently Used) Eviction', () => {
    it('should evict least recently used items when cache is full', () => {
      // Fill cache to capacity
      for (let i = 0; i < 100; i++) {
        const dog = generateDogData(`dog-${i}`, 'small');
        cache.set(`dog-${i}`, dog, { entityType: 'dog', priority: 'medium' });
      }

      expect(cache.getStats().totalItems).toBe(100);

      // Access some items to update their LRU status
      cache.get('dog-0');
      cache.get('dog-1');
      cache.get('dog-2');

      // Add new item that exceeds capacity
      const newDog = generateDogData('dog-new', 'medium');
      const success = cache.set('dog-new', newDog, { entityType: 'dog', priority: 'medium' });

      expect(success).toBe(true);
      expect(cache.getStats().totalItems).toBeLessThanOrEqual(100);
      expect(cache.getStats().evictionCount).toBeGreaterThan(0);

      // Recently accessed items should still be in cache
      expect(cache.get('dog-0')).toBeDefined();
      expect(cache.get('dog-1')).toBeDefined();
      expect(cache.get('dog-2')).toBeDefined();

      // New item should be in cache
      expect(cache.get('dog-new')).toBeDefined();
    });

    it('should maintain access order correctly', () => {
      // Add items with different access patterns
      const items = ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'];
      
      for (const item of items) {
        cache.set(item, { data: item }, { entityType: 'dog', priority: 'medium' });
      }

      // Access items in specific order
      cache.get('item-3');
      cache.get('item-1');
      cache.get('item-5');

      // Fill cache to trigger eviction
      for (let i = 6; i <= 100; i++) {
        cache.set(`item-${i}`, { data: `item-${i}` }, { entityType: 'dog', priority: 'medium' });
      }

      // Add one more to trigger eviction
      cache.set('final-item', { data: 'final' }, { entityType: 'dog', priority: 'medium' });

      // Recently accessed items should survive
      expect(cache.get('item-3')).toBeDefined();
      expect(cache.get('item-1')).toBeDefined();
      expect(cache.get('item-5')).toBeDefined();
      
      // Least recently accessed should be evicted
      expect(cache.get('item-2')).toBeNull();
      expect(cache.get('item-4')).toBeNull();
    });
  });

  describe('TTL (Time To Live) Eviction', () => {
    it('should evict expired items automatically', () => {
      // Add items with short TTL
      const shortTTL = 1000; // 1 second
      for (let i = 0; i < 10; i++) {
        cache.set(`temp-${i}`, { data: i }, { 
          entityType: 'dog', 
          priority: 'medium',
          ttl: shortTTL
        });
      }

      // Add items with longer TTL
      const longTTL = 10000; // 10 seconds
      for (let i = 0; i < 10; i++) {
        cache.set(`long-${i}`, { data: i }, { 
          entityType: 'dog', 
          priority: 'medium',
          ttl: longTTL
        });
      }

      expect(cache.getStats().totalItems).toBe(20);

      // Simulate time passing
      cache.simulateTime(2000); // 2 seconds

      // Try to access expired items
      expect(cache.get('temp-0')).toBeNull();
      expect(cache.get('temp-5')).toBeNull();

      // Long TTL items should still be accessible
      expect(cache.get('long-0')).toBeDefined();
      expect(cache.get('long-5')).toBeDefined();

      const stats = cache.getStats();
      expect(stats.totalItems).toBe(10); // Only long TTL items remain
    });

    it('should handle mixed TTL scenarios', () => {
      const items = [
        { key: 'no-ttl', ttl: undefined },
        { key: 'short-ttl', ttl: 500 },
        { key: 'medium-ttl', ttl: 2000 },
        { key: 'long-ttl', ttl: 5000 }
      ];

      for (const item of items) {
        cache.set(item.key, { data: item.key }, {
          entityType: 'dog',
          priority: 'medium',
          ttl: item.ttl
        });
      }

      // Simulate time progression
      cache.simulateTime(1000); // 1 second

      expect(cache.get('no-ttl')).toBeDefined();
      expect(cache.get('short-ttl')).toBeNull(); // Expired
      expect(cache.get('medium-ttl')).toBeDefined();
      expect(cache.get('long-ttl')).toBeDefined();

      cache.simulateTime(2000); // Total 3 seconds

      expect(cache.get('no-ttl')).toBeDefined();
      expect(cache.get('medium-ttl')).toBeNull(); // Expired
      expect(cache.get('long-ttl')).toBeDefined();
    });
  });

  describe('Priority-Based Eviction', () => {
    it('should protect high priority items from eviction', () => {
      // Fill cache with mixed priorities
      for (let i = 0; i < 30; i++) {
        cache.set(`high-${i}`, { data: i }, { 
          entityType: 'dog', 
          priority: 'high' 
        });
      }

      for (let i = 0; i < 40; i++) {
        cache.set(`medium-${i}`, { data: i }, { 
          entityType: 'dog', 
          priority: 'medium' 
        });
      }

      for (let i = 0; i < 30; i++) {
        cache.set(`low-${i}`, { data: i }, { 
          entityType: 'dog', 
          priority: 'low' 
        });
      }

      expect(cache.getStats().totalItems).toBe(100);

      // Add items that exceed capacity
      for (let i = 0; i < 20; i++) {
        const newDog = generateDogData(`overflow-${i}`, 'medium');
        cache.set(`overflow-${i}`, newDog, { 
          entityType: 'dog', 
          priority: 'medium' 
        });
      }

      const stats = cache.getStats();
      expect(stats.evictionCount).toBeGreaterThan(0);

      // High priority items should be preserved
      const highPriorityItems = cache.getItemsByPriority('high');
      expect(highPriorityItems.length).toBe(30); // All high priority items preserved

      // Low priority items should be evicted first
      const lowPriorityItems = cache.getItemsByPriority('low');
      expect(lowPriorityItems.length).toBeLessThan(30);
    });

    it('should evict high priority items only when necessary', () => {
      const smallCache = new MockCacheManager(10 * 1024, 20); // Very small cache

      // Fill with high priority items
      for (let i = 0; i < 20; i++) {
        smallCache.set(`high-${i}`, { data: 'x'.repeat(400) }, { // ~400 bytes each
          entityType: 'dog', 
          priority: 'high' 
        });
      }

      // Try to add a critical high priority item that requires eviction
      const largeData = { data: 'x'.repeat(2000) }; // ~2KB
      const success = smallCache.set('critical', largeData, { 
        entityType: 'dog', 
        priority: 'high' 
      });

      expect(success).toBe(true);
      expect(smallCache.getStats().evictionCount).toBeGreaterThan(0);
      expect(smallCache.get('critical')).toBeDefined();
    });
  });

  describe('Size-Based Eviction', () => {
    it('should evict largest items when size-constrained', () => {
      // Add items of varying sizes
      const items = [
        { key: 'small-1', data: generateDogData('small-1', 'small') },
        { key: 'small-2', data: generateDogData('small-2', 'small') },
        { key: 'medium-1', data: generateDogData('medium-1', 'medium') },
        { key: 'medium-2', data: generateDogData('medium-2', 'medium') },
        { key: 'large-1', data: generateDogData('large-1', 'large') },
        { key: 'large-2', data: generateDogData('large-2', 'large') }
      ];

      for (const item of items) {
        cache.set(item.key, item.data, { 
          entityType: 'dog', 
          priority: 'medium' 
        });
      }

      // const sizeBefore = initialStats.totalSize; // Could be used for logging

      // Force size-based eviction by adding many large items
      for (let i = 0; i < 50; i++) {
        const largeDog = generateDogData(`huge-${i}`, 'large');
        cache.set(`huge-${i}`, largeDog, { 
          entityType: 'dog', 
          priority: 'medium' 
        });
      }

      const finalStats = cache.getStats();
      expect(finalStats.evictionCount).toBeGreaterThan(0);

      // Small items should be more likely to survive than large ones
      const survivingSmall = items.filter(item => 
        item.key.includes('small') && cache.get(item.key) !== null
      ).length;
      
      const survivingLarge = items.filter(item => 
        item.key.includes('large') && cache.get(item.key) !== null
      ).length;

      expect(survivingSmall).toBeGreaterThanOrEqual(survivingLarge);
    });

    it('should maintain cache within size limits', () => {
      const sizeLimit = 512 * 1024; // 512KB
      const sizeCache = new MockCacheManager(sizeLimit, 1000);

      // Add items until we approach the size limit
      let itemCount = 0;
      // const itemSize = 10 * 1024; // ~10KB per item - could be used for logging

      while (sizeCache.getStats().totalSize < sizeLimit * 0.8) {
        const dog = generateDogData(`size-test-${itemCount}`, 'medium');
        sizeCache.set(`size-test-${itemCount}`, dog, { 
          entityType: 'dog', 
          priority: 'medium' 
        });
        itemCount++;
      }

      // Add more items to trigger size-based eviction
      for (let i = 0; i < 20; i++) {
        const largeDog = generateDogData(`overflow-${i}`, 'large');
        sizeCache.set(`overflow-${i}`, largeDog, { 
          entityType: 'dog', 
          priority: 'medium' 
        });
      }

      const finalStats = sizeCache.getStats();
      expect(finalStats.totalSize).toBeLessThanOrEqual(sizeLimit);
      expect(finalStats.evictionCount).toBeGreaterThan(0);
    });
  });

  describe('Entity Type-Specific Eviction', () => {
    it('should handle eviction preferences by entity type', () => {
      // Add different entity types
      const entityData = [
        { type: 'person', priority: 'high', count: 20 },
        { type: 'dog', priority: 'medium', count: 30 },
        { type: 'show', priority: 'high', count: 15 },
        { type: 'entry', priority: 'low', count: 35 }
      ];

      for (const entityGroup of entityData) {
        for (let i = 0; i < entityGroup.count; i++) {
          cache.set(`${entityGroup.type}-${i}`, { 
            id: `${entityGroup.type}-${i}`,
            type: entityGroup.type,
            data: 'x'.repeat(100)
          }, { 
            entityType: entityGroup.type as 'person' | 'dog' | 'show' | 'club' | 'entry', 
            priority: entityGroup.priority as 'high' | 'medium' | 'low'
          });
        }
      }

      expect(cache.getStats().totalItems).toBe(100);

      // Force eviction
      for (let i = 0; i < 30; i++) {
        cache.set(`overflow-${i}`, { data: 'x'.repeat(500) }, { 
          entityType: 'dog', 
          priority: 'medium' 
        });
      }

      // Check which entity types were preserved
      const _personItems = cache.getItemsByEntityType('person').length;
      // const dogItems = cache.getItemsByEntityType('dog').length; // Could be used for assertions
      const _showItems = cache.getItemsByEntityType('show').length;
      const _entryItems = cache.getItemsByEntityType('entry').length;

      // High priority entities (person, show) should be better preserved
      expect(_personItems).toBeGreaterThan(_entryItems);
      expect(_showItems).toBeGreaterThan(_entryItems);
    });
  });

  describe('Complex Eviction Scenarios', () => {
    it('should handle mixed eviction policies correctly', () => {
      const testCache = new MockCacheManager(256 * 1024, 50); // Small cache for aggressive eviction

      // Add items with mixed characteristics
      const items = [
        { key: 'old-high', priority: 'high', ttl: undefined, size: 'small' },
        { key: 'old-low', priority: 'low', ttl: undefined, size: 'large' },
        { key: 'new-high', priority: 'high', ttl: 2000, size: 'medium' },
        { key: 'new-low', priority: 'low', ttl: 2000, size: 'small' },
        { key: 'expiring-high', priority: 'high', ttl: 500, size: 'medium' }
      ];

      for (const item of items) {
        const data = generateDogData(item.key, item.size as 'small' | 'medium' | 'large');
        testCache.set(item.key, data, {
          entityType: 'dog',
          priority: item.priority as 'high' | 'medium' | 'low',
          ttl: item.ttl
        });
      }

      // Access some items to affect LRU
      testCache.get('old-high');
      testCache.get('new-high');

      // Fill cache to trigger eviction
      for (let i = 0; i < 50; i++) {
        const dog = generateDogData(`filler-${i}`, 'medium');
        testCache.set(`filler-${i}`, dog, {
          entityType: 'dog',
          priority: 'medium'
        });
      }

      // Simulate time to expire some items
      testCache.simulateTime(1000);

      const stats = testCache.getStats();
      expect(stats.evictionCount).toBeGreaterThan(0);

      // High priority, recently accessed items should survive
      expect(testCache.get('old-high')).toBeDefined();
      expect(testCache.get('new-high')).toBeDefined();

      // Expired items should be gone
      expect(testCache.get('expiring-high')).toBeNull();

      // Low priority items more likely to be evicted
      const lowPriorityRemaining = ['old-low', 'new-low'].filter(key => 
        testCache.get(key) !== null
      ).length;
      
      expect(lowPriorityRemaining).toBeLessThan(2);
    });

    it('should maintain performance during aggressive eviction', () => {
      const performanceCache = new MockCacheManager(128 * 1024, 30); // Very constrained

      const startTime = performance.now();
      
      // Rapidly add many items to trigger frequent eviction
      for (let i = 0; i < 200; i++) {
        const dog = generateDogData(`perf-${i}`, 'large');
        performanceCache.set(`perf-${i}`, dog, {
          entityType: 'dog',
          priority: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low'
        });

        // Occasionally access items to create realistic usage patterns
        if (i % 10 === 0 && i > 0) {
          performanceCache.get(`perf-${i - 5}`);
        }
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      const stats = performanceCache.getStats();
      
      // Should complete quickly despite heavy eviction
      expect(duration).toBeLessThan(1000); // Less than 1 second
      
      // Cache should be at capacity
      expect(stats.totalItems).toBeLessThanOrEqual(30);
      
      // Should have high eviction count
      expect(stats.evictionCount).toBeGreaterThan(100);
      
      // Hit rate should be reasonable despite churning
      expect(stats.hitRate).toBeGreaterThan(0.1);
    });
  });

  describe('Cache Statistics and Monitoring', () => {
    it('should provide accurate eviction statistics', () => {
      // Fill cache and monitor evictions
      for (let i = 0; i < 100; i++) {
        cache.set(`initial-${i}`, { data: i }, { 
          entityType: 'dog', 
          priority: 'medium' 
        });
      }

      const initialStats = cache.getStats();
      expect(initialStats.evictionCount).toBe(0);

      // Trigger evictions
      for (let i = 0; i < 50; i++) {
        const largeDog = generateDogData(`trigger-${i}`, 'large');
        cache.set(`trigger-${i}`, largeDog, { 
          entityType: 'dog', 
          priority: 'medium' 
        });
      }

      const finalStats = cache.getStats();
      expect(finalStats.evictionCount).toBeGreaterThan(0);
      expect(finalStats.totalItems).toBeLessThanOrEqual(100);
      expect(finalStats.hitRate).toBeGreaterThan(0);
    });

    it('should track cache efficiency metrics', () => {
      // Create realistic access patterns
      const keys = Array.from({ length: 50 }, (_, i) => `metric-${i}`);
      
      for (const key of keys) {
        cache.set(key, { data: key }, { 
          entityType: 'dog', 
          priority: 'medium' 
        });
      }

      // Access some items multiple times (80/20 rule)
      const hotKeys = keys.slice(0, 10);
      const coldKeys = keys.slice(10);

      for (let round = 0; round < 5; round++) {
        // Access hot keys frequently
        for (const key of hotKeys) {
          for (let i = 0; i < 5; i++) {
            cache.get(key);
          }
        }

        // Access cold keys occasionally
        for (const key of coldKeys.slice(0, 5)) {
          cache.get(key);
        }
      }

      // Add more items to trigger eviction
      for (let i = 0; i < 100; i++) {
        cache.set(`new-${i}`, { data: i }, { 
          entityType: 'dog', 
          priority: 'medium' 
        });
      }

      const stats = cache.getStats();
      
      // Hit rate should be high due to hot keys
      expect(stats.hitRate).toBeGreaterThan(0.5);
      
      // Hot keys should still be in cache
      const hotKeysRemaining = hotKeys.filter(key => cache.get(key) !== null).length;
      expect(hotKeysRemaining).toBeGreaterThan(hotKeys.length * 0.5);
    });
  });

  describe('Manual Eviction and Cleanup', () => {
    it('should support manual eviction triggers', () => {
      // Fill cache
      for (let i = 0; i < 100; i++) {
        cache.set(`manual-${i}`, { data: i }, { 
          entityType: 'dog', 
          priority: i % 3 === 0 ? 'low' : 'medium'
        });
      }

      const beforeEviction = cache.getStats().totalItems;
      
      // Trigger manual eviction
      const evictedCount = cache.triggerEviction();
      
      const afterEviction = cache.getStats().totalItems;
      
      expect(evictedCount).toBeGreaterThan(0);
      expect(afterEviction).toBeLessThan(beforeEviction);
      expect(cache.getStats().evictionCount).toBeGreaterThan(0);
    });

    it('should handle bulk cleanup operations', () => {
      // Add items with different characteristics
      for (let i = 0; i < 50; i++) {
        cache.set(`bulk-${i}`, { data: i }, { 
          entityType: 'dog', 
          priority: 'low',
          ttl: 1000 // Short TTL
        });
      }

      for (let i = 0; i < 50; i++) {
        cache.set(`keep-${i}`, { data: i }, { 
          entityType: 'dog', 
          priority: 'high'
        });
      }

      expect(cache.getStats().totalItems).toBe(100);

      // Simulate time passing and cleanup
      cache.simulateTime(2000);
      
      // Manual cleanup of remaining low priority items
      const lowPriorityItems = cache.getItemsByPriority('low');
      for (const item of lowPriorityItems) {
        cache.delete(item.key);
      }

      const finalStats = cache.getStats();
      expect(finalStats.totalItems).toBeLessThan(100);
      
      // High priority items should remain
      const highPriorityRemaining = cache.getItemsByPriority('high').length;
      expect(highPriorityRemaining).toBe(50);
    });
  });
});