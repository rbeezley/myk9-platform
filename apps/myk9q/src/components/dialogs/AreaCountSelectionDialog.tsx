/**
 * AreaCountSelectionDialog
 *
 * Forces judge/admin to select area count (1 or 2) for ASCA Interior
 * Advanced/Excellent classes before proceeding to entry list.
 *
 * This dialog is shown when:
 * - Class has flexible area count (area_count_min != area_count_max in class_requirements)
 * - Class doesn't have area_count set yet
 * - User has admin or judge role
 */

import React, { useState, useEffect } from 'react';
import { LayoutGrid, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DialogContainer } from './DialogContainer';
import { logger } from '@/utils/logger';
import './shared-dialog.css';
import './ClassSettingsDialog.css';

// Helper to format seconds to M:SS display
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export interface AreaCountRequirements {
  min: number;
  max: number;
  maxTotalSeconds: number;
}

interface AreaCountSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classData: {
    id: number;
    element: string;
    level: string;
    class_name: string;
  };
  areaCountRequirements: AreaCountRequirements;
  onSave: () => void;
}

export const AreaCountSelectionDialog: React.FC<AreaCountSelectionDialogProps> = ({
  isOpen,
  onClose,
  classData,
  areaCountRequirements,
  onSave
}) => {
  const [saving, setSaving] = useState(false);
  const [areaCount, setAreaCount] = useState<number>(1);
  const [area1Seconds, setArea1Seconds] = useState<number>(0);
  const [area2Seconds, setArea2Seconds] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState('');

  // Initialize time allocation when dialog opens or area count changes
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      // Default to 1 area
      setAreaCount(1);
      // Split time evenly for 2-area default
      const halfTime = Math.floor(areaCountRequirements.maxTotalSeconds / 2);
      setArea1Seconds(halfTime);
      setArea2Seconds(halfTime);
    }
  }, [isOpen, areaCountRequirements.maxTotalSeconds]);

  // Auto-balance time allocation
  const updateArea1Time = (newSeconds: number) => {
    const maxTotal = areaCountRequirements.maxTotalSeconds;
    const clampedSeconds = Math.max(30, Math.min(newSeconds, maxTotal - 30));
    setArea1Seconds(clampedSeconds);
    setArea2Seconds(maxTotal - clampedSeconds);
  };

  const updateArea2Time = (newSeconds: number) => {
    const maxTotal = areaCountRequirements.maxTotalSeconds;
    const clampedSeconds = Math.max(30, Math.min(newSeconds, maxTotal - 30));
    setArea2Seconds(clampedSeconds);
    setArea1Seconds(maxTotal - clampedSeconds);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setErrorMessage('');

      const updateData: {
        area_count: number;
        area_count_confirmed: boolean;
        time_limit_seconds: number;
        time_limit_area2_seconds: number | null;
      } = {
        area_count: areaCount,
        area_count_confirmed: true, // Mark that judge has explicitly chosen
        time_limit_seconds: areaCount === 1 ? areaCountRequirements.maxTotalSeconds : area1Seconds,
        time_limit_area2_seconds: areaCount >= 2 ? area2Seconds : null
      };

      // Validate for 2 areas
      if (areaCount >= 2) {
        const total = area1Seconds + area2Seconds;
        if (total > areaCountRequirements.maxTotalSeconds) {
          setErrorMessage(`Total time (${formatTime(total)}) exceeds maximum allowed (${formatTime(areaCountRequirements.maxTotalSeconds)})`);
          return;
        }
        if (area1Seconds <= 0 || area2Seconds <= 0) {
          setErrorMessage('Both areas must have time allocated');
          return;
        }
      }

      const { error } = await supabase
        .from('classes')
        .update(updateData)
        .eq('id', classData.id);

      if (error) {
        logger.error('Error saving area count:', error);
        setErrorMessage('Failed to save. Please try again.');
        return;
      }

      logger.info(`✅ Area count set to ${areaCount} for class ${classData.id}`);
      onSave();
    } catch (error) {
      logger.error('Exception saving area count:', error);
      setErrorMessage('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContainer
      isOpen={isOpen}
      onClose={onClose}
      title="Select Number of Areas"
      icon={<LayoutGrid className="title-icon" />}
    >
      <div className="settings-form">
        {/* Class Info Header */}
        <div className="class-info-header">
          <h3 className="class-title">{classData.class_name}</h3>
        </div>

        {/* Explanation */}
        <div className="settings-info-box" style={{ marginBottom: '16px' }}>
          <AlertCircle size={18} className="settings-info-icon" style={{ color: 'var(--color-warning)' }} />
          <p className="settings-info-text">
            This class allows either <strong>{areaCountRequirements.min} or {areaCountRequirements.max} search areas</strong>.
            Please select the number of areas before scoring begins.
          </p>
        </div>

        {/* Area Count Selection */}
        <div className="settings-section">
          <div className="settings-item">
            <div className="settings-item-header">
              <label className="settings-label">
                <LayoutGrid size={16} className="settings-label-icon" />
                Number of Areas
              </label>
            </div>
            <div className="settings-area-count-options">
              {Array.from(
                { length: areaCountRequirements.max - areaCountRequirements.min + 1 },
                (_, i) => areaCountRequirements.min + i
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

        {/* Time Allocation - Only show when 2 areas selected */}
        {areaCount >= 2 && (
          <div className="settings-section">
            <div className="settings-time-allocation">
              <div className="settings-time-allocation-header">
                <label className="settings-label">
                  <Clock size={16} className="settings-label-icon" />
                  Time Allocation
                </label>
                <p className="settings-description">
                  Allocate {formatTime(areaCountRequirements.maxTotalSeconds)} total between areas
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
                      disabled={area1Seconds <= 30}
                    >
                      −
                    </button>
                    <span className="settings-time-value">
                      {formatTime(area1Seconds)}
                    </span>
                    <button
                      type="button"
                      className="settings-time-stepper-btn"
                      onClick={() => updateArea1Time(area1Seconds + 30)}
                      disabled={area2Seconds <= 30}
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
                      disabled={area2Seconds <= 30}
                    >
                      −
                    </button>
                    <span className="settings-time-value">
                      {formatTime(area2Seconds)}
                    </span>
                    <button
                      type="button"
                      className="settings-time-stepper-btn"
                      onClick={() => updateArea2Time(area2Seconds + 30)}
                      disabled={area1Seconds <= 30}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Total time display */}
              <div className={`settings-time-total ${
                area1Seconds + area2Seconds > areaCountRequirements.maxTotalSeconds ? 'settings-time-total--error' : ''
              }`}>
                <span>Total:</span>
                <span className="settings-time-total-value">
                  {formatTime(area1Seconds + area2Seconds)} / {formatTime(areaCountRequirements.maxTotalSeconds)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Single area info */}
        {areaCount === 1 && (
          <div className="settings-section">
            <div className="settings-info-box">
              <CheckCircle size={18} className="settings-info-icon" style={{ color: 'var(--color-success)' }} />
              <p className="settings-info-text">
                Single area search with <strong>{formatTime(areaCountRequirements.maxTotalSeconds)}</strong> max time.
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="settings-message settings-message--error">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="dialog-footer">
        <button
          className="dialog-button dialog-button-secondary"
          onClick={onClose}
          disabled={saving}
        >
          Go Back
        </button>
        <button
          className="dialog-button dialog-button-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </DialogContainer>
  );
};
