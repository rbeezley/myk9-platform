/**
 * Data Archive Service
 * 
 * Manages automatic archiving of completed shows and historical data
 * to reduce active memory footprint and improve performance.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from '@/services/LoggingService';
import { Show } from '@/types/show-types';
import { Dog } from '@/types/dog-types';
import { User } from '@/types/user-types';
import type { SyncableShowEntry as Entry } from '@/store/entryStore';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { smartCompress, smartDecompress } from '@/services/database/compression-utils';

export interface ArchiveConfig {
  /** Days after show completion before archiving */
  archiveAfterDays: number;
  /** Whether to compress archived data */
  enableCompression: boolean;
  /** Maximum archive size in MB before rotation */
  maxArchiveSizeMB: number;
  /** Retention period in days for archived data */
  retentionDays: number;
  /** Whether to keep summary data after archiving */
  keepSummaries: boolean;
}

export interface ArchivedShow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  archivedAt: string;
  summaryData: ShowSummary;
  compressedData?: string;
  sizeBytes: number;
}

export interface ShowSummary {
  totalEntries: number;
  totalDogs: number;
  totalHandlers: number;
  totalClasses: number;
  winners: Array<{
    className: string;
    dogName: string;
    handlerName: string;
    placement: number;
  }>;
  statistics: {
    averageClassSize: number;
    mostPopularBreeds: string[];
    participationByState: Record<string, number>;
  };
}

export interface ArchiveStats {
  totalArchived: number;
  totalSizeMB: number;
  oldestArchive: string;
  newestArchive: string;
  compressionRatio: number;
}

const DEFAULT_CONFIG: ArchiveConfig = {
  archiveAfterDays: 30,
  enableCompression: true,
  maxArchiveSizeMB: 100,
  retentionDays: 365,
  keepSummaries: true,
};

export class DataArchiveService {
  private config: ArchiveConfig;
  private storage = getOptimalStorage('archives');
  private archiveIndex: Map<string, ArchivedShow> = new Map();
  
  constructor(config: Partial<ArchiveConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadArchiveIndex();
  }

  /**
   * Load archive index from storage
   */
  private async loadArchiveIndex(): Promise<void> {
    try {
      const indexData = await this.storage.getItem('archive-index');
      if (indexData) {
        const index = JSON.parse(indexData);
        this.archiveIndex = new Map(Object.entries(index));
      }
    } catch (error) {
      logger.error('Failed to load archive index', 'archive', {}, error as Error);
    }
  }

  /**
   * Save archive index to storage
   */
  private async saveArchiveIndex(): Promise<void> {
    const indexData = Object.fromEntries(this.archiveIndex);
    await this.storage.setItem('archive-index', JSON.stringify(indexData));
  }

