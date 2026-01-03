import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Heart, MoreHorizontal, Users, UserCheck, Circle, Wrench, MessageSquare, Coffee, CalendarClock, PlayCircle, CheckCircle, Calendar, WifiOff, AlertTriangle, Info } from 'lucide-react';
import { getStaleDataStatus, formatStaleTime } from '../../utils/staleDataUtils';
import { UserPermissions } from '../../utils/auth';
import { ClassDetailsPopover } from '@/components/dialogs/ClassDetailsPopover';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ClassDetailsContent } from '@/components/dialogs/ClassDetailsContent';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';

interface ClassEntry {
  id: number;
  element: string;
  level: string;
  section: string;
  class_name: string;
  class_order: number;
  judge_name: string;
  entry_count: number;
  completed_count: number;
  class_status: 'no-status' | 'setup' | 'briefing' | 'break' | 'start_time' | 'in_progress' | 'offline-scoring' | 'completed';
  is_scoring_finalized?: boolean;
  is_favorite: boolean;
  time_limit_seconds?: number;
  time_limit_area2_seconds?: number;
  time_limit_area3_seconds?: number;
  area_count?: number;
  start_time?: string;
  briefing_time?: string;
  break_until?: string;
  planned_start_time?: string;
  last_result_at?: string;
  self_checkin_enabled?: boolean;
  visibility_preset?: 'open' | 'standard' | 'review';
  dogs: {
    id: number;
    armband: number;
    call_name: string;
    breed: string;
    handler: string;
    in_ring: boolean;
    checkin_status: number;
    is_scored: boolean;
    exhibitor_order: number;
  }[];
}

interface ClassCardProps {
  classEntry: ClassEntry;
  hasPermission: (permission: keyof UserPermissions) => boolean;
  toggleFavorite: (classId: number) => void;
  handleViewEntries: (classEntry: ClassEntry) => void;
  setActivePopup: (id: number | null) => void;
  setSelectedClassForStatus: (classEntry: ClassEntry) => void;
  setStatusDialogOpen: (open: boolean) => void;
  activePopup: number | null;
  getStatusColor: (status: ClassEntry['class_status'], classEntry?: ClassEntry) => string;
  getFormattedStatus: (classEntry: ClassEntry) => { label: string; time: string | null };
  onMenuClick?: (classId: number) => void;
  onPrefetch?: () => void;
  justToggledClassId?: number | null;
}

