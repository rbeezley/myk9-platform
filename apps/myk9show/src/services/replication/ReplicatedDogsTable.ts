/**
 * ReplicatedDogsTable - Offline-first dog data replication for myK9Show
 *
 * Manages dog data with offline support using @myk9/replication.
 *
 * Conflict Resolution:
 * - Server-authoritative for registration data
 * - Local changes to optional fields preserved
 */

import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import type { Database } from '@/types/supabase';

/**
 * Database row type from Supabase schema
 */
type DogRow = Database['public']['Tables']['dogs']['Row'];

/**
 * App-level Dog type with camelCase fields and sync metadata
 */
export interface ReplicatedDog {
  id: string;
  name: string;
  callName?: string;
  breed: string;
  sex?: string;
  dateOfBirth?: string;
  ownerId?: string;
  height?: string;
  weight?: string;
  color?: string;
  microchipNumber?: string;
  isSpayedNeutered?: boolean;
  imageUrl?: string;
  // Sync metadata
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

/**
 * Convert database row to app Dog type
 */
function rowToDog(row: DogRow): ReplicatedDog {
  return {
    id: String(row.id),
    name: row.name,
    callName: row.call_name ?? undefined,
    breed: row.breed,
    sex: row.sex ?? undefined,
    dateOfBirth: row.date_of_birth ?? undefined,
    ownerId: row.owner_id ?? undefined,
    height: row.height ?? undefined,
    weight: row.weight ?? undefined,
    color: row.color ?? undefined,
    microchipNumber: row.microchip_number ?? undefined,
    isSpayedNeutered: row.spayed_neutered ?? undefined,
    imageUrl: row.image_url ?? undefined,
  };
}

export class ReplicatedDogsTable extends ReplicatedTable<ReplicatedDog> {
  constructor() {
    super('dogs', undefined, { logger });
  }

  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      const metadata = await this.getSyncMetadata();
      const allCached = await this.getAll();
      const isCacheEmpty = allCached.length === 0;
      const lastSync = isCacheEmpty ? 0 : (metadata?.lastIncrementalSyncAt || 0);

      logger.log(`[${this.getTableName()}] Starting sync`);

      // Filter by owner_id if provided
      let query = supabase
        .from('dogs')
        .select('*')
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      if (licenseKey) {
        query = query.eq('owner_id', licenseKey);
      }

      const { data: remoteDogs, error } = await query;

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteDogs || remoteDogs.length === 0) {
        await this.updateSyncMetadata({
          lastIncrementalSyncAt: Date.now(),
          syncStatus: 'idle',
        });

        return {
          tableName: this.getTableName(),
          success: true,
          operation: 'incremental-sync',
          rowsAffected: 0,
          conflictsResolved: 0,
          duration: Date.now() - startTime,
        };
      }

      for (const remoteRow of remoteDogs) {
        const dogId = String(remoteRow.id);
        const remoteDog = rowToDog(remoteRow);
        const localDog = await this.get(dogId);

        if (localDog) {
          const resolved = this.resolveConflict(localDog, remoteDog);
          await this.set(dogId, resolved);
          conflictsResolved++;
        } else {
          await this.set(dogId, remoteDog);
        }

        rowsSynced++;
      }

      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
      });

      return {
        tableName: this.getTableName(),
        success: true,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[${this.getTableName()}] Sync failed:`, error);

      return {
        tableName: this.getTableName(),
        success: false,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Conflict resolution for dogs - server wins, preserve local image
   */
  protected resolveConflict(local: ReplicatedDog, remote: ReplicatedDog): ReplicatedDog {
    return {
      ...remote,
      imageUrl: remote.imageUrl || local.imageUrl,
    };
  }

  /**
   * Get all dogs
   */
  async getAllDogs(): Promise<ReplicatedDog[]> {
    return this.getAll();
  }

  /**
   * Get dog by ID
   */
  async getDogById(dogId: string): Promise<ReplicatedDog | null> {
    return this.get(dogId);
  }

  /**
   * Get dogs by owner
   */
  async getDogsByOwner(ownerId: string): Promise<ReplicatedDog[]> {
    const allDogs = await this.getAll();
    return allDogs.filter(dog => dog.ownerId === ownerId);
  }

  /**
   * Search dogs by name
   */
  async searchDogs(query: string): Promise<ReplicatedDog[]> {
    const allDogs = await this.getAll();
    const lowerQuery = query.toLowerCase();

    return allDogs.filter(dog =>
      dog.name.toLowerCase().includes(lowerQuery) ||
      dog.callName?.toLowerCase().includes(lowerQuery) ||
      dog.breed.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get dogs by breed
   */
  async getDogsByBreed(breed: string): Promise<ReplicatedDog[]> {
    const allDogs = await this.getAll();
    return allDogs.filter(dog => dog.breed.toLowerCase() === breed.toLowerCase());
  }

  /**
   * Update dog (marks as dirty for sync)
   */
  async updateDog(dogId: string, updates: Partial<ReplicatedDog>): Promise<void> {
    const dog = await this.get(dogId);
    if (!dog) {
      throw new Error(`Dog ${dogId} not found`);
    }

    const updated: ReplicatedDog = {
      ...dog,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(dogId, updated, true);
    logger.log(`[${this.getTableName()}] Updated dog ${dogId}`);
  }

  /**
   * Create a new dog locally
   */
  async createDog(dog: Omit<ReplicatedDog, 'id'>): Promise<ReplicatedDog> {
    const id = crypto.randomUUID();
    const newDog: ReplicatedDog = {
      ...dog,
      id,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(id, newDog, true);
    logger.log(`[${this.getTableName()}] Created new dog ${id}`);
    return newDog;
  }
}

// Singleton export
export const replicatedDogsTable = new ReplicatedDogsTable();
