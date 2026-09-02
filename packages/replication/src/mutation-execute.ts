import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from './dependencies';
import {
  classifyEmptyUpdateResult,
  ContainmentError,
  getConflictServerVersion,
  getReturnedServerVersion,
  isContainmentError,
  isVersionConflictError,
  OccRejectionError,
  parseContainmentRetryAfterMs,
} from './mutation-occ';
import { TIMEOUT_PRESETS, withTimeout } from './mutation-utils';
import type { PendingMutation } from './types';

const POSTGRES_UNIQUE_VIOLATION = '23505';

export interface MutationExecutionResult {
  newServerVersion?: number;
  remappedRowId?: string;
}

export function isPrimaryKeyDuplicateError(
  error: unknown,
  tableName: string,
  rowId: string
): boolean {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown } | null;
  if (candidate?.code !== POSTGRES_UNIQUE_VIOLATION) return false;

  const haystack = [candidate.message, candidate.details]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
  const tablePrimaryKey = `${tableName.toLowerCase()}_pkey`;
  const normalizedRowId = rowId.toLowerCase();

  return (
    haystack.includes(tablePrimaryKey) ||
    (haystack.includes('key (id)=') && haystack.includes(`(${normalizedRowId})`))
  );
}

/**
 * Execute a single mutation on the server with timeout protection.
 *
 * Uses `select()` after upsert/delete to get the returned rows,
 * which lets us detect RLS silent rejections (0 rows affected = RLS blocked).
 */
