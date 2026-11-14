/**
 * Host-injected replication capability for ringside pages: the one write
 * that crosses the package boundary (`updateClassStatus`).
 */

import type { ClassStatusValue } from '../pages/ClassList/types';

export type { ClassStatusValue };

// ── Auth ─────────────────────────────────────────────────────────────────

// ── Replication ──────────────────────────────────────────────────────────

/**
 * The subset of `Partial<Class>` fields that ringside callers actually
 * pass to `updateClassStatus`. Surveyed from
 * `apps/myk9q/src/pages/EntryList/hooks/useEntryListHandlers.ts` — only
 * the three time fields appear. If future callers need more, widen this
 * type intentionally rather than `Partial<Class>` (which would leak the
 * host's full table-row shape into the package boundary).
 */
export interface ClassStatusUpdateFields {
  briefing_time?: string;
  break_until?: string;
  start_time?: string;
}

/**
 * Replication actions ringside pages perform on host-owned typed tables.
 *
 * Host implementation in `apps/myk9q` binds these to its
 * `services/replication/tables/*` singletons. The host is responsible
 * for the optimistic update + outbound sync; ringside just calls.
 */
export interface RingsideReplication {
  /**
   * Update a class's status (and optional time fields). Resolves once
   * the host has accepted the change locally — the host's own sync
   * engine handles eventual server propagation.
   */
  updateClassStatus: (
    classId: string,
    status: ClassStatusValue,
    additionalFields?: ClassStatusUpdateFields
  ) => Promise<void>;
}
