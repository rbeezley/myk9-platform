/**
 * Ringside capability adapters (Phase 1a) — the `RingsideContextValue`
 * bag myK9Show passes to `<RingsideProvider>`.
 *
 * Binds ringside's three capability slices to myK9Show's own systems:
 *  - auth → `buildRingsideAuth` (RBAC → ringside role; see ringsideAuthAdapter)
 *  - replication → myK9Show's `replicatedClassesTable.updateClass`
 *  - prefetch → null stub (myK9Show has no prefetch cache yet)
 *
 * Builders are pure factories; the host shim memoizes the assembled value
 * so the context reference stays stable across renders.
 */

import {
  type RingsideReplication,
  type RingsidePrefetch,
  type RingsideContextValue,
  type RingsideShowContext,
} from '@myk9/ringside';
import { replicatedClassesTable } from '@/services/replication';
import { UserRole as ShowRole } from '@/types/auth-types';
import { buildRingsideAuth } from './ringsideAuthAdapter';
import { toShowClassStatus } from './ringsideClassStatusMap';

/**
 * Replication capability — binds ringside's `updateClassStatus` to
 * myK9Show's `updateClass`.
 *
 * INTENT (owner decision 2026-05-28, drop-for-spike): ringside's
 * `briefing_time` / `break_until` fields are dropped — myK9Show's class
 * table has no columns for them. Only `start_time` is threaded through
 * (→ `startTime`). Status is mapped lossily via `toShowClassStatus`.
 */
export function buildRingsideReplication(): RingsideReplication {
  return {
    updateClassStatus: async (classId, status, additionalFields) => {
      await replicatedClassesTable.updateClass(classId, {
        classStatus: toShowClassStatus(status),
        ...(additionalFields?.start_time ? { startTime: additionalFields.start_time } : {}),
      });
    },
  };
}

/**
 * Prefetch capability — myK9Show has no prefetch cache manager yet, so
 * every key misses. ringside tolerates `null` (its callers fall back to
 * the data hooks). Replace with a real adapter if/when myK9Show grows a
 * prefetch cache.
 */
export function buildRingsidePrefetch(): RingsidePrefetch {
  return {
    get: async () => null,
  };
}

/** Assemble the full `RingsideContextValue` for `<RingsideProvider value={...}>`. */
export function buildRingsideContextValue(args: {
  showRole: ShowRole | null | undefined;
  showContext: RingsideShowContext | null;
}): RingsideContextValue {
  return {
    auth: buildRingsideAuth(args),
    replication: buildRingsideReplication(),
    prefetch: buildRingsidePrefetch(),
  };
}
