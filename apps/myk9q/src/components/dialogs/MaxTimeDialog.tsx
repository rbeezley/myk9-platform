import React, { useState, useEffect } from 'react';
import { Clock, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { DialogContainer } from './DialogContainer';
import { logger } from '@/utils/logger';
import { MaxTimeDictatedDisplay } from './MaxTimeDictatedDisplay';
import { MaxTimeInputsGrid } from './MaxTimeInputsGrid';
import { useMaxTimeSave } from './useMaxTimeSave';
import { parseTimeRange, secondsToTimeString, canSave } from './MaxTimeDialog.utils';
import type { MaxTimeDialogProps, TimeRange, ClassRequirements } from './MaxTimeDialog.types';
import './shared-dialog.css';
import './MaxTimeDialog.css';

export type { MaxTimeDialogProps };

export const MaxTimeDialog: React.FC<MaxTimeDialogProps> = ({
  isOpen,
  onClose,
  showWarning = false,
  classData,
  onTimeUpdate
}) => {
  const { showContext } = useAuth();
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [requirements, setRequirements] = useState<ClassRequirements | null>(null);
  const [times, setTimes] = useState<string[]>(['', '', '']);
  const [errors, setErrors] = useState<string[]>(['', '', '']);
  const [isDictatedTime, setIsDictatedTime] = useState(false);
  const [dictatedTime, setDictatedTime] = useState<string>('');

  const {
    saving,
    validationMessage,
    successMessage,
    errorMessage,
    clearMessages,
    setValidationMessage,
    setErrorMessage,
    handleSave,
  } = useMaxTimeSave({
    classData,
    timeRange,
    times,
    onTimeUpdate,
    onClose,
  });

  useEffect(() => {
    if (isOpen && classData) {
      clearMessages();
      loadTimeRange();
      initializeTimes();
    }
  }, [isOpen, classData]);

  const loadTimeRange = async () => {
    if (!showContext?.licenseKey) return;

    setLoading(true);
    try {
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
        setRequirements({
          has_30_second_warning: requirementsData.has_30_second_warning,
          time_type: requirementsData.time_type,
          warning_notes: requirementsData.warning_notes
        });

        const timeText = requirementsData.time_limit_text || '';
        const range = parseTimeRange(timeText);
        const areas = requirementsData.area_count || 1;

        const isFixedTime = classData.element === 'Container' || classData.element === 'Buried';

        if (isFixedTime && range.min === range.max) {
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

  const initializeTimes = () => {
    const currentTimes = [
      secondsToTimeString(classData.time_limit_seconds),
      secondsToTimeString(classData.time_limit_area2_seconds),
      secondsToTimeString(classData.time_limit_area3_seconds)
    ];

    setTimes(currentTimes);
    setErrors(['', '', '']);
  };

  const handleTimeChange = (areaIndex: number, value: string) => {
    const newTimes = [...times];
    newTimes[areaIndex] = value;
    setTimes(newTimes);
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
                <MaxTimeDictatedDisplay
                  dictatedTime={dictatedTime}
                  requirements={requirements}
                />
              ) : (
                <MaxTimeInputsGrid
                  timeRange={timeRange}
                  times={times}
                  errors={errors}
                  isOpen={isOpen}
                  loading={loading}
                  isDictatedTime={isDictatedTime}
                  validationMessage={validationMessage}
                  errorMessage={errorMessage}
                  onTimeChange={handleTimeChange}
                  onErrorsChange={setErrors}
                  onClearMessages={() => {
                    setValidationMessage('');
                    setErrorMessage('');
                  }}
                />
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

              {/* Master Class Warning */}
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
              disabled={!canSave(timeRange, saving, times, errors, showWarning)}
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
