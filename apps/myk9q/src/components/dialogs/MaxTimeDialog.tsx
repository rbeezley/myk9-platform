import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { DialogContainer } from './DialogContainer';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Class } from '@/services/replication/tables/ReplicatedClassesTable';
import { logger } from '@/utils/logger';
import './shared-dialog.css';
import './MaxTimeDialog.css';

interface MaxTimeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  showWarning?: boolean;
  classData: {
    id: number;
    element: string;
    level: string;
    class_name: string;
    time_limit_seconds?: number;
    time_limit_area2_seconds?: number;
    time_limit_area3_seconds?: number;
    area_count?: number;
    pairedClassId?: number; // For combined Novice A & B classes
  };
  onTimeUpdate?: () => void;
}

interface TimeRange {
  min: number;
  max: number;
  areas: number;
}

interface ClassRequirements {
  has_30_second_warning?: boolean;
  time_type?: 'fixed' | 'range' | 'dictated';
  warning_notes?: string;
}

export const MaxTimeDialog: React.FC<MaxTimeDialogProps> = ({
  isOpen,
  onClose,
  showWarning = false,
  classData,
  onTimeUpdate
}) => {
  const { showContext } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [requirements, setRequirements] = useState<ClassRequirements | null>(null);
  const [times, setTimes] = useState<string[]>(['', '', '']);
  const [errors, setErrors] = useState<string[]>(['', '', '']);
  const [isDictatedTime, setIsDictatedTime] = useState(false);
  const [dictatedTime, setDictatedTime] = useState<string>('');
  const [validationMessage, setValidationMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Clear all messages
  const clearMessages = () => {
    setValidationMessage('');
    setSuccessMessage('');
    setErrorMessage('');
  };

  useEffect(() => {
    if (isOpen && classData) {
      clearMessages();
      loadTimeRange();
      initializeTimes();
    }
  }, [isOpen, classData]);

  // Auto-focus first input when dialog opens and is not dictated time
  useEffect(() => {
    if (isOpen && !loading && !isDictatedTime && firstInputRef.current) {
      // Small delay to ensure the dialog is fully rendered
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
        // Select the minutes section by default
        if (firstInputRef.current?.value) {
          firstInputRef.current.setSelectionRange(0, 2);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, loading, isDictatedTime]);

  const loadTimeRange = async () => {
    if (!showContext?.licenseKey) return;

    setLoading(true);
    try {
// Get organization type
      const { data: showData, error: showError } = await supabase
        .from('shows')
        .select('organization')
        .eq('license_key', showContext.licenseKey)
        .single();

      if (showError || !showData) {
        logger.error('❌ Error fetching show data:', showError);
        return;
      }

      const isAKC = showData.organization.includes('AKC');
      const isUKC = showData.organization.includes('UKC');
      const isASCA = showData.organization.includes('ASCA');

      // Query the unified requirements table for time range
      let requirementsData = null;

      const org = isAKC ? 'AKC' : isUKC ? 'UKC' : isASCA ? 'ASCA' : null;

      if (org) {
        const { data, error } = await supabase
          .from('class_requirements')
          .select('*')
          .eq('organization', org)
          .eq('element', classData.element)
          .eq('level', classData.level)
          .single();

        if (!error && data) {
          requirementsData = data;
        }
      }

      if (requirementsData) {
        // Store requirements for warning display
        setRequirements({
          has_30_second_warning: requirementsData.has_30_second_warning,
          time_type: requirementsData.time_type,
          warning_notes: requirementsData.warning_notes
        });

        // Parse time range from time_limit_text (e.g., "1 - 3 minutes", "4 minutes")
        const timeText = requirementsData.time_limit_text || '';
        const range = parseTimeRange(timeText);
        const areas = requirementsData.area_count || 1;

        // Check if this is a dictated time class (Container or Buried)
        const isFixedTime = classData.element === 'Container' || classData.element === 'Buried';

        if (isFixedTime && range.min === range.max) {
          // This is a dictated time - display as read-only
          setIsDictatedTime(true);
          setDictatedTime(`${range.min} minute${range.min !== 1 ? 's' : ''}`);
} else {
          setIsDictatedTime(false);
        }

        setTimeRange({ ...range, areas });
}
    } catch (error) {
      logger.error('💥 Error loading time range:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseTimeRange = (timeText: string): { min: number; max: number } => {
    // Handle formats like "1 - 3 minutes", "4 minutes", "1-3 minutes", "2:30", "3:00"
    const cleanText = timeText.toLowerCase().replace(/minutes?/g, '').trim();

    // Check for MM:SS format (e.g., "2:30", "3:00")
    if (cleanText.match(/^\d+:\d{2}$/)) {
      const [mins, secs] = cleanText.split(':').map(p => parseInt(p));
      const totalMinutes = mins + (secs / 60);
      return { min: totalMinutes, max: totalMinutes };
    }

    // Handle range format (e.g., "1 - 3", "1-3")
    if (cleanText.includes('-')) {
      const parts = cleanText.split('-').map(p => parseInt(p.trim()));
      return { min: parts[0] || 1, max: parts[1] || parts[0] || 3 };
    } else {
      const single = parseInt(cleanText) || 3;
      return { min: single, max: single };
    }
  };

  const initializeTimes = () => {
    // Convert seconds to MM:SS format
    const secondsToTimeString = (seconds?: number | string): string => {
      if (!seconds || seconds === 0) return '';
      const totalSeconds = typeof seconds === 'string' ? parseInt(seconds) : seconds;
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const currentTimes = [
      secondsToTimeString(classData.time_limit_seconds),
      secondsToTimeString(classData.time_limit_area2_seconds),
      secondsToTimeString(classData.time_limit_area3_seconds)
    ];

    setTimes(currentTimes);
    setErrors(['', '', '']);
  };

  const formatTimeInput = (value: string): string => {
    // Remove non-digits and colons
    const cleaned = value.replace(/[^\d:]/g, '');

    // If empty, return empty
    if (!cleaned) return '';

    // Handle MM:SS format
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':');
      let minutes = parseInt(parts[0]) || 0;
      let seconds = parseInt(parts[1]) || 0;

      // Handle seconds overflow (convert to minutes)
      if (seconds >= 60) {
        minutes += Math.floor(seconds / 60);
        seconds = seconds % 60;
      }

      // Cap at reasonable maximum (5 minutes)
      if (minutes > 5) {
        minutes = 5;
        seconds = 0;
      }

      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Handle just numbers - interpret based on length and context
    const numValue = parseInt(cleaned);
    if (isNaN(numValue)) return '';

    if (cleaned.length <= 2) {
      // 1-2 digits: treat as minutes
      const minutes = Math.min(numValue, 5); // Cap at 5 minutes
      return `${minutes.toString().padStart(2, '0')}:00`;
    } else if (cleaned.length === 3) {
      // 3 digits: first digit as minutes, last two as seconds (e.g., 130 = 1:30)
      const minutes = Math.floor(numValue / 100);
      const seconds = numValue % 100;
      if (seconds < 60) {
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        // Invalid seconds, treat as minutes
        const totalMinutes = Math.min(Math.floor(numValue / 60), 5);
        return `${totalMinutes.toString().padStart(2, '0')}:00`;
      }
    } else {
      // 4+ digits: treat as MMSS format
      const minutes = Math.floor(numValue / 100);
      const seconds = numValue % 100;
      const finalMinutes = Math.min(minutes, 5);
      const finalSeconds = seconds < 60 ? seconds : 0;
      return `${finalMinutes.toString().padStart(2, '0')}:${finalSeconds.toString().padStart(2, '0')}`;
    }
  };

  const validateTime = (timeStr: string, _areaIndex: number): string => {
    if (!timeRange || !timeStr) return '';

    const timeMinutes = convertToMinutes(timeStr);

    if (timeMinutes < timeRange.min) {
      return `Minimum ${timeRange.min} minute${timeRange.min !== 1 ? 's' : ''}`;
    }

    if (timeMinutes > timeRange.max) {
      return `Maximum ${timeRange.max} minute${timeRange.max !== 1 ? 's' : ''}`;
    }

    return '';
  };

  const convertToMinutes = (timeStr: string): number => {
    if (timeStr.includes(':')) {
      const [minutes, seconds] = timeStr.split(':').map(p => parseInt(p) || 0);
      return minutes + (seconds / 60);
    }
    return parseInt(timeStr) || 0;
  };

  const setPresetTime = (areaIndex: number, timeString: string) => {
    handleTimeChange(areaIndex, timeString);
  };

  const generateTimePresets = (): string[] => {
    if (!timeRange) return [];

    const presets: string[] = [];
    const { min, max } = timeRange;

    // Generate presets for each minute and half-minute increment within range
    for (let minute = min; minute <= max; minute++) {
      // Add full minute (e.g., 1:00, 2:00, 3:00)
      presets.push(`${minute.toString().padStart(2, '0')}:00`);

      // Add half minute if not at max (e.g., 1:30, 2:30)
      if (minute < max) {
        presets.push(`${minute.toString().padStart(2, '0')}:30`);
      }
    }

    return presets;
  };

  // Check if save button should be enabled
  const canSave = (): boolean => {
    if (!timeRange || saving) return false;

    // Check all required areas have times
    const requiredAreas = timeRange.areas;
    const filledTimes = times.slice(0, requiredAreas).filter(time => time !== '');

    const allFilled = filledTimes.length === requiredAreas;
    const allEmpty = filledTimes.length === 0;

    // If showWarning is true (max time required), must fill all areas - can't save empty
    if (showWarning && allEmpty) return false;

    // Otherwise: all areas must be filled (or all must be empty for clearing)
    if (!allFilled && !allEmpty) return false;

    // No validation errors
    const hasErrors = errors.slice(0, requiredAreas).some(error => error !== '');
    if (hasErrors) return false;

    return true;
  };

  const handleTimeChange = (areaIndex: number, value: string) => {
    const formatted = formatTimeInput(value);
    const newTimes = [...times];
    newTimes[areaIndex] = formatted;
    setTimes(newTimes);

    // Clear global messages when user starts typing
    if (validationMessage || errorMessage) {
      setValidationMessage('');
      setErrorMessage('');
    }

    // Validate
    const newErrors = [...errors];
    newErrors[areaIndex] = validateTime(formatted, areaIndex);
    setErrors(newErrors);
  };

  const handleTimeKeyDown = (areaIndex: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const value = input.value;
    const cursorPos = input.selectionStart || 0;
    const selectionEnd = input.selectionEnd || 0;

    // Handle backspace functionality
    if (e.key === 'Backspace') {
      e.preventDefault();

      // If there's a selection, clear it
      if (cursorPos !== selectionEnd) {
        const newValue = value.slice(0, cursorPos) + value.slice(selectionEnd);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(cursorPos, cursorPos), 0);
        return;
      }

      // Handle backspace at different positions
      if (cursorPos === 0) {
        // At beginning, clear the entire field
        handleTimeChange(areaIndex, '');
        return;
      } else if (cursorPos === 3 && value.charAt(2) === ':') {
        // At colon position, move to minutes and delete the last minute digit
        const newValue = value.charAt(0) + '0:' + value.slice(3);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(1, 1), 0);
        return;
      } else if (cursorPos <= 2) {
        // In minutes section
        const newValue = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(Math.max(0, cursorPos - 1), Math.max(0, cursorPos - 1)), 0);
        return;
      } else {
        // In seconds section
        const newValue = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(Math.max(3, cursorPos - 1), Math.max(3, cursorPos - 1)), 0);
        return;
      }
    }

    // Handle delete key
    if (e.key === 'Delete') {
      e.preventDefault();

      // If there's a selection, clear it
      if (cursorPos !== selectionEnd) {
        const newValue = value.slice(0, cursorPos) + value.slice(selectionEnd);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(cursorPos, cursorPos), 0);
        return;
      }

      // Handle delete at different positions
      if (cursorPos >= value.length) {
        return; // At end, nothing to delete
      } else if (cursorPos === 2 && value.charAt(2) === ':') {
        // At colon, delete first seconds digit
        const newValue = value.slice(0, 3) + '0' + value.slice(4);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(3, 3), 0);
        return;
      } else {
        const newValue = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
        const formatted = formatTimeInput(newValue);
        handleTimeChange(areaIndex, formatted);
        setTimeout(() => input.setSelectionRange(cursorPos, cursorPos), 0);
        return;
      }
    }

    // Handle arrow keys to skip over colon
    if (e.key === 'ArrowRight' && cursorPos === 2) {
      e.preventDefault();
      input.setSelectionRange(3, 3);
    }
    if (e.key === 'ArrowLeft' && cursorPos === 3) {
      e.preventDefault();
      input.setSelectionRange(2, 2);
    }
  };

  const handleTimeClick = (areaIndex: number, e: React.MouseEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const clickPos = input.selectionStart || 0;

    // If clicking on or after the colon, move to seconds
    if (clickPos >= 2) {
      setTimeout(() => input.setSelectionRange(3, 5), 0);
    } else {
      // Clicking in minutes section
      setTimeout(() => input.setSelectionRange(0, 2), 0);
    }
  };

  const getAreaLabel = (areaIndex: number): string => {
    if (!timeRange || timeRange.areas === 1) return 'Max Time';
    return `Area ${areaIndex + 1} Max Time`;
  };

  const handleSave = async () => {
    if (!timeRange) return;

    // Validate all times
    const newErrors = times.map((time, index) => validateTime(time, index));
    setErrors(newErrors);

    // Check if any errors exist
    const hasErrors = newErrors.some(error => error !== '');
    if (hasErrors) return;

    // Allow saving cleared times (for corrections) or properly filled times
    const requiredAreas = timeRange.areas;
    const filledTimes = times.slice(0, requiredAreas).filter(time => time !== '');
    const allAreasEmpty = filledTimes.length === 0;
    const allAreasStillFilled = filledTimes.length === requiredAreas;

    // Only prevent saving if some areas are filled and some are empty (incomplete state)
    if (!allAreasEmpty && !allAreasStillFilled) {
      setValidationMessage(`Please either set max time for all ${requiredAreas} area${requiredAreas !== 1 ? 's' : ''} or clear all fields`);
      return;
    }

    // Clear any previous messages
    clearMessages();

    setSaving(true);
    try {
      // Convert MM:SS to seconds
      const timeStringToSeconds = (timeStr: string): number => {
        if (!timeStr) return 0;
        const [minutes, seconds] = timeStr.split(':').map(p => parseInt(p) || 0);
        return (minutes * 60) + seconds;
      };

      // Update the class with new max times in seconds
      // Always include all time fields to ensure clearing works properly
      const updateData: {
        time_limit_seconds: number;
        time_limit_area2_seconds: number;
        time_limit_area3_seconds: number;
      } = {
        time_limit_seconds: times[0] ? timeStringToSeconds(times[0]) : 0,
        time_limit_area2_seconds: times[1] ? timeStringToSeconds(times[1]) : 0,
        time_limit_area3_seconds: times[2] ? timeStringToSeconds(times[2]) : 0,
      };

      // For combined Novice A & B classes, update both records
      const idsToUpdate = classData.pairedClassId
        ? [classData.id, classData.pairedClassId]
        : [classData.id];

const { error } = await supabase
        .from('classes')
        .update(updateData)
        .in('id', idsToUpdate);

      if (error) {
        logger.error('❌ Error updating max times:', error);
        setErrorMessage('Failed to save max times. Please try again.');
        return;
      }

      // Update IndexedDB cache directly to avoid stale data on refetch
      try {
        const manager = await ensureReplicationManager();
        const classesTable = manager.getTable<Class>('classes');

        if (classesTable) {
          for (const id of idsToUpdate) {
            const existingClass = await classesTable.get(String(id));
            if (existingClass) {
              // Update only the time fields
              const updatedClass: Class = {
                ...existingClass,
                time_limit_seconds: updateData.time_limit_seconds || undefined,
                time_limit_area2_seconds: updateData.time_limit_area2_seconds || undefined,
                time_limit_area3_seconds: updateData.time_limit_area3_seconds || undefined,
              };
              await classesTable.set(String(id), updatedClass, false);
            }
          }
        }
      } catch (cacheError) {
        // Non-fatal - cache will be updated on next sync
        logger.warn('⚠️ [MaxTimeDialog] Failed to update IndexedDB cache:', cacheError);
      }

// Show appropriate success message
      if (allAreasEmpty) {
        // User cleared all times
        setSuccessMessage('Max times have been cleared successfully. Judges can now set new times.');
      } else {
        // User set times normally
        setSuccessMessage('Max times have been saved successfully.');
      }

      // Auto-close dialog after showing success message
      setTimeout(() => {
        onTimeUpdate?.();
        onClose();
      }, 2000);
    } catch (error) {
      logger.error('💥 Error saving max times:', error);
      setErrorMessage('Failed to save max times. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContainer
      isOpen={isOpen}
      onClose={onClose}
      title="Set Max Time"
      icon={<Clock className="title-icon" />}
      className="max-time-dialog"
    >
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <p>Loading time requirements...</p>
            </div>
          ) : timeRange ? (
            <>
              {/* Class Info Header */}
              <div className="class-info-header">
                <h3 className="class-title">{classData.element} {classData.level}</h3>
                <div className="time-range-info">
                  <span className="range-badge">
                    {timeRange.min === timeRange.max
                      ? `${timeRange.min} minute${timeRange.min !== 1 ? 's' : ''}`
                      : `${timeRange.min} - ${timeRange.max} minutes`
                    }
                  </span>
                  {timeRange.areas > 1 && (
                    <span className="areas-badge">
                      {timeRange.areas} Areas
                    </span>
                  )}
                  {isDictatedTime && (
                    <span className="dictated-badge">
                      Fixed Time
                    </span>
                  )}
                </div>
              </div>

              {/* Warning Banner */}
              {showWarning && (
                <div className="warning-banner">
                  <div className="warning-banner-content">
                    <AlertCircle className="warning-icon" />
                    <div className="warning-text">
                      <p><strong>Max time required before scoring</strong></p>
                      <p>Please set the max time for this class before starting to score entries. This ensures consistent timing for all competitors.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Message Display */}
              {validationMessage && (
                <div className="message-banner validation-message">
                  <div className="message-content">
                    <AlertCircle className="message-icon" />
                    <p>{validationMessage}</p>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="message-banner error-message">
                  <div className="message-content">
                    <AlertCircle className="message-icon" />
                    <p>{errorMessage}</p>
                  </div>
                </div>
              )}

              {successMessage && (
                <div className="message-banner success-message">
                  <div className="message-content">
                    <CheckCircle className="message-icon" />
                    <p>{successMessage}</p>
                  </div>
                </div>
              )}

              {/* Time Display */}
              {isDictatedTime ? (
                <div className="dictated-time-display">
                  <div className="dictated-time-item">
                    <div className="dictated-time-icon">
                      <Clock className="h-6 w-6" />
                    </div>
                    <div className="dictated-time-content">
                      <label>Max Time (Fixed)</label>
                      <div className="dictated-time-value">{dictatedTime}</div>
                    </div>
                  </div>
                  <div className="dictated-notice">
                    <AlertCircle className="notice-icon" />
                    <p>This class has a fixed max time set by the organization rules.</p>
                  </div>
                  {/* Master Class Warning for Fixed Time */}
                  {requirements?.has_30_second_warning === false && (
                    <div className="dictated-notice">
                      <AlertCircle className="notice-icon" />
                      <p><strong>Note:</strong> {requirements.warning_notes || 'This class does not receive a 30-second warning.'}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="time-inputs-grid">
                  {Array.from({ length: timeRange.areas }, (_, index) => (
                    <div key={index} className="time-input-group">
                      {/* Inline row: label + input */}
                      <div className="time-input-row">
                        <label className="time-input-label">
                          {getAreaLabel(index)}
                        </label>
                        <div className="time-input-wrapper">
                          <input
                            ref={index === 0 ? firstInputRef : undefined}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9:]*"
                            className={`time-input ${errors[index] ? 'error' : ''}`}
                            placeholder="MM:SS"
                            value={times[index]}
                            onChange={(e) => handleTimeChange(index, e.target.value)}
                            onKeyDown={(e) => handleTimeKeyDown(index, e)}
                            onClick={(e) => handleTimeClick(index, e)}
                            onFocus={(e) => {
                              // Select minutes section by default
                              setTimeout(() => {
                                if (e.target.value) {
                                  e.target.setSelectionRange(0, 2);
                                } else {
                                  e.target.select();
                                }
                              }, 0);
                            }}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck="false"
                          />
                          {times[index] && (
                            <button
                              type="button"
                              className="clear-time-btn"
                              onClick={() => handleTimeChange(index, '')}
                              aria-label={`Clear ${getAreaLabel(index)} time`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Preset buttons below */}
                      <div className="time-presets">
                        {generateTimePresets().map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={`time-preset-btn ${
                              times[index] === preset ? 'active' : ''
                            }`}
                            onClick={() => setPresetTime(index, preset)}
                            aria-label={`Set time to ${preset}`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      {errors[index] && (
                        <div className="input-error">
                          <AlertCircle className="error-icon" />
                          <span>{errors[index]}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Help Text */}
              {!isDictatedTime && (
                <div className="help-text">
                  <p><strong>Quick entry tips:</strong></p>
                  <p>• Type <strong>2</strong> for 2:00 minutes</p>
                  <p>• Type <strong>230</strong> for 2:30 minutes</p>
                  <p>• Type <strong>2:45</strong> for 2 minutes 45 seconds</p>
                  <p>• Use preset buttons for quick time selection</p>
                  <p>Time must be between {timeRange.min} - {timeRange.max} minutes for this class</p>
                </div>
              )}

              {/* Master Class Warning - Use database field */}
              {!isDictatedTime && requirements?.has_30_second_warning === false && (
                <div className="dictated-notice">
                  <AlertCircle className="notice-icon" />
                  <p><strong>Note:</strong> {requirements.warning_notes || 'This class does not receive a 30-second warning.'}</p>
                </div>
              )}
            </>
          ) : (
            <div className="no-data-state">
              <Clock className="no-data-icon" />
              <h3>No Time Requirements Found</h3>
              <p>Time requirements are not available for this class.</p>
            </div>
          )}

      {timeRange && (
        <div className="dialog-footer">
          <button className="cancel-button" onClick={onClose}>
            {isDictatedTime ? 'Close' : 'Cancel'}
          </button>
          {!isDictatedTime && (
            <button
              className="save-button"
              onClick={handleSave}
              disabled={!canSave()}
            >
              {saving ? (
                <>
                  <div className="button-spinner" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Times
                </>
              )}
            </button>
          )}
        </div>
      )}
    </DialogContainer>
  );
};