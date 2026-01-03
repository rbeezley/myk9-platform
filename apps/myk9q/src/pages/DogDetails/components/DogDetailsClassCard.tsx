/**
 * DogDetails Class Card Component
 *
 * Extracted from DogDetails.tsx to reduce complexity.
 * Displays a single class entry with status, results, and visibility controls.
 */

import React from 'react';
import {
  Clock,
  AlertTriangle,
  ThumbsUp,
  XCircle,
  Check,
  Circle,
  Star,
  User,
  Target,
  Users,
  UserX
} from 'lucide-react';
import { TrialDateBadge } from '../../../components/ui';
import { PlacementBadge } from '../../EntryList/SortableEntryCardComponents';
import { getAvailabilityMessage } from '../../../services/resultVisibilityService';
import { formatTimeForDisplay } from '../../../utils/timeUtils';
import { getEntryStatusColor, getEntryStatusLabel } from '../../../utils/statusUtils';
import { isNonQualifyingResult } from '../../EntryList/sortableEntryCardUtils';
import type { ClassEntry } from '../hooks/useDogDetailsData';

interface DogDetailsClassCardProps {
  entry: ClassEntry;
  onCardClick: (entry: ClassEntry) => void;
  onStatusClick: (e: React.MouseEvent<HTMLButtonElement>, classId: number) => void;
}

/**
 * Format time for display, handling non-qualifying results
 */
function formatTime(time: string | null, resultText?: string | null): string {
  if (isNonQualifyingResult(resultText)) {
    return '00:00.00';
  }
  return formatTimeForDisplay(time);
}

/**
 * Render status icon based on check-in status
 */
function renderCheckInStatusIcon(status: string | undefined) {
  const iconStyle = { width: '18px', height: '18px', flexShrink: 0 };

  switch (status) {
    case 'checked-in':
      return <Check size={18} className="status-icon" style={iconStyle} />;
    case 'conflict':
      return <AlertTriangle size={18} className="status-icon" style={iconStyle} />;
    case 'pulled':
      return <XCircle size={18} className="status-icon" style={iconStyle} />;
    case 'at-gate':
      return <Star size={18} className="status-icon" style={iconStyle} />;
    default:
      return <Circle size={18} className="status-icon" style={iconStyle} />;
  }
}

/**
 * Format queue position for display
 */
function formatQueuePosition(position: number | undefined, status: string | undefined): string | null {
  if (status === 'pulled' || status === 'in-ring') return null;
  if (position === undefined) return null;
  if (position === 0) return 'Next up!';
  return `${position} ${position === 1 ? 'dog' : 'dogs'} ahead`;
}

const ICON_STYLE_18 = { width: '18px', height: '18px', flexShrink: 0 } as const;

/**
 * Render the status badge button content
 * Extracted to reduce component complexity
 */
function renderStatusBadgeContent(
  entry: ClassEntry,
  statusColor: string
): React.ReactNode {
  const isScored = entry.is_scored;
  const isQualified = statusColor === 'qualified';
  const isNQ = statusColor === 'not-qualified';
  const isAbsent = statusColor === 'absent' || statusColor === 'withdrawn';

  if (isScored) {
    return renderScoredStatusContent(entry, isQualified, isNQ, isAbsent);
  }

  return (
    <>
      {renderCheckInStatusIcon(entry.check_in_status)}
      <span className="status-text">{getEntryStatusLabel(entry)}</span>
    </>
  );
}

/**
 * Render the scored status badge content (Q/NQ/Absent/other)
 */
function renderScoredStatusContent(
  entry: ClassEntry,
  isQualified: boolean,
  isNQ: boolean,
  isAbsent: boolean
): React.ReactNode {
  if (!entry.visibleFields?.showQualification) {
    return (
      <>
        <Circle size={18} className="status-icon" style={ICON_STYLE_18} />
        <span className="status-text">Results Pending</span>
      </>
    );
  }

  if (isQualified) {
    return (
      <>
        <ThumbsUp size={18} className="status-icon" style={ICON_STYLE_18} />
        <span className="status-text">Qualified</span>
      </>
    );
  }

  if (isNQ) {
    return (
      <>
        <XCircle size={18} className="status-icon" style={ICON_STYLE_18} />
        <span className="status-text">Not Qualified</span>
      </>
    );
  }

  if (isAbsent) {
    return (
      <>
        <UserX size={18} className="status-icon" style={ICON_STYLE_18} />
        <span className="status-text">{getEntryStatusLabel(entry)}</span>
      </>
    );
  }

  return (
    <>
      <Check size={18} className="status-icon" style={ICON_STYLE_18} />
      <span className="status-text">{getEntryStatusLabel(entry)}</span>
    </>
  );
}

