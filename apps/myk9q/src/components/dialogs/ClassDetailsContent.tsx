import React from 'react';
import { Clock, Eye, Smartphone, User, Users, Activity, ListChecks, Hash } from 'lucide-react';
import { formatSecondsToMMSS } from '@/utils/timeUtils';
import { cn } from '@/lib/utils';

/** Tailwind styles for ClassDetailsContent */
const styles = {
  // Status badge variants
  statusInProgress: "bg-green-500/15 text-[var(--success)]",
  statusBriefing: "bg-amber-500/15 text-[var(--warning)]",
  statusBreak: "bg-blue-500/15 text-[var(--info)]",
  statusUpcoming: "bg-blue-500/15 text-[var(--info)]",
  statusCompleted: "bg-slate-400/15 text-[var(--muted-foreground)]",
  statusOffline: "bg-red-500/15 text-[var(--destructive)]",
  // Subtle row for less important info
  rowSubtle: cn(
    "mt-2 pt-2",
    "border-t border-dashed border-[var(--border-color,#e2e8f0)]",
    "opacity-70",
    "[&_.popover-icon]:opacity-80 [&_.popover-label]:opacity-80"
  ),
  // Monospace value
  valueMono: "font-mono text-[11px] tracking-wider",
};

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

export interface ClassDetailsContentProps {
  data: ClassDetailsData;
  /** Show Judge B row (for combined sections) */
  showJudgeB?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

interface StatusBadgeInfo {
  text: string;
  style: string;
}

function getStatusBadge(status?: string): StatusBadgeInfo | null {
  switch (status) {
    case 'in_progress':
      return { text: 'IN PROGRESS', style: styles.statusInProgress };
    case 'briefing':
      return { text: 'BRIEFING', style: styles.statusBriefing };
    case 'break':
      return { text: 'ON BREAK', style: styles.statusBreak };
    case 'start_time':
    case 'setup':
      return { text: 'UPCOMING', style: styles.statusUpcoming };
    case 'completed':
      return { text: 'COMPLETED', style: styles.statusCompleted };
    case 'offline-scoring':
      return { text: 'OFFLINE', style: styles.statusOffline };
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
 * Shared content component for class details.
 * Used by both ClassDetailsPopover (desktop) and BottomSheet (mobile).
 *
 * Shows:
 * - Status & entry progress
 * - Judge(s)
 * - Max time (with multi-area support)
 * - Results visibility
 * - Check-in mode
 */
export const ClassDetailsContent: React.FC<ClassDetailsContentProps> = ({
  data,
  showJudgeB = false,
}) => {
  const statusBadge = getStatusBadge(data.status);
  const hasJudgeB = showJudgeB && data.judgeNameB && data.judgeNameB !== data.judgeName;
  const hasTimeLimit = data.timeLimitSeconds || data.timeLimitArea2Seconds || data.timeLimitArea3Seconds;
  const isMultiArea = data.areaCount && data.areaCount > 1;

  return (
    <div className="class-details-content">
      {/* Status */}
      {statusBadge && (
        <div className="popover-row">
          <Activity className="popover-icon" size={14} />
          <span className="popover-label">Status:</span>
          <span className={cn("popover-badge", statusBadge.style)}>
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
        <div className={cn("popover-row", styles.rowSubtle)}>
          <Hash className="popover-icon" size={14} />
          <span className="popover-label">Class ID:</span>
          <span className={cn("popover-value", styles.valueMono)}>{data.classId}</span>
        </div>
      )}
    </div>
  );
};

export default ClassDetailsContent;
