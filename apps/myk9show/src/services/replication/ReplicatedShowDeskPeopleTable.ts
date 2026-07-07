import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';

export interface ShowDeskPersonInput {
  id?: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  status?: string;
}

export interface ReplicatedShowDeskPerson {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  status: string;
  _version?: number;
  _lastModified?: Date;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

export class ReplicatedShowDeskPeopleTable extends ReplicatedTable<ReplicatedShowDeskPerson> {
  private _lastMutationId: string | null = null;

  constructor() {
    super('people', undefined, { logger });
  }

  get lastMutationId(): string | null {
    return this._lastMutationId;
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

  async createPerson(input: ShowDeskPersonInput): Promise<ReplicatedShowDeskPerson> {
    const id = input.id ?? crypto.randomUUID();
    const person: ReplicatedShowDeskPerson = {
      id,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      zipCode: input.zipCode?.trim() || null,
      status: input.status ?? 'active',
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(id, person, true);
    this._lastMutationId = await this.queueMutation('INSERT', id, this.toSupabaseRow(person));
    logger.log(`[${this.getTableName()}] Created show-desk person ${id}`);

    return person;
  }

  protected resolveConflict(
    local: ReplicatedShowDeskPerson,
    _remote: ReplicatedShowDeskPerson
  ): ReplicatedShowDeskPerson {
    return local;
  }

  private toSupabaseRow(person: ReplicatedShowDeskPerson): Record<string, unknown> {
    return {
      id: person.id,
      first_name: person.firstName,
      last_name: person.lastName,
      email: person.email ?? null,
      phone: person.phone ?? null,
      address: person.address ?? null,
      city: person.city ?? null,
      state: person.state ?? null,
      zip_code: person.zipCode ?? null,
      status: person.status,
      updated_at: new Date().toISOString(),
    };
  }
}

export const replicatedShowDeskPeopleTable = new ReplicatedShowDeskPeopleTable();
