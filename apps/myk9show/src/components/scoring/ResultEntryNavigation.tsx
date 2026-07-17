/**
 * Result Entry Navigation Component
 *
 * Provides armband-focused navigation between entries in a class,
 * following the proven Flutter app UX patterns with visual status indicators
 * and progress tracking.
 */

import { useMemo, useState, useCallback } from 'react';
import { AlertCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import '@/styles/myk9-show-details.css';

// UI Components
import { Button } from '@/components/ui/button';
import { StatusBadge, StatusIcon, getStatusDescriptor } from '@/components/status';

// Types
import type { ScentWorkEntry, ScentWorkResult } from '@/types/scent-work-types';
import type { CheckInStatus } from '@myk9/core';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { CheckInManagementOverlay } from '@/components/common/CheckInManagementOverlay';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { msToDisplay } from '@/lib/timeUtils';
import { logger } from '@/services/LoggingService';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';

// Entry status for navigation
export type EntryNavigationStatus = 'pending' | 'in-progress' | 'completed';

export interface EntryWithResult extends ScentWorkEntry {
  navigationStatus: EntryNavigationStatus;
  result?: ScentWorkResult | undefined;
  placement?: number | undefined;
  isCurrentEntry?: boolean | undefined;
  checkInStatus?: CheckInStatus | undefined;
}

export interface ResultEntryNavigationProps {
  entries: EntryWithResult[];
  currentEntryId?: string | undefined;
  classInfo: {
    element: string;
    level: string;
    judge: string;
    totalEntries: number;
    classNumber?: string | undefined;
  };
  onSelectEntry: (entryId: string) => void;
  onStartJudging?: (() => void) | undefined;
  showProgress?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Entry navigation component with armband grid and progress tracking
 *
 * Features:
 * - Armband-focused grid layout (3-4 per row)
 * - Color-coded status indicators
 * - Progress tracking with completed count
 * - Quick jump to any entry
 * - Class information header
 */
export function ResultEntryNavigation({
  entries,
  classInfo,
  onSelectEntry,
  showProgress = true,
  className,
}: ResultEntryNavigationProps) {
  const { hasRole } = useAuthContext();
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [checkInManagementOpen, setCheckInManagementOpen] = useState(false);
  const [selectedEntryForCheckIn, setSelectedEntryForCheckIn] = useState<EntryWithResult | null>(
    null
  );

  // Check if user can manage check-in status
  const canManageCheckIn =
    hasRole(UserRole.JUDGE) ||
    hasRole(UserRole.SECRETARY) ||
    hasRole(UserRole.STEWARD) ||
    hasRole(UserRole.SITE_ADMIN);

  // Calculate progress statistics
  const progressStats = useMemo(() => {
    const total = entries.length;
    const completed = entries.filter(e => e.navigationStatus === 'completed').length;
    const inProgress = entries.filter(e => e.navigationStatus === 'in-progress').length;
    const pending = entries.filter(e => e.navigationStatus === 'pending').length;

    return {
      total,
      completed,
      inProgress,
      pending,
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [entries]);

  const updateCheckInStatus = useCallback(async (entryId: string, status: CheckInStatus) => {
    logger.debug(`Updating check-in status for entry ${entryId} to ${status}`, 'scoring', {});
    await updateReplicatedCheckInStatus(entryId, status);
  }, []);

  const handleCheckInStatusUpdate = async (status: CheckInStatus) => {
    if (!selectedEntryForCheckIn) return;

    try {
      await updateCheckInStatus(selectedEntryForCheckIn.id, status);
      setCheckInDialogOpen(false);
      setSelectedEntryForCheckIn(null);
    } catch (error) {
      logger.error('Failed to update check-in status:', 'scoring', {}, error as Error);
    }
  };

  const handleBulkCheckInStatusUpdate = async (entryId: string, status: CheckInStatus) => {
    try {
      await updateCheckInStatus(entryId, status);
    } catch (error) {
      logger.error('Failed to update check-in status:', 'scoring', {}, error as Error);
      throw error;
    }
  };

  return (
    <div className={cn('space-y-8', className)}>
      {/* Class Header */}
      <div className="myk9-judge-progress-section">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="myk9-judge-progress-title">
                {classInfo.element} {classInfo.level}
              </h2>
              <div className="flex items-center space-x-4 mt-2 text-sm text-muted-foreground">
                <span>Judge: {classInfo.judge}</span>
                <span>•</span>
                <span>{classInfo.totalEntries} Entries</span>
                <span>•</span>
                <span>2min limit</span>
              </div>
            </div>
            {canManageCheckIn && (
              <Button
                onClick={() => setCheckInManagementOpen(true)}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 px-6 py-3 text-base font-medium min-h-[44px]"
                size="lg"
              >
                <Users className="h-5 w-5 mr-2" />
                Manage Check-In
              </Button>
            )}
          </div>
        </div>

        {/* Progress Section */}
        {showProgress && (
          <div>
            <div className="myk9-judge-progress-header">
              <span className="text-sm font-medium text-muted-foreground">Progress</span>
              <span className="myk9-judge-progress-stats">
                {progressStats.completed} of {progressStats.total} completed
              </span>
            </div>

            <div className="myk9-judge-progress-bar">
              <div
                className="myk9-judge-progress-fill"
                style={{ width: `${progressStats.completionPercentage}%` }}
              />
            </div>

            <div className="myk9-judge-progress-indicators">
              <div className="flex items-center space-x-4">
                <div className="myk9-judge-progress-indicator">
                  <StatusIcon family="entry" status="completed" size="sm" decorative />
                  <span>
                    {progressStats.completed} {getStatusDescriptor('entry', 'completed').label}
                  </span>
                </div>
                <div className="myk9-judge-progress-indicator">
                  <StatusIcon family="entry" status="in-progress" size="sm" decorative />
                  <span>
                    {progressStats.inProgress}{' '}
                    {getStatusDescriptor('entry', 'in-progress').label}
                  </span>
                </div>
                <div className="myk9-judge-progress-indicator">
                  <StatusIcon family="entry" status="pending" size="sm" decorative />
                  <span>
                    {progressStats.pending} {getStatusDescriptor('entry', 'pending').label}
                  </span>
                </div>
              </div>
              <span>{progressStats.completionPercentage}% Complete</span>
            </div>
          </div>
        )}
      </div>

      {/* Entry Grid */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Entries</h3>
          <p className="text-sm text-muted-foreground">
            Select an entry to begin or continue judging
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {entries.map(entry => {
            const navigationStatus = entry.isCurrentEntry
              ? ('in-progress' as const)
              : entry.navigationStatus;

            // Debug logging for entries #107 and #108
            if (['107', '108'].includes(entry.displayInfo.armband)) {
              logger.debug(`🐕 Entry #${entry.displayInfo.armband}:`, 'scoring', {
                data: {
                  navigationStatus: entry.navigationStatus,
                  hasResult: !!entry.result,
                  result: entry.result,
                  statusClass: navigationStatus,
                },
              });
            }

            return (
              <div
                key={entry.id}
                className={cn('myk9-entry-card', entry.isCurrentEntry && 'current')}
                onPointerDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectEntry(entry.id);
                }}
                onTouchStart={e => {
                  // Immediate visual feedback on touch start
                  e.currentTarget.style.transform = 'scale(0.96)';
                }}
                onTouchEnd={e => {
                  // Reset visual state on touch end
                  e.currentTarget.style.transform = '';
                }}
                onTouchCancel={e => {
                  // Reset if touch is cancelled
                  e.currentTarget.style.transform = '';
                }}
              >
                {/* Armband and Status */}
                <div className="myk9-entry-header">
                  <div className="flex items-center gap-2">
                    <div className="myk9-entry-armband">#{entry.displayInfo.armband}</div>
                  </div>
                  <div className="myk9-entry-status-indicator">
                    {entry.navigationStatus === 'completed' && entry.placement && (
                      <div
                        className={cn(
                          'myk9-entry-placement-badge',
                          entry.placement === 1
                            ? 'first-place'
                            : entry.placement === 2
                              ? 'second-place'
                              : entry.placement === 3
                                ? 'third-place'
                                : 'other-place'
                        )}
                      >
                        {entry.placement === 1
                          ? '1st'
                          : entry.placement === 2
                            ? '2nd'
                            : entry.placement === 3
                              ? '3rd'
                              : `${entry.placement}th`}
                      </div>
                    )}
                    <StatusIcon family="entry" status={navigationStatus} />
                  </div>
                </div>

                {/* Dog Information */}
                <div className="myk9-entry-dog-info">
                  <div className="myk9-entry-dog-name">{entry.displayInfo.dogName}</div>
                  <div className="myk9-entry-handler-name">{entry.displayInfo.handlerName}</div>
                </div>

                {/* Result/Time Information */}
                <div className="myk9-entry-footer">
                  {entry.result ? (
                    <>
                      <div className="myk9-entry-time">
                        {msToDisplay(entry.result.searchTime, 'hundredths')}
                      </div>
                      {(() => {
                        const { qualification, faults } = entry.result;

                        switch (qualification) {
                          case 'Qualified':
                            return (
                              <div className="myk9-entry-result-badge myk9-entry-result-qualified">
                                Q{faults > 0 ? ` (${faults}f)` : ''}
                              </div>
                            );
                          case 'Not Qualified':
                            return (
                              <div className="myk9-entry-result-badge myk9-entry-result-nq">NQ</div>
                            );
                          case 'Absent':
                            return (
                              <div className="myk9-entry-result-badge myk9-entry-result-absent">
                                ABS
                              </div>
                            );
                          case 'Excused':
                            return (
                              <div className="myk9-entry-result-badge myk9-entry-result-excused">
                                EXC
                              </div>
                            );
                          case 'Withdrawn':
                            return (
                              <div className="myk9-entry-result-badge myk9-entry-result-withdrawn">
                                WD
                              </div>
                            );
                          default:
                            return (
                              <div className="myk9-entry-result-badge myk9-entry-result-nq">
                                {qualification}
                              </div>
                            );
                        }
                      })()}
                    </>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-medium text-muted-foreground">
                        {getStatusDescriptor('entry', navigationStatus).label}
                      </span>
                      {navigationStatus === 'pending' &&
                        entry.checkInStatus &&
                        entry.checkInStatus !== 'no-status' && (
                          <StatusBadge family="entry" status={entry.checkInStatus} />
                        )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {entries.length === 0 && (
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Entries Found</h3>
            <p className="text-muted-foreground">There are no entries in this class yet.</p>
          </div>
        )}
      </div>

      {/* Check-In Status Dialog */}
      {selectedEntryForCheckIn && (
        <CheckInStatusDialog
          open={checkInDialogOpen}
          onOpenChange={setCheckInDialogOpen}
          currentStatus={selectedEntryForCheckIn.checkInStatus || 'no-status'}
          onUpdateStatus={handleCheckInStatusUpdate}
          // This is a scoring/judge surface — it must keep the full staff status
          // set (Conflict/Pulled) and staff wording, not the exhibitor variant.
          // It previously relied on the shared default (exhibitor), which happened
          // to include those statuses; the exhibitor variant no longer does, so
          // the staff role must be explicit here.
          userRole="judge"
          entryInfo={{
            armband: selectedEntryForCheckIn.displayInfo.armband,
            dogName: selectedEntryForCheckIn.displayInfo.dogName,
            handlerName: selectedEntryForCheckIn.displayInfo.handlerName,
            className: `${classInfo.element} ${classInfo.level}`,
            classNumber: classInfo.classNumber || '1',
          }}
        />
      )}

      {/* Check-In Management Overlay */}
      <CheckInManagementOverlay
        open={checkInManagementOpen}
        onOpenChange={setCheckInManagementOpen}
        entries={entries.map(entry => ({
          id: entry.id,
          armband: entry.displayInfo.armband,
          dogName: entry.displayInfo.dogName,
          handlerName: entry.displayInfo.handlerName,
          checkInStatus: entry.checkInStatus,
          navigationStatus: entry.navigationStatus,
        }))}
        onUpdateStatus={handleBulkCheckInStatusUpdate}
      />
    </div>
  );
}