  /**
   * Check if a show should be archived based on completion date
   */
  public shouldArchiveShow(show: Show): boolean {
    if (show.status !== 'completed') return false;
    
    const endDate = new Date(show.endDate);
    const daysSinceEnd = Math.floor((Date.now() - endDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return daysSinceEnd >= this.config.archiveAfterDays;
  }

  /**
   * Archive a completed show with all related data
   */
  public async archiveShow(
    show: Show,
    entries: Entry[],
    dogs: Dog[],
    people: User[],
    results: any[]
  ): Promise<ArchivedShow> {
    logger.info('Archiving show', 'archive', { showName: show.name, showId: show.id });

    // Generate summary data
    const summary = this.generateShowSummary(show, entries, dogs, people, results);
    
    // Prepare full data for archiving
    const fullData = {
      show,
      entries,
      dogs,
      people,
      results,
      archivedAt: new Date().toISOString(),
    };
    
    // Compress if enabled
    let archiveData: string;
    let sizeBytes: number;
    
    if (this.config.enableCompression) {
      const jsonData = JSON.stringify(fullData);
      archiveData = smartCompress(jsonData);
      sizeBytes = archiveData.length;
      logger.debug('Compressed show data', 'archive', { showName: show.name, originalKB: (jsonData.length / 1024).toFixed(2), compressedKB: (sizeBytes / 1024).toFixed(2) });
    } else {
      archiveData = JSON.stringify(fullData);
      sizeBytes = archiveData.length;
    }
    
    // Create archive entry
    const archived: ArchivedShow = {
      id: show.id,
      name: show.name,
      startDate: show.startDate,
      endDate: show.endDate,
      archivedAt: new Date().toISOString(),
      summaryData: summary,
      compressedData: archiveData,
      sizeBytes,
    };
    
    // Store archived data
    await this.storage.setItem(`archive-${show.id}`, archiveData);
    
    // Update index
    this.archiveIndex.set(show.id, archived);
    await this.saveArchiveIndex();
    
    // Check archive size and rotate if needed
    await this.checkArchiveRotation();
    
    return archived;
  }

  /**
   * Restore an archived show
   */
  public async restoreShow(showId: string): Promise<{
    show: Show;
    entries: Entry[];
    dogs: Dog[];
    people: User[];
    results: any[];
  } | null> {
    const archived = this.archiveIndex.get(showId);
    if (!archived) {
      logger.warn('Archive not found for show', 'archive', { showId });
      return null;
    }
    
    try {
      const archiveData = await this.storage.getItem(`archive-${showId}`);
      if (!archiveData) {
        throw new Error('Archive data not found in storage');
      }
      
      let jsonData: string;
      if (this.config.enableCompression && archived.compressedData) {
        jsonData = smartDecompress(archiveData);
      } else {
        jsonData = archiveData;
      }
      
      const fullData = JSON.parse(jsonData);
      logger.info('Restored show', 'archive', { showName: archived.name });

      return {
        show: fullData.show,
        entries: fullData.entries,
        dogs: fullData.dogs,
        people: fullData.people,
        results: fullData.results,
      };
    } catch (error) {
      logger.error('Failed to restore show', 'archive', { showId }, error as Error);
      return null;
    }
  }

  /**
   * Generate summary data for a show
   */
  private generateShowSummary(
    show: Show,
    entries: Entry[],
    dogs: Dog[],
    people: User[],
    results: any[]
  ): ShowSummary {
    // Calculate statistics
    const breedCounts = new Map<string, number>();
    const stateCounts = new Map<string, number>();
    
    dogs.forEach(dog => {
      breedCounts.set(dog.breed, (breedCounts.get(dog.breed) || 0) + 1);
    });
    
    people.forEach(person => {
      if (person.state) {
        stateCounts.set(person.state, (stateCounts.get(person.state) || 0) + 1);
      }
    });
    
    // Get top breeds
    const sortedBreeds = Array.from(breedCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([breed]) => breed);
    
    // Extract winners (simplified - would need actual results structure)
    const winners = results
      .filter(r => r.placement <= 3)
      .map(r => ({
        className: r.className || 'Unknown Class',
        dogName: dogs.find(d => d.id === r.dogId)?.name || 'Unknown Dog',
        handlerName: people.find(p => p.id === r.handlerId)?.firstName + ' ' + 
                     people.find(p => p.id === r.handlerId)?.lastName || 'Unknown Handler',
        placement: r.placement,
      }))
      .slice(0, 10);
    
    return {
      totalEntries: entries.length,
      totalDogs: dogs.length,
      totalHandlers: people.length,
      totalClasses: show.trials?.reduce((sum, trial) => sum + (trial.classes?.length || 0), 0) || 0,
      winners,
      statistics: {
        averageClassSize: entries.length / (show.trials?.reduce((sum, trial) => sum + (trial.classes?.length || 0), 0) || 1),
        mostPopularBreeds: sortedBreeds,
        participationByState: Object.fromEntries(stateCounts),
      },
    };
  }

  /**
   * Check archive size and rotate old archives if needed
   */
  private async checkArchiveRotation(): Promise<void> {
    const stats = await this.getArchiveStats();
    
    // Check size limit
    if (stats.totalSizeMB > this.config.maxArchiveSizeMB) {
      logger.info('Archive rotation needed', 'archive', { currentSizeMB: stats.totalSizeMB, maxSizeMB: this.config.maxArchiveSizeMB });
      await this.rotateOldArchives();
    }
    
    // Check retention period
    await this.cleanExpiredArchives();
  }

  /**
   * Rotate old archives to maintain size limit
   */
  private async rotateOldArchives(): Promise<void> {
    const archives = Array.from(this.archiveIndex.values())
      .sort((a, b) => new Date(a.archivedAt).getTime() - new Date(b.archivedAt).getTime());
    
    let totalSize = archives.reduce((sum, a) => sum + a.sizeBytes, 0);
    const targetSize = this.config.maxArchiveSizeMB * 1024 * 1024 * 0.8; // 80% of max
    
    for (const archive of archives) {
      if (totalSize <= targetSize) break;
      
      // Keep summary only
      if (this.config.keepSummaries) {
        archive.compressedData = undefined;
        await this.storage.removeItem(`archive-${archive.id}`);
        logger.debug('Rotated archive data (kept summary)', 'archive', { archiveName: archive.name });
      } else {
        // Remove completely
        await this.removeArchive(archive.id);
      }
      
      totalSize -= archive.sizeBytes;
    }
  }

  /**
   * Clean up expired archives based on retention policy
   */
  private async cleanExpiredArchives(): Promise<void> {
    const now = Date.now();
    const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
    
    for (const [id, archive] of this.archiveIndex) {
      const archiveAge = now - new Date(archive.archivedAt).getTime();
      
      if (archiveAge > retentionMs) {
        await this.removeArchive(id);
        logger.debug('Removed expired archive', 'archive', { archiveName: archive.name });
      }
    }
  }

  /**
   * Remove an archive completely
   */
  public async removeArchive(showId: string): Promise<void> {
    this.archiveIndex.delete(showId);
    await this.storage.removeItem(`archive-${showId}`);
    await this.saveArchiveIndex();
  }

  /**
   * Get archive statistics
   */
  public async getArchiveStats(): Promise<ArchiveStats> {
    const archives = Array.from(this.archiveIndex.values());
    
    if (archives.length === 0) {
      return {
        totalArchived: 0,
        totalSizeMB: 0,
        oldestArchive: '',
        newestArchive: '',
        compressionRatio: 0,
      };
    }
    
    const totalBytes = archives.reduce((sum, a) => sum + a.sizeBytes, 0);
    const sortedByDate = archives.sort((a, b) => 
      new Date(a.archivedAt).getTime() - new Date(b.archivedAt).getTime()
    );
    
    // Estimate compression ratio (would need original sizes for accurate calculation)
    const avgCompressionRatio = this.config.enableCompression ? 0.7 : 1.0;
    
    return {
      totalArchived: archives.length,
      totalSizeMB: totalBytes / (1024 * 1024),
      oldestArchive: sortedByDate[0]?.name || '',
      newestArchive: sortedByDate[sortedByDate.length - 1]?.name || '',
      compressionRatio: avgCompressionRatio,
    };
  }

  /**
   * Search archived shows by criteria
   */
  public searchArchives(criteria: {
    startDate?: string;
    endDate?: string;
    name?: string;
    minEntries?: number;
  }): ArchivedShow[] {
    return Array.from(this.archiveIndex.values()).filter(archive => {
      if (criteria.startDate && archive.startDate < criteria.startDate) return false;
      if (criteria.endDate && archive.endDate > criteria.endDate) return false;
      if (criteria.name && !archive.name.toLowerCase().includes(criteria.name.toLowerCase())) return false;
      if (criteria.minEntries && archive.summaryData.totalEntries < criteria.minEntries) return false;
      
      return true;
    });
  }

  /**
   * Export archive summaries for reporting
   */
  public exportArchiveSummaries(): ArchivedShow[] {
    return Array.from(this.archiveIndex.values()).map(archive => ({
      ...archive,
      compressedData: undefined, // Don't include compressed data in export
    }));
  }
}

// Singleton instance
let archiveService: DataArchiveService | null = null;

export function getArchiveService(config?: Partial<ArchiveConfig>): DataArchiveService {
  if (!archiveService) {
    archiveService = new DataArchiveService(config);
  }
  return archiveService;
}