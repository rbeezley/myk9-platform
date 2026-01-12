/**
 * Data Eviction Service
 * 
 * Manages memory by intelligently removing inactive data from stores
 * when memory pressure is detected, prioritizing frequently accessed data.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getRumService } from './RealUserMonitoring';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';
import { logger } from '@/services/LoggingService';

export interface EvictionConfig {
  memoryThresholdMB: number;
  inactivityThresholdHours: number;
  maxEvictionPercentage: number;
  protectedTypes: string[];
}

export interface EvictionResult {
  itemsEvicted: number;
  memoryFreedMB: number;
  categories: Record<string, number>;
  success: boolean;
  error?: string;
}

export class DataEvictionService {
  private config: EvictionConfig = {
    memoryThresholdMB: 100, // Start eviction at 100MB
    inactivityThresholdHours: 24, // Evict data not accessed in 24h
    maxEvictionPercentage: 30, // Never evict more than 30% at once
    protectedTypes: ['active_show', 'current_user'] // Never evict these
  };

  private accessLog: Map<string, number> = new Map();
  private rumService = getRumService();

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EvictionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Track data access for intelligent eviction
   */
  trackAccess(type: string, id: string): void {
    const key = `${type}:${id}`;
    this.accessLog.set(key, Date.now());
  }

  /**
   * Check if eviction is needed and perform if necessary
   */
  async checkAndEvict(): Promise<EvictionResult | null> {
    const memoryUsage = this.getCurrentMemoryUsage();
    
    if (memoryUsage < this.config.memoryThresholdMB) {
      return null; // No eviction needed
    }

    logger.debug(`🗑️ Memory threshold exceeded (${memoryUsage}MB), starting eviction...`, 'performance', {});
    return this.performEviction();
  }

  /**
   * Force eviction regardless of memory usage
   */
  async forceEviction(): Promise<EvictionResult> {
    logger.debug('🗑️ Forcing data eviction...', 'performance', {});
    return this.performEviction();
  }

  /**
   * Perform intelligent data eviction
   */
  private async performEviction(): Promise<EvictionResult> {
    const startTime = performance.now();
    const initialMemory = this.getCurrentMemoryUsage();

    try {
      let totalEvicted = 0;
      const categories: Record<string, number> = {};

      // Evict inactive shows
      const showsEvicted = await this.evictInactiveShows();
      totalEvicted += showsEvicted;
      categories.shows = showsEvicted;

      // Evict inactive people (with no active relationships)
      const peopleEvicted = await this.evictInactivePeople();
      totalEvicted += peopleEvicted;
      categories.people = peopleEvicted;

      // Evict inactive dogs (with no recent entries)
      const dogsEvicted = await this.evictInactiveDogs();
      totalEvicted += dogsEvicted;
      categories.dogs = dogsEvicted;

      // Clear old access logs
      this.cleanupAccessLog();

      const finalMemory = this.getCurrentMemoryUsage();
      const memoryFreed = initialMemory - finalMemory;
      const duration = performance.now() - startTime;

      // Track eviction performance
      this.rumService.trackCustomMetric('data_eviction_completed', duration, {
        items_evicted: totalEvicted.toString(),
        memory_freed: memoryFreed.toFixed(1),
        initial_memory: initialMemory.toFixed(1),
        final_memory: finalMemory.toFixed(1)
      });

      const result: EvictionResult = {
        itemsEvicted: totalEvicted,
        memoryFreedMB: memoryFreed,
        categories,
        success: true
      };

      logger.debug(`✅ Eviction completed:`, 'performance', { data: result });
      return result;

    } catch (error) {
      logger.error('❌ Eviction failed:', 'performance', {}, error as Error);
      
      return {
        itemsEvicted: 0,
        memoryFreedMB: 0,
        categories: {},
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Evict inactive shows
   */
  private async evictInactiveShows(): Promise<number> {
    const showStore = useShowStore.getState();
    const shows = showStore.shows;
    
    const inactiveShows = shows.filter(show => {
      // Don't evict active shows
      if (show.status === 'active' || show.status === 'published') return false;
      
      // Don't evict recently accessed shows
      const accessKey = `show:${show.id}`;
      const lastAccess = this.accessLog.get(accessKey);
      if (lastAccess && this.isRecentlyAccessed(lastAccess)) return false;
      
      // Don't evict recent shows
      const showDate = new Date(show.startDate);
      const daysSinceShow = (Date.now() - showDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceShow > 30; // Evict shows older than 30 days
    });

    // Limit eviction percentage
    const maxEvict = Math.floor(shows.length * this.config.maxEvictionPercentage / 100);
    const toEvict = inactiveShows.slice(0, maxEvict);

    // Remove shows
    toEvict.forEach(show => {
      showStore.removeShow(show.id);
      this.accessLog.delete(`show:${show.id}`);
    });

    return toEvict.length;
  }

  /**
   * Evict inactive people (those with no active relationships)
   */
  private async evictInactivePeople(): Promise<number> {
    const userStore = useUserStore.getState();
    const dogStore = useDogStore.getState();
    const showStore = useShowStore.getState();
    
    const people = userStore.people;
    
    // Find people with active relationships
    const activeOwnerIds = new Set(dogStore.dogs.map(d => d.ownerId));
    const _activeShowIds = new Set(
      showStore.shows
        .filter(s => s.status === 'active' || s.status === 'published')
        .map(s => s.id)
    );
    void _activeShowIds; // TODO: Use for show-related eviction logic

    const inactivePeople = people.filter(person => {
      // Don't evict people with dogs
      if (activeOwnerIds.has(person.id)) return false;
      
      // Don't evict recently accessed people
      const accessKey = `person:${person.id}`;
      const lastAccess = this.accessLog.get(accessKey);
      if (lastAccess && this.isRecentlyAccessed(lastAccess)) return false;
      
      // Check if person has recent activity
      const lastActivity = person._lastModified;
      if (lastActivity) {
        const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceActivity > 90; // Evict people inactive for 90+ days
      }
      
      return true;
    });

    // Limit eviction
    const maxEvict = Math.floor(people.length * this.config.maxEvictionPercentage / 100);
    const toEvict = inactivePeople.slice(0, maxEvict);

    // Remove people
    toEvict.forEach(person => {
      userStore.removePerson(person.id);
      this.accessLog.delete(`person:${person.id}`);
    });

    return toEvict.length;
  }

  /**
   * Evict inactive dogs
   */
  private async evictInactiveDogs(): Promise<number> {
    const dogStore = useDogStore.getState();
    const dogs = dogStore.dogs;
    
    const inactiveDogs = dogs.filter(dog => {
      // Don't evict recently accessed dogs
      const accessKey = `dog:${dog.id}`;
      const lastAccess = this.accessLog.get(accessKey);
      if (lastAccess && this.isRecentlyAccessed(lastAccess)) return false;
      
      // Check dog age and activity
      if (dog.dateOfBirth) {
        const age = (Date.now() - new Date(dog.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365);
        // Don't evict young dogs or recently born dogs
        if (age < 0.5) return false;
      }
      
      return true;
    });

    // Limit eviction - be more conservative with dogs
    const maxEvict = Math.floor(dogs.length * (this.config.maxEvictionPercentage / 2) / 100);
    const toEvict = inactiveDogs.slice(0, maxEvict);

    // Remove dogs
    toEvict.forEach(dog => {
      dogStore.removeDog(dog.id);
      this.accessLog.delete(`dog:${dog.id}`);
    });

    return toEvict.length;
  }

  /**
   * Check if data was recently accessed
   */
  private isRecentlyAccessed(lastAccess: number): boolean {
    const hoursSinceAccess = (Date.now() - lastAccess) / (1000 * 60 * 60);
    return hoursSinceAccess < this.config.inactivityThresholdHours;
  }

  /**
   * Clean up old access log entries
   */
  private cleanupAccessLog(): void {
    const cutoff = Date.now() - (this.config.inactivityThresholdHours * 2 * 60 * 60 * 1000);
    
    for (const [key, timestamp] of this.accessLog.entries()) {
      if (timestamp < cutoff) {
        this.accessLog.delete(key);
      }
    }
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      return memInfo.usedJSHeapSize / 1024 / 1024;
    }
    return 0;
  }

  /**
   * Get eviction statistics
   */
  getEvictionStats() {
    return {
      config: this.config,
      accessLogSize: this.accessLog.size,
      currentMemory: this.getCurrentMemoryUsage(),
      thresholdExceeded: this.getCurrentMemoryUsage() > this.config.memoryThresholdMB
    };
  }
}

// Service instance
let dataEvictionService: DataEvictionService | null = null;

export function getDataEvictionService(): DataEvictionService {
  if (!dataEvictionService) {
    dataEvictionService = new DataEvictionService();
  }
  return dataEvictionService;
}