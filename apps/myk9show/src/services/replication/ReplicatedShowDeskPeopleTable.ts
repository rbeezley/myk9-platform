import {
  REPLICATION_STORES,
  ReplicatedTable,
  type ReplicatedRow,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { SHARED_CONTACT_KEYS, type SharedContactKey } from '@/utils/personContactKeys';

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
  /** The show whose add-entry flow created this person (MYK9-1059). INSERT only. */
  createdFromShowId?: string | null;
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
  createdFromShowId?: string | null;
  _version?: number;
  _lastModified?: Date;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

export class ReplicatedShowDeskPeopleTable extends ReplicatedTable<ReplicatedShowDeskPerson> {
  private _lastMutationId: string | null = null;

  constructor() {
    super('people', { logger });
  }

  /**
   * A person added at the desk carries contact details and is stored until sent,
   * so it is private to the account that added it (MYK9-2277), as entries are
   * (MYK9-1133). A row saved before this change has no owner: it stays queued and
   * is still sent (the queue is read by the account that queued it, never through
   * these readers), and no account is shown it.
   */
  override usesAccountOwnedRows(): boolean {
    return true;
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
      ...(input.createdFromShowId && { createdFromShowId: input.createdFromShowId }),
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    const { mutationId } = await this.writeAndQueue(id, person, {
      operation: 'INSERT',
      payload: this.toSupabaseRow(person),
    });
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Created show-desk person ${id}`);

    return person;
  }

  /**
   * MYK9-2255, at sign-out: a row with unsent work keeps every field; a row that
   * was sent keeps the name only. Covers every account's rows on this device.
   *
   * MYK9-2356: "sent" is read from the row's own replication state (clean wrapper,
   * not `_localOnly`), never from the mutation queue, which needs a signed-in user
   * and so throws at sign-out. A row whose state is unknown counts as unsent. A row
   * that fails is logged and skipped; the rest are still stripped, and the strip
   * runs again at the next start. Throws only when storage cannot be read.
   */
  async redactSentContacts(): Promise<void> {
    const db = await this.init();
    const store = REPLICATION_STORES.REPLICATED_TABLES;
    const table = this.getTableName();
    const all = (await db.getAll(store)) as ReplicatedRow<ReplicatedShowDeskPerson>[];
    let changed = false;
    for (const candidate of all) {
      if (candidate.tableName !== table || !hasContacts(candidate.data)) continue;
      try {
        const tx = db.transaction(store, 'readwrite');
        const row = (await tx.store.get([table, candidate.id])) as
          ReplicatedRow<ReplicatedShowDeskPerson> | undefined;
        const data = row?.data as ReplicatedShowDeskPerson | undefined;
        if (row && data && row.isDirty === false && data._localOnly !== true) {
          await tx.store.put({ ...row, data: { ...data, ...NO_CONTACTS } });
          changed = true;
        }
        await tx.done;
      } catch (error) {
        logger.error(
          `[${table}] Could not remove contact details from row ${candidate.id}`,
          error as Error
        );
      }
    }
    if (changed) await this.notifyListeners();
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
      street_address: person.address ?? null,
      city: person.city ?? null,
      state: person.state ?? null,
      zip_code: person.zipCode ?? null,
      status: person.status,
      ...(person.createdFromShowId && { created_from_show_id: person.createdFromShowId }),
      updated_at: new Date().toISOString(),
    };
  }
}

const NO_CONTACTS = Object.fromEntries(SHARED_CONTACT_KEYS.map(key => [key, null])) as Record<
  SharedContactKey,
  null
>;

function hasContacts(person: ReplicatedShowDeskPerson | undefined): boolean {
  return !!person && SHARED_CONTACT_KEYS.some(key => person[key]);
}

export const replicatedShowDeskPeopleTable = new ReplicatedShowDeskPeopleTable();
