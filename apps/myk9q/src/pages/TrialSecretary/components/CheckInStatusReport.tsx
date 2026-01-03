/**
 * Check-In Status Report
 *
 * Shows exhibitors grouped by check-in status using tabs:
 * - Not Checked In: Haven't checked into any class
 * - Partial Check-In: Checked into some but not all classes
 * - Fully Checked In: Checked into all their classes
 *
 * Pulled and scored classes are shown inline on each exhibitor's card
 * rather than as separate tabs, keeping the UI action-oriented.
 */

import React, { useState } from 'react';
import { RefreshCw, AlertCircle, AlertTriangle, CheckCircle2, Users, UserCheck } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCheckInReportData, type ExhibitorCheckInStatus, type PendingClassEntry } from '../hooks/useCheckInReportData';
import { updateEntryCheckinStatus } from '@/services/entry/entryStatusManagement';

interface CheckInStatusReportProps {
  licenseKey: string;
}

type ReportTab = 'not-checked-in' | 'partial' | 'fully-checked-in';

interface ExhibitorRowProps {
  exhibitor: ExhibitorCheckInStatus;
  showPendingClasses?: boolean;
  onCheckInAll?: (entryIds: number[]) => void;
  onCheckInSingle?: (entryId: number) => void;
  isCheckingIn?: boolean;
}

const ExhibitorRow: React.FC<ExhibitorRowProps> = ({
  exhibitor,
  showPendingClasses = true,
  onCheckInAll,
  onCheckInSingle,
  isCheckingIn = false,
}) => (
  <div className="exhibitor-row">
    <div className="exhibitor-info">
      <span className="exhibitor-armband">#{exhibitor.armband}</span>
      <span className="exhibitor-name">{exhibitor.handler}</span>
      {exhibitor.dogName && (
        <span className="exhibitor-dog">({exhibitor.dogName})</span>
      )}
    </div>
    <div className="exhibitor-classes">
      {showPendingClasses && exhibitor.pendingClasses.length > 0 && (
        <div className="class-list pending">
          <span className="class-list-label">Pending:</span>
          {exhibitor.pendingClasses.map((cls: PendingClassEntry) => (
            <button
              key={cls.entryId}
              className="class-tag pending clickable"
              onClick={() => onCheckInSingle?.(cls.entryId)}
              disabled={isCheckingIn}
              title={`Check in to ${cls.className}`}
            >
              {cls.className}
            </button>
          ))}
        </div>
      )}
      {exhibitor.checkedInClasses.length > 0 && (
        <div className="class-list checked-in">
          <span className="class-list-label">Checked in:</span>
          {exhibitor.checkedInClasses.map((cls, idx) => (
            <span key={idx} className="class-tag checked-in">{cls}</span>
          ))}
        </div>
      )}
      {exhibitor.pulledClasses.length > 0 && (
        <div className="class-list pulled">
          <span className="class-list-label">Pulled:</span>
          {exhibitor.pulledClasses.map((cls, idx) => (
            <span key={idx} className="class-tag pulled">{cls}</span>
          ))}
        </div>
      )}
      {exhibitor.scoredClasses.length > 0 && (
        <div className="class-list scored">
          <span className="class-list-label">Scored:</span>
          {exhibitor.scoredClasses.map((cls, idx) => (
            <span key={idx} className="class-tag scored">{cls}</span>
          ))}
        </div>
      )}
    </div>
    <div className="exhibitor-actions">
      {showPendingClasses && exhibitor.pendingClasses.length > 0 && onCheckInAll && (
        <button
          className="checkin-all-button"
          onClick={() => onCheckInAll(exhibitor.pendingClasses.map((c: PendingClassEntry) => c.entryId))}
          disabled={isCheckingIn}
          title="Check in to all pending classes"
        >
          <UserCheck size={16} />
          <span>All</span>
        </button>
      )}
      <span className="stat-badge">
        {exhibitor.scoredCount + exhibitor.checkedInCount}/{exhibitor.totalEntries - exhibitor.pulledCount}
      </span>
    </div>
  </div>
);

