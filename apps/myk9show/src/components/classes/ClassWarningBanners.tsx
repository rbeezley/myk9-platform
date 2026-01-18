import { WifiOff, AlertTriangle } from 'lucide-react';
import { getStaleDataStatus, formatStaleTime } from '@/utils/staleDataUtils';

interface ClassWarningBannersProps {
  /** Current class status */
  classStatus: string;
  /** Timestamp of last result (for stale data detection) */
  lastResultAt?: string | Date | null | undefined;
  /** Whether class is in offline scoring mode */
  isOfflineScoring?: boolean | undefined;
}

/**
 * Warning banners for class cards.
 *
 * Displays:
 * - Offline scoring banner (orange) when class is manually set to offline mode
 * - Stale data banner (amber) when no results synced for 10+ minutes while in progress
 */
export function ClassWarningBanners({
  classStatus,
  lastResultAt,
  isOfflineScoring = false,
}: ClassWarningBannersProps) {
  const staleStatus = getStaleDataStatus(classStatus, lastResultAt);

  // No warnings to show
  if (!isOfflineScoring && !staleStatus.shouldShowWarning) {
    return null;
  }

  return (
    <div className="space-y-1.5 mt-2">
      {/* Offline Scoring Banner */}
      {isOfflineScoring && (
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
          <WifiOff className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate">Offline - updates when reconnected</span>
        </div>
      )}

      {/* Stale Data Banner */}
      {staleStatus.shouldShowWarning && !isOfflineScoring && (
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate">
            May be outdated ({formatStaleTime(staleStatus.minutesSinceLastResult!)})
          </span>
        </div>
      )}
    </div>
  );
}
