/**
 * ConflictManager stub
 *
 * The real conflict resolution implementation lives in the @myk9/replication package.
 * This file exists solely to satisfy module resolution for tests while the local
 * implementation is pending. Tests that reference this module use vi.mock() and
 * describe.skip to avoid executing unimplemented code.
 *
 * TODO: Implement local ConflictManager or re-export from @myk9/replication.
 */

export type ConflictEventType =
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'conflict_failed'
  | 'manual_resolution_required';

export interface ConflictEvent {
  type: ConflictEventType;
  entityType?: string;
  entityId?: string;
  [key: string]: unknown;
}

export class ConflictManager {
  private static _instance: ConflictManager | null = null;

  static getInstance(_config?: Record<string, unknown>): ConflictManager {
    if (!ConflictManager._instance) {
      ConflictManager._instance = new ConflictManager();
    }
    return ConflictManager._instance;
  }

  async handleSyncConflict(..._args: unknown[]): Promise<never> {
    throw new Error('ConflictManager.handleSyncConflict not implemented');
  }

  async batchProcessConflicts(..._args: unknown[]): Promise<never> {
    throw new Error('ConflictManager.batchProcessConflicts not implemented');
  }

  async resolveConflictManually(..._args: unknown[]): Promise<never> {
    throw new Error('ConflictManager.resolveConflictManually not implemented');
  }

  addEventListener(_type: ConflictEventType, _handler: (event: ConflictEvent) => void): void {
    throw new Error('ConflictManager.addEventListener not implemented');
  }

  removeEventListener(_type: ConflictEventType, _handler: (event: ConflictEvent) => void): void {
    throw new Error('ConflictManager.removeEventListener not implemented');
  }

  getConflictStats(): Record<string, unknown> {
    throw new Error('ConflictManager.getConflictStats not implemented');
  }

  getResolutionHistory(): unknown[] {
    throw new Error('ConflictManager.getResolutionHistory not implemented');
  }

  clearResolvedConflicts(): void {
    throw new Error('ConflictManager.clearResolvedConflicts not implemented');
  }

  getPendingConflicts(_filters?: Record<string, unknown>): unknown[] {
    throw new Error('ConflictManager.getPendingConflicts not implemented');
  }
}
