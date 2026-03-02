/**
 * Result Entry Navigation Component
 * 
 * Provides armband-focused navigation between entries in a class,
 * following the proven Flutter app UX patterns with visual status indicators
 * and progress tracking.
 */

import { useMemo, useState, useCallback } from 'react';
import { Clock, AlertCircle, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import '@/styles/myk9-show-details.css';

// UI Components
import { Button } from '@/components/ui/button';

// Data operations
import { useUpdateEntryMutation } from '@/hooks/queries/useEntriesDatabase';

// Types
import type { ScentWorkEntry, ScentWorkResult } from '@/types/scent-work-types';
import type { CheckInStatus } from '@/types/check-in-types';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { CheckInManagementOverlay } from '@/components/common/CheckInManagementOverlay';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { msToDisplay } from '@/lib/timeUtils';
import { logger } from '@/services/LoggingService';

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
  className
}: ResultEntryNavigationProps) {
  const { hasRole } = useAuthContext();
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [checkInManagementOpen, setCheckInManagementOpen] = useState(false);
  const [selectedEntryForCheckIn, setSelectedEntryForCheckIn] = useState<EntryWithResult | null>(null);

  const updateEntryMutation = useUpdateEntryMutation();

  // Check if user can manage check-in status
  const canManageCheckIn = hasRole(UserRole.JUDGE) || hasRole(UserRole.SECRETARY) || hasRole(UserRole.GATE_STEWARD) || hasRole(UserRole.SITE_ADMIN);

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
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }, [entries]);

  const updateCheckInStatus = useCallback(async (entryId: string, status: CheckInStatus) => {
    logger.debug(`Updating check-in status for entry ${entryId} to ${status}`, 'scoring', {});
    await updateEntryMutation.mutateAsync({
      id: entryId,
      updates: { result_status: status } as Record<string, unknown>,
    });
  }, [updateEntryMutation]);

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
                  <div className="myk9-judge-progress-dot completed"></div>
                  <span>{progressStats.completed} Completed</span>
                </div>
                <div className="myk9-judge-progress-indicator">
                  <div className="myk9-judge-progress-dot in-progress"></div>
                  <span>{progressStats.inProgress} In Progress</span>
                </div>
                <div className="myk9-judge-progress-indicator">
                  <div className="myk9-judge-progress-dot pending"></div>
                  <span>{progressStats.pending} Pending</span>
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
          {entries.map((entry) => {
            const getStatusClass = () => {
              if (entry.isCurrentEntry) return 'current';
              return entry.navigationStatus;
            };
            
            // Debug logging for entries #107 and #108
            if (['107', '108'].includes(entry.displayInfo.armband)) {
              logger.debug(`🐕 Entry #${entry.displayInfo.armband}:`, 'scoring', { data: {
                navigationStatus: entry.navigationStatus,
                hasResult: !!entry.result,
                result: entry.result,
                statusClass: getStatusClass()
              } });
            }
            
            return (
              <div
                key={entry.id}
                className={cn('myk9-entry-card', getStatusClass())}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectEntry(entry.id);
                }}
                onTouchStart={(e) => {
                  // Immediate visual feedback on touch start
                  e.currentTarget.style.transform = 'scale(0.96)';
                }}
                onTouchEnd={(e) => {
                  // Reset visual state on touch end
                  e.currentTarget.style.transform = '';
                }}
                onTouchCancel={(e) => {
                  // Reset if touch is cancelled
                  e.currentTarget.style.transform = '';
                }}
              >
                {/* Armband and Status */}
                <div className="myk9-entry-header">
                  <div className="flex items-center gap-2">
                    <div className="myk9-entry-armband">
                      #{entry.displayInfo.armband}
                    </div>
                  </div>
                  <div className="myk9-entry-status-indicator">
                    {/* For completed entries, show placement badge or nothing */}
                    {entry.navigationStatus === 'completed' ? (
                      entry.placement ? (
                        <div className={cn(
                          'myk9-entry-placement-badge',
                          entry.placement === 1 ? 'first-place' :
                          entry.placement === 2 ? 'second-place' :
                          entry.placement === 3 ? 'third-place' :
                          'other-place'
                        )}>
                          {entry.placement === 1 ? '1st' : 
                           entry.placement === 2 ? '2nd' : 
                           entry.placement === 3 ? '3rd' : 
                           `${entry.placement}th`}
                        </div>
                      ) : null
                    ) : (
                      /* For pending/in-progress entries, show status indicators */
                      <>
                        {entry.navigationStatus === 'in-progress' || entry.isCurrentEntry ? (
                          <Clock className="h-4 w-4 text-[#FF9500]" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className={cn('myk9-entry-status-dot', getStatusClass())}></div>
                      </>
                    )}
                  </div>
                </div>

                {/* Dog Information */}
                <div className="myk9-entry-dog-info">
                  <div className="myk9-entry-dog-name">
                    {entry.displayInfo.dogName}
                  </div>
                  <div className="myk9-entry-handler-name">
                    {entry.displayInfo.handlerName}
                  </div>
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
                              <div className="myk9-entry-result-badge myk9-entry-result-nq">
                                NQ
                              </div>
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
                  ) : entry.navigationStatus === 'in-progress' ? (
                    <div className="myk9-entry-status-text in-progress">
                      In Progress
                    </div>
                  ) : (
                    // For pending entries, show check-in status badge in bottom-right corner
                    <div className="flex items-center justify-between w-full">
                      <div className="myk9-entry-status-text pending">
                        Not Started
                      </div>
                      {(() => {
                        const status = entry.checkInStatus || 'none';
                        switch (status) {
                          case 'checked-in':
                            return (
                              <div className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-md border border-blue-200 dark:border-blue-700">
                                Checked In
                              </div>
                            );
                          case 'conflict':
                            return (
                              <div className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-md border border-yellow-200 dark:border-yellow-700">
                                Conflict
                              </div>
                            );
                          case 'at-gate':
                            return (
                              <div className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-md border border-green-200 dark:border-green-700">
                                At Gate
                              </div>
                            );
                          case 'pulled':
                            return (
                              <div className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded-md border border-red-200 dark:border-red-700">
                                Pulled
                              </div>
                            );
                          case 'go-to-gate':
                            return (
                              <div className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded-md border border-purple-200 dark:border-purple-700">
                                Go to Gate
                              </div>
                            );
                          default:
                            return null;
                        }
                      })()}
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
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No Entries Found
            </h3>
            <p className="text-muted-foreground">
              There are no entries in this class yet.
            </p>
          </div>
        )}
      </div>

      {/* Check-In Status Dialog */}
      {selectedEntryForCheckIn && (
        <CheckInStatusDialog
          open={checkInDialogOpen}
          onOpenChange={setCheckInDialogOpen}
          currentStatus={selectedEntryForCheckIn.checkInStatus || 'none'}
          onUpdateStatus={handleCheckInStatusUpdate}
          entryInfo={{
            armband: selectedEntryForCheckIn.displayInfo.armband,
            dogName: selectedEntryForCheckIn.displayInfo.dogName,
            handlerName: selectedEntryForCheckIn.displayInfo.handlerName,
            className: `${classInfo.element} ${classInfo.level}`,
            classNumber: classInfo.classNumber || '1'
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
          navigationStatus: entry.navigationStatus
        }))}
        onUpdateStatus={handleBulkCheckInStatusUpdate}
      />
    </div>
  );
}