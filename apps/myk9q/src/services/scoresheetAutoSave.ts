/**
 * Scoresheet Auto-Save Service
 *
 * Automatically saves scoresheet drafts to prevent data loss.
 * Features:
 * - Configurable auto-save intervals
 * - Draft management (save, load, delete)
 * - Conflict detection (multiple devices)
 * - Recovery mechanism for crashes
 * - Settings integration
 *
 * Storage Strategy:
 * - localStorage for quick access
 * - IndexedDB for larger drafts (future enhancement)
 * - Supabase for cloud backup (optional)
 */

import { logger } from '@/utils/logger';

export interface ScoresheetDraft {
  /** Unique ID for the draft */
  id: string;
  /** Entry ID being scored */
  entryId: string;
  /** Trial ID */
  trialId: string;
  /** Draft data (scoresheet-specific) */
  data: Record<string, unknown>;
  /** Timestamp of last save */
  lastSaved: number;
  /** Version number (for conflict detection) */
  version: number;
  /** Device ID (for multi-device detection) */
  deviceId: string;
}

export interface AutoSaveConfig {
  /** Auto-save interval in milliseconds (default: 10000 = 10 seconds) */
  interval: number;
  /** Enable auto-save (default: true) */
  enabled: boolean;
  /** Maximum drafts to keep per entry (default: 3) */
  maxDraftsPerEntry: number;
  /** Enable cloud backup (default: false) */
  cloudBackup: boolean;
}

class ScoresheetAutoSaveService {
  private config: AutoSaveConfig = {
    interval: 10000, // 10 seconds
    enabled: true,
    maxDraftsPerEntry: 3,
    cloudBackup: false,
  };

  private timers: Map<string, NodeJS.Timeout> = new Map();
  private deviceId: string;
  private readonly STORAGE_PREFIX = 'scoresheet_draft_';
  private readonly RECOVERY_PREFIX = 'scoresheet_recovery_';