export const ClassCard: React.FC<ClassCardProps> = ({
  classEntry,
  hasPermission,
  toggleFavorite,
  handleViewEntries,
  setActivePopup,
  setSelectedClassForStatus,
  setStatusDialogOpen,
  activePopup,
  getStatusColor,
  getFormattedStatus,
  onMenuClick,
  onPrefetch,
  justToggledClassId,
}) => {
  // Detect touch device to choose between bottom sheet (mobile) and popover (desktop)
  const isTouchDevice = useIsTouchDevice();

  // Memoize computed values to prevent redundant function calls
  const statusColor = useMemo(
    () => getStatusColor(classEntry.class_status, classEntry),
    [classEntry, getStatusColor]
  );

  const formattedStatus = useMemo(
    () => getFormattedStatus(classEntry),
    [classEntry, getFormattedStatus]
  );

  // Check if run order data may be stale (for automatic offline detection)
  // Uses class_status === 'in_progress' which is automatically set when first dog is scored
  const staleStatus = useMemo(
    () => getStaleDataStatus({
      class_status: classEntry.class_status,
      last_result_at: classEntry.last_result_at,
    }),
    [classEntry.class_status, classEntry.last_result_at]
  );

  // Track status pulse animation - triggers when class_status changes
  const [isStatusAnimating, setIsStatusAnimating] = useState(false);
  const prevStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Only animate if status changed (not on initial mount)
    if (prevStatusRef.current !== undefined && classEntry.class_status !== prevStatusRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: triggers animation on prop change, same pattern as SortableEntryCard
      setIsStatusAnimating(true);
      const timer = setTimeout(() => setIsStatusAnimating(false), 500);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = classEntry.class_status;
  }, [classEntry.class_status]);

  const statusPulseClass = isStatusAnimating ? 'status-just-changed' : '';

  // State for class details - popover (desktop) or bottom sheet (mobile)
  const [showDetailsPopup, setShowDetailsPopup] = useState(false);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const infoIndicatorRef = useRef<HTMLDivElement>(null);

  // Class details data (shared between popover and bottom sheet)
  const classDetailsData = useMemo(() => ({
    classId: classEntry.id,
    status: classEntry.class_status,
    totalEntries: classEntry.entry_count,
    completedEntries: classEntry.completed_count,
    judgeName: classEntry.judge_name,
    timeLimitSeconds: classEntry.time_limit_seconds,
    timeLimitArea2Seconds: classEntry.time_limit_area2_seconds,
    timeLimitArea3Seconds: classEntry.time_limit_area3_seconds,
    areaCount: classEntry.area_count,
    visibilityPreset: classEntry.visibility_preset,
    selfCheckinEnabled: classEntry.self_checkin_enabled
  }), [classEntry]);

  // Format planned start time for display
  const formatPlannedStartTime = (timestamp: string | undefined) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Helper function to get the appropriate icon for each status
  const getStatusIcon = (status: ClassEntry['class_status']) => {
    switch (status) {
      case 'no-status':
        return <Circle size={18} className="status-icon" style={{ width: '18px', height: '18px', flexShrink: 0 }} />;
      case 'setup':
        return <Wrench size={18} className="status-icon" style={{ width: '18px', height: '18px', flexShrink: 0 }} />;
      case 'briefing':
        return <MessageSquare size={18} className="status-icon" style={{ width: '18px', height: '18px', flexShrink: 0 }} />;
      case 'break':
        return <Coffee size={18} className="status-icon" style={{ width: '18px', height: '18px', flexShrink: 0 }} />;
      case 'start_time':
        return <CalendarClock size={18} className="status-icon" style={{ width: '18px', height: '18px', flexShrink: 0 }} />;
      case 'in_progress':
        return <PlayCircle size={18} className="status-icon" style={{ width: '18px', height: '18px', flexShrink: 0 }} />;
      case 'offline-scoring':
        return <WifiOff size={18} className="status-icon" style={{ width: '18px', height: '18px', flexShrink: 0 }} />;
      case 'completed':
        return <CheckCircle size={18} className="status-icon" style={{ width: '18px', height: '18px', flexShrink: 0 }} />;
      default:
        return <Circle size={18} className="status-icon" style={{ width: '18px', height: '18px', flexShrink: 0 }} />;
    }
  };

  return (
    <div
      key={classEntry.id}
      className={`class-card touchable status-${classEntry.class_status.replace('_', '-')}`}
      onMouseEnter={() => onPrefetch?.()}
      onTouchStart={() => onPrefetch?.()}
      onClick={(e) => {
        // Don't navigate if clicking on interactive elements (buttons) or status badge
        const target = e.target as HTMLElement;
        if (
          target.closest('button') ||
          target.closest('.class-card-status-action') ||
          target.closest('.status-badge')
        ) {
          return;
        }
        handleViewEntries(classEntry);
      }}
    >
      <div className="class-content">
        <div className="class-header">
          {/* Action buttons - positioned absolutely in top-right, horizontal layout */}
          <div className="class-actions">
            <button
              type="button"
              className={`favorite-button ${classEntry.is_favorite ? 'favorited' : ''} ${justToggledClassId === classEntry.id ? 'favorite-just-toggled' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                toggleFavorite(classEntry.id);
                return false;
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              style={{ zIndex: 15 }}
            >
              <Heart className="favorite-icon" />
            </button>

            <button
              className="class-menu-button"
              onClick={(e) => {
                e.stopPropagation();
                if (activePopup === classEntry.id) {
                  setActivePopup(null);
                } else {
                  onMenuClick?.(classEntry.id);
                }
              }}
            >
              <MoreHorizontal className="menu-icon" />
            </button>
          </div>

          {/* Class name and metadata section */}
          <div className="class-title-section">
            {/* Class name with info indicator for popup */}
            <div
              ref={infoIndicatorRef}
              className="class-name-wrapper"
              onMouseEnter={() => {
                // Desktop: show popover on hover
                if (!isTouchDevice) {
                  setShowDetailsPopup(true);
                }
              }}
              onMouseLeave={() => {
                // Desktop: hide popover when mouse leaves
                if (!isTouchDevice) {
                  setShowDetailsPopup(false);
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (isTouchDevice) {
                  // Mobile: open bottom sheet on tap
                  setShowBottomSheet(true);
                } else {
                  // Desktop fallback: toggle popover on click
                  setShowDetailsPopup(!showDetailsPopup);
                }
              }}
            >
              <h3 className="class-name">{classEntry.class_name}</h3>
              <span className="info-indicator" aria-hidden="true">
                <Info size={12} />
              </span>
            </div>

            {/* Desktop: Class Details Popover - renders via portal */}
            {!isTouchDevice && (
              <ClassDetailsPopover
                isOpen={showDetailsPopup}
                onClose={() => setShowDetailsPopup(false)}
                anchorRef={infoIndicatorRef}
                position="top"
                data={classDetailsData}
              />
            )}

            {/* Mobile: Class Details Bottom Sheet */}
            <BottomSheet
              isOpen={showBottomSheet}
              onClose={() => setShowBottomSheet(false)}
              title="Class Details"
              closeOnBackdrop={false}
            >
              <ClassDetailsContent data={classDetailsData} />
            </BottomSheet>

            {/* Metadata Section - Judge only (other details in popup) */}
            <div className="metadata-section">
              {/* Judge */}
              <div className="meta-row">
                <UserCheck size={14} />
                Judge: {classEntry.judge_name}
              </div>
            </div>

            {classEntry.planned_start_time && (
              <div className="class-planned-time">
                <Calendar size={14} style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                <span className="planned-time-label">Planned:</span>
                <span className="planned-time-value">{formatPlannedStartTime(classEntry.planned_start_time)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Status Badge + Preview (grouped together) */}
        <div className="class-status-preview-section">
          {/* Status Badge - Corner badge design like entry list */}
          <div className="class-card-status-action">
            {hasPermission('canManageClasses') ? (
              <button
                className={`status-badge class-status-badge ${statusColor} ${statusPulseClass}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();

                  setSelectedClassForStatus(classEntry);
                  setStatusDialogOpen(true);
                }}
              >
                {getStatusIcon(classEntry.class_status)}
                <span className="status-text">
                  {formattedStatus.label}
                  {formattedStatus.time && (
                    <>
                      {' '}
                      <span className="status-time">{formattedStatus.time}</span>
                    </>
                  )}
                </span>
              </button>
            ) : (
              <div className={`status-badge class-status-badge ${statusColor} ${statusPulseClass}`}>
                {getStatusIcon(classEntry.class_status)}
                <span className="status-text">
                  {formattedStatus.label}
                  {formattedStatus.time && (
                    <>
                      {' '}
                      <span className="status-time">{formattedStatus.time}</span>
                    </>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Progress Bar - Visual separator showing class completion */}
          {classEntry.entry_count > 0 && (
            <div className="class-progress-bar">
              <div
                className="class-progress-fill"
                style={{
                  width: `${(classEntry.completed_count / classEntry.entry_count) * 100}%`
                }}
              />
            </div>
          )}

          {/* Contextual Preview - Display actual dog armband numbers */}
          {classEntry.dogs.length > 0 ? (
            <div className="contextual-preview-condensed">
              {/* Display actual armband numbers from dogs array (not parsed from string) */}
              {(() => {
                const inRingDog = classEntry.dogs.find(dog => dog.in_ring);
                const nextDogs = classEntry.dogs
                  .filter(dog =>
                    !dog.is_scored &&
                    !dog.in_ring &&
                    dog.checkin_status !== 3 // Exclude pulled dogs (checkin_status 3 = pulled)
                  )
                  .slice(0, 3);

                return (
                  <>
                    {/* In-ring dog with visual indicator */}
                    {inRingDog && (
                      <span key={inRingDog.id} className="armband-number in-ring">
                        <Circle size={8} fill="#f59e0b" stroke="#f59e0b" style={{ marginRight: '2px' }} />
                        #{inRingDog.armband}
                      </span>
                    )}
                    {/* Next dogs waiting */}
                    {nextDogs.map((dog) => (
                      <span key={dog.id} className="armband-number">
                        #{dog.armband}
                      </span>
                    ))}
                  </>
                );
              })()}
              {/* Show remaining count */}
              {classEntry.entry_count - classEntry.completed_count > 0 && (
                <span className="remaining-count">
                  {classEntry.entry_count - classEntry.completed_count} of {classEntry.entry_count} remaining
                </span>
              )}
              {classEntry.class_status === 'completed' && (
                <span className="remaining-count">
                  All complete
                </span>
              )}
            </div>
          ) : (
            <>
              {/* Empty progress bar track for visual consistency */}
              <div className="class-progress-bar" />
              <div className="no-entries">
                <Users className="no-entries-icon" />
                <span>No entries yet</span>
              </div>
            </>
          )}

          {/* Warning Banners - At bottom of card, compact single-line */}
          {classEntry.class_status === 'offline-scoring' && (
            <div className="offline-warning-banner">
              <WifiOff size={10} />
              <span>Offline - updates when reconnected</span>
            </div>
          )}
          {staleStatus.shouldShowWarning && (
            <div className="stale-warning-banner">
              <AlertTriangle size={10} />
              <span>May be outdated ({formatStaleTime(staleStatus.minutesSinceLastResult!)})</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