export const CheckInStatusReport: React.FC<CheckInStatusReportProps> = ({ licenseKey }) => {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useCheckInReportData(licenseKey);
  const [activeTab, setActiveTab] = useState<ReportTab>('not-checked-in');

  // Mutation for checking in entries with optimistic updates
  const checkInMutation = useMutation({
    mutationFn: async (entryIds: number[]) => {
      // Check in all entries sequentially
      for (const entryId of entryIds) {
        await updateEntryCheckinStatus(entryId, 'checked-in');
      }
      return entryIds;
    },
    // Optimistic update - immediately move classes to checked-in state
    onMutate: async (entryIds: number[]) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['checkInReport', licenseKey] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['checkInReport', licenseKey]);

      // Optimistically update the data - keep exhibitors in current lists,
      // just update their classes. They'll move to correct tabs on next refetch.
      // This prevents losing context when checking in individual classes.
      queryClient.setQueryData(['checkInReport', licenseKey], (old: typeof data) => {
        if (!old) return old;

        const entryIdSet = new Set(entryIds);

        // Helper to update an exhibitor's classes (stays in same list)
        const updateExhibitor = (exhibitor: ExhibitorCheckInStatus): ExhibitorCheckInStatus => {
          const classesToMove = exhibitor.pendingClasses.filter(c => entryIdSet.has(c.entryId));
          if (classesToMove.length === 0) return exhibitor;

          const newPendingClasses = exhibitor.pendingClasses.filter(c => !entryIdSet.has(c.entryId));
          const newCheckedInClasses = [
            ...exhibitor.checkedInClasses,
            ...classesToMove.map(c => c.className),
          ];

          return {
            ...exhibitor,
            pendingClasses: newPendingClasses,
            checkedInClasses: newCheckedInClasses,
            checkedInCount: exhibitor.checkedInCount + classesToMove.length,
            notCheckedInCount: exhibitor.notCheckedInCount - classesToMove.length,
          };
        };

        // Update exhibitors in place - don't move between lists yet
        // This keeps them visible so user can continue checking in classes
        return {
          ...old,
          notCheckedIn: old.notCheckedIn.map(updateExhibitor),
          partialCheckIn: old.partialCheckIn.map(updateExhibitor),
          fullyCheckedIn: old.fullyCheckedIn, // Already fully checked in, no changes needed
          stats: {
            ...old.stats,
            checkedInEntries: old.stats.checkedInEntries + entryIds.length,
          },
        };
      });

      return { previousData };
    },
    // If the mutation fails, roll back to the previous value
    onError: (_err, _entryIds, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['checkInReport', licenseKey], context.previousData);
      }
    },
    // Always refetch after error or success to ensure data is in sync
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['checkInReport', licenseKey] });
    },
  });

  // Handler for checking in all pending classes for an exhibitor
  const handleCheckInAll = (entryIds: number[]) => {
    checkInMutation.mutate(entryIds);
  };

  // Handler for checking in a single class
  const handleCheckInSingle = (entryId: number) => {
    checkInMutation.mutate([entryId]);
  };

  if (isLoading) {
    return (
      <div className="checkin-report checkin-report--loading">
        <div className="loading-spinner" />
        <p>Loading check-in data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="checkin-report checkin-report--error">
        <AlertCircle size={24} />
        <p>Error loading check-in data</p>
        <button onClick={() => refetch()} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="checkin-report checkin-report--empty">
        <Users size={32} />
        <p>No entry data available</p>
      </div>
    );
  }

  const { notCheckedIn, partialCheckIn, fullyCheckedIn, stats } = data;

  // Get current tab's data
  const getTabData = () => {
    switch (activeTab) {
      case 'not-checked-in':
        return { exhibitors: notCheckedIn, showPending: true, emptyMessage: 'All exhibitors have checked in to at least one class!' };
      case 'partial':
        return { exhibitors: partialCheckIn, showPending: true, emptyMessage: 'No exhibitors with partial check-ins' };
      case 'fully-checked-in':
        return { exhibitors: fullyCheckedIn, showPending: false, emptyMessage: 'No exhibitors fully checked in yet' };
    }
  };

  const tabData = getTabData();

  return (
    <div className="checkin-report">
      {/* Header with refresh button */}
      <div className="checkin-report-header">
        <h2>Check-In Status</h2>
        <button
          className="refresh-button"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Refresh data"
        >
          <RefreshCw size={18} className={isFetching ? 'spinning' : ''} />
        </button>
      </div>

      {/* Entry-level stats bar */}
      <div className="checkin-entry-stats">
        <span className="entry-stat">
          <strong>{stats.checkedInEntries}</strong> of <strong>{stats.totalEntries}</strong> entries checked in
          ({stats.totalEntries > 0 ? Math.round((stats.checkedInEntries / stats.totalEntries) * 100) : 0}%)
        </span>
      </div>

      {/* Tab buttons */}
      <div className="checkin-tabs">
        <button
          className={`checkin-tab tab-danger ${activeTab === 'not-checked-in' ? 'active' : ''}`}
          onClick={() => setActiveTab('not-checked-in')}
        >
          <AlertCircle size={16} />
          <span className="tab-label">Not Checked In</span>
          <span className="tab-count">{stats.notCheckedInCount}</span>
        </button>
        <button
          className={`checkin-tab tab-warning ${activeTab === 'partial' ? 'active' : ''}`}
          onClick={() => setActiveTab('partial')}
        >
          <AlertTriangle size={16} />
          <span className="tab-label">Partial</span>
          <span className="tab-count">{stats.partialCheckInCount}</span>
        </button>
        <button
          className={`checkin-tab tab-success ${activeTab === 'fully-checked-in' ? 'active' : ''}`}
          onClick={() => setActiveTab('fully-checked-in')}
        >
          <CheckCircle2 size={16} />
          <span className="tab-label">Checked In</span>
          <span className="tab-count">{stats.fullyCheckedInCount}</span>
        </button>
      </div>

      {/* Tab content - exhibitor list */}
      <div className="checkin-tab-content">
        {tabData.exhibitors.length === 0 ? (
          <p className="empty-message">{tabData.emptyMessage}</p>
        ) : (
          <div className="exhibitor-list">
            {tabData.exhibitors.map((exhibitor) => (
              <ExhibitorRow
                key={`${exhibitor.armband}-${exhibitor.handler}`}
                exhibitor={exhibitor}
                showPendingClasses={tabData.showPending}
                onCheckInAll={handleCheckInAll}
                onCheckInSingle={handleCheckInSingle}
                isCheckingIn={checkInMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckInStatusReport;
