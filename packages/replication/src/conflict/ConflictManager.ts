/**
 * ConflictManager - Central manager for conflict lifecycle
 * 
 * Provides:
 * - Integration with ConflictResolver
 * - Event system for conflict notifications
 * - Manual resolution API
 * - Conflict history and statistics
 */

import { ConflictResolver, conflictResolver } from './ConflictResolver';
import type {
    ConflictStrategy,
    ConflictResolutionResult,
    Conflict,
    ResolutionContext
} from '../types';

export type ConflictEventType =
    | 'conflict_detected'
    | 'conflict_resolved'
    | 'conflict_failed'
    | 'manual_resolution_required';

export interface ConflictEvent {
    id: string;
    type: ConflictEventType;
    timestamp: Date;
    conflictId?: string;
    entityType?: string;
    entityId?: string;
    data?: Record<string, unknown>;
}

export interface ConflictStats {
    total: number;
    resolved: number;
    pending: number;
}

/**
 * Central manager for conflict lifecycle
 */
export class ConflictManager {
    private resolver: ConflictResolver;
    private listeners: Map<string, Set<(event: ConflictEvent) => void>> = new Map();
    private pendingConflicts: Map<string, Conflict> = new Map();
    private resolutionHistory: Conflict[] = [];
    private stats: ConflictStats = { total: 0, resolved: 0, pending: 0 };

    constructor(resolver?: ConflictResolver) {
        this.resolver = resolver || conflictResolver;
    }

    /**
     * Add event listener
     */
    addEventListener(type: ConflictEventType, handler: (event: ConflictEvent) => void): void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type)!.add(handler);
    }

    /**
     * Remove event listener
     */
    removeEventListener(type: ConflictEventType, handler: (event: ConflictEvent) => void): void {
        if (this.listeners.has(type)) {
            this.listeners.get(type)!.delete(handler);
        }
    }

    /**
     * Notify listeners
     */
    private emit(event: ConflictEvent): void {
        const handlers = this.listeners.get(event.type);
        if (handlers) {
            handlers.forEach(handler => handler(event));
        }
    }

    /**
     * Get conflict statistics
     */
    getConflictStats(): ConflictStats {
        return { ...this.stats };
    }

    /**
     * Get list of pending conflicts
     */
    getPendingConflicts(): Conflict[] {
        return Array.from(this.pendingConflicts.values());
    }

    /**
     * Get conflict by ID
     */
    getConflictById(id: string): Conflict | undefined {
        return this.pendingConflicts.get(id);
    }

    /**
     * Get resolution history
     */
    getResolutionHistory(): Conflict[] {
        return [...this.resolutionHistory];
    }

    /**
     * Resolve a conflict manually
     */
    async resolveConflictManually<T>(
        conflictId: string,
        resolution: { strategy: ConflictStrategy; resolvedEntity: T; userId?: string }
    ): Promise<boolean> {
        const conflict = this.pendingConflicts.get(conflictId);
        if (!conflict) return false;

        conflict.status = 'resolved';
        conflict.resolution = {
            strategy: resolution.strategy,
            resolvedEntity: resolution.resolvedEntity,
            resolvedAt: new Date(),
            resolvedBy: resolution.userId
        };

        this.pendingConflicts.delete(conflictId);
        this.resolutionHistory.push(conflict);

        this.stats.resolved++;
        this.stats.pending = this.pendingConflicts.size;

        this.emit({
            id: `ev-${Date.now()}`,
            type: 'conflict_resolved',
            timestamp: new Date(),
            conflictId,
            entityType: conflict.entityType,
            entityId: conflict.entityId
        });

        return true;
    }

    /**
     * Core logic for handling a sync conflict
     * This is called by ReplicatedTable or SyncEngine during synchronization
     */
    async handleSyncConflict<T extends { id: string }>(
        local: T,
        remote: T,
        base?: T,
        context?: Partial<ResolutionContext>
    ): Promise<ConflictResolutionResult<T>> {
        const strategy: ConflictStrategy = 'last-write-wins'; // Default

        const result = this.resolver.resolve(local, remote, strategy);

        // If it's a conflict that needs manual intervention 
        // For now, we'll mark it as non-automatic if resolver couldn't perfectly merge (example logic)
        const isAutomatic = result.strategy !== 'field-level-merge' || !result.conflictingFields?.length;

        if (!isAutomatic) {
            const conflictId = `conflict-${local.id}-${Date.now()}`;
            const conflict: Conflict<T> = {
                id: conflictId,
                entityId: local.id,
                localData: local,
                remoteData: remote,
                baseData: base,
                detectedAt: new Date(),
                status: 'pending'
            };

            this.pendingConflicts.set(conflictId, conflict);

            this.stats.total++;
            this.stats.pending = this.pendingConflicts.size;

            this.emit({
                id: `ev-${Date.now()}`,
                type: 'manual_resolution_required',
                timestamp: new Date(),
                conflictId,
                entityId: local.id,
                data: { local, remote, base, context }
            });
        }

        return {
            ...result,
            automatic: isAutomatic
        };
    }
}

// Singleton instance
export const conflictManager = new ConflictManager();
