/**
 * Smart Confirmation Service
 *
 * Provides intelligent confirmation dialogs for destructive actions.
 * Features:
 * - Only shows confirmations for destructive actions
 * - Bypass for experienced users (configurable threshold)
 * - Customizable per action type
 * - Tracks user experience level
 * - Settings integration
 *
 * Philosophy:
 * - Don't ask for confirmation on save/create operations
 * - DO ask for delete, clear, reset, override operations
 * - Reduce confirmation fatigue for experienced users
 */

import { logger } from '@/utils/logger';

export type ConfirmationAction =
  | 'delete_result'        // Delete a scored result
  | 'clear_scoresheet'     // Clear all data on active scoresheet
  | 'reset_timer'          // Reset timer during a run
  | 'override_score'       // Manually override auto-calculated score
  | 'disqualify'           // Mark dog as DQ
  | 'change_placement'     // Manually change placement order
  | 'delete_draft'         // Delete an auto-saved draft
  | 'abandon_scoring'      // Leave scoresheet without saving
  | 'clear_all_data'       // Nuclear option - clear all personal data
  | 'logout';              // Logout (usually no confirmation needed)

export interface ConfirmationConfig {
  /** Action type */
  action: ConfirmationAction;
  /** Whether this action requires confirmation */
  requiresConfirmation: boolean;
  /** Bypass threshold (number of successful actions before bypassing) */
  bypassThreshold: number;
  /** Custom message to show */
  message?: string;
  /** Detailed warning (optional) */
  warning?: string;
}

export interface ConfirmationRequest {
  /** Action being performed */
  action: ConfirmationAction;
  /** Title for confirmation dialog */
  title: string;
  /** Message to show user */
  message: string;
  /** Warning text (optional) */
  warning?: string;
  /** Confirm button text (default: "Confirm") */
  confirmText?: string;
  /** Cancel button text (default: "Cancel") */
  cancelText?: string;
  /** Data to pass through to callback */
  data?: Record<string, unknown>;
}

export interface ConfirmationResponse {
  /** Whether user confirmed */
  confirmed: boolean;
  /** Whether to bypass future confirmations for this action */
  bypassFuture?: boolean;
}

class SmartConfirmationService {
  private actionCounts: Map<ConfirmationAction, number> = new Map();
  private bypassedActions: Set<ConfirmationAction> = new Set();
  private readonly STORAGE_KEY = 'myK9Q_confirmation_state';

  // Default configuration for each action type
  private defaultConfigs: Map<ConfirmationAction, ConfirmationConfig> = new Map([
    ['delete_result', {
      action: 'delete_result',
      requiresConfirmation: true,
      bypassThreshold: 15,
      message: 'Delete this scored result?',
      warning: 'This action cannot be undone. The entry will revert to unscored.',
    }],
    ['clear_scoresheet', {
      action: 'clear_scoresheet',
      requiresConfirmation: true,
      bypassThreshold: 5,
      message: 'Clear all data on this scoresheet?',
      warning: 'All entered data will be lost. Use this to start over.',
    }],
    ['reset_timer', {
      action: 'reset_timer',
      requiresConfirmation: true,
      bypassThreshold: 25,
      message: 'Reset the timer?',
      warning: 'Current time will be lost.',
    }],
    ['override_score', {
      action: 'override_score',
      requiresConfirmation: true,
      bypassThreshold: 20,
      message: 'Override the calculated score?',
      warning: 'This will replace the auto-calculated score with your manual entry.',
    }],
    ['disqualify', {
      action: 'disqualify',
      requiresConfirmation: true,
      bypassThreshold: 8,
      message: 'Disqualify this dog?',
      warning: 'This will mark the entry as DQ. The entry can be un-DQ\'d later if needed.',
    }],
    ['change_placement', {
      action: 'change_placement',
      requiresConfirmation: true,
      bypassThreshold: 12,
      message: 'Manually change placement?',
      warning: 'This will override the automatic placement order.',
    }],
    ['delete_draft', {
      action: 'delete_draft',
      requiresConfirmation: true,
      bypassThreshold: 10,
      message: 'Delete this auto-saved draft?',
      warning: 'This action cannot be undone.',
    }],
    ['abandon_scoring', {
      action: 'abandon_scoring',
      requiresConfirmation: true,
      bypassThreshold: 0, // Always confirm leaving without saving
      message: 'Leave without saving?',
      warning: 'All unsaved changes will be lost.',
    }],
    ['clear_all_data', {
      action: 'clear_all_data',
      requiresConfirmation: true,
      bypassThreshold: 0, // Never bypass - too dangerous!
      message: 'Clear all personal data?',
      warning: 'This will permanently delete all your settings, favorites, and preferences.',
    }],
    ['logout', {
      action: 'logout',
      requiresConfirmation: false, // Don't confirm logout by default
      bypassThreshold: 0,
    }],
  ]);

  constructor() {
    this.loadState();
  }

