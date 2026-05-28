/**
 * useClassRealtime Hook
 *
 * Manages Supabase real-time subscriptions for class updates.
 * Handles optimistic local updates for class status changes and full refreshes for other changes.
 *
 * Extracted from ClassList.tsx
 */

import { useEffect, useCallback } from 'react';
import type { SupabaseClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { ClassEntry } from '../types';

/**
 * Record type for class data in real-time updates
 */
interface ClassRecord {
  id: string;
  class_status?: string;
  is_scoring_finalized?: boolean;
  /**
   * Tracked so secretary-side reorders (which write `display_order`) trigger a
   * refetch instead of being swallowed by the status-only optimistic path.
   * See migration 136 for the column.
   */
  display_order?: number;
}

/**
 * Payload type for real-time updates (internal use)
 */
export interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: ClassRecord | null;
  old: ClassRecord | null;
}

/**
 * Supabase payload type alias for postgres_changes
 */
type SupabaseRealtimePayload = RealtimePostgresChangesPayload<{
  [key: string]: unknown;
}>;

/**
 * Custom hook for managing real-time class updates
 *
 * Provides real-time synchronization for:
 * - **Class Status Updates**: Optimistic local updates for status changes
 * - **Class Completion**: Updates is_scoring_finalized flag in real-time
 * - **Other Changes**: Full refresh for INSERT/DELETE operations
 *
 * **Optimistic Updates**: For UPDATE events, updates local state directly without refetch
 * **Full Refresh**: For INSERT/DELETE events, triggers full data refetch
 * **Automatic Cleanup**: Unsubscribes when component unmounts or dependencies change
 *
 * **Subscription Channel**: `class-list-trial-{trialId}` - scoped to current trial
 * **Tables Watched**: `classes` and `entries` tables in public schema
 * **Events**: All events (* = INSERT, UPDATE, DELETE)
 *
 * @param trialId - Trial ID to subscribe to
 * @param licenseKey - License key for authorization
 * @param setClasses - State setter for local class updates
 * @param refetch - Refetch function for full data refresh (can return void or Promise<void>)
 * @param supabaseClient - Supabase client instance
 *
 * @example
 * ```tsx
 * function ClassList() {
 *   const [classes, setClasses] = useState<ClassEntry[]>([]);
 *   const { refetch } = useClassListData();
 *
 *   // Set up real-time subscription
 *   useClassRealtime(
 *     trialId,
 *     licenseKey,
 *     setClasses,
 *     refetch,
 *     supabase
 *   );
 *
 *   return (
 *     <div>
 *       {classes.map(cls => (
 *         <ClassCard key={cls.id} classEntry={cls} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useClassRealtime(
  trialId: number | undefined,
  licenseKey: string | undefined,
  setClasses: React.Dispatch<React.SetStateAction<ClassEntry[]>>,
  refetch: () => void | Promise<void>,
  supabaseClient: SupabaseClient
): void {
  // Memoize the payload handler to avoid recreating on every render
  const handleRealtimeUpdate = useCallback((payload: SupabaseRealtimePayload) => {
    // For UPDATE events, update local state directly (optimistic update)
    const newRecord = payload.new as ClassRecord | undefined;
    const oldRecord = payload.old as ClassRecord | undefined;
    if (payload.eventType === 'UPDATE' && newRecord && oldRecord) {
      // If display_order changed, the optimistic status-only path would silently
      // swallow a secretary-side reorder — the local sort would keep showing
      // the stale order until the next manual refetch. Show-day reorders are
      // time-pressured, so fall through to a full refetch instead.
      //
      // PERF GUARD: Supabase realtime only includes the PK in `payload.old`
      // unless the table is `REPLICA IDENTITY FULL`. The `classes` table is
      // currently `REPLICA IDENTITY DEFAULT`, so `oldRecord.display_order` is
      // always undefined. After migration 136 every row has a numeric
      // `display_order`, which would make this branch fire on EVERY status
      // update and refetch the ringside hot path. Gate on `oldRecord` actually
      // carrying the column so we only fall through when the comparison is
      // meaningful (i.e., once RI FULL is enabled). Until then, reorders
      // propagate via the next replication / polling cycle rather than
      // immediately — an acceptable tradeoff over a per-update refetch storm
      // during scoring.
      const oldHasDisplayOrder =
        oldRecord != null && 'display_order' in oldRecord;
      const reorderChanged =
        oldHasDisplayOrder &&
        typeof newRecord.display_order === 'number' &&
        newRecord.display_order !== oldRecord.display_order;

      if (reorderChanged) {
        refetch();
        return;
      }

      setClasses(prev => prev.map(c =>
        c.id === newRecord.id
          ? {
              ...c,
              class_status: (newRecord.class_status as ClassEntry['class_status']) || 'no-status',
              is_scoring_finalized: newRecord.is_scoring_finalized || false
            }
          : c
      ));
    } else {
      // For INSERT/DELETE, do full refresh
      refetch();
    }
  }, [setClasses, refetch]);

  // Set up real-time subscription
  useEffect(() => {
    // Don't subscribe if missing required data
    if (!trialId || !licenseKey) {
return;
    }

// Create subscription channel - watch both classes and entries tables
    const subscription: RealtimeChannel = supabaseClient
      .channel(`class-list-trial-${trialId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // All events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'classes'
        },
        handleRealtimeUpdate
      )
      .on(
        'postgres_changes',
        {
          event: '*', // All events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'entries'
        },
        (_payload) => {
          // For entry changes, always refetch to update dog counts and status
          refetch();
        }
      )
      .subscribe();

// Cleanup function - unsubscribe on unmount or dependency change
    return () => {
subscription.unsubscribe();
    };
  }, [trialId, licenseKey, supabaseClient, handleRealtimeUpdate]);
}
