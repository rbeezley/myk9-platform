import React, { useState, useEffect } from 'react';
import { Clock, Play, Coffee, CheckCircle, Settings, Calendar, Circle, WifiOff, AlertTriangle, UserX } from 'lucide-react';
import { DialogContainer } from './DialogContainer';
import './shared-dialog.css';
import './ClassStatusDialog.css';

interface ClassStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (status: string, timeValue?: string) => void;
  classData: {
    id: number;
    element: string;
    level: string;
    class_name: string;
    class_status: string;
    entry_count: number;
    scored_count?: number;
    briefing_time?: string;
    break_until_time?: string;
    start_time?: string;
  };
  currentStatus: string;
  /** Callback to mark all unscored entries as absent */
  onMarkAbsent?: () => Promise<void>;
}

export const ClassStatusDialog: React.FC<ClassStatusDialogProps> = ({
  isOpen,
  onClose,
  onStatusChange,
  classData,
  currentStatus,
  onMarkAbsent
}) => {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [timeValue, setTimeValue] = useState<string>('');
  const [isFirstEdit, setIsFirstEdit] = useState(true);
  const [showAbsentConfirmation, setShowAbsentConfirmation] = useState(false);
  const [isMarkingAbsent, setIsMarkingAbsent] = useState(false);

  // Calculate unscored count
  const unscoredCount = (classData.entry_count || 0) - (classData.scored_count || 0);

  const statusOptions = [
    {
      id: 'no-status',
      label: 'No Status',
      icon: Circle,
      description: 'Reset class status',
      colorVar: '--status-none',
      needsTime: false
    },
    {
      id: 'setup',
      label: 'Setup',
      icon: Settings,
      description: 'Preparing the ring and equipment',
      colorVar: '--status-setup',
      needsTime: false
    },
    {
      id: 'briefing',
      label: 'Briefing',
      icon: Calendar,
      description: 'Judge briefing exhibitors',
      colorVar: '--status-briefing',
      needsTime: true,
      timeLabel: 'Briefing time',
      timePlaceholder: '10:00 AM',
      timeField: 'briefing_time'
    },
    {
      id: 'break',
      label: 'Break',
      icon: Coffee,
      description: 'Class is on break',
      colorVar: '--status-break',
      needsTime: true,
      timeLabel: 'Break until',
      timePlaceholder: '2:30 PM',
      timeField: 'break_until_time'
    },
    {
      id: 'start_time',
      label: 'Start Time',
      icon: Clock,
      description: 'Set class start time',
      colorVar: '--status-start-time',
      needsTime: true,
      timeLabel: 'Start time',
      timePlaceholder: '1:00 PM',
      timeField: 'start_time'
    },
    {
      id: 'in_progress',
      label: 'In Progress',
      icon: Play,
      description: 'Class is actively running',
      colorVar: '--status-in-progress',
      needsTime: false
    },
    {
      id: 'offline-scoring',
      label: 'Offline Scoring',
      icon: WifiOff,
      description: 'Judging offline - run order delayed',
      colorVar: '--status-offline-scoring',
      needsTime: false
    },
    {
      id: 'completed',
      label: 'Completed',
      icon: CheckCircle,
      description: 'Class has finished',
      colorVar: '--status-completed',
      needsTime: false
    }
  ];

  // Initialize time value when status is selected
  const getCurrentTime = (): string => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  useEffect(() => {
    if (selectedStatus && isOpen) {
      const status = statusOptions.find(s => s.id === selectedStatus);
      if (status?.needsTime && status.timeField) {
        // Check if there's an existing time for this status
        const existingTime = classData[status.timeField as keyof typeof classData] as string | undefined;
        if (existingTime) {
          setTimeValue(existingTime);
          setIsFirstEdit(false); // Don't clear if there's an existing time
        } else {
          // Set to current time by default
          setTimeValue(getCurrentTime());
          setIsFirstEdit(true); // Allow clearing on first keystroke
        }
      }
    }
  }, [selectedStatus, isOpen]);

  const handleStatusSelect = (statusId: string) => {
    const status = statusOptions.find(s => s.id === statusId);

    if (status?.needsTime) {
      setSelectedStatus(statusId);
    } else if (statusId === 'completed' && unscoredCount > 0 && onMarkAbsent) {
      // Show confirmation when marking complete with unscored dogs
      setShowAbsentConfirmation(true);
    } else {
      onStatusChange(statusId);
      onClose();
    }
  };

  const handleMarkAbsentAndComplete = async () => {
    if (!onMarkAbsent) return;

    setIsMarkingAbsent(true);
    try {
      await onMarkAbsent();
      onStatusChange('completed');
      onClose();
    } catch (error) {
      console.error('Failed to mark entries as absent:', error);
    } finally {
      setIsMarkingAbsent(false);
      setShowAbsentConfirmation(false);
    }
  };

  const handleCompleteWithoutMarking = () => {
    onStatusChange('completed');
    onClose();
    setShowAbsentConfirmation(false);
  };

  const handleCancelAbsentConfirmation = () => {
    setShowAbsentConfirmation(false);
  };

  const handleTimeSubmit = () => {
    if (selectedStatus && timeValue.trim()) {
      onStatusChange(selectedStatus, timeValue.trim());
      onClose();
      setSelectedStatus(null);
      setTimeValue('');
    }
  };

  const handleCancel = () => {
    setSelectedStatus(null);
    setTimeValue('');
  };

  const addMinutes = (minutes: number) => {
    // Parse the current time value in the field
    let baseTime: Date;

    if (timeValue.trim()) {
      // Try to parse the existing time
      try {
        const timeParts = timeValue.match(/(\d+):?(\d+)?\s*(am|pm)?/i);
        if (timeParts) {
          let hours = parseInt(timeParts[1]);
          const mins = parseInt(timeParts[2] || '0');
          const period = timeParts[3]?.toLowerCase();

          // Convert to 24-hour format
          if (period === 'pm' && hours !== 12) {
            hours += 12;
          } else if (period === 'am' && hours === 12) {
            hours = 0;
          }

          baseTime = new Date();
          baseTime.setHours(hours, mins, 0, 0);
        } else {
          // Can't parse, use current time
          baseTime = new Date();
        }
      } catch {
        baseTime = new Date();
      }
    } else {
      // Empty field, use current time
      baseTime = new Date();
    }

    // Add the specified minutes
    const futureTime = new Date(baseTime.getTime() + minutes * 60000);
    const timeString = futureTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    setTimeValue(timeString);
    setIsFirstEdit(false); // Mark as edited when using quick buttons
  };

  // Intelligent time formatting similar to MaxTimeDialog
  const formatTimeInput = (value: string): string => {
    // Remove all non-alphanumeric characters and spaces for processing
    const cleaned = value.replace(/[^0-9apmAPM]/g, '').toLowerCase();

    // If empty, return empty
    if (!cleaned) return '';

    // Extract AM/PM if present
    const hasAM = cleaned.includes('a');
    const hasRM = cleaned.includes('p');
    const period = hasRM ? 'PM' : hasAM ? 'AM' : '';

    // Remove am/pm from the number part
    const numStr = cleaned.replace(/[ap]/g, '');

    if (!numStr) return '';

    const num = parseInt(numStr);
    if (isNaN(num)) return '';

    // Smart AM/PM detection based on typical dog show hours
    const getSmartPeriod = (hour: number): string => {
      if (hour >= 1 && hour <= 6) return 'AM';  // 1-6 is early morning (AM)
      if (hour >= 7 && hour <= 11) return 'AM'; // 7-11 is morning (AM)
      if (hour === 12) return 'PM';             // 12 is noon (PM)
      return 'PM';                               // Everything else PM
    };

    // Interpret the numbers based on length
    if (numStr.length <= 2) {
      // 1-2 digits: treat as hour
      let hour = num;
      const defaultPeriod = period || getSmartPeriod(hour);
      if (hour > 12) hour = hour % 12 || 12;
      if (hour === 0) hour = 12;
      return `${hour}:00 ${defaultPeriod}`;
    } else if (numStr.length === 3) {
      // 3 digits: first digit as hour, last two as minutes (e.g., 130 = 1:30)
      let hour = Math.floor(num / 100);
      const minutes = num % 100;
      const defaultPeriod = period || getSmartPeriod(hour);
      if (hour > 12) hour = hour % 12 || 12;
      if (hour === 0) hour = 12;
      if (minutes < 60) {
        return `${hour}:${minutes.toString().padStart(2, '0')} ${defaultPeriod}`;
      } else {
        return `${hour}:00 ${defaultPeriod}`;
      }
    } else {
      // 4+ digits: treat as HHMM format
      let hour = Math.floor(num / 100);
      const minutes = num % 100;
      const defaultPeriod = period || (hour >= 13 ? 'PM' : getSmartPeriod(hour % 12 || 12));

      // Convert 24-hour to 12-hour
      if (hour > 12) {
        hour = hour - 12;
      } else if (hour === 0) {
        hour = 12;
      }

      const finalMinutes = minutes < 60 ? minutes : 0;
      return `${hour}:${finalMinutes.toString().padStart(2, '0')} ${defaultPeriod}`;
    }
  };

  const handleTimeChange = (value: string) => {
    // If this is the first keystroke and we're showing default time, clear it
    if (isFirstEdit && timeValue && value.length > timeValue.length) {
      // User is adding characters - clear the default and start fresh
      const newChar = value.slice(-1);
      setTimeValue(newChar);
      setIsFirstEdit(false);
    } else {
      // Normal editing
      setTimeValue(value);
      setIsFirstEdit(false);
    }
  };

  const handleTimeBlur = () => {
    // Format the time when user finishes typing (loses focus)
    if (timeValue.trim()) {
      const formatted = formatTimeInput(timeValue);
      setTimeValue(formatted);
    }
  };

  return (
    <DialogContainer
      isOpen={isOpen}
      onClose={onClose}
      title="Class Status"
      icon={<Clock className="title-icon" />}
    >
      {/* Class Info Header */}
      <div className="class-info-header">
        <h3 className="class-title">{classData.element} {classData.level}</h3>
        <div className="class-meta">
          <span className="entry-count">
            {classData.entry_count} {classData.entry_count === 1 ? 'Dog' : 'Dogs'}
          </span>
        </div>
      </div>

      {showAbsentConfirmation ? (
        /* Absent Confirmation Interface */
        <div className="absent-confirmation-container">
          <div className="absent-confirmation-header">
            <div className="absent-confirmation-icon">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div>
              <h4 className="absent-confirmation-title">Unscored Entries</h4>
              <p className="absent-confirmation-description">
                {unscoredCount} {unscoredCount === 1 ? 'dog has' : 'dogs have'} not been scored
              </p>
            </div>
          </div>

          <div className="absent-confirmation-message">
            <p>Would you like to mark these entries as <strong>Absent</strong> before completing the class?</p>
          </div>

          <div className="absent-confirmation-actions">
            <button
              className="absent-action-button absent-action-cancel"
              onClick={handleCancelAbsentConfirmation}
              disabled={isMarkingAbsent}
            >
              Cancel
            </button>
            <button
              className="absent-action-button absent-action-skip"
              onClick={handleCompleteWithoutMarking}
              disabled={isMarkingAbsent}
            >
              Complete Anyway
            </button>
            <button
              className="absent-action-button absent-action-mark"
              onClick={handleMarkAbsentAndComplete}
              disabled={isMarkingAbsent}
            >
              <UserX className="h-4 w-4" />
              {isMarkingAbsent ? 'Marking...' : 'Mark Absent'}
            </button>
          </div>
        </div>
      ) : selectedStatus ? (
        /* Time Input Interface */
        <div className="time-input-container">
          {(() => {
            const status = statusOptions.find(s => s.id === selectedStatus);
            const IconComponent = status?.icon || Clock;
            return (
              <>
                <div className="time-status-header">
                  <div className="time-status-icon">
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="time-status-title">{status?.label}</h4>
                    <p className="time-status-description">{status?.description}</p>
                  </div>
                </div>

                <div className="time-input-group">
                  <label className="time-input-label">{status?.timeLabel}</label>
                  <input
                    type="text"
                    className="time-input"
                    value={timeValue}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    onBlur={handleTimeBlur}
                    onFocus={(e) => {
                      // Select all text on focus so user can type to replace
                      e.target.select();
                    }}
                    placeholder={status?.timePlaceholder}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleTimeBlur();
                        handleTimeSubmit();
                      } else if (e.key === 'Escape') {
                        handleCancel();
                      }
                    }}
                  />

                  {/* Quick time adjustment buttons */}
                  <div className="time-quick-buttons">
                    <button
                      type="button"
                      className="time-quick-button"
                      onClick={() => addMinutes(5)}
                      title="Add 5 minutes"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      className="time-quick-button"
                      onClick={() => addMinutes(15)}
                      title="Add 15 minutes"
                    >
                      +15
                    </button>
                    <button
                      type="button"
                      className="time-quick-button"
                      onClick={() => addMinutes(30)}
                      title="Add 30 minutes"
                    >
                      +30
                    </button>
                  </div>
                </div>

                <div className="time-actions">
                  <button
                    className="time-action-button time-action-cancel"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                  <button
                    className="time-action-button time-action-submit"
                    onClick={handleTimeSubmit}
                    disabled={!timeValue.trim()}
                  >
                    Set {status?.label}
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        /* Status Options Grid */
        <div className="status-grid">
          {statusOptions.map((status) => {
            const IconComponent = status.icon;
            const isSelected = currentStatus === status.id;

            return (
              <div
                key={status.id}
                className={`status-item ${isSelected ? 'status-item-selected' : ''}`}
                onClick={() => handleStatusSelect(status.id)}
                role="button"
                tabIndex={0}
                style={{ '--status-color': `var(${status.colorVar})` } as React.CSSProperties}
              >
                <div className="status-icon">
                  <IconComponent />
                </div>
                <div className="status-content">
                  <label className="status-label">{status.label}</label>
                  <div className="status-description">{status.description}</div>
                </div>
                {isSelected && (
                  <div className="status-selected-indicator">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DialogContainer>
  );
};
