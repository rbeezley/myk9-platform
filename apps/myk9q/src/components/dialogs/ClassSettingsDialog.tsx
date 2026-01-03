import React, { useState, useEffect } from 'react';
import { Settings, CheckCircle, AlertCircle, Info, LayoutGrid, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { setClassVisibility } from '../../services/resultVisibilityService';
import { PRESET_CONFIGS } from '../../types/visibility';
import type { VisibilityPreset } from '../../types/visibility';
import { DialogContainer } from './DialogContainer';
import { useAuth } from '../../contexts/AuthContext';
import { parseOrganizationData } from '../../utils/organizationUtils';
import { logger } from '@/utils/logger';
import './shared-dialog.css';
import './ClassSettingsDialog.css';

interface AreaCountOptions {
  min: number;
  max: number;
  isFlexible: boolean;
  maxTotalSeconds?: number; // Total time limit from class_requirements
}

// Helper to format seconds to M:SS display
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Helper to parse M:SS or plain seconds input to total seconds
const parseTimeInput = (input: string): number | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Handle M:SS format (e.g., "2:08", "3:30")
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0]) || 0;
      const secs = parseInt(parts[1]) || 0;
      if (secs >= 0 && secs < 60) {
        return mins * 60 + secs;
      }
    }
    return null;
  }

  // Handle plain number (treat as seconds if small, or could be minutes)
  const num = parseFloat(trimmed);
  if (!isNaN(num)) {
    // If it's a decimal like 2.5, treat as minutes
    if (trimmed.includes('.')) {
      return Math.round(num * 60);
    }
    // Plain integer - if > 10, treat as seconds; otherwise as minutes
    return num > 10 ? num : num * 60;
  }

  return null;
};

interface ClassSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classData: {
    id: number;
    element: string;
    level: string;
    class_name: string;
    self_checkin_enabled?: boolean;
  };
  onSettingsUpdate?: () => void;
}

