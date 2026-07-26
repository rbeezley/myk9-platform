/**
 * Secretary Entry Export
 *
 * The CSV-export read for trial secretaries, extracted from `secretary.ts`.
 *
 * It is its own module because it is its own concern: the rest of `secretary.ts`
 * manages entry status, check-in and pending review through the `entries` table,
 * whereas this goes through a SECURITY DEFINER RPC, owns the flat row shape that
 * RPC returns, and maps it into the nested shape the export UI expects. None of
 * that is shared with the status queries, and the RPC row types are meaningless
 * outside it.
 *
 * Re-exported from `./index`, which is how every consumer already imports it —
 * no call site changes.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

/** Flat row shape returned by the `get_entries_for_export` RPC. */
type RpcRow = {
  id: string;
  armband: string | null;
  handler: string | null;
  payment_status: string | null;
  entry_status: string | null;
  entry_fee: number | null;
  submitted_at: string | null;
  special_requests: string | null;
  jump_height: string | null;
  run_order: number | null;
  dog_id: string | null;
  dog_name: string | null;
  dog_call_name: string | null;
  dog_breed: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  dog_registrations: unknown; // Json from generated types — cast when mapping
  class_name: string | null;
  class_number: string | null;
};

type DogReg = { organization: string; registration_number: string };

/**
 * Get entries for CSV export.
 * Uses a SECURITY DEFINER function that enforces is_trial_secretary(club_id)
 * before returning owner PII — prevents direct REST API data dumps.
 */
export const getEntriesForExport = async (showId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.rpc('get_entries_for_export', {
      p_show_id: showId,
    });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_entries_for_export', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_entries_for_export');
    }

    const rows: RpcRow[] = (data ?? []) as RpcRow[];
    const mapped = rows.map(row => ({
      armband: row.armband,
      handler: row.handler,
      entry_status: row.entry_status,
      payment_status: row.payment_status,
      entry_fee: row.entry_fee,
      special_requests: row.special_requests,
      jump_height: row.jump_height,
      dog: row.dog_id
        ? {
            name: row.dog_name,
            call_name: row.dog_call_name,
            breed: row.dog_breed,
            owner: row.owner_first_name
              ? {
                  first_name: row.owner_first_name,
                  last_name: row.owner_last_name,
                  email: row.owner_email,
                  phone: row.owner_phone,
                }
              : null,
            dog_registrations: Array.isArray(row.dog_registrations)
              ? (row.dog_registrations as DogReg[])
              : [],
          }
        : null,
      class: row.class_name ? { name: row.class_name, class_number: row.class_number } : null,
    }));

    return { data: mapped, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_entries_for_export');
    logQuery('entries', 'get_entries_for_export', duration, dbError.message);
    return { data: [], error: dbError };
  }
};
