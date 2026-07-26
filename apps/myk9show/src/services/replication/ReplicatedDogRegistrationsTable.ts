import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import type { DogInput } from '@/store/dogStore';

type RegistrationInput = NonNullable<DogInput['registrations']>[number];

export interface ReplicatedDogRegistration {
  id: string;
  dogId: string;
  organization: string;
  registrationNumber: string;
  /**
   * The identity resolver's ordering fields. Locally-cached registrations are
   * merged with server rows before breed resolution, so dropping these made the
   * comparator fall back to ordering by `id` for any dog with an offline
   * registration (MYK9-90 review round 2).
   *
   * `createdAt` is REQUIRED (#1480) because both creation paths now always stamp
   * it. `isPrimary` stays optional and read-only here until its migration is
   * pushed — see `toSupabaseRow`.
   */
  createdAt: string;
  isPrimary?: boolean | null;
  registeredName?: string | null;
  breed?: string | null;
  status?: string | null;
  verified?: boolean | null;
  _version?: number;
  _lastModified?: Date;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

/**
 * Distinct, ordered creation timestamps for a batch.
 *
 * A plain `new Date().toISOString()` per row ties when several registrations are
 * created in the same millisecond — which is the normal case for a batch — and a
 * tie sends the resolver to its `id` (random UUID) tiebreak. Offsetting by index
 * keeps creation ORDER, so the first registration entered stays primary.
 */
export function createRegistrationTimestamps(count: number): string[] {
  const base = Date.now();
  return Array.from({ length: count }, (_, i) => new Date(base + i).toISOString());
}

function normalizeRegistration(
  input: RegistrationInput,
  createdAt: string
): Omit<ReplicatedDogRegistration, 'id'> {
  return {
    dogId: '',
    organization: input.organization || 'AKC',
    registrationNumber: input.number || '',
    registeredName: input.registeredName || null,
    breed: input.type || null,
    status: input.status || 'pending',
    verified: false,
    // Stamped at construction, NOT left for the server default. The identity
    // resolver orders by `created_at`, so without it a dog created offline with
    // several registrations resolved by random UUID rather than creation order
    // until a server round trip (MYK9-90 review round 3).
    createdAt,
  };
}

export class ReplicatedDogRegistrationsTable extends ReplicatedTable<ReplicatedDogRegistration> {
  constructor() {
    super('dog_registrations', undefined, { logger });
  }

  async sync(): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  async createRegistrationsForDog(
    dogId: string,
    registrations: RegistrationInput[],
    options: { dependsOn?: string[] } = {}
  ): Promise<ReplicatedDogRegistration[]> {
    const saved: ReplicatedDogRegistration[] = [];

    // `createdAt` comes from `creationTimestamps`, NOT from a per-row
    // `new Date()`: rows created in the same millisecond would tie, and a tie
    // sends the resolver back to its random-UUID tiebreak.
    const createdAts = createRegistrationTimestamps(registrations.length);
    for (const [index, input] of registrations.entries()) {
      const normalized = normalizeRegistration(input, createdAts[index]!);
      const registration: ReplicatedDogRegistration = {
        ...normalized,
        dogId,
        id: crypto.randomUUID(),
        _version: 1,
        _lastModified: new Date(normalized.createdAt),
        _syncStatus: 'pending',
        _localOnly: true,
      };

      await this.set(registration.id, registration, true);
      await this.queueMutation(
        'INSERT',
        registration.id,
        this.toSupabaseRow(registration),
        options.dependsOn
      );
      saved.push(registration);
    }

    return saved;
  }

  async createLocalRegistrationsForDog(
    dogId: string,
    registrations: RegistrationInput[]
  ): Promise<ReplicatedDogRegistration[]> {
    const saved: ReplicatedDogRegistration[] = [];

    // `createdAt` comes from `creationTimestamps`, NOT from a per-row
    // `new Date()`: rows created in the same millisecond would tie, and a tie
    // sends the resolver back to its random-UUID tiebreak.
    const createdAts = createRegistrationTimestamps(registrations.length);
    for (const [index, input] of registrations.entries()) {
      const normalized = normalizeRegistration(input, createdAts[index]!);
      const registration: ReplicatedDogRegistration = {
        ...normalized,
        dogId,
        id: crypto.randomUUID(),
        _version: 1,
        _lastModified: new Date(normalized.createdAt),
        _syncStatus: 'pending',
        _localOnly: true,
      };

      await this.set(registration.id, registration, false);
      saved.push(registration);
    }

    return saved;
  }

  async getPendingMutationIdsForDog(dogId: string): Promise<string[]> {
    const registrations = (await this.getAll()).filter(
      registration => registration.dogId === dogId
    );
    const pendingIds = await Promise.all(
      registrations.map(registration => this.getPendingMutationIdsForRow(registration.id))
    );

    return pendingIds.flat();
  }

  async getRegistrationsForDogs(dogIds: string[]): Promise<Record<string, unknown>[]> {
    if (dogIds.length === 0) return [];

    const dogIdSet = new Set(dogIds);
    const registrations = await this.getAll();
    return registrations
      .filter(registration => dogIdSet.has(registration.dogId))
      .map(registration => this.toSupabaseRow(registration));
  }

  async getRegistrationsForDog(dogId: string): Promise<Record<string, unknown>[]> {
    return this.getRegistrationsForDogs([dogId]);
  }

  protected resolveConflict(
    local: ReplicatedDogRegistration,
    _remote: ReplicatedDogRegistration
  ): ReplicatedDogRegistration {
    return local;
  }

  toSupabaseRow(registration: ReplicatedDogRegistration): Record<string, unknown> {
    return {
      id: registration.id,
      dog_id: registration.dogId,
      organization: registration.organization,
      registration_number: registration.registrationNumber,
      // Carried so the merged local+server list keeps the resolver's ordering.
      // `is_primary` is deliberately NOT written: its migration is unpushed, so
      // emitting it would fail against the live schema.
      created_at: registration.createdAt,
      registered_name: registration.registeredName ?? null,
      breed: registration.breed ?? null,
      status: registration.status ?? 'pending',
      verified: registration.verified ?? false,
      updated_at: new Date().toISOString(),
    };
  }
}

export const replicatedDogRegistrationsTable = new ReplicatedDogRegistrationsTable();
