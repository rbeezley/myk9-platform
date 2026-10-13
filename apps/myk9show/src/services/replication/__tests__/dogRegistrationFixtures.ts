/**
 * Shared fixtures for the registrations replica tests (MYK9-1090): a server
 * row, direct IndexedDB access for queue records, and a fake PostgREST
 * builder for `dog_registrations` that records every call.
 */
import { vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import type { DogRegistrationRow } from '../dogRegistrationRows';

export function serverRow(overrides: Partial<DogRegistrationRow> = {}): DogRegistrationRow {
  return {
    id: 'reg-1',
    dog_id: 'dog-1',
    organization: 'AKC',
    registration_number: 'SR12345601',
    registration_date: '2024-02-01',
    verified: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z',
    registered_name: 'CH Beacon Hill Fast Lane',
    breed: 'Border Collie',
    variety: null,
    status: 'active',
    application_number: null,
    submission_date: null,
    certificate: null,
    is_primary: true,
    version: 3,
    ...overrides,
  };
}

/** Put a queue record straight into IndexedDB, as the MutationManager stores it. */
export async function putQueueRecord(
  store: 'pending' | 'failed',
  record: { id: string; tableName: string; rowId: string }
): Promise<void> {
  const db = await databaseManager.getDatabase('dog_registrations');
  const name =
    store === 'pending'
      ? REPLICATION_STORES.PENDING_MUTATIONS
      : REPLICATION_STORES.FAILED_MUTATIONS;
  await db.put(name, { operation: 'UPDATE', data: {}, status: store, ...record });
}

export interface RegistrationsServer {
  /** Pages answered to the changes pass, in order. */
  changePages: DogRegistrationRow[][];
  /** Pages answered to the ID pass, in order; an Error answers as a PostgREST error. */
  idPages: Array<Array<{ id: string }> | Error>;
  /** Rows the server holds, answered to `.in('id' | 'dog_id', …)` reads. */
  rows: DogRegistrationRow[];
  /** Answer every read by id (hydration, row refetch) with an error. */
  failIdLookups?: boolean;
  /** Called as each ID page is answered (to simulate a write mid-pass). */
  onIdPage?: (index: number) => Promise<void>;
  /** Every select list and filter the code sent. */
  calls: Array<{ method: string; args: unknown[] }>;
}

/** Route `supabase.from('dog_registrations')` to an in-memory server. */
export function installRegistrationsServer(server: RegistrationsServer): void {
  let idPage = 0;
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    if (table !== 'dog_registrations') throw new Error(`unexpected table ${table}`);
    const record = (method: string, args: unknown[]) => {
      server.calls.push({ method, args });
    };
    const chain =
      (method: string) =>
      (...args: unknown[]) => {
        record(method, args);
        return builder;
      };
    const builder: Record<string, unknown> = {
      select: chain('select'),
      gt: chain('gt'),
      or: chain('or'),
      eq: chain('eq'),
      order: chain('order'),
      range: async (...args: unknown[]) => {
        record('range', args);
        return { data: server.changePages.shift() ?? [], error: null };
      },
      in: async (column: string, values: string[]) => {
        record('in', [column, values]);
        if (column === 'id' && server.failIdLookups) {
          return { data: null, error: { message: 'timeout' } };
        }
        const key = column as 'id' | 'dog_id';
        return { data: server.rows.filter(row => values.includes(row[key])), error: null };
      },
      limit: async (...args: unknown[]) => {
        record('limit', args);
        const index = idPage++;
        await server.onIdPage?.(index);
        const page = server.idPages[index] ?? [];
        return page instanceof Error
          ? { data: null, error: { message: page.message } }
          : { data: page, error: null };
      },
    };
    return builder;
  }) as unknown as typeof supabase.from);
}

export function newServer(overrides: Partial<RegistrationsServer> = {}): RegistrationsServer {
  return { changePages: [], idPages: [], rows: [], calls: [], ...overrides };
}
