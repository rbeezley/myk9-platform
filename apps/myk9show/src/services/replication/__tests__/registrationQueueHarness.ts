/**
 * A REAL MutationManager wired to the shared registrations and dogs tables,
 * uploading through a recording fake client, for the queued registration
 * writes (MYK9-1090, MYK9-1075). The queue lives in fake IndexedDB, so
 * "queued", "sent" and "refused" are measured on the queue itself.
 */
import { vi } from 'vitest';
import {
  MutationManager,
  databaseManager,
  REPLICATION_STORES,
  type PendingMutation,
} from '@myk9/replication';
import type { SupabaseClient } from '@supabase/supabase-js';
import { replicatedDogRegistrationsTable } from '../ReplicatedDogRegistrationsTable';
import { replicatedDogsTable } from '../ReplicatedDogsTable';

export const QUEUE_USER = 'auth-user-1';

/** What the fake server answers each upload with. */
export interface UploadAnswer {
  data: unknown;
  error: unknown;
}

export interface RegistrationQueueHarness {
  manager: MutationManager;
  /** Every write the manager sent: `[operation, table, payload]`. */
  sent: Array<[string, string, unknown]>;
  /** The answer the next uploads get (default: success). */
  answer: { insert?: UploadAnswer; update?: UploadAnswer; delete?: UploadAnswer };
  /** The `.eq()` filters of each UPDATE or DELETE sent, in order. */
  filters: Array<{ op: string; eqs: Record<string, unknown> }>;
  /**
   * Rows the fake server holds, by id. Opt-in: a row put here behaves like the
   * real table (a second INSERT is a primary-key duplicate, an UPDATE applies
   * only at the matching `version` and bumps it). Rows not here are echoed.
   */
  server: Map<string, Record<string, unknown>>;
  pending(): Promise<PendingMutation[]>;
  failed(): Promise<PendingMutation[]>;
  /** Upload the queue and let the confirmed-delete listener run. */
  upload(): Promise<void>;
  /** Let the manager's debounced auto-upload fire (it defers while offline). */
  settle(): Promise<void>;
  destroy(): Promise<void>;
}

export function setDeviceOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

export function createRegistrationQueueHarness(): RegistrationQueueHarness {
  const sent: Array<[string, string, unknown]> = [];
  const answer: RegistrationQueueHarness['answer'] = {};
  const filters: RegistrationQueueHarness['filters'] = [];
  const server: RegistrationQueueHarness['server'] = new Map();
  const from = vi.fn((table: string) => {
    const respond = (op: 'insert' | 'update' | 'delete', payload: unknown, row: unknown) => {
      sent.push([op, table, payload]);
      return answer[op] ?? { data: [row], error: null };
    };
    const insert = (payload: Record<string, unknown>) => {
      const id = String(payload.id);
      if (!answer.insert && server.has(id)) {
        sent.push(['insert', table, payload]);
        return {
          data: null,
          error: {
            code: '23505',
            message: `duplicate key value violates unique constraint "${table}_pkey"`,
            details: `Key (id)=(${id}) already exists.`,
          },
        };
      }
      const result = respond('insert', payload, { id });
      if (!answer.insert) server.set(id, { ...payload, version: 1 });
      return result;
    };
    const update = (payload: Record<string, unknown>, eqs: Record<string, unknown>) => {
      const held = server.get(String(eqs.id));
      if (answer.update || !held) {
        return respond('update', payload, { id: eqs.id, version: Number(eqs.version ?? 0) + 1 });
      }
      sent.push(['update', table, payload]);
      if (eqs.version !== undefined && eqs.version !== held.version)
        return { data: [], error: null };
      const next = { ...held, ...payload, version: Number(held.version) + 1 };
      server.set(String(eqs.id), next);
      return { data: [{ id: eqs.id, version: next.version }], error: null };
    };
    const filtered = (op: 'update' | 'delete', payload: unknown) => {
      const eqs: Record<string, unknown> = {};
      const chain = {
        eq: (column: string, value: unknown) => {
          eqs[column] = value;
          return chain;
        },
        maybeSingle: async () => {
          const held = server.get(String(eqs.id));
          return { data: held ? { version: held.version } : null, error: null };
        },
        select: async () => {
          filters.push({ op, eqs: { ...eqs } });
          if (op === 'update') return update(payload as Record<string, unknown>, eqs);
          server.delete(String(eqs.id));
          return respond(op, payload, { id: eqs.id });
        },
      };
      return chain;
    };
    return {
      select: () => filtered('update', undefined),
      insert: (payload: Record<string, unknown>) => ({
        select: async () => insert(payload),
      }),
      update: (payload: unknown) => filtered('update', payload),
      delete: () => filtered('delete', undefined),
    };
  });
  const client = { from } as unknown as SupabaseClient;
  const manager = new MutationManager(client, {
    maxRetries: 1,
    retryBackoffBase: 1,
    getCurrentUserId: async () => QUEUE_USER,
    getCurrentUploadContext: async () => ({ authUserId: QUEUE_USER, supabaseClient: client }),
  });
  replicatedDogRegistrationsTable.setMutationManager(manager);
  replicatedDogsTable.setMutationManager(manager);

  const readStore = async (store: string) => {
    const db = await databaseManager.getDatabase('MutationManager');
    return (await db.getAll(store)) as PendingMutation[];
  };

  return {
    manager,
    sent,
    answer,
    filters,
    server,
    pending: () => readStore(REPLICATION_STORES.PENDING_MUTATIONS),
    failed: () => readStore(REPLICATION_STORES.FAILED_MUTATIONS),
    upload: async () => {
      await manager.uploadPendingMutations();
      // The confirmed-delete listener runs off the upload-complete event.
      await new Promise(resolve => setTimeout(resolve, 20));
    },
    settle: () => new Promise(resolve => setTimeout(resolve, 150)),
    destroy: async () => {
      await manager.clearAllMutations();
      manager.destroy();
    },
  };
}
