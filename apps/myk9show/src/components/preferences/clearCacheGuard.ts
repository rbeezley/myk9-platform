export interface ClearCacheCounts {
  pendingMutationCount: number;
  offlineSyncQueueCount: number;
}

export interface ClearCacheDecision {
  allowed: boolean;
  pendingCount: number;
}

export function decideClearCache({
  pendingMutationCount,
  offlineSyncQueueCount,
}: ClearCacheCounts): ClearCacheDecision {
  const pendingCount = Math.max(0, pendingMutationCount) + Math.max(0, offlineSyncQueueCount);
  return {
    allowed: pendingCount === 0,
    pendingCount,
  };
}
