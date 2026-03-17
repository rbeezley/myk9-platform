import React, { useState, useCallback } from 'react';
import { Users, Calendar, Trophy, Edit, Trash2, MoreVertical } from 'lucide-react';
import { CLASS_STATUS, getNextClassStatus, type ClassStatusValue } from '@myk9/core';
import { type EntryData } from './types/classTypes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClassResultsTable } from './ClassResultsTable';
import SectionToggleControls from './SectionToggleControls';
import ClassExpandableSections from './ClassExpandableSections';
import Breadcrumb from '@/components/common/Breadcrumb';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
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
  formatTime,
  formatClassTitle,
  isScentWorkShow,
  buildClassStats,
  buildClassConfig,
  buildScentWorkEntries,
} from './ClassDetailsMain.helpers';

const ClassDetailsMain: React.FC<ClassDetailsMainProps> = ({
  classData,
  classEntries,
  parentShow,
  parentTrial,
  isResultsView = false,
  onEditClass,
  onDeleteClass,
  // onEditPhoto,
  // onViewTrial,
  onAddEntry,
  onDeleteEntry,
  onStatusChange,
  onResultUpdate,
}) => {
  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'class',
    show: parentShow,
    trial: parentTrial,
    classId: classData.id,
    className: isResultsView ? `${classData.className} - Results` : classData.className,
  });

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

  // Build stats
  const stats = buildClassStats(classEntries, isScentWork);

  const getStatusClass = useCallback((status: string) => {
    switch (status) {
      case CLASS_STATUS.SCHEDULED:
        return 'myk9-show-status-upcoming';
      case CLASS_STATUS.IN_PROGRESS:
        return 'myk9-show-status-in-progress';
      case CLASS_STATUS.COMPLETED:
        return 'myk9-show-status-completed';
      default:
        return 'myk9-show-status-upcoming';
    }
  }, []);

  const getStatusIcon = useCallback((status: string) => {
    switch (status) {
      case CLASS_STATUS.SCHEDULED:
        return <Calendar className="w-3 h-3" />;
      case CLASS_STATUS.IN_PROGRESS:
        return <Users className="w-3 h-3" />;
      case CLASS_STATUS.COMPLETED:
        return <Trophy className="w-3 h-3" />;
      default:
        return <Calendar className="w-3 h-3" />;
    }
  }, []);

  const handleStatusClick = useCallback(() => {
    if (!onStatusChange) return;
    const nextStatus = getNextClassStatus(classData.status as ClassStatusValue);
    onStatusChange(nextStatus);
  }, [classData.status, onStatusChange]);

  // Auth and permissions
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
            time: searchTime ? formatTime(searchTime) : '',
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
    <div className="myk9-show-container">
      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbItems} showHomeIcon={true} />

      {/* Class Information Card */}
      <div className="myk9-show-info-card">
        <div className="myk9-show-info-header">
          <div>
            <div className="flex items-center gap-3">
              <div className="myk9-show-info-title">{formatClassTitle(classData)}</div>
              <button
                onClick={isResultsView ? undefined : handleStatusClick}
                className={`myk9-show-status ${getStatusClass(classData.status)} ${onStatusChange && !isResultsView ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                disabled={!onStatusChange || isResultsView}
                title={onStatusChange && !isResultsView ? 'Click to change status' : undefined}
              >
                {getStatusIcon(classData.status)}
                {classData.status || 'Scheduled'}
              </button>
            </div>
          </div>
          {!isResultsView && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditClass}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Class
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDeleteClass} className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Class
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Essential Information - Always Visible */}
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
      <div className="myk9-show-stats-section">
        <div className="myk9-show-stats-grid">
          {stats.map((stat, index) => (
            <div key={index} className="myk9-show-stat-card">
              <div className="myk9-show-stat-layout">
                <div className={`myk9-show-stat-icon ${stat.type}`}>
                  {stat.type === 'trials' && <Calendar className="w-5 h-5" />}
                  {stat.type === 'classes' && <Trophy className="w-5 h-5" />}
                  {stat.type === 'entries' && <Users className="w-5 h-5" />}
                </div>

                <div className="myk9-show-stat-content">
                  <div className="myk9-show-stat-header">
                    <div className="myk9-show-stat-title">{stat.title}</div>
                    {stat.trend && <div className="myk9-show-stat-trend">{stat.trend}</div>}
                  </div>
                  <div className="myk9-show-stat-number">{stat.value}</div>
                </div>
              </div>

              <div className="myk9-show-stat-details">
                <span>{stat.detail1}</span>
                <span>{stat.detail2}</span>
                {stat.detail3 && (
                  <span className="text-xs text-muted-foreground">{stat.detail3}</span>
                )}
              </div>

              <div className="myk9-show-stat-progress">
                <div
                  className={`myk9-show-stat-progress-bar ${stat.type}`}
                  style={{ width: `${stat.progress}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

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