export const ClassSettingsDialog: React.FC<ClassSettingsDialogProps> = ({
  isOpen,
  onClose,
  classData,
  onSettingsUpdate
}) => {
  const { showContext } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selfCheckinEnabled, setSelfCheckinEnabled] = useState(false);
  const [resultsVisibility, setResultsVisibility] = useState<VisibilityPreset>('standard');
  const [plannedStartTime, setPlannedStartTime] = useState('');
  const [areaCount, setAreaCount] = useState<number>(1);
  const [areaCountOptions, setAreaCountOptions] = useState<AreaCountOptions | null>(null);
  const [area1Seconds, setArea1Seconds] = useState<number>(0);
  const [area2Seconds, setArea2Seconds] = useState<number>(0);
  const [editingArea, setEditingArea] = useState<1 | 2 | null>(null);
  const [editValue, setEditValue] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-balance time allocation: when one area changes, the other gets the remaining time
  const updateArea1Time = (newSeconds: number) => {
    const maxTotal = areaCountOptions?.maxTotalSeconds || 0;
    const clampedSeconds = Math.max(30, Math.min(newSeconds, maxTotal - 30));
    setArea1Seconds(clampedSeconds);
    setArea2Seconds(maxTotal - clampedSeconds);
  };

  const updateArea2Time = (newSeconds: number) => {
    const maxTotal = areaCountOptions?.maxTotalSeconds || 0;
    const clampedSeconds = Math.max(30, Math.min(newSeconds, maxTotal - 30));
    setArea2Seconds(clampedSeconds);
    setArea1Seconds(maxTotal - clampedSeconds);
  };

  // Load current settings when dialog opens
  useEffect(() => {
    if (isOpen && classData) {
      setSuccessMessage('');
      setErrorMessage('');
      loadSettings();
    }
  }, [isOpen, classData]);

  const loadSettings = async () => {
    try {
      setLoading(true);

      // Load self check-in setting, planned start time, area count, and time limits
      const { data, error } = await supabase
        .from('classes')
        .select('self_checkin_enabled, planned_start_time, area_count, time_limit_seconds, time_limit_area2_seconds')
        .eq('id', classData.id)
        .single();

      if (error) {
        logger.error('Error loading class settings:', error);
        setErrorMessage('Failed to load class settings');
        return;
      }

      if (data) {
        setSelfCheckinEnabled(data.self_checkin_enabled ?? true);
        setAreaCount(data.area_count ?? 1);
        setArea1Seconds(data.time_limit_seconds ?? 0);
        setArea2Seconds(data.time_limit_area2_seconds ?? 0);

        // Extract just the time portion from ISO timestamp (HH:MM format)
        if (data.planned_start_time) {
          const date = new Date(data.planned_start_time);
          const hours = date.getHours().toString().padStart(2, '0');
          const minutes = date.getMinutes().toString().padStart(2, '0');
          setPlannedStartTime(`${hours}:${minutes}`);
        } else {
          setPlannedStartTime('');
        }
      }

      // Load area count options and max time from class_requirements
      const orgData = parseOrganizationData(showContext?.org || '');
      const { data: requirementsData } = await supabase
        .from('class_requirements')
        .select('area_count, area_count_min, area_count_max, time_limit_seconds')
        .eq('organization', orgData.organization)
        .eq('element', classData.element)
        .eq('level', classData.level)
        .maybeSingle();

      if (requirementsData) {
        const min = requirementsData.area_count_min ?? requirementsData.area_count ?? 1;
        const max = requirementsData.area_count_max ?? requirementsData.area_count ?? 1;
        setAreaCountOptions({
          min,
          max,
          isFlexible: min !== max,
          maxTotalSeconds: requirementsData.time_limit_seconds ?? undefined
        });
        // If class doesn't have area_count set, use the default from requirements
        if (!data?.area_count && requirementsData.area_count) {
          setAreaCount(requirementsData.area_count);
        }
        // If class doesn't have time limits set, split the max evenly for 2 areas
        if (min !== max && requirementsData.time_limit_seconds) {
          if (!data?.time_limit_seconds && !data?.time_limit_area2_seconds) {
            // Default: split time evenly between areas
            const halfTime = Math.floor(requirementsData.time_limit_seconds / 2);
            setArea1Seconds(halfTime);
            setArea2Seconds(halfTime);
          }
        }
      }

      // Load results visibility setting
      // Note: We need to pass trial_id and license_key but we don't have them in this dialog
      // For now, just fetch from the class visibility override table directly
      // Note: Must select class_id with preset_name to avoid PostgREST 406 error
      // when selecting only enum columns
      const { data: visibilityData } = await supabase
        .from('class_result_visibility_overrides')
        .select('class_id, preset_name')
        .eq('class_id', classData.id)
        .maybeSingle();

      if (visibilityData?.preset_name) {
        setResultsVisibility(visibilityData.preset_name);
      }
    } catch (error) {
      logger.error('Exception loading class settings:', error);
      setErrorMessage('Failed to load class settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      setSuccessMessage('');
      setErrorMessage('');

      // Update self check-in setting and planned start time
      let plannedTimestamp: string | null = null;
      if (plannedStartTime) {
        // Convert time (HH:MM) to ISO timestamp using today's date
        const [hours, minutes] = plannedStartTime.split(':');
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        plannedTimestamp = date.toISOString();
      }

      const updateData: {
        self_checkin_enabled: boolean;
        planned_start_time: string | null;
        area_count?: number;
        area_count_confirmed?: boolean;
        time_limit_seconds?: number;
        time_limit_area2_seconds?: number | null;
      } = {
        self_checkin_enabled: selfCheckinEnabled,
        planned_start_time: plannedTimestamp
      };

      // Include area_count and time limits if there's flexibility
      if (areaCountOptions?.isFlexible && areaCount) {
        updateData.area_count = areaCount;
        updateData.area_count_confirmed = true; // Mark that judge has explicitly chosen

        if (areaCount >= 2 && areaCountOptions.maxTotalSeconds) {
          // Validate total doesn't exceed max
          const total = area1Seconds + area2Seconds;
          if (total > areaCountOptions.maxTotalSeconds) {
            setErrorMessage(`Total time (${formatTime(total)}) exceeds maximum allowed (${formatTime(areaCountOptions.maxTotalSeconds)})`);
            return;
          }
          if (area1Seconds <= 0 || area2Seconds <= 0) {
            setErrorMessage('Both areas must have time allocated');
            return;
          }
          updateData.time_limit_seconds = area1Seconds;
          updateData.time_limit_area2_seconds = area2Seconds;
        } else if (areaCount === 1) {
          // Single area: use total time, clear area 2
          updateData.time_limit_seconds = areaCountOptions.maxTotalSeconds;
          updateData.time_limit_area2_seconds = null;
        }
      }

      const { error: checkinError } = await supabase
        .from('classes')
        .update(updateData)
        .eq('id', classData.id);

      if (checkinError) {
        logger.error('Error saving check-in settings:', checkinError);
        setErrorMessage('Failed to save settings. Please try again.');
        return;
      }

      // Update results visibility setting
      try {
        await setClassVisibility(classData.id, resultsVisibility, 'ClassSettingsDialog');
      } catch (visibilityError) {
        logger.error('Error saving visibility settings:', visibilityError);
        setErrorMessage('Failed to save results visibility. Please try again.');
        return;
      }

      setSuccessMessage('Settings saved successfully!');

      // Close dialog after brief delay to show success message,
      // then refresh parent data AFTER dialog is closed to avoid visual glitches
      setTimeout(() => {
        onClose();
        // Small delay before refresh to ensure dialog is fully unmounted
        if (onSettingsUpdate) {
          setTimeout(onSettingsUpdate, 100);
        }
      }, 1500);
    } catch (error) {
      logger.error('Exception saving class settings:', error);
      setErrorMessage('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContainer
      isOpen={isOpen}
      onClose={onClose}
      title="Class Settings"
      icon={<Settings className="title-icon" />}
    >
      {loading ? (
        <div className="settings-loading">
          <p>Loading settings...</p>
        </div>
      ) : (
        <div className="settings-form">
          {/* Class Info Header */}
          <div className="class-info-header">
            <h3 className="class-title">{classData.class_name}</h3>
          </div>

          {/* Planned Start Time - Compact */}
          <div className="settings-section settings-section--compact">
            <label className="settings-label" htmlFor="planned-start-time">
              Planned Start Time <span className="settings-optional">(optional)</span>
            </label>
            <input
              id="planned-start-time"
              type="time"
              className="settings-time-input"
              value={plannedStartTime}
              onChange={(e) => setPlannedStartTime(e.target.value)}
            />
          </div>

          {/* Area Count Selection - Only show when judge can choose */}
          {areaCountOptions?.isFlexible && (
            <div className="settings-section">
              <div className="settings-item">
                <div className="settings-item-header">
                  <label className="settings-label">
                    <LayoutGrid size={16} className="settings-label-icon" />
                    Number of Areas
                  </label>
                  <p className="settings-description">
                    Choose between {areaCountOptions.min} or {areaCountOptions.max} search areas for this class
                  </p>
                </div>
                <div className="settings-area-count-options">
                  {Array.from(
                    { length: areaCountOptions.max - areaCountOptions.min + 1 },
                    (_, i) => areaCountOptions.min + i
                  ).map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={`settings-area-count-btn ${
                        areaCount === count ? 'settings-area-count-btn--active' : ''
                      }`}
                      onClick={() => setAreaCount(count)}
                    >
                      {count} Area{count > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Time Allocation - Only show when 2 areas selected */}
          {areaCountOptions?.isFlexible && areaCount >= 2 && areaCountOptions.maxTotalSeconds && (
            <div className="settings-section">
              <div className="settings-time-allocation">
                <div className="settings-time-allocation-header">
                  <label className="settings-label">
                    <Clock size={16} className="settings-label-icon" />
                    Time Allocation
                  </label>
                  <p className="settings-description">
                    Allocate {formatTime(areaCountOptions.maxTotalSeconds)} total between areas (max combined)
                  </p>
                </div>

                <div className="settings-time-allocation-inputs">
                  <div className="settings-time-input-group">
                    <label className="settings-time-input-label">Area 1</label>
                    <div className="settings-time-stepper">
                      <button
                        type="button"
                        className="settings-time-stepper-btn"
                        onClick={() => updateArea1Time(area1Seconds - 30)}
                        disabled={editingArea !== null || area1Seconds <= 30}
                      >
                        −
                      </button>
                      {editingArea === 1 ? (
                        <input
                          type="text"
                          className="settings-time-edit-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => {
                            const seconds = parseTimeInput(editValue);
                            if (seconds !== null && seconds >= 30) {
                              updateArea1Time(seconds);
                            }
                            setEditingArea(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const seconds = parseTimeInput(editValue);
                              if (seconds !== null && seconds >= 30) {
                                updateArea1Time(seconds);
                              }
                              setEditingArea(null);
                            } else if (e.key === 'Escape') {
                              setEditingArea(null);
                            }
                          }}
                          autoFocus
                          placeholder="M:SS"
                        />
                      ) : (
                        <button
                          type="button"
                          className="settings-time-value settings-time-value--editable"
                          onClick={() => {
                            setEditingArea(1);
                            setEditValue(formatTime(area1Seconds));
                          }}
                          title="Tap to edit"
                        >
                          {formatTime(area1Seconds)}
                        </button>
                      )}
                      <button
                        type="button"
                        className="settings-time-stepper-btn"
                        onClick={() => updateArea1Time(area1Seconds + 30)}
                        disabled={editingArea !== null || area2Seconds <= 30}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="settings-time-input-group">
                    <label className="settings-time-input-label">Area 2</label>
                    <div className="settings-time-stepper">
                      <button
                        type="button"
                        className="settings-time-stepper-btn"
                        onClick={() => updateArea2Time(area2Seconds - 30)}
                        disabled={editingArea !== null || area2Seconds <= 30}
                      >
                        −
                      </button>
                      {editingArea === 2 ? (
                        <input
                          type="text"
                          className="settings-time-edit-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => {
                            const seconds = parseTimeInput(editValue);
                            if (seconds !== null && seconds >= 30) {
                              updateArea2Time(seconds);
                            }
                            setEditingArea(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const seconds = parseTimeInput(editValue);
                              if (seconds !== null && seconds >= 30) {
                                updateArea2Time(seconds);
                              }
                              setEditingArea(null);
                            } else if (e.key === 'Escape') {
                              setEditingArea(null);
                            }
                          }}
                          autoFocus
                          placeholder="M:SS"
                        />
                      ) : (
                        <button
                          type="button"
                          className="settings-time-value settings-time-value--editable"
                          onClick={() => {
                            setEditingArea(2);
                            setEditValue(formatTime(area2Seconds));
                          }}
                          title="Tap to edit"
                        >
                          {formatTime(area2Seconds)}
                        </button>
                      )}
                      <button
                        type="button"
                        className="settings-time-stepper-btn"
                        onClick={() => updateArea2Time(area2Seconds + 30)}
                        disabled={editingArea !== null || area1Seconds <= 30}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Total time display */}
                <div className={`settings-time-total ${
                  area1Seconds + area2Seconds > areaCountOptions.maxTotalSeconds ? 'settings-time-total--error' : ''
                }`}>
                  <span>Total:</span>
                  <span className="settings-time-total-value">
                    {formatTime(area1Seconds + area2Seconds)} / {formatTime(areaCountOptions.maxTotalSeconds)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Check-in Mode Toggle */}
          <div className="settings-section">
            <div className="settings-item">
              <div className="settings-item-header">
                <label className="settings-label">Check-in Mode</label>
                <p className="settings-description">
                  How exhibitors check in for this class
                </p>
              </div>
              <div className="settings-toggle-container">
                <button
                  className={`settings-toggle ${
                    selfCheckinEnabled ? 'settings-toggle--on' : ''
                  }`}
                  onClick={() => setSelfCheckinEnabled(!selfCheckinEnabled)}
                  aria-label="Toggle check-in mode"
                >
                  <span className="settings-toggle-thumb" />
                </button>
                <span className="settings-toggle-label">
                  {selfCheckinEnabled ? 'App (Self)' : 'At Table'}
                </span>
              </div>
            </div>
          </div>

          {/* Results Visibility Section */}
          <div className="settings-section">
            <div className="settings-visibility-header">
              <label className="settings-label">Results Visibility</label>
              <p className="settings-description">
                Control when and what results are shown to exhibitors
              </p>
            </div>

            <div className="settings-visibility-options">
              {(['open', 'standard', 'review'] as const).map((preset) => {
                const config = PRESET_CONFIGS[preset];
                return (
                  <label key={preset} className="settings-visibility-option">
                    <input
                      type="radio"
                      name="results-visibility"
                      value={preset}
                      checked={resultsVisibility === preset}
                      onChange={() => setResultsVisibility(preset)}
                      className="settings-radio-input"
                    />
                    <div className="settings-visibility-content">
                      <div className="settings-visibility-title">
                        <span className="settings-visibility-icon">{config.icon}</span>
                        <span>{config.title}</span>
                      </div>
                      <p className="settings-visibility-description">
                        {config.description}
                      </p>
                      <p className="settings-visibility-details">
                        {config.details}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Inheritance help tip */}
            <div className="settings-info-box">
              <Info size={18} className="settings-info-icon" />
              <p className="settings-info-text">
                This overrides the show/trial default. To set defaults for all classes,
                go to <strong>Secretary Tools → Results/Check-In Settings</strong>.
              </p>
            </div>
          </div>

          {/* Messages */}
          {successMessage && (
            <div className="settings-message settings-message--success">
              <CheckCircle size={18} />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="settings-message settings-message--error">
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="dialog-footer">
        <button
          className="dialog-button dialog-button-secondary"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          className="dialog-button dialog-button-primary"
          onClick={handleSaveSettings}
          disabled={saving || loading}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </DialogContainer>
  );
};
