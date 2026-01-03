/**
 * Archive Scheduler
 * 
 * Automatically archives completed shows based on configured policies
 * and maintains optimal performance by moving historical data out of
 * active memory.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { DataArchiveService, getArchiveService } from './DataArchiveService';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { Show } from '@/types/show-types';

export interface SchedulerConfig {
  /** How often to check for archivable shows (in minutes) */
  checkIntervalMinutes: number;
  /** Whether to run archiving in the background */
  runInBackground: boolean;
  /** Maximum shows to archive in one batch */
  batchSize: number;
  /** Whether to notify user of archiving actions */
  notifyUser: boolean;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  checkIntervalMinutes: 60, // Check every hour
  runInBackground: true,
  batchSize: 5,
  notifyUser: true,
};

export class ArchiveScheduler {
  private config: SchedulerConfig;
  private archiveService: DataArchiveService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastRunTime: Date | null = null;
  
  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.archiveService = getArchiveService();
  }

  /**
   * Start the archive scheduler
   */
  public start(): void {
    if (this.intervalId) {
      console.log('⏰ Archive scheduler already running');
      return;
    }
    
    console.log(`⏰ Starting archive scheduler (interval: ${this.config.checkIntervalMinutes} minutes)`);
    
    // Run immediately on start
    this.runArchiveCheck();
    
    // Set up interval
    this.intervalId = setInterval(
      () => this.runArchiveCheck(),
      this.config.checkIntervalMinutes * 60 * 1000
    );
  }

  /**
   * Stop the archive scheduler
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('⏰ Archive scheduler stopped');
    }
  }

  /**
   * Run archive check immediately
   */
  public async runArchiveCheck(): Promise<void> {
    if (this.isRunning) {
      console.log('⏳ Archive check already in progress, skipping...');
      return;
    }
    
    this.isRunning = true;
    this.lastRunTime = new Date();
    
    try {
      console.log('🔍 Checking for archivable shows...');
      
      // Get all shows from store
      const showStore = useShowStore.getState();
      const shows = showStore.shows;
      
      // Find shows that should be archived
      const archivableShows = shows.filter(show => 
        this.archiveService.shouldArchiveShow(show)
      );
      
      if (archivableShows.length === 0) {
        console.log('✅ No shows need archiving');
        return;
      }
      
      console.log(`📦 Found ${archivableShows.length} shows to archive`);
      
      // Archive in batches
      const batchedShows = archivableShows.slice(0, this.config.batchSize);
      
      for (const show of batchedShows) {
        await this.archiveShow(show);
      }
      
      // Notify if configured
      if (this.config.notifyUser && batchedShows.length > 0) {
        this.notifyArchiveComplete(batchedShows);
      }
      
    } catch (error) {
      console.error('❌ Archive check failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Archive a single show
   */
  private async archiveShow(show: Show): Promise<void> {
    try {
      console.log(`📦 Archiving show: ${show.name}`);
      
      // Gather related data
      const entryStore = useEntryStore.getState();
      const dogStore = useDogStore.getState();
      const userStore = useUserStore.getState();
      
      // Filter data related to this show
      const showEntries = entryStore.entries.filter(e => e.showId === show.id);
      
      // Get unique dogs and people from entries
      const dogIds = new Set(showEntries.map(e => e.dogId));
      const dogs = dogStore.dogs.filter(d => dogIds.has(d.id));
      
      // Get people through their dogs' entries
      const peopleIds = new Set(
        showEntries
          .map(entry => {
            const dog = dogStore.dogs.find(d => d.id === entry.dogId);
            return dog?.ownerId;
          })
          .filter(Boolean)
      );
      const people = userStore.people.filter(p => peopleIds.has(p.id));
      
      // TODO: Get actual results when results store is implemented
      const results: any[] = [];
      
      // Archive the show
      await this.archiveService.archiveShow(
        show,
        showEntries,
        dogs,
        people,
        results
      );
      
      // Remove from active stores if background mode
      if (this.config.runInBackground) {
        await this.removeArchivedData(show, showEntries);
      }
      
      console.log(`✅ Successfully archived: ${show.name}`);
      
    } catch (error) {
      console.error(`❌ Failed to archive show ${show.name}:`, error);
    }
  }

  /**
   * Remove archived data from active stores
   */
  private async removeArchivedData(show: Show, entries: any[]): Promise<void> {
    console.log(`🧹 Removing archived data from active stores...`);
    
    // Remove show
    const showStore = useShowStore.getState();
    showStore.deleteShow(show.id);
    
    // Remove entries
    const entryStore = useEntryStore.getState();
    entries.forEach(entry => {
      // Note: You'll need to add a deleteEntry method to your entry store
      const updatedEntries = entryStore.entries.filter(e => e.id !== entry.id);
      entryStore.setEntries(updatedEntries);
    });
    
    // Note: We keep dogs and people as they might be used in other shows
    
    console.log(`✅ Removed archived data for: ${show.name}`);
  }

  /**
   * Notify user of archive completion
   */
  private notifyArchiveComplete(shows: Show[]): void {
    // This would integrate with your notification system
    const message = shows.length === 1
      ? `Show "${shows[0].name}" has been archived`
      : `${shows.length} shows have been archived`;
    
    console.log(`📢 ${message}`);
    
    // TODO: Integrate with actual notification system
    // For now, we'll just log it
  }

  /**
   * Get scheduler status
   */
  public getStatus(): {
    isRunning: boolean;
    lastRunTime: Date | null;
    nextRunTime: Date | null;
  } {
    const nextRunTime = this.lastRunTime && this.intervalId
      ? new Date(this.lastRunTime.getTime() + this.config.checkIntervalMinutes * 60 * 1000)
      : null;
    
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      nextRunTime,
    };
  }

  /**
   * Update scheduler configuration
   */
  public updateConfig(config: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart if interval changed
    if (config.checkIntervalMinutes && this.intervalId) {
      this.stop();
      this.start();
    }
  }
}

// Singleton instance
let scheduler: ArchiveScheduler | null = null;

export function getArchiveScheduler(config?: Partial<SchedulerConfig>): ArchiveScheduler {
  if (!scheduler) {
    scheduler = new ArchiveScheduler(config);
  }
  return scheduler;
}

/**
 * Initialize archive scheduler on app start
 */
export function initializeArchiveScheduler(): void {
  const scheduler = getArchiveScheduler();
  
  // Only start in production or if explicitly enabled
  if (process.env.NODE_ENV === 'production' || process.env.VITE_ENABLE_ARCHIVING === 'true') {
    scheduler.start();
    
    // Stop on page unload
    window.addEventListener('beforeunload', () => {
      scheduler.stop();
    });
  }
}