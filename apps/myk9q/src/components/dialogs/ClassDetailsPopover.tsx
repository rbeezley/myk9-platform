import React from 'react';
import { Clock, Eye, Smartphone, User, Users, Activity, ListChecks, Hash } from 'lucide-react';
import { Popover, type PopoverPosition } from '@/components/ui';
import { formatSecondsToMMSS } from '@/utils/timeUtils';
import './ClassDetailsPopover.css';

// =============================================================================
// Types
// =============================================================================

export interface ClassDetailsData {
  // Identity
  classId?: number | string;

  // Status & Progress
  status?: string;
  totalEntries?: number;
  completedEntries?: number;

  // Personnel
  judgeName?: string;
  judgeNameB?: string; // For combined sections

  // Time Configuration
  timeLimitSeconds?: number;
  timeLimitArea2Seconds?: number;
  timeLimitArea3Seconds?: number;
  areaCount?: number;

  // Settings
  visibilityPreset?: 'open' | 'standard' | 'review';
  selfCheckinEnabled?: boolean;
}

export interface ClassDetailsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  data: ClassDetailsData;
  position?: PopoverPosition;
  /** Show Judge B row (for combined sections) */
  showJudgeB?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

interface StatusBadgeInfo {
  text: string;
  className: string;
}

function getStatusBadge(status?: string): StatusBadgeInfo | null {
  switch (status) {
    case 'in_progress':
      return { text: 'IN PROGRESS', className: 'status-in-progress' };
    case 'briefing':
      return { text: 'BRIEFING', className: 'status-briefing' };
    case 'break':
      return { text: 'ON BREAK', className: 'status-break' };
    case 'start_time':
    case 'setup':
      return { text: 'UPCOMING', className: 'status-upcoming' };
    case 'completed':
      return { text: 'COMPLETED', className: 'status-completed' };
    case 'offline-scoring':
      return { text: 'OFFLINE', className: 'status-offline' };
    case 'no-status':
    default:
      return null;
  }
}

function getVisibilityLabel(preset?: string): string {
  switch (preset) {
    case 'open':
      return 'Immediately';
    case 'review':
      return 'After Review';
    case 'standard':
    default:
      return 'After Class';
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * Unified popover for displaying class details.
 * Used on both ClassList (ClassCard) and EntryList pages.
 *
 * Shows:
 * - Status & entry progress
 * - Judge(s)
 * - Max time (with multi-area support)
 * - Results visibility
 * - Check-in mode
 */
export const ClassDetailsPopover: React.FC<ClassDetailsPopoverProps> = ({
  isOpen,
  onClose,
  anchorRef,
  data,
  position = 'top',
  showJudgeB = false,
}) => {
  const statusBadge = getStatusBadge(data.status);
  const hasJudgeB = showJudgeB && data.judgeNameB && data.judgeNameB !== data.judgeName;
  const hasTimeLimit = data.timeLimitSeconds || data.timeLimitArea2Seconds || data.timeLimitArea3Seconds;
  const isMultiArea = data.areaCount && data.areaCount > 1;

  return (
    <Popover
      isOpen={isOpen}
      onClose={onClose}
      anchorRef={anchorRef}
      title="Class Details"
      className="class-details-popover"
      position={position}
    >
      {/* Status */}
      {statusBadge && (
        <div className="popover-row">
          <Activity className="popover-icon" size={14} />
          <span className="popover-label">Status:</span>
          <span className={`popover-badge ${statusBadge.className}`}>
            {statusBadge.text}
          </span>
        </div>
      )}

      {/* Entry Progress */}
      {data.totalEntries !== undefined && (
        <div className="popover-row">
          <ListChecks className="popover-icon" size={14} />
          <span className="popover-label">Entries:</span>
          <span className="popover-value">
            {data.completedEntries || 0} / {data.totalEntries} completed
          </span>
        </div>
      )}

      {/* Judge */}
      {data.judgeName && data.judgeName !== 'TBD' && (
        <div className="popover-row">
          <User className="popover-icon" size={14} />
          <span className="popover-label">{hasJudgeB ? 'Judge A:' : 'Judge:'}</span>
          <span className="popover-value">{data.judgeName}</span>
        </div>
      )}

      {/* Judge B (for combined sections) */}
      {hasJudgeB && (
        <div className="popover-row">
          <Users className="popover-icon" size={14} />
          <span className="popover-label">Judge B:</span>
          <span className="popover-value">{data.judgeNameB}</span>
        </div>
      )}

      {/* Max Time */}
      <div className="popover-row">
        <Clock className="popover-icon" size={14} />
        <span className="popover-label">Max Time:</span>
        <span className="popover-value time-value">
          {hasTimeLimit ? (
            isMultiArea ? (
              <>
                {data.timeLimitSeconds && (
                  <span className="area-time">
                    <span className="area-label">(1)</span> {formatSecondsToMMSS(data.timeLimitSeconds)}
                  </span>
                )}
                {data.timeLimitArea2Seconds && (
                  <span className="area-time">
                    <span className="area-label">(2)</span> {formatSecondsToMMSS(data.timeLimitArea2Seconds)}
                  </span>
                )}
                {data.timeLimitArea3Seconds && (
                  <span className="area-time">
                    <span className="area-label">(3)</span> {formatSecondsToMMSS(data.timeLimitArea3Seconds)}
                  </span>
                )}
              </>
            ) : (
              data.timeLimitSeconds ? formatSecondsToMMSS(data.timeLimitSeconds) : 'TBD'
            )
          ) : (
            'TBD'
          )}
        </span>
      </div>

      {/* Results Visibility */}
      <div className="popover-row">
        <Eye className="popover-icon" size={14} />
        <span className="popover-label">Results:</span>
        <span className={`popover-badge visibility-${data.visibilityPreset || 'standard'}`}>
          {getVisibilityLabel(data.visibilityPreset)}
        </span>
      </div>

      {/* Check-in Mode */}
      <div className="popover-row">
        <Smartphone className="popover-icon" size={14} />
        <span className="popover-label">Check-in:</span>
        <span className={`popover-badge ${data.selfCheckinEnabled ? 'checkin-self' : 'checkin-table'}`}>
          {data.selfCheckinEnabled ? 'App (Self)' : 'At Table'}
        </span>
      </div>

      {/* Class ID - subtle, for troubleshooting */}
      {data.classId && (
        <div className="popover-row popover-row-subtle">
          <Hash className="popover-icon" size={14} />
          <span className="popover-label">Class ID:</span>
          <span className="popover-value popover-value-mono">{data.classId}</span>
        </div>
      )}
    </Popover>
  );
};

export default ClassDetailsPopover;
