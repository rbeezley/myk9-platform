import { startTransition, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClassCard } from '@myk9/ui';
import { TrialClass } from '../types/trial.types';
import { useClassEntriesPreview } from '@/hooks/useClassEntriesPreview';
import { useFavoriteClassesStore } from '@/store/favoriteClassesStore';
import {
  ClassDetailsPopover,
  type ClassDetailsData,
} from '@/components/classes/ClassDetailsPopover';
import { ClassWarningBanners } from '@/components/classes/ClassWarningBanners';

interface TrialClassesCardsProps {
  classes: TrialClass[];
  trialId: string;
  /** Staff-only gate for the per-card edit menu. Deny by default. */
  canManage?: boolean;
  onEditClass: (classItem: TrialClass) => void;
  onDeleteClass: (classItem: TrialClass) => void;
}

/**
 * Format start time for display
 */
function formatStartTime(startTime: string | undefined): string | undefined {
  if (!startTime) return undefined;
  try {
    return new Date(startTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return startTime;
  }
}

/**
 * TrialClassesCards Component
 *
 * Displays trial classes as cards using the shared ClassCard component
 * from @myk9/ui for UX consistency with myK9Q.
 */
export function TrialClassesCards({
  classes,
  trialId,
  canManage = false,
  onEditClass,
  onDeleteClass: _onDeleteClass,
}: TrialClassesCardsProps) {
  const navigate = useNavigate();

  // Favorites store
  const { loadFavorites, toggleFavorite, isFavorite, justToggled } = useFavoriteClassesStore();

  // Load favorites when trialId changes
  useEffect(() => {
    if (trialId) {
      loadFavorites(trialId);
    }
  }, [trialId, loadFavorites]);

  // Get class IDs for entry preview lookup
  const classIds = useMemo(() => classes.map(c => c.id), [classes]);
  const entryPreviewMap = useClassEntriesPreview(classIds);

  // Build class details data for info popover
  const getClassDetailsData = (classItem: TrialClass): ClassDetailsData => ({
    className: `${classItem.element} ${classItem.level} ${classItem.section}`,
    status: classItem.status,
    judgeName: classItem.judgeName,
    entryCount: classItem.entries,
    completedEntries: classItem.completedEntries,
    timeLimits: classItem.timeLimits,
    resultsVisibility: classItem.resultsVisibility,
    checkInMode: classItem.checkInMode,
  });

  if (classes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-muted-foreground">
          <div className="mb-2 text-lg font-medium">No classes to display</div>
          <div className="text-sm">Classes will appear here as cards</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {classes.map(classItem => {
        const startTime = formatStartTime(classItem.startTime);
        const entryPreview = entryPreviewMap.get(classItem.id) || [];
        const classDetailsData = getClassDetailsData(classItem);
        const className = `${classItem.element} ${classItem.level} ${classItem.section}`;

        return (
          <ClassDetailsPopover key={classItem.id} data={classDetailsData}>
            <div>
              <ClassCard
                className={className}
                judgeName={classItem.judgeName || 'TBD'}
                {...(startTime !== undefined && { plannedStartTime: startTime })}
                status={classItem.status}
                entryCount={classItem.entries}
                completedCount={classItem.completedEntries ?? 0}
                entries={entryPreview}
                // Favorite support
                isFavorite={isFavorite(classItem.id)}
                onFavoriteClick={() => toggleFavorite(classItem.id)}
                favoriteJustToggled={justToggled === classItem.id}
                // Warning banners
                warnings={
                  <ClassWarningBanners
                    classStatus={classItem.status}
                    lastResultAt={classItem.lastResultAt}
                    isOfflineScoring={classItem.isOfflineScoring}
                  />
                }
                onCardClick={() => startTransition(() => navigate(`/classes/${classItem.id}`))}
                {...(canManage && {
                  onMenuClick: () => {
                    onEditClass(classItem);
                  },
                })}
              />
            </div>
          </ClassDetailsPopover>
        );
      })}
    </div>
  );
}
