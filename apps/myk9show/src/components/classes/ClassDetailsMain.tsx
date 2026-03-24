import React from 'react';
import { Users, Calendar, Trophy, type LucideIcon } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import type { StatColor } from '@myk9/ui';
import { type EntryData } from './types/classTypes';
import { ClassResultsTable } from './ClassResultsTable';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { createUserPermissions, UserPermissions } from '@/types/user-permissions';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { logger } from '@/services/LoggingService';
import type { ScentWorkResult, MultiAreaScentWorkResult } from '@/types/scent-work-types';
import type { ClassDetailsMainProps } from './ClassDetailsMain.types';
import {
  isScentWorkShow,
  buildClassStats,
  buildClassConfig,
  buildScentWorkEntries,
} from './ClassDetailsMain.helpers';
import { msToDisplay } from '@/lib/timeUtils';

const ICON_MAP: Record<string, LucideIcon> = {
  trials: Calendar,
  classes: Trophy,
  entries: Users,
};

const COLOR_MAP: Record<string, StatColor> = {
  entries: 'primary',
  classes: 'emerald',
  trials: 'purple',
};

const ClassDetailsMain: React.FC<ClassDetailsMainProps> = ({
  classData,
  classEntries,
  parentShow,
  onAddEntry,
  onDeleteEntry,
  onResultUpdate,
  onOpenRequirements,
}) => {
  // Check if this is a Scent Work show
  const isScentWork = isScentWorkShow(parentShow);

  const stats = buildClassStats(classEntries, isScentWork);

  const { user, hasRole } = useAuthContext();
  const { dogs } = useDogStoreCompat();

  const userPermissions: UserPermissions = React.useMemo(() => {
    const displayName = user?.email || 'Unknown User';

    if (hasRole(UserRole.SITE_ADMIN)) {
      return createUserPermissions('admin', user?.id, displayName);
    } else if (hasRole(UserRole.SECRETARY)) {
      return createUserPermissions('secretary', user?.id, displayName);
    } else if (hasRole(UserRole.CLUB_ADMIN)) {
      return createUserPermissions('steward', user?.id, displayName);
    } else {
      return createUserPermissions('exhibitor', user?.id, displayName);
    }
  }, [user, hasRole]);

  // Build class configuration and entries for results table
  const classConfig = React.useMemo(() => buildClassConfig(classData), [classData]);

  const scentWorkEntries = React.useMemo(
    () => buildScentWorkEntries(classEntries, classData, classConfig, dogs),
    [classEntries, dogs, classData, classConfig]
  );

  // Handle results submission from BulkResultEntry
  const handleResultsSubmit = React.useCallback(
    async (results: (ScentWorkResult | MultiAreaScentWorkResult)[]) => {
      if (!onResultUpdate) return;

      try {
        for (const result of results) {
          const searchTime = 'searchTime' in result ? result.searchTime : result.totalSearchTime;

          const entryUpdate: Partial<EntryData> = {
            time: searchTime ? msToDisplay(searchTime, 'hundredths') : '',
            status: result.qualification,
            qualificationReason: (result as ScentWorkResult).qualificationReason || undefined,
            score: searchTime ? (searchTime / 1000).toString() : '',
            placement:
              (
                result as ScentWorkResult & { placementCalculated?: number }
              ).placementCalculated?.toString() || '',
          };

          await onResultUpdate(result.entryId, entryUpdate);
        }
      } catch (error) {
        logger.error('Error submitting results:', 'classes', {}, error as Error);
      }
    },
    [onResultUpdate]
  );

  return (
    <div className="space-y-6">
      {/* Statistics Cards — only when there are entries */}
      {classEntries.length > 0 && (
        <StatsGrid columns={stats.length as 2 | 3}>
          {stats.map((stat, index) => {
            const Icon = ICON_MAP[stat.type] ?? Users;
            const color = COLOR_MAP[stat.type] ?? 'primary';
            const subtitle = [stat.detail1, stat.detail2, stat.detail3].filter(Boolean).join(' / ');

            return (
              <StatCard
                key={index}
                icon={Icon}
                title={stat.title}
                value={stat.value}
                color={color}
                subtitle={subtitle}
                progress={stat.progress}
                {...(stat.trend ? { trend: stat.trend } : {})}
              />
            );
          })}
        </StatsGrid>
      )}

      {/* ENTRIES Section */}
      <ClassResultsTable
        entries={scentWorkEntries}
        classConfig={classConfig}
        userPermissions={userPermissions}
        onResultsSubmit={handleResultsSubmit}
        onDeleteEntry={onDeleteEntry}
        onAddEntry={onAddEntry}
        classId={classData?.id}
        onOpenRequirements={onOpenRequirements}
      />
    </div>
  );
};

export default ClassDetailsMain;