export async function executeMutation(
  supabase: SupabaseClient,
  logger: Logger,
  mutation: PendingMutation
): Promise<MutationExecutionResult> {
  const { tableName, operation, data } = mutation;

  switch (operation) {
    case 'INSERT': {
      if (mutation.rpc) {
        const { data: returned, error } = await withTimeout(
          supabase.rpc(mutation.rpc.name, mutation.rpc.args ?? data),
          TIMEOUT_PRESETS.standard,
          `${tableName} rpc ${mutation.rpc.name}`
        );
        if (error) {
          // An RPC INSERT can commit before its response reaches the client.
          // Replaying the same client-generated payload then raises a unique
          // violation even though the desired server state already exists.
          // Treat only INSERT RPC duplicates as idempotent success; UPDATE RPC
          // duplicates remain real constraint failures.
          if (isPrimaryKeyDuplicateError(error, tableName, mutation.rowId)) {
            logger.log(
              `[MutationManager] 23505 on INSERT ${tableName}/${mutation.rowId} RPC — prior attempt committed, treating as success`
            );
            return {};
          }
          throw error;
        }
        if (mutation.rpc.expectRowId && typeof returned === 'string') {
          if (returned !== mutation.rowId) {
            return { remappedRowId: returned };
          }
        }
        return {};
      }

      const { data: rows, error } = await withTimeout(
        supabase.from(tableName).insert(data).select('id'),
        TIMEOUT_PRESETS.standard,
        `${tableName} insert`
      );
      if (isPrimaryKeyDuplicateError(error, tableName, mutation.rowId)) {
        // Row already exists — retry hit a duplicate-key on a client-generated UUID.
        // The INSERT succeeded on a prior attempt; treat this as success.
        // INVARIANT: all offline-INSERT entities use client-generated UUIDs (verified Plan 006).
        logger.log(
          `[MutationManager] 23505 on INSERT ${tableName}/${mutation.rowId} — prior attempt committed, treating as success`
        );
        return {};
      }
      if (error) throw error;
      if (!rows || rows.length === 0) {
        throw new Error(
          `RLS policy blocked INSERT on ${tableName} for row ${mutation.rowId}. ` +
            `Check that the authenticated user has the required role.`
        );
      }
      return {};
    }

    case 'UPDATE': {
      // RPC-routed UPDATE: apply through a SECURITY DEFINER function instead of
      // a direct table UPDATE. Used when the caller's role is denied by the
      // table's UPDATE RLS policy but admitted by the function's own per-row
      // authorization (e.g. at-show ringside writes by an assigned judge). The
      // function returns the authoritative post-trigger version.
      if (mutation.rpc) {
        const { data: returned, error } = await withTimeout(
          supabase.rpc(
            mutation.rpc.name,
            mutation.rpc.args ?? {
              p_entry_id: data.id as string,
              p_fields: mutation.rpc.fields ?? {},
              p_expected_version: mutation.serverVersion ?? null,
            }
          ),
          TIMEOUT_PRESETS.standard,
          `${tableName} rpc ${mutation.rpc.name}`
        );
        if (error) {
          // A version-conflict raise (`40001`) would otherwise dead-letter,
          // leaving the local OCC token stale so the app regenerates the same
          // conflicting write forever (CPU storm). The RPC surfaces the current
          // server version in the error DETAIL (error.details) — read it from
          // there rather than a direct entries re-read, which the ringside
          // caller's role (assigned judge / steward / passcode) may be denied.
          // Re-throw as an OccRejectionError so the conflict handler advances
          // the token and backs off.
          // MYK9-115: containment is checked BEFORE the conflict path. RS429
          // means the server is shedding load and has asked us to stop; it
          // carries the authoritative version in DETAIL just like 40001, so the
          // token still advances — but the upload runner must pause rather than
          // retry, or the client hammers the breaker that exists to stop it.
          if (isContainmentError(error)) {
            throw new ContainmentError(
              tableName,
              mutation.rowId,
              getConflictServerVersion(error),
              parseContainmentRetryAfterMs(error)
            );
          }
          if (isVersionConflictError(error)) {
            const fresh = getConflictServerVersion(error);
            throw new OccRejectionError(
              tableName,
              mutation.rowId,
              mutation.serverVersion ?? fresh ?? 0,
              fresh
            );
          }
          throw error;
        }
        // The RPC returns the new integer version (or null if the function
        // signals a no-op). Surface it so the local row's OCC token stays fresh.
        const newServerVersion = typeof returned === 'number' ? returned : undefined;
        return { newServerVersion };
      }

      // Build the query: add OCC precondition when serverVersion is set so a
      // concurrent server write (trigger bumped version) causes 0-row rejection
      // rather than silently overwriting with last-write-wins.
      let updateQuery = supabase
        .from(tableName)
        .update(data)
        .eq('id', data.id as string);
      if (mutation.serverVersion !== undefined) {
        updateQuery = updateQuery.eq('version', mutation.serverVersion);
      }
      const { data: rows, error } = await withTimeout(
        updateQuery.select('id, version'),
        TIMEOUT_PRESETS.standard,
        `${tableName} update`
      );
      if (error) throw error;
      if (!rows || rows.length === 0) {
        let serverCheck: { version?: number } | null | undefined;
        let serverCheckError: unknown;
        if (mutation.serverVersion !== undefined) {
          // Disambiguate: OCC rejection (version advanced) vs RLS denial (version unchanged)
          // vs row deleted. One bounded re-check avoids silent permanent queue stall.
          const { data: check, error: checkError } = await withTimeout(
            supabase
              .from(tableName)
              .select('version')
              .eq('id', data.id as string)
              .maybeSingle(),
            TIMEOUT_PRESETS.standard,
            `${tableName} occ-check`
          );
          serverCheck = check as { version?: number } | null | undefined;
          serverCheckError = checkError;
        }
        throw classifyEmptyUpdateResult({
          tableName,
          rowId: mutation.rowId,
          serverVersion: mutation.serverVersion,
          serverCheck,
          serverCheckError,
        });
      }
      const newServerVersion = getReturnedServerVersion(rows as Array<{ version?: number }>);
      return { newServerVersion };
    }

    case 'DELETE': {
      const { data: rows, error } = await withTimeout(
        supabase
          .from(tableName)
          .delete()
          .eq('id', data.id as string)
          .select('id'),
        TIMEOUT_PRESETS.standard,
        `${tableName} delete`
      );
      if (error) throw error;
      // 0 rows affected means either the row was already deleted (OK,
      // idempotent) or RLS silently rejected the DELETE. We can't
      // distinguish the two, so we log a warning and let the next sync
      // determine whether the row still exists.
      if (!rows || rows.length === 0) {
        logger.warn(
          `[MutationManager] DELETE on ${tableName} for row ${mutation.rowId} affected 0 rows. ` +
            `Row may have already been deleted, or RLS policy blocked the operation.`
        );
      }
      return {};
    }

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}
