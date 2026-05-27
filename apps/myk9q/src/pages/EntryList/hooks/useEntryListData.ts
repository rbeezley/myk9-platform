/**
 * Shim — implementation moved to @myk9/ringside in PR E2b.
 *
 * See packages/ringside/src/pages/EntryList/hooks/useEntryListData.ts
 * and docs/plans/phase-0-ringside-package.md for the extraction plan.
 *
 * The package hook takes `dependencies: EntryListDataDependencies` as a
 * required injected prop (matching the direct-arg DI pattern from PR E1d's
 * `StatusDependencies`). This shim binds the apps/myk9q implementations —
 * `useAuth`, `ensureReplicationManager`, and the four fetcher functions
 * in `useEntryListDataHelpers` — and forwards the rest of the options
 * through. Existing callers in EntryList.tsx and CombinedEntryList.tsx
 * keep working unchanged.
 *
 * The helpers file (`useEntryListDataHelpers.ts`) stays here as the
 * host's implementation of the fetch slot — it's app-specific code that
 * reaches for supabase, entryService, the replicated tables, and the
 * visibility service. Nothing about those concerns belongs in ringside.
 */

import { useMemo } from 'react';
import {
  useEntryListData as useEntryListDataBase,
  type EntryListDataDependencies,
  type UseEntryListDataOptions,
} from '@myk9/ringside';
import { useAuth } from '../../../contexts/AuthContext';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import {
  fetchFromReplicationCache,
  fetchFromSupabase,
  fetchCombinedFromReplicationCache,
  fetchCombinedFromSupabase,
} from './useEntryListDataHelpers';

// Re-export the data-shape types so existing callers can keep importing
// them from this path.
export type { ClassInfo, EntryListData } from '@myk9/ringside';

// Public option shape the host exposes — same as the package's shape
// minus the `dependencies` slot, which the shim wires internally.
export type AppUseEntryListDataOptions = Omit<UseEntryListDataOptions, 'dependencies'>;

export const useEntryListData = (options: AppUseEntryListDataOptions) => {
  const { showContext, role } = useAuth();

  // Hoist licenseKey to a local const so the useMemo deps array can
  // reference it directly. Inlining `showContext?.licenseKey` in the
  // deps trips the React Compiler's "preserve manual memoization" lint
  // — it infers `showContext` (less specific) and refuses to match a
  // more-specific declared dep. Pulling licenseKey out makes the
  // declared dep and the inferred dep match exactly.
  const licenseKey = showContext?.licenseKey;

  // Memoize the deps object so the ringside hook's useEffect doesn't
  // re-subscribe on every render. Auth identity (role + licenseKey) is
  // the only "real" input — the fetcher functions are module-level and
  // referentially stable forever, so they don't need to be in the deps.
  const dependencies = useMemo<EntryListDataDependencies>(
    () => ({
      auth: { role, showContext: licenseKey ? { licenseKey } : null },

      fetchSingleClass: async (classId, licenseKey, userRole) => {
        // Replication cache first, Supabase fallback — pre-move SUT behavior.
        const cacheResult = await fetchFromReplicationCache(classId, licenseKey, userRole);
        if (cacheResult) return cacheResult;
        return fetchFromSupabase(classId, licenseKey, userRole);
      },

      fetchCombinedClasses: async (classIdA, classIdB, licenseKey, userRole) => {
        const cacheResult = await fetchCombinedFromReplicationCache(
          classIdA,
          classIdB,
          licenseKey,
          userRole,
        );
        if (cacheResult) return cacheResult;
        return fetchCombinedFromSupabase(classIdA, classIdB, licenseKey, userRole);
      },

      forceSyncEntriesAndClasses: async licenseKey => {
        const manager = await ensureReplicationManager();
        await Promise.all([
          manager.syncTable('entries', { licenseKey }),
          manager.syncTable('classes', { licenseKey }),
        ]);
      },

      subscribeToReplicationChanges: cb => {
        // The pre-move SUT had inline "skip initial callback" logic here —
        // the package contract says hosts own that semantics now. The
        // ReplicatedTable subscribe() implementation fires immediately
        // with current data on subscribe, so we filter the first call
        // per table.
        let unsubEntries: (() => void) | undefined;
        let unsubClasses: (() => void) | undefined;
        let entriesInitialDone = false;
        let classesInitialDone = false;
        let cancelled = false;

        (async () => {
          try {
            const manager = await ensureReplicationManager();
            if (cancelled) return;
            const entriesTable = manager.getTable('entries');
            const classesTable = manager.getTable('classes');
            if (!entriesTable || !classesTable) return;

            unsubEntries = entriesTable.subscribe(() => {
              if (!entriesInitialDone) {
                entriesInitialDone = true;
                return;
              }
              cb();
            });
            unsubClasses = classesTable.subscribe(() => {
              if (!classesInitialDone) {
                classesInitialDone = true;
                return;
              }
              cb();
            });
          } catch {
            // Replication manager init failure — pre-move SUT logged the
            // error and continued. We swallow silently here; the host can
            // log via its own logger if it cares.
          }
        })();

        return () => {
          cancelled = true;
          unsubEntries?.();
          unsubClasses?.();
        };
      },
    }),
    // Rebuilt only when auth identity changes. The fetcher imports are
    // module-stable so eslint-react-hooks correctly omits them from the
    // deps suggestion.
    [role, licenseKey],
  );

  return useEntryListDataBase({ ...options, dependencies });
};