  constructor() {
    // Generate or retrieve device ID
    this.deviceId = this.getOrCreateDeviceId();

    // Set up recovery listener for page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
    }
  }

  /**
   * Get or create a unique device ID
   */
  private getOrCreateDeviceId(): string {
    const key = 'myK9Q_device_id';
    let deviceId = localStorage.getItem(key);

    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(key, deviceId);
    }

    return deviceId;
  }

  /**
   * Update auto-save configuration
   */
  public setConfig(config: Partial<AutoSaveConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  public getConfig(): AutoSaveConfig {
    return { ...this.config };
  }

  /**
   * Start auto-saving for a scoresheet
   */
  public startAutoSave(
    draftId: string,
    getData: () => Record<string, unknown>,
    entryId: string,
    trialId: string
  ): void {
    if (!this.config.enabled) return;

    // Clear existing timer if any
    this.stopAutoSave(draftId);

    // Set up new auto-save timer
    const timer = setInterval(() => {
      const data = getData();
      this.saveDraft({
        id: draftId,
        entryId,
        trialId,
        data,
        lastSaved: Date.now(),
        version: this.getNextVersion(draftId),
        deviceId: this.deviceId,
      });
    }, this.config.interval);

    this.timers.set(draftId, timer);
  }

  /**
   * Stop auto-saving for a scoresheet
   */
  public stopAutoSave(draftId: string): void {
    const timer = this.timers.get(draftId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(draftId);
    }
  }

  /**
   * Save a draft manually
   */
  public saveDraft(draft: ScoresheetDraft): void {
    const key = `${this.STORAGE_PREFIX}${draft.id}`;

    try {
      localStorage.setItem(key, JSON.stringify(draft));
// Clean up old drafts
      this.cleanupOldDrafts(draft.entryId);
    } catch (error) {
      logger.error('[AutoSave] Failed to save draft:', error);
    }
  }

  /**
   * Load a draft
   */
  public loadDraft(draftId: string): ScoresheetDraft | null {
    const key = `${this.STORAGE_PREFIX}${draftId}`;

    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const draft: ScoresheetDraft = JSON.parse(stored);

      // Check for conflicts (different device)
      if (draft.deviceId !== this.deviceId) {
        logger.warn(`[AutoSave] Draft from different device: ${draft.deviceId}`);
      }

      return draft;
    } catch (error) {
      logger.error('[AutoSave] Failed to load draft:', error);
      return null;
    }
  }

  /**
   * Get all drafts for an entry
   */
  public getDraftsForEntry(entryId: string): ScoresheetDraft[] {
    const drafts: ScoresheetDraft[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(this.STORAGE_PREFIX)) continue;

        const stored = localStorage.getItem(key);
        if (!stored) continue;

        const draft: ScoresheetDraft = JSON.parse(stored);
        if (draft.entryId === entryId) {
          drafts.push(draft);
        }
      }
    } catch (error) {
      logger.error('[AutoSave] Failed to get drafts:', error);
    }

    // Sort by last saved (newest first)
    return drafts.sort((a, b) => b.lastSaved - a.lastSaved);
  }

  /**
   * Delete a draft
   */
  public deleteDraft(draftId: string): void {
    const key = `${this.STORAGE_PREFIX}${draftId}`;
    localStorage.removeItem(key);
    this.stopAutoSave(draftId);
  }

  /**
   * Delete all drafts for an entry
   */
  public deleteDraftsForEntry(entryId: string): void {
    const drafts = this.getDraftsForEntry(entryId);
    drafts.forEach(draft => this.deleteDraft(draft.id));
  }

  /**
   * Clean up old drafts (keep only maxDraftsPerEntry most recent)
   */
  private cleanupOldDrafts(entryId: string): void {
    const drafts = this.getDraftsForEntry(entryId);

    if (drafts.length > this.config.maxDraftsPerEntry) {
      // Delete oldest drafts
      const toDelete = drafts.slice(this.config.maxDraftsPerEntry);
      toDelete.forEach(draft => this.deleteDraft(draft.id));
    }
  }

  /**
   * Get the next version number for a draft
   */
  private getNextVersion(draftId: string): number {
    const draft = this.loadDraft(draftId);
    return draft ? draft.version + 1 : 1;
  }

  /**
   * Handle page unload - save recovery data
   */
  private handleBeforeUnload(): void {
    // Save recovery data for all active timers
    this.timers.forEach((_, draftId) => {
      const draft = this.loadDraft(draftId);
      if (draft) {
        const recoveryKey = `${this.RECOVERY_PREFIX}${draftId}`;
        localStorage.setItem(recoveryKey, JSON.stringify({
          ...draft,
          recoveryTimestamp: Date.now(),
        }));
      }
    });
  }

  /**
   * Check for recovery data (e.g., after a crash)
   */
  public hasRecoveryData(draftId: string): boolean {
    const recoveryKey = `${this.RECOVERY_PREFIX}${draftId}`;
    return localStorage.getItem(recoveryKey) !== null;
  }

  /**
   * Load recovery data
   */
  public loadRecoveryData(draftId: string): ScoresheetDraft | null {
    const recoveryKey = `${this.RECOVERY_PREFIX}${draftId}`;

    try {
      const stored = localStorage.getItem(recoveryKey);
      if (!stored) return null;

      const recovery = JSON.parse(stored);

      // Only recover if recent (within last hour)
      const age = Date.now() - recovery.recoveryTimestamp;
      if (age > 60 * 60 * 1000) {
        this.clearRecoveryData(draftId);
        return null;
      }

      return recovery;
    } catch (error) {
      logger.error('[AutoSave] Failed to load recovery data:', error);
      return null;
    }
  }

  /**
   * Clear recovery data
   */
  public clearRecoveryData(draftId: string): void {
    const recoveryKey = `${this.RECOVERY_PREFIX}${draftId}`;
    localStorage.removeItem(recoveryKey);
  }

  /**
   * Detect conflicts between drafts (e.g., from different devices)
   */
  public detectConflict(draftId: string, localVersion: number): boolean {
    const stored = this.loadDraft(draftId);

    if (!stored) return false;

    // Conflict if stored version is higher than local version
    // or if from a different device
    return stored.version > localVersion || stored.deviceId !== this.deviceId;
  }

  /**
   * Get conflict resolution options
   */
  public getConflictResolutionOptions(draftId: string): {
    local: ScoresheetDraft | null;
    remote: ScoresheetDraft | null;
  } {
    const stored = this.loadDraft(draftId);

    return {
      local: null, // Caller should provide local version
      remote: stored,
    };
  }

  /**
   * Merge two draft versions (simple strategy: use latest)
   */
  public mergeDrafts(draft1: ScoresheetDraft, draft2: ScoresheetDraft): ScoresheetDraft {
    // Use the most recent draft
    return draft1.lastSaved > draft2.lastSaved ? draft1 : draft2;
  }

  /**
   * Clear all auto-save data (for settings/testing)
   */
  public clearAllDrafts(): void {
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(this.STORAGE_PREFIX) || key.startsWith(this.RECOVERY_PREFIX))) {
        keys.push(key);
      }
    }

    keys.forEach(key => localStorage.removeItem(key));

    // Stop all timers
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers.clear();
  }

  /**
   * Get storage usage statistics
   */
  public getStorageStats(): {
    draftCount: number;
    totalSize: number;
    oldestDraft: number | null;
    newestDraft: number | null;
  } {
    let draftCount = 0;
    let totalSize = 0;
    let oldestDraft: number | null = null;
    let newestDraft: number | null = null;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(this.STORAGE_PREFIX)) continue;

      const value = localStorage.getItem(key);
      if (!value) continue;

      draftCount++;
      totalSize += value.length;

      try {
        const draft: ScoresheetDraft = JSON.parse(value);
        if (oldestDraft === null || draft.lastSaved < oldestDraft) {
          oldestDraft = draft.lastSaved;
        }
        if (newestDraft === null || draft.lastSaved > newestDraft) {
          newestDraft = draft.lastSaved;
        }
      } catch {
        // Skip invalid drafts
      }
    }

    return {
      draftCount,
      totalSize,
      oldestDraft,
      newestDraft,
    };
  }
}

// Singleton instance
const scoresheetAutoSaveService = new ScoresheetAutoSaveService();

export default scoresheetAutoSaveService;