  /**
   * Load saved state from localStorage
   */
  private loadState(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const state = JSON.parse(stored);
        // Properly type the Map entries
        const counts = state.counts || {};
        Object.entries(counts).forEach(([key, value]) => {
          this.actionCounts.set(key as ConfirmationAction, value as number);
        });
        this.bypassedActions = new Set(state.bypassed || []);
      }
    } catch (error) {
      logger.error('[SmartConfirmation] Failed to load state:', error);
    }
  }

  /**
   * Save state to localStorage
   */
  private saveState(): void {
    try {
      const state = {
        counts: Object.fromEntries(this.actionCounts),
        bypassed: Array.from(this.bypassedActions),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      logger.error('[SmartConfirmation] Failed to save state:', error);
    }
  }

  /**
   * Check if confirmation is required for an action
   */
  public requiresConfirmation(action: ConfirmationAction): boolean {
    // Check if bypassed by user
    if (this.bypassedActions.has(action)) {
      return false;
    }

    const config = this.defaultConfigs.get(action);
    if (!config || !config.requiresConfirmation) {
      return false;
    }

    // Check if user has reached bypass threshold
    const count = this.actionCounts.get(action) || 0;
    if (config.bypassThreshold > 0 && count >= config.bypassThreshold) {
      return false;
    }

    return true;
  }

  /**
   * Request confirmation from user
   * Returns a promise that resolves when user confirms/cancels
   */
  public async requestConfirmation(
    request: ConfirmationRequest
  ): Promise<ConfirmationResponse> {
    // Check if confirmation is required
    if (!this.requiresConfirmation(request.action)) {
      // Auto-confirm, but still track the action
      this.recordAction(request.action, true);
      return { confirmed: true };
    }

    // Show confirmation dialog (caller will implement UI)
    // This is a placeholder - actual implementation depends on UI framework
    return new Promise((resolve) => {
      // Emit custom event for UI to handle
      const event = new CustomEvent('smart-confirmation-request', {
        detail: {
          request,
          resolve,
        },
      });
      window.dispatchEvent(event);
    });
  }

  /**
   * Record an action (confirmed or cancelled)
   */
  public recordAction(action: ConfirmationAction, confirmed: boolean): void {
    if (!confirmed) return;

    const currentCount = this.actionCounts.get(action) || 0;
    this.actionCounts.set(action, currentCount + 1);
    this.saveState();
  }

  /**
   * Bypass future confirmations for an action
   */
  public bypassAction(action: ConfirmationAction): void {
    this.bypassedActions.add(action);
    this.saveState();
  }

  /**
   * Re-enable confirmations for an action
   */
  public enableAction(action: ConfirmationAction): void {
    this.bypassedActions.delete(action);
    this.saveState();
  }

  /**
   * Get configuration for an action
   */
  public getConfig(action: ConfirmationAction): ConfirmationConfig | undefined {
    return this.defaultConfigs.get(action);
  }

  /**
   * Update configuration for an action
   */
  public setConfig(action: ConfirmationAction, config: Partial<ConfirmationConfig>): void {
    const current = this.defaultConfigs.get(action);
    if (current) {
      this.defaultConfigs.set(action, { ...current, ...config });
    }
  }

  /**
   * Get action count (for experience tracking)
   */
  public getActionCount(action: ConfirmationAction): number {
    return this.actionCounts.get(action) || 0;
  }

  /**
   * Check if user has bypassed an action
   */
  public isBypassed(action: ConfirmationAction): boolean {
    return this.bypassedActions.has(action);
  }

  /**
   * Get user experience level (0-100)
   * Based on total actions across all types
   */
  public getExperienceLevel(): number {
    const totalActions = Array.from(this.actionCounts.values()).reduce((sum, count) => sum + count, 0);

    // Experience levels:
    // 0-10 actions: Novice (0-20)
    // 11-50 actions: Intermediate (21-50)
    // 51-100 actions: Advanced (51-80)
    // 100+ actions: Expert (81-100)

    if (totalActions <= 10) {
      return Math.min(20, totalActions * 2);
    } else if (totalActions <= 50) {
      return 20 + Math.min(30, (totalActions - 10) * 0.75);
    } else if (totalActions <= 100) {
      return 50 + Math.min(30, (totalActions - 50) * 0.6);
    } else {
      return Math.min(100, 80 + Math.min(20, (totalActions - 100) * 0.1));
    }
  }

  /**
   * Get experience label
   */
  public getExperienceLabel(): string {
    const level = this.getExperienceLevel();

    if (level < 20) return 'Novice';
    if (level < 50) return 'Intermediate';
    if (level < 80) return 'Advanced';
    return 'Expert';
  }

  /**
   * Reset all confirmation state (for testing or settings)
   */
  public resetAll(): void {
    this.actionCounts.clear();
    this.bypassedActions.clear();
    this.saveState();
  }

  /**
   * Reset confirmation state for a specific action
   */
  public resetAction(action: ConfirmationAction): void {
    this.actionCounts.delete(action);
    this.bypassedActions.delete(action);
    this.saveState();
  }

  /**
   * Get all statistics
   */
  public getStats(): {
    experienceLevel: number;
    experienceLabel: string;
    totalActions: number;
    bypassedCount: number;
    actionBreakdown: Array<{ action: string; count: number; bypassed: boolean }>;
  } {
    const actionBreakdown = Array.from(this.defaultConfigs.keys()).map(action => ({
      action,
      count: this.getActionCount(action),
      bypassed: this.isBypassed(action),
    }));

    return {
      experienceLevel: this.getExperienceLevel(),
      experienceLabel: this.getExperienceLabel(),
      totalActions: Array.from(this.actionCounts.values()).reduce((sum, count) => sum + count, 0),
      bypassedCount: this.bypassedActions.size,
      actionBreakdown,
    };
  }
}

// Singleton instance
const smartConfirmationService = new SmartConfirmationService();

export default smartConfirmationService;
