import React, { useState, useEffect } from 'react';
import { Clock, Users, MapPin, AlertTriangle, Target, Ruler, Package, Speech } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { DialogContainer } from './DialogContainer';
import { logger } from '@/utils/logger';
import './shared-dialog.css';
import './ClassRequirementsDialog.css';
// Updated to show fixed vs range and Master warning

interface ClassRequirementsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSetMaxTime?: () => void;
  classData: {
    id: number;
    element: string;
    level: string;
    class_name: string;
    time_limit?: string;
    time_limit2?: string;
    time_limit3?: string;
    entry_count: number;
  };
}

interface ClassRequirements {
  id: number;
  organization: string;
  element: string;
  level: string;
  hides: string;
  distractions: string;
  height: string;
  area_count: number;
  time_limit_text: string;
  area_size: string;

  // Configurable rule fields (database-driven)
  has_30_second_warning?: boolean;  // Default: true - Whether 30-second warning is given
  time_type?: 'fixed' | 'range' | 'dictated';  // Default: 'range' - Type of max time
  warning_notes?: string;  // Custom warning message to display
  updated_at?: string;  // Last update timestamp

  // Organization-specific fields
  required_calls?: string;    // AKC
  final_response?: string;    // UKC
  containers_items?: string;  // Unified: AKC containers / UKC items
}

