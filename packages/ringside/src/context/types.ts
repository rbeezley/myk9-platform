/**
 * RingsideContext type definitions.
 *
 * The Q5 dependency-injection surface for `@myk9/ringside`.
 *
 * Design intent
 * -------------
 * Ringside is a shared package mounted by two hosts: `apps/myk9q` today,
 * and `apps/myk9show`'s `/at-show` route from Phase 1. Both hosts own
 * their own auth, replication, and caching infrastructure — the package
 * deliberately does NOT include those concerns.
 *
 * Instead, the host injects a small set of capability bags into a
 * React context. Page code inside ringside reads from that context
 * via `useRingside()` (and derived hooks like `useRingsidePermission()`).
 *
 * Empirically scoped
 * ------------------
 * Surveying `apps/myk9q/src/pages/ClassList` + `EntryList`, the actual
 * runtime singleton-call surface across both pages is exactly two
 * functions:
 *
 *   - `prefetchCache.get(key)` — 3 sites in `useClassListFetch.ts`
 *   - `replicatedClassesTable.updateClassStatus(...)` — 1 site in
 *     `useEntryListHandlers.ts`
 *
 * Plus `useAuth()` returning a role + show context + permission check.
 * Everything else those pages import from the host is type-only and
 * can be relocated to package-local type modules (the pattern PR E0
 * established with `pages/ClassList/types.ts`).
 *
 * Capabilities are therefore narrowly typed below. As future PRs (E1,
 * E2, F, G) discover additional calls that need to cross the boundary,
 * extend the interfaces here in a follow-up — do NOT widen the surface
 * speculatively.
 */

import type { UserRole, UserPermissions } from '../auth/passcodes';
import type { ClassStatusValue } from '../pages/ClassList/types';

export type { ClassStatusValue };

// ── Auth ─────────────────────────────────────────────────────────────────

/**
 * Show identity + organization metadata that ringside pages display and
 * route on. Lifted from `apps/myk9q/src/contexts/AuthContext.tsx`'s
 * `ShowContext` interface.
 */
export interface RingsideShowContext {
  showId: string;
  showName: string;
  clubName: string;
  showDate: string;
  licenseKey: string;
  /** Organization (e.g. 'UKC Obedience', 'AKC Scent Work'). */
  org: string;
  /** Competition type (e.g. 'National', 'Regular'). */
  competition_type: string;
  /** Show type used by ringside's Nationals-detection paths. */
  showType?: string;
}

/**
 * Auth state slice ringside reads from. A **value snapshot**, not a hook
 * — the host calls its own `useAuth()` (or equivalent) and passes the
 * result to `RingsideProvider`.
 */
export interface RingsideAuth {
  /** Currently authenticated role, or `null` if not signed in. */
  role: UserRole | null;
  /** Show the user authenticated against, or `null` pre-login. */
  showContext: RingsideShowContext | null;
  /** Returns true if the current role has the named permission. */
  canAccess: (permission: keyof UserPermissions) => boolean;
}

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

// ── Prefetch ─────────────────────────────────────────────────────────────

/**
 * Read-only prefetch reader. Ringside pages query keys the host has
 * already populated — they do NOT write to or clear the cache. Cache
 * management stays in the host.
 *
 * Returns the cached data directly (not the host's `{ key, data,
 * timestamp, ttl, size }` envelope) because callers in the surveyed
 * code paths only access `.data` — passing it through unwrapped keeps
 * the boundary minimal and lets the host adapter strip metadata.
 */
export interface RingsidePrefetch {
  /** Returns the cached data for `key`, or `null` if not present. */
  get: <T = unknown>(key: string) => Promise<T | null>;
}

// ── Provider value ───────────────────────────────────────────────────────

/**
 * The full value bag a host passes to `<RingsideProvider value={...}>`.
 *
 * Bags rather than a flat shape so future additions (e.g. notifications,
 * realtime channels) land as additive properties without touching
 * existing capabilities. Each bag is independently mockable in tests.
 */
export interface RingsideContextValue {
  auth: RingsideAuth;
  replication: RingsideReplication;
  prefetch: RingsidePrefetch;
}
