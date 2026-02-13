/**
 * Archive Scheduler
 *
 * Automatically archives completed shows based on configured policies
 * and maintains optimal performance by moving historical data out of
 * active memory.
 */

import { DataArchiveService, getArchiveService, ArchivableResult } from './DataArchiveService';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { useShowStore } from '@/store/showStore';
import { useEntryStore, type SyncableShowEntry } from '@/store/entryStore';
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
      logger.debug('Archive scheduler already running', 'archive');
      return;
    }

    logger.info('Starting archive scheduler', 'archive', { intervalMinutes: this.config.checkIntervalMinutes });
    
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
      logger.info('Archive scheduler stopped', 'archive');
    }
  }

  /**
   * Run archive check immediately
   */
  public async runArchiveCheck(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Archive check already in progress, skipping', 'archive');
      return;
    }
    
    this.isRunning = true;
    this.lastRunTime = new Date();
    
    try {
      logger.debug('Checking for archivable shows', 'archive');
      
      // Get all shows from store
      const showStore = useShowStore.getState();
      const shows = showStore.shows;
      
      // Find shows that should be archived
      const archivableShows = shows.filter(show => 
        this.archiveService.shouldArchiveShow(show)
      );
      
      if (archivableShows.length === 0) {
        logger.debug('No shows need archiving', 'archive');
        return;
      }

      logger.info('Found shows to archive', 'archive', { count: archivableShows.length });
      
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
      logger.error('Archive check failed', 'archive', {}, error as Error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Archive a single show
   */
  private async archiveShow(show: Show): Promise<void> {
    try {
      logger.info('Archiving show', 'archive', { showName: show.name });
      
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
      
      // Build archivable results from entries that have competition data
      const results: ArchivableResult[] = showEntries
        .filter(entry => entry.competitionData)
        .map(entry => {
          const dog = dogStore.dogs.find(d => d.id === entry.dogId);
          const handler = people.find(p => p.id === dog?.ownerId);
          const parsedScore = entry.competitionData?.score ? parseFloat(entry.competitionData.score) : null;

          const archivableResult: ArchivableResult = {
            id: entry.id,
            dogId: entry.dogId,
            handlerId: handler?.id ?? '',
            className: entry.classId,
            placement: parseInt(entry.competitionData?.placement ?? '0', 10) || 0,
            qualified: entry.competitionData?.qualified,
            time: entry.competitionData?.time,
          };

          if (parsedScore !== null) {
            archivableResult.score = parsedScore;
          }

          return archivableResult;
        });
      
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
      
      logger.info('Successfully archived show', 'archive', { showName: show.name });

    } catch (error) {
      logger.error('Failed to archive show', 'archive', { showName: show.name }, error as Error);
    }
  }

  /**
   * Remove archived data from active stores
   */
  private async removeArchivedData(show: Show, entries: SyncableShowEntry[]): Promise<void> {
    logger.debug('Removing archived data from active stores', 'archive', { showName: show.name });
    
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

    logger.debug('Removed archived data', 'archive', { showName: show.name });
  }

  /**
   * Notify user of archive completion
   */
  private notifyArchiveComplete(shows: Show[]): void {
    const message = shows.length === 1
      ? `Show "${shows[0].name}" has been archived`
      : `${shows.length} shows have been archived`;

    logger.info('Archive notification', 'archive', { message });

    notifications.info(message, {
      description: 'Archived shows can be restored from the Data Management settings.',
      duration: 6000,
    });
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