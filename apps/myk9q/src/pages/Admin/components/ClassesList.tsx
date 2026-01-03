/**
 * ClassesList Component
 *
 * Displays the list of classes with selection and bulk operations.
 * Shows class cards with visibility and check-in status badges.
 *
 * Extracted from CompetitionAdmin.tsx
 */

import React from 'react';
import { Eye, UserCheck, UserX } from 'lucide-react';
import { PRESET_CONFIGS } from '../../../types/visibility';
import type { VisibilityPreset } from '../../../types/visibility';
import type { ClassInfo } from '../hooks/useCompetitionAdminData';
import { formatTrialDate } from '../../../utils/dateUtils';

export interface ClassesListProps {
  /** List of classes to display */
  classes: ClassInfo[];
  /** Set of selected class IDs */
  selectedClasses: Set<number>;
  /** Toggle selection for a class */
  onToggleClassSelection: (classId: number) => void;
  /** Select all classes */
  onSelectAllClasses: () => void;
  /** Clear all selections */
  onClearSelection: () => void;
  /** Handler for bulk visibility change */
  onBulkSetVisibility: (preset: VisibilityPreset) => void;
  /** Handler for bulk self check-in enable */
  onBulkEnableCheckin: () => void;
  /** Handler for bulk self check-in disable */
  onBulkDisableCheckin: () => void;
}

/**
 * ClassesList Component
 *
 * Displays:
 * - Header with class count and selection controls
 * - Bulk operations toolbar (when classes selected)
 * - Grid of class cards with visibility/check-in badges
 */
export function ClassesList({
  classes,
  selectedClasses,
  onToggleClassSelection,
  onSelectAllClasses,
  onClearSelection,
  onBulkSetVisibility,
  onBulkEnableCheckin,
  onBulkDisableCheckin
}: ClassesListProps): React.ReactElement {
  return (
    <div className="classes-list">
      <div className="classes-header">
        <h2>Classes ({classes.length})</h2>
        <div className="selection-actions">
          {selectedClasses.size > 0 ? (
            <>
              <span className="selection-count-badge">
                {selectedClasses.size} selected
              </span>
              <button onClick={onClearSelection} className="clear-selection-btn">
                Clear
              </button>
            </>
          ) : (
            <button onClick={onSelectAllClasses} className="select-all-btn">
              Select All
            </button>
          )}
        </div>
      </div>

      {/* Bulk Operations - appears when classes are selected */}
      {selectedClasses.size > 0 && (
        <div className="bulk-operations-container">
          {/* Result Visibility Card */}
          <div className="bulk-operations-card">
            <div className="toolbar-section">
              <h4>Result Visibility</h4>
              <div className="toolbar-buttons">
                {(Object.keys(PRESET_CONFIGS) as VisibilityPreset[]).map((preset) => {
                  const config = PRESET_CONFIGS[preset];
                  return (
                    <button
                      key={preset}
                      className="toolbar-btn visibility-btn"
                      onClick={() => onBulkSetVisibility(preset)}
                      title={config.description}
                    >
                      <span className="btn-icon">{config.icon}</span>
                      <span className="btn-text">{config.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Self Check-In Card */}
          <div className="bulk-operations-card">
            <div className="toolbar-section">
              <h4>Self Check-In</h4>
              <div className="toolbar-buttons">
                <button
                  className="toolbar-btn checkin-enable-btn"
                  onClick={onBulkEnableCheckin}
                >
                  <UserCheck className="btn-icon" />
                  <span className="btn-text">Enable</span>
                </button>
                <button
                  className="toolbar-btn checkin-disable-btn"
                  onClick={onBulkDisableCheckin}
                >
                  <UserX className="btn-icon" />
                  <span className="btn-text">Disable</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="classes-grid">
        {classes.map((classInfo) => {
          const visibilityPreset = classInfo.visibility_preset || 'standard';
          const visibilityTitle = PRESET_CONFIGS[visibilityPreset]?.title || 'After Class';

          return (
            <div
              key={classInfo.id}
              className={`class-card-compact ${selectedClasses.has(classInfo.id) ? 'selected' : ''}`}
              onClick={() => onToggleClassSelection(classInfo.id)}
            >
              <div className="card-left">
                <input
                  type="checkbox"
                  checked={selectedClasses.has(classInfo.id)}
                  onChange={() => onToggleClassSelection(classInfo.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="card-checkbox"
                />
                <div className="card-info">
                  {/* Row 1: Trial Date + Trial Number */}
                  <div className="info-row-1">
                    {formatTrialDate(classInfo.trial_date)} • Trial {classInfo.trial_number}
                  </div>
                  {/* Row 2: Element • Level • Section */}
                  <div className="info-row-2">
                    <span className="element-level">
                      {classInfo.element} • {classInfo.level}
                      {classInfo.section && classInfo.section !== '-' && ` • ${classInfo.section}`}
                    </span>
                  </div>
                  {/* Row 3: Judge */}
                  <div className="info-row-3">
                    Judge: {classInfo.judge_name || 'TBD'}
                  </div>
                </div>
              </div>
              <div className="card-right">
                <div className="badge-stack">
                  {/* Visibility Badge */}
                  <span className="visibility-badge" title={`Result visibility: ${visibilityTitle}`}>
                    <Eye className="badge-icon" />
                    {visibilityTitle}
                  </span>
                  {/* Self Check-In Badge */}
                  {classInfo.self_checkin ? (
                    <span className="checkin-badge enabled" title="Self check-in enabled">
                      <UserCheck className="badge-icon" />
                      SELF CHECK-IN
                    </span>
                  ) : (
                    <span className="checkin-badge disabled" title="Table check-in only">
                      <UserX className="badge-icon" />
                      TABLE CHECK-IN
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {classes.length === 0 && (
        <div className="no-classes">
          <div className="no-classes-icon">📋</div>
          <div className="no-classes-text">No classes found for this competition</div>
        </div>
      )}
    </div>
  );
}
