/**
 * React Query hooks for activity_log (Phase 4.1 — Activity Timeline).
 */

import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { getActivityForRecord, logActivity } from '@/services/database/activity-logs';
import type {
  ActivityRecordType,
  ActivityLogInsert,
} from '@/services/database/activity-logs';
import { cacheStrategies } from '@/lib/queryClient';

export const activityQueryKeys = {
  all: ['activity'] as const,
  record: (type: ActivityRecordType, id: string) => [...activityQueryKeys.all, type, id] as const,
};

/** Fetch paginated activity for a record with infinite scroll. */
export const useActivityLogQuery = (
  recordType: ActivityRecordType,
  recordId: string,
  enabled = true
) => {
  return useInfiniteQuery({
    queryKey: activityQueryKeys.record(recordType, recordId),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, count, error } = await getActivityForRecord(recordType, recordId, pageParam);
      if (error) throw error;
      return { entries: data ?? [], totalCount: count, page: pageParam };
    },
    initialPageParam: 0,
    getNextPageParam: lastPage => {
      const loadedCount = (lastPage.page + 1) * 50;
      return loadedCount < lastPage.totalCount ? lastPage.page + 1 : undefined;
    },
    enabled: !!recordId && enabled,
    maxPages: 20,
    ...cacheStrategies.dynamic,
  });
};

/** Log a new activity entry. */
export const useLogActivityMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: ActivityLogInsert) => {
      const { error } = await logActivity(entry);
      if (error) throw error;
    },
    onSuccess: (_data, entry) => {
      // Invalidate the activity feed for the affected record
      queryClient.invalidateQueries({
        queryKey: activityQueryKeys.record(entry.record_type, entry.record_id),
      });
    },
  });
};
