import React, { useState } from 'react';
import { Users, Calendar, Trophy, type LucideIcon } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import type { StatColor } from '@myk9/ui';
import { type EntryData } from './types/classTypes';
import { ClassResultsTable } from './ClassResultsTable';
import SectionToggleControls from './SectionToggleControls';
import ClassExpandableSections from './ClassExpandableSections';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { createUserPermissions, UserPermissions } from '@/types/user-permissions';
import { useDogStore } from '@/store/dogStore';
import { logger } from '@/services/LoggingService';
import type { ScentWorkResult, MultiAreaScentWorkResult } from '@/types/scent-work-types';
import '@/styles/myk9-show-details.css';
import type { ClassDetailsMainProps } from './ClassDetailsMain.types';
import {
  countPopulatedFields,
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
}) => {
  // Count fields for each section
  const timingFieldsCount = countPopulatedFields([
    classData.estimatedJudgingTime,
    classData.timeLimit1,
    classData.timeLimit2,
    classData.timeLimit3,
    classData.startTime,
    classData.endTime,
  ]);

  const officialsFieldsCount = countPopulatedFields([
    classData.gateSteward,
    classData.tableSteward,
    classData.timerSteward,
    classData.ringSteward1,
    classData.ringSteward2,
    classData.ringSteward3,
  ]);

  const requirementsFieldsCount = countPopulatedFields([
    classData.hidesUsed,
    classData.distractionsUsed,
    classData.itemsUsed,
    classData.requiresJumpHeight,
  ]);

  const feesFieldsCount = countPopulatedFields([
    classData.preEntryFee,
    classData.dayOfShowFee,
    classData.entryFee,
  ]);

  const customFieldsCount = classData.customFields ? Object.keys(classData.customFields).length : 0;

  // State for section controls
  const [forceExpandAll, setForceExpandAll] = useState<boolean | undefined>(undefined);
  const [forceCollapseAll, setForceCollapseAll] = useState<boolean | undefined>(undefined);

  const handleExpandAll = () => {
    setForceCollapseAll(undefined);
    setForceExpandAll(true);
    setTimeout(() => setForceExpandAll(undefined), 200);
  };

  const handleCollapseAll = () => {
    setForceExpandAll(undefined);
    setForceCollapseAll(true);
    setTimeout(() => setForceCollapseAll(undefined), 200);
  };

  // Check if this is a Scent Work show
  const isScentWork = isScentWorkShow(parentShow);

  const stats = buildClassStats(classEntries, isScentWork);

  const { user, hasRole } = useAuthContext();
  const { dogs } = useDogStore();

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
      {/* Class Information Card */}
      <div className="myk9-show-info-card">
        {/* Essential Information */}
        <div className="myk9-show-info-grid">
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Trial</div>
            <div className="myk9-show-info-value">{classData.trial}</div>
          </div>
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Trial Date</div>
            <div className="myk9-show-info-value">
              {new Date(classData.trialDate + 'T00:00:00').toLocaleDateString()}
            </div>
          </div>
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Judge</div>
            <div className="myk9-show-info-value">{classData.judge}</div>
          </div>
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Class Order</div>
            <div className="myk9-show-info-value">#{classData.classOrder}</div>
          </div>
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Entry Fee</div>
            <div className="myk9-show-info-value">${classData.entryFee}</div>
          </div>
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Max Entries</div>
            <div className="myk9-show-info-value">{classData.maxEntries}</div>
          </div>
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Time Limit</div>
            <div className="myk9-show-info-value">{classData.timeLimit1}</div>
          </div>
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Trial Number</div>
            <div className="myk9-show-info-value">{classData.trialNumber}</div>
          </div>
        </div>

        {/* Section Controls */}
        <div className="mt-6 flex justify-end">
          <SectionToggleControls onExpandAll={handleExpandAll} onCollapseAll={handleCollapseAll} />
        </div>

        {/* Expandable Sections */}
        <ClassExpandableSections
          classData={classData}
          timingFieldsCount={timingFieldsCount}
          officialsFieldsCount={officialsFieldsCount}
          requirementsFieldsCount={requirementsFieldsCount}
          feesFieldsCount={feesFieldsCount}
          customFieldsCount={customFieldsCount}
          forceExpandAll={forceExpandAll}
          forceCollapseAll={forceCollapseAll}
        />
      </div>

      {/* Statistics Cards */}
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

      {/* ENTRIES Section */}
      <ClassResultsTable
        entries={scentWorkEntries}
        classConfig={classConfig}
        userPermissions={userPermissions}
        onResultsSubmit={handleResultsSubmit}
        onDeleteEntry={onDeleteEntry}
        onAddEntry={onAddEntry}
      />
    </div>
  );
};

export default ClassDetailsMain;