export const DogDetailsClassCard: React.FC<DogDetailsClassCardProps> = ({
  entry,
  onCardClick,
  onStatusClick
}) => {
  const statusColor = getEntryStatusColor(entry);
  const isScored = entry.is_scored;
  const isQualified = statusColor === 'qualified';

  return (
    <div
      className={`class-card ${statusColor} clickable`}
      style={{ position: 'relative', cursor: 'pointer' }}
      onClick={() => onCardClick(entry)}
    >
      {/* Corner Badge - Match EntryList design */}
      <div className="class-card-action">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!isScored) {
              onStatusClick(e, entry.id);
            }
          }}
          disabled={isScored}
          className={`status-badge ${statusColor}`}
        >
          {renderStatusBadgeContent(entry, statusColor)}
        </button>
      </div>

      <div className="class-content">
        {/* Top row: Class Name */}
        <h4 className="class-name" style={{
          margin: 0,
          fontSize: '1.125rem',
          fontWeight: 600,
          lineHeight: 1.2
        }}>
          {[
            entry.element,
            entry.level,
            entry.section && entry.section !== '-' ? entry.section : null
          ].filter(Boolean).join(' \u2022 ')}
        </h4>

        {/* Second row: Trial date and number */}
        <div className="class-meta-details">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <TrialDateBadge date={entry.trial_date} />
          </span>
          {entry.trial_number !== undefined && entry.trial_number !== null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Target size={14} style={{ width: '14px', height: '14px', flexShrink: 0 }} />
              Trial {entry.trial_number}
            </span>
          )}
        </div>

        {/* Third row: Judge */}
        {entry.judge_name && (
          <p style={{
            margin: 0,
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--muted-foreground)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem'
          }}>
            <User size={14} style={{ width: '14px', height: '14px', flexShrink: 0 }} />
            Judge: {entry.judge_name}
          </p>
        )}

        {/* Queue Position Badge - only show for pending (not scored) entries */}
        {!entry.is_scored && formatQueuePosition(entry.queuePosition, entry.check_in_status) && (
          <>
            <div className="class-card-divider" />
            <div className={`queue-position-badge ${
              entry.queuePosition === 0 ? 'next-up' :
              entry.queuePosition !== undefined && entry.queuePosition <= 3 ? 'approaching' : ''
            }`}>
              <Users size={14} style={{ width: '14px', height: '14px', flexShrink: 0 }} />
              <span>{formatQueuePosition(entry.queuePosition, entry.check_in_status)}</span>
            </div>
          </>
        )}

        {/* Performance Stats - respect visibility settings */}
        {entry.is_scored && (
          <>
            <div className="class-card-divider" />
            <div className="class-stats">
            {/* Placement Badge */}
            {entry.visibleFields?.showPlacement &&
             entry.position !== null &&
             entry.position !== undefined &&
             entry.position !== 9996 &&
             entry.position > 0 &&
             isQualified && (
              <PlacementBadge placement={entry.position} />
            )}

            {/* Time */}
            {entry.visibleFields?.showTime ? (
              <span className="time-badge">
                <Clock size={14} className="badge-icon" />
                {formatTime(entry.search_time, entry.result_text)}
              </span>
            ) : (
              <span className="time-badge dimmed">
                <Clock size={14} className="badge-icon" />
                \u23F3 {getAvailabilityMessage(entry.is_scoring_finalized || false, entry.timeTiming || 'class_complete')}
              </span>
            )}

            {/* Faults */}
            {entry.visibleFields?.showFaults ? (
              <span className="faults-badge-subtle">
                <AlertTriangle size={14} className="badge-icon" />
                {entry.fault_count || 0} {entry.fault_count === 1 ? 'Fault' : 'Faults'}
              </span>
            ) : (
              <span className="faults-badge-subtle dimmed">
                <AlertTriangle size={14} className="badge-icon" />
                \u23F3 {getAvailabilityMessage(entry.is_scoring_finalized || false, entry.faultsTiming || 'class_complete')}
              </span>
            )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DogDetailsClassCard;
