import {
    replicatedClassesTable,
    replicatedEntriesTable,
    replicatedTrialsTable,
    replicatedShowsTable,
    replicatedDogsTable,
    replicatedClubsTable
} from '@/services/replication';

// Define the shape of replicated tables
type ReplicatedTable = {
    sync?: () => Promise<{ success: boolean; error?: string }>;
    [key: string]: unknown;
};

type SyncResult = { success: boolean; error?: string };

/**
 * Simplified ReplicationManager to support existing hooks that expect
 * a centralized manager for table access and synchronization.
 */
class ReplicationManager {
    private tables: Record<string, ReplicatedTable> = {
        classes: replicatedClassesTable,
        entries: replicatedEntriesTable,
        trials: replicatedTrialsTable,
        shows: replicatedShowsTable,
        dogs: replicatedDogsTable,
        clubs: replicatedClubsTable
    };

    /**
     * Get a replicated table by name
     */
    getTable(name: string): ReplicatedTable | undefined {
        return this.tables[name];
    }

    /**
     * Trigger sync for a specific table
     */
    async syncTable(name: string): Promise<SyncResult> {
        const table = this.getTable(name);
        if (table && typeof table.sync === 'function') {
            return await table.sync();
        }
        return { success: false, error: `Table ${name} not found or sync not supported` };
    }
}

const manager = new ReplicationManager();

/**
 * Ensures the replication manager is initialized and returns it.
 * This pattern is used by several hooks in the application.
 */
export async function ensureReplicationManager(): Promise<ReplicationManager> {
    // Singleton instance is already initialized
    return manager;
}
