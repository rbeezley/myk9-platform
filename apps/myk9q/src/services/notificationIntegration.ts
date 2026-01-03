/**
 * Notification Integration Service
 *
 * This service connects the notification system to real app events.
 * It monitors store changes and triggers notifications based on:
 * - Entry status changes (scored, in ring)
 * - Class scheduling and timing
 * - Sync operations
 * - System updates
 */

import { useEntryStore } from '@/stores/entryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  notifyYourTurn,
  notifyResultsPosted,
  notifyClassStarting,
  notifySyncError,
} from './notificationHandlers';
import type { Entry } from '@/stores/entryStore';
import { logger } from '@/utils/logger';

interface ClassSchedule {
  classId: number;
  element: string;
  level: string;
  scheduledStartTime: string;
  warningScheduled?: boolean;
}

class NotificationIntegration {
  private static instance: NotificationIntegration;
  private previousEntries: Map<number, Entry> = new Map();
  private classSchedules: Map<number, ClassSchedule> = new Map();
  private scheduledWarnings: Map<number, NodeJS.Timeout> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private isInitialized = false;
  private favoriteDogs: Set<number> = new Set();
  private licenseKey: string = '';

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): NotificationIntegration {
    if (!NotificationIntegration.instance) {
      NotificationIntegration.instance = new NotificationIntegration();
    }
    return NotificationIntegration.instance;
  }

  /**
   * Initialize notification monitoring
   * Call this once when the app starts
   */
  initialize(): void {
    if (this.isInitialized) {
return;
    }

// Load license key from auth context in localStorage
    this.loadLicenseKeyFromAuth();

    // Subscribe to entry store changes
    useEntryStore.subscribe((state, prevState) => {
      this.handleEntryChanges(state.entries, prevState.entries);
      this.handleCurrentEntryChanges(state.currentEntry, prevState.currentEntry);
    });

    // Monitor class schedules every minute
    this.monitoringInterval = setInterval(() => {
      this.checkClassStartWarnings();
    }, 60000); // Check every minute

    // Watch for both auth and favorites changes in localStorage
    window.addEventListener('storage', (e) => {
      if (e.key === 'myK9Q_auth') {
        // Auth changed, reload license key and favorites
        this.loadLicenseKeyFromAuth();
      } else if (e.key === `dog_favorites_${this.licenseKey}`) {
        // Favorites changed, reload them
        this.loadFavoriteDogs();
      }
    });

    this.isInitialized = true;
}

  /**
   * Load license key from auth context in localStorage
   */
  private loadLicenseKeyFromAuth(): void {
    try {
      const authData = localStorage.getItem('myK9Q_auth');
      if (authData) {
        const auth = JSON.parse(authData);
        if (auth.showContext?.licenseKey) {
          this.licenseKey = auth.showContext.licenseKey;
this.loadFavoriteDogs();
        }
      }
    } catch (error) {
      logger.error('Error loading license key from auth:', error);
    }
  }

  /**
   * Load favorited dogs from localStorage
   * Uses the same key pattern as the Home page
   */
  private loadFavoriteDogs(): void {
    try {
      const favoritesKey = `dog_favorites_${this.licenseKey || 'default'}`;
      const savedFavorites = localStorage.getItem(favoritesKey);

      if (savedFavorites) {
        const favoriteIds = JSON.parse(savedFavorites);
        if (Array.isArray(favoriteIds) && favoriteIds.every(id => typeof id === 'number')) {
          this.favoriteDogs = new Set(favoriteIds);
} else {
          logger.warn('Invalid dog favorites data format');
          this.favoriteDogs = new Set();
        }
      } else {
        this.favoriteDogs = new Set();
      }
    } catch (error) {
      logger.error('Error loading dog favorites:', error);
      this.favoriteDogs = new Set();
    }
  }

  /**
   * Check if an entry is favorited by the user
   * @param entry - The entry to check
   * @returns true if favorited, false otherwise
   */
  private isFavorited(entry: Entry): boolean {
    return this.favoriteDogs.has(entry.armband);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (!this.isInitialized) {
return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    this.scheduledWarnings.forEach(timeout => clearTimeout(timeout));
    this.scheduledWarnings.clear();
    this.isInitialized = false;
}

  /**
   * Handle entry changes to detect scoring events
   */
  private handleEntryChanges(currentEntries: Entry[], previousEntries: Entry[]): void {
    // Build a map of previous entries for quick lookup
    const prevMap = new Map(previousEntries.map(e => [e.id, e]));

    currentEntries.forEach(entry => {
      const prevEntry = prevMap.get(entry.id);

      // Detect newly scored entry
      if (prevEntry && !prevEntry.isScored && entry.isScored) {
        this.onEntryScored(entry, prevEntry);
      }

      // Detect entry marked as "in ring"
      if (prevEntry && prevEntry.status !== 'in-ring' && entry.status === 'in-ring') {
        this.onEntryInRing(entry);
      }
    });

    // Update previous entries cache
    this.previousEntries = new Map(currentEntries.map(e => [e.id, e]));
    void this.previousEntries; // Reserved for future entry change detection
  }

  /**
   * Handle current entry changes to detect "your turn" events
   */
  private handleCurrentEntryChanges(current: Entry | null, previous: Entry | null): void {
    // When a new entry becomes current, check if we should notify
    if (current && current !== previous) {
      this.onCurrentEntryChanged(current, previous);
    }
  }

  /**
   * Called when an entry is marked as scored
   * NOTE: We check if the entire class is complete, not individual entries
   */
  private async onEntryScored(entry: Entry, _previousState: Entry): Promise<void> {
    // Always check if class is complete (in-app notification only)
// Check if all entries in this class are now scored
    const { currentClassEntries } = useEntryStore.getState();
    const classEntries = currentClassEntries.filter(e => e.classId === entry.classId);
    const allScored = classEntries.every(e => e.isScored);

    if (allScored && classEntries.length > 0) {
      // Class is complete! Notify about final placements
      await this.onClassComplete(entry.classId, classEntries);
    }
  }

  /**
   * Called when all dogs in a class have been scored
   * This is when placements are final and exhibitors want to know results
   */
  private async onClassComplete(classId: number, entries: Entry[]): Promise<void> {
// Get entries with placements (top 4 typically)
    const placedEntries = entries
      .filter(e => e.placement && e.placement <= 4)
      .sort((a, b) => (a.placement || 0) - (b.placement || 0));

    // Only notify for favorited dogs
    const favoritedPlacedEntries = placedEntries.filter(e => this.isFavorited(e));

    if (favoritedPlacedEntries.length === 0) {
return;
    }

    // Notify each favorited placed entry
    for (const entry of favoritedPlacedEntries) {
      const qualified = entry.resultText?.toLowerCase().includes('q') || false;
      await notifyResultsPosted(entry, entry.placement, qualified);
    }

}

  /**
   * Called when an entry is marked as "in ring"
   */
  private async onEntryInRing(entry: Entry): Promise<void> {
    const { settings } = useSettingsStore.getState();

// Get the unscored entries in order
    const { currentClassEntries } = useEntryStore.getState();
    const unscoredEntries = currentClassEntries.filter(e => !e.isScored);
    const currentIndex = unscoredEntries.findIndex(e => e.id === entry.id);

    if (currentIndex < 0) {
      return; // Entry not found in unscored list
    }

    // Notify the dog that is N dogs ahead (based on user setting)
    const leadDogs = settings.notifyYourTurnLeadDogs;
    const targetIndex = currentIndex + leadDogs;

    if (targetIndex < unscoredEntries.length) {
      const targetEntry = unscoredEntries[targetIndex];
      const dogsAhead = leadDogs;
      await this.onNextEntryUp(targetEntry, entry, dogsAhead);
    }
  }

  /**
   * Called when it's approaching a dog's turn
   */
  private async onNextEntryUp(nextEntry: Entry, currentEntry: Entry, dogsAhead: number): Promise<void> {
    // Only notify if this dog is favorited
    if (!this.isFavorited(nextEntry)) {
return;
    }

// Send notification with context about how many dogs ahead
    await notifyYourTurn(nextEntry, currentEntry, dogsAhead);
  }

  /**
   * Called when the current entry changes (e.g., user navigates to a scoresheet)
   */
  private async onCurrentEntryChanged(current: Entry, _previous: Entry | null): Promise<void> {
    // If current entry is not yet scored and is marked "in ring", might be their turn
    if (!current.isScored && current.inRing) {
// Could send a notification here if appropriate
    }
  }

  /**
   * Register a class schedule for start time warnings
   */
  registerClassSchedule(
    classId: number,
    element: string,
    level: string,
    scheduledStartTime: string
  ): void {
    this.classSchedules.set(classId, {
      classId,
      element,
      level,
      scheduledStartTime,
      warningScheduled: false,
    });

    // Schedule the warning notification
    this.scheduleClassStartWarning(classId);
  }

  /**
   * Schedule a notification for class starting soon
   */
  private scheduleClassStartWarning(classId: number): void {
    const classSchedule = this.classSchedules.get(classId);
    if (!classSchedule || classSchedule.warningScheduled) {
      return;
    }

    const startTime = new Date(classSchedule.scheduledStartTime);
    const warningTime = new Date(startTime.getTime() - 5 * 60 * 1000); // 5 minutes before
    const now = new Date();

    const timeUntilWarning = warningTime.getTime() - now.getTime();

    if (timeUntilWarning > 0) {
      const timeout = setTimeout(async () => {
        await notifyClassStarting(
          {
            id: classSchedule.classId,
            element: classSchedule.element,
            level: classSchedule.level,
            scheduled_start_time: classSchedule.scheduledStartTime,
          },
          5
        );
      }, timeUntilWarning);

      this.scheduledWarnings.set(classId, timeout);
      classSchedule.warningScheduled = true;

}
  }

  /**
   * Check if any classes are starting soon
   * Called periodically to catch classes that were registered after their warning time
   */
  private async checkClassStartWarnings(): Promise<void> {
    const now = new Date();

    this.classSchedules.forEach(async (classSchedule) => {
      if (classSchedule.warningScheduled) {
        return; // Already scheduled
      }

      const startTime = new Date(classSchedule.scheduledStartTime);
      const minutesUntilStart = (startTime.getTime() - now.getTime()) / (60 * 1000);

      // If class starts in 5 minutes (±1 minute window), send notification now
      if (minutesUntilStart >= 4 && minutesUntilStart <= 6) {
        await notifyClassStarting(
          {
            id: classSchedule.classId,
            element: classSchedule.element,
            level: classSchedule.level,
            scheduled_start_time: classSchedule.scheduledStartTime,
          },
          Math.round(minutesUntilStart)
        );

        classSchedule.warningScheduled = true;
      }
    });
  }

  /**
   * Manually trigger a "your turn" notification
   * Useful for testing or manual notifications
   */
  async manuallyNotifyYourTurn(entryId: number): Promise<void> {
    const { entries } = useEntryStore.getState();
    const entry = entries.find(e => e.id === entryId);

    if (!entry) {
      logger.warn(`Entry ${entryId} not found`);
      return;
    }

    await notifyYourTurn(entry);
  }

  /**
   * Manually trigger a "results posted" notification
   */
  async manuallyNotifyResults(entryId: number): Promise<void> {
    const { entries } = useEntryStore.getState();
    const entry = entries.find(e => e.id === entryId);

    if (!entry) {
      logger.warn(`Entry ${entryId} not found`);
      return;
    }

    const qualified = entry.resultText?.toLowerCase().includes('q') || false;
    await notifyResultsPosted(entry, entry.placement, qualified);
  }

  /**
   * Notify about a sync error
   * Call this from your sync/network error handlers
   */
  async notifySyncError(errorMessage: string, operation: string, retryable = true): Promise<void> {
    // In-app notification only
    await notifySyncError(errorMessage, operation, retryable);
  }

}

// Export singleton instance
export const notificationIntegration = NotificationIntegration.getInstance();

// Export for testing
export { NotificationIntegration };
