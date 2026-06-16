import type { PublicEntryRow } from '@/services/database/entries';

/** Shape of a single entry row rendered by EntriesTab. */
export interface ShowEntryRow {
  id: string;
  entry_status: string | null;
  handler: string | null;
  armband: string | null;
  entry_fee: number | null;
  payment_status: string | null;
  created_at: string | null;
  dog: {
    id: string;
    name: string | null;
    call_name: string | null;
    breed: string | null;
    owner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  } | null;
  class: {
    id: string;
    name: string | null;
    class_number: number | null;
    entry_fee: number | null;
  } | null;
}

/**
 * Adapt a cascade-gated public view row into the ShowEntryRow shape. Payment
 * columns, entry fee, and owner identity are unavailable to anon (not exposed
 * by the public view) and map to null — the table renders a handler fallback.
 */
export function publicRowToShowEntryRow(row: PublicEntryRow): ShowEntryRow {
  return {
    id: row.id,
    entry_status: row.entry_status,
    handler: row.handler,
    armband: row.armband,
    entry_fee: null,
    payment_status: null,
    created_at: row.created_at,
    dog: row.dog_id
      ? {
          id: row.dog_id,
          name: row.dog_name,
          call_name: row.dog_call_name,
          breed: row.dog_breed,
          owner: null,
        }
      : null,
    class: { id: row.class_id ?? '', name: row.class_name, class_number: null, entry_fee: null },
  };
}
