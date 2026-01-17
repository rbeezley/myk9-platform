import {
    replicatedClassesTable,
    replicatedEntriesTable,
    replicatedTrialsTable,
    replicatedShowsTable,
    replicatedDogsTable,
    replicatedClubsTable
} from '@/services/replication';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClub } from '@/services/replication/ReplicatedClubsTable';

type SyncResult = { success: boolean; error?: string; rowsAffected?: number };

/**
 * Interface for replicated table instances
 */
interface IReplicatedTable<T> {
    get(id: string): Promise<T | undefined>;
    getAll(): Promise<T[]>;
    set(id: string, item: T): Promise<void>;
    sync(licenseKey: string): Promise<SyncResult>;
}

// Type mapping for table names to their data types
interface TableTypeMap {
    classes: ReplicatedClass;
    entries: ReplicatedEntry;
    trials: ReplicatedTrial;
    shows: ReplicatedShow;
    dogs: ReplicatedDog;
    clubs: ReplicatedClub;
}

type TableName = keyof TableTypeMap;

/**
 * Simplified ReplicationManager to support existing hooks that expect
 * a centralized manager for table access and synchronization.
 */
class ReplicationManager {
    private tables = {
        classes: replicatedClassesTable as IReplicatedTable<ReplicatedClass>,
        entries: replicatedEntriesTable as IReplicatedTable<ReplicatedEntry>,
        trials: replicatedTrialsTable as IReplicatedTable<ReplicatedTrial>,
        shows: replicatedShowsTable as IReplicatedTable<ReplicatedShow>,
        dogs: replicatedDogsTable as IReplicatedTable<ReplicatedDog>,
        clubs: replicatedClubsTable as IReplicatedTable<ReplicatedClub>,
    };

    /**
     * Get a replicated table by name with proper typing
     */
    getTable<K extends TableName>(name: K): IReplicatedTable<TableTypeMap[K]> | undefined {
        return this.tables[name] as IReplicatedTable<TableTypeMap[K]> | undefined;
    }

    /**
     * Trigger sync for a specific table
     */
    async syncTable(name: TableName, licenseKey: string = ''): Promise<SyncResult> {
        const table = this.tables[name];
        if (table && typeof table.sync === 'function') {
            return await table.sync(licenseKey);
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