export const ClassRequirementsDialog: React.FC<ClassRequirementsDialogProps> = ({
  isOpen,
  onClose,
  onSetMaxTime,
  classData
}) => {
  const { showContext } = useAuth();
  const [requirements, setRequirements] = useState<ClassRequirements | null>(null);
  const [loading, setLoading] = useState(false);
  const [organization, setOrganization] = useState<'AKC' | 'UKC' | 'ASCA' | null>(null);

  useEffect(() => {
    if (isOpen && classData) {
      loadRequirements();
    }
  }, [isOpen, classData]);

  const loadRequirements = async () => {
    if (!showContext?.licenseKey) return;

    setLoading(true);
    try {
      // First, get the organization from the show data
      const { data: showData, error: showError } = await supabase
        .from('shows')
        .select('organization')
        .eq('license_key', showContext.licenseKey)
        .single();

      if (showError || !showData) {
        logger.error('❌ Error fetching show data:', showError);
        return;
      }

      const org = showData.organization;
      const isAKC = org.includes('AKC');
      const isUKC = org.includes('UKC');
      const isASCA = org.includes('ASCA');
      setOrganization(isAKC ? 'AKC' : isUKC ? 'UKC' : isASCA ? 'ASCA' : null);

      // Query the unified requirements table
      const orgType = isAKC ? 'AKC' : isUKC ? 'UKC' : isASCA ? 'ASCA' : null;
      let requirementsData = null;

      if (orgType) {
const { data, error } = await supabase
          .from('class_requirements')
          .select('*')
          .eq('organization', orgType)
          .eq('element', classData.element)
          .eq('level', classData.level)
          .single();

if (!error && data) {
          requirementsData = data;
        }
      }

setRequirements(requirementsData);
    } catch (error) {
      logger.error('💥 Error loading requirements:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMaxTimeDisplay = () => {
    // Check if any judge-set max times exist
    const area1Time = classData.time_limit;
    const area2Time = classData.time_limit2;
    const area3Time = classData.time_limit3;

    const setTimes = [area1Time, area2Time, area3Time].filter(time => {
      if (!time || typeof time !== 'string') return false;
      const trimmed = time.trim();
      return trimmed !== '' &&
             trimmed !== '00:00' &&
             trimmed !== '00:00:00' &&
             trimmed !== ':' &&
             !trimmed.startsWith("'00:00'");
    });

    if (setTimes.length > 0) {
      // Show judge-set times
      if (setTimes.length === 1) {
        return `${setTimes[0]} (set by judge)`;
      } else {
        return `${setTimes.join(', ')} (set by judge)`;
      }
    }

    // Fall back to requirements text
    if (requirements && requirements.time_limit_text) {
      // Determine if this is actually a range by checking if the text contains a range indicator
      // A range looks like "2:30 - 3:00" or "2 to 3 minutes"
      const textLower = requirements.time_limit_text.toLowerCase();
      const isActualRange = requirements.time_limit_text.includes(' - ') ||
                           textLower.includes(' to ') ||
                           /\d+\s*-\s*\d+/.test(requirements.time_limit_text);

      // Only show "range allowed" if the time text actually represents a range
      // A single value like "2 minutes" should be shown as fixed, not range
      const timeType = isActualRange ? 'range' :
                      requirements.time_type === 'dictated' ? 'dictated' : 'fixed';

      const suffix = timeType === 'fixed' ? '' :  // No suffix for fixed times - cleaner UI
                    timeType === 'dictated' ? '(dictated by organization)' :
                    '(range allowed)';

      // Use database field for warning (with fallback to level check for backward compatibility)
      const showWarning = requirements.has_30_second_warning === false ||
                         (requirements.has_30_second_warning === undefined &&
                          classData.level.toLowerCase().includes('master'));

      const warningText = showWarning
        ? (requirements.warning_notes ? ` - ${requirements.warning_notes}` : ' - No 30-second warning')
        : '';

      return `${requirements.time_limit_text}${suffix ? ` ${suffix}` : ''}${warningText}`;
    }

    return 'Not specified';
  };

  return (
    <DialogContainer
      isOpen={isOpen}
      onClose={onClose}
      title="Class Requirements"
      icon={<Package className="title-icon" />}
    >
      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>Loading requirements...</p>
        </div>
      ) : requirements ? (
        <>
          {/* Class Info Header */}
          <div className="class-info-header">
            <h3 className="class-title">{classData.element} {classData.level}</h3>
            <div className="class-meta">
              <span className="org-badge">{organization}</span>
              <span className="entry-count">
                <Users className="h-4 w-4" />
                {classData.entry_count} {classData.entry_count === 1 ? 'Dog' : 'Dogs'}
              </span>
            </div>
          </div>

          {/* Requirements Grid */}
          <div className="requirements-grid">
            {/* Max Time */}
            <div
              className={`requirement-item ${onSetMaxTime ? 'requirement-item-clickable' : ''}`}
              onClick={onSetMaxTime}
              role={onSetMaxTime ? "button" : undefined}
              tabIndex={onSetMaxTime ? 0 : undefined}
            >
              <div className="requirement-icon" style={{ background: 'var(--status-in-progress)' }}>
                <Clock size={20} />
              </div>
              <div className="requirement-content">
                <label>Max Time</label>
                <div className="requirement-value">{getMaxTimeDisplay()}</div>
              </div>
            </div>

            {/* Hides */}
            <div className="requirement-item">
              <div className="requirement-icon" style={{ background: 'var(--status-start-time)' }}>
                <Target size={20} />
              </div>
              <div className="requirement-content">
                <label>Hides</label>
                <div className="requirement-value">{requirements.hides}</div>
              </div>
            </div>

            {/* Distractions */}
            <div className="requirement-item">
              <div className="requirement-icon" style={{ background: 'var(--token-warning)' }}>
                <AlertTriangle size={20} />
              </div>
              <div className="requirement-content">
                <label>Distractions</label>
                <div className="requirement-value">{requirements.distractions}</div>
              </div>
            </div>

            {/* Required Calls (AKC) or Final Response (UKC) */}
            <div className="requirement-item">
              <div className="requirement-icon" style={{ background: 'var(--checkin-at-gate)' }}>
                <Speech size={20} />
              </div>
              <div className="requirement-content">
                <label>
                  {requirements.organization === 'UKC' ? 'Final Response' : 'Required Calls'}
                </label>
                <div className="requirement-value">
                  {requirements.organization === 'UKC'
                    ? requirements.final_response || '-'
                    : requirements.required_calls || '-'}
                </div>
              </div>
            </div>

            {/* Height */}
            {requirements.height && requirements.height !== '-' && (
              <div className="requirement-item">
                <div className="requirement-icon" style={{ background: 'var(--status-break)' }}>
                  <Ruler size={20} />
                </div>
                <div className="requirement-content">
                  <label>Max Height</label>
                  <div className="requirement-value">{requirements.height}</div>
                </div>
              </div>
            )}

            {/* Arrangement - Only for Container, Buried, and Handler Discrimination Novice */}
            {(classData.element === 'Container' ||
              classData.element === 'Buried' ||
              (classData.element === 'Handler Discrimination' && classData.level === 'Novice A')) && (
              <div className="requirement-item">
                <div className="requirement-icon" style={{ background: 'var(--primary)' }}>
                  <Package size={20} />
                </div>
                <div className="requirement-content">
                  <label>Arrangement</label>
                  <div className="requirement-value">
                    {requirements.containers_items || '-'}
                  </div>
                </div>
              </div>
            )}

            {/* Area Size */}
            {requirements.area_size && requirements.area_size !== '-' && (
              <div className="requirement-item">
                <div className="requirement-icon" style={{ background: 'var(--token-success)' }}>
                  <MapPin size={20} />
                </div>
                <div className="requirement-content">
                  <label>Area Size</label>
                  <div className="requirement-value">{requirements.area_size}</div>
                </div>
              </div>
            )}

            {/* Area Count */}
            {requirements.area_count > 1 && (
              <div className="requirement-item">
                <div className="requirement-icon" style={{ background: 'var(--token-success)' }}>
                  <MapPin size={20} />
                </div>
                <div className="requirement-content">
                  <label>Areas</label>
                  <div className="requirement-value">{requirements.area_count}</div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="no-data-state">
          <Package className="no-data-icon" />
          <h3>No Requirements Found</h3>
          <p>Requirements data is not available for this class combination.</p>
        </div>
      )}
    </DialogContainer>
  );
};