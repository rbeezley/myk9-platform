import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import type { DogInput } from '@/store/dogStore';

type RegistrationInput = NonNullable<DogInput['registrations']>[number];

export interface ReplicatedDogRegistration {
  id: string;
  dogId: string;
  organization: string;
  registrationNumber: string;
  registeredName?: string | null;
  breed?: string | null;
  status?: string | null;
  verified?: boolean | null;
  _version?: number;
  _lastModified?: Date;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

function normalizeRegistration(input: RegistrationInput): Omit<ReplicatedDogRegistration, 'id'> {
  return {
    dogId: '',
    organization: input.organization || 'AKC',
    registrationNumber: input.number || '',
    registeredName: input.registeredName || null,
    breed: input.type || null,
    status: input.status || 'pending',
    verified: false,
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

    for (const input of registrations) {
      const normalized = normalizeRegistration(input);
      const registration: ReplicatedDogRegistration = {
        ...normalized,
        dogId,
        id: crypto.randomUUID(),
        _version: 1,
        _lastModified: new Date(),
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

    for (const input of registrations) {
      const normalized = normalizeRegistration(input);
      const registration: ReplicatedDogRegistration = {
        ...normalized,
        dogId,
        id: crypto.randomUUID(),
        _version: 1,
        _lastModified: new Date(),
        _syncStatus: 'pending',
        _localOnly: true,
      };

      await this.set(registration.id, registration, false);
      saved.push(registration);
    }

    return saved;
  }

  async getPendingMutationIdsForDog(dogId: string): Promise<string[]> {
    const registrations = (await this.getAll()).filter(registration => registration.dogId === dogId);
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
      registered_name: registration.registeredName ?? null,
      breed: registration.breed ?? null,
      status: registration.status ?? 'pending',
      verified: registration.verified ?? false,
      updated_at: new Date().toISOString(),
    };
  }
}

export const replicatedDogRegistrationsTable = new ReplicatedDogRegistrationsTable();
