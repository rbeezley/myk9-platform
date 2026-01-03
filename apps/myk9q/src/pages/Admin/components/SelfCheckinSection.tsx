/**
 * SelfCheckinSection Component
 *
 * Collapsible section for managing self check-in settings.
 * Handles show-level defaults and trial-level overrides.
 *
 * Extracted from CompetitionAdmin.tsx
 */

import React from 'react';
import { UserCheck, UserX, Calendar, Target, ArrowDown, RotateCcw, ClipboardList } from 'lucide-react';
import type { TrialInfo } from '../hooks/useCompetitionAdminData';
import { formatTrialDate } from '../../../utils/dateUtils';

export interface SelfCheckinSectionProps {
  /** Whether the section is expanded */
  isExpanded: boolean;
  /** Toggle section expansion */
  onToggleExpanded: () => void;
  /** Current show-level self check-in setting */
  showSelfCheckinEnabled: boolean;
  /** Trial-level self check-in overrides */
  trialSelfCheckinSettings: Map<number, boolean>;
  /** List of trials */
  trials: TrialInfo[];
  /** Handler for setting show self check-in */
  onSetShowSelfCheckin: (enabled: boolean) => void;
  /** Handler for setting trial self check-in */
  onSetTrialSelfCheckin: (trialId: number, enabled: boolean) => void;
  /** Handler for removing trial self check-in override */
  onRemoveTrialSelfCheckin: (trialId: number) => void;
}

/**
 * SelfCheckinSection Component
 *
 * Collapsible section that displays:
 * - Show-level self check-in toggle
 * - Trial-level override controls
 * - Explanation of cascade logic
 */
export function SelfCheckinSection({
  isExpanded,
  onToggleExpanded,
  showSelfCheckinEnabled,
  trialSelfCheckinSettings,
  trials,
  onSetShowSelfCheckin,
  onSetTrialSelfCheckin,
  onRemoveTrialSelfCheckin
}: SelfCheckinSectionProps): React.ReactElement {
  return (
    <div className="visibility-control-section checkin-section">
      <div className="visibility-header" onClick={onToggleExpanded}>
        <div className="visibility-title">
          <UserCheck className="section-icon" />
          <h3>Self Check-In Settings</h3>
        </div>
        <span className="expand-toggle">{isExpanded ? '▲ Collapse' : '▼ Expand'}</span>
      </div>

      {isExpanded && (
        <>
          {/* Show-level default */}
          <div className="show-default-card">
            <div className="show-default-header">
              <span className="show-badge"><ClipboardList size={16} /> Show Default</span>
              <span className="inheritance-note">
                All trials/classes inherit this unless overridden
              </span>
            </div>
            <div className="checkin-toggle-container">
              <button
                className={`checkin-toggle-btn ${showSelfCheckinEnabled ? 'enabled' : 'disabled'}`}
                onClick={() => onSetShowSelfCheckin(!showSelfCheckinEnabled)}
              >
                {showSelfCheckinEnabled ? (
                  <>
                    <UserCheck className="btn-icon" />
                    <span className="btn-text">Self Check-In ENABLED</span>
                    <span className="btn-hint">Exhibitors can check in via app</span>
                  </>
                ) : (
                  <>
                    <UserX className="btn-icon" />
                    <span className="btn-text">Self Check-In DISABLED</span>
                    <span className="btn-hint">Table check-in only</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Trial-level overrides */}
          {trials.length > 0 && (
            <div className="trial-overrides-section">
              <h4><Calendar size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Trial Overrides (Optional)</h4>
              <p className="section-description">
                Override the show default for specific trials. Classes in these trials will inherit the trial setting.
              </p>
              <div className="trial-rows-grid">
                {trials.map((trial) => {
                  const currentSetting = trialSelfCheckinSettings.get(trial.trial_id);
                  const isCustom = currentSetting !== undefined;
                  const effectiveSetting = currentSetting ?? showSelfCheckinEnabled;

                  return (
                    <div key={trial.trial_id} className="trial-override-card">
                      <div className="trial-override-info">
                        <span className="trial-override-label">
                          {formatTrialDate(trial.trial_date)} • Trial {trial.trial_number}
                        </span>
                        <span className="trial-override-meta">
                          Judge{trial.judges.length > 1 ? 's' : ''}: {trial.judges.join(', ')}
                        </span>
                        <span className="trial-override-meta">
                          {trial.class_count} {trial.class_count === 1 ? 'class' : 'classes'}
                        </span>
                      </div>
                      <div className="trial-override-controls">
                        <div className="trial-checkin-selector">
                          <label className="trial-override-label-text">
                            {isCustom ? <><Target size={14} /> Custom:</> : <><ArrowDown size={14} /> Inherited:</>}
                          </label>
                          <select
                            className={`trial-checkin-dropdown ${isCustom ? 'custom' : 'inherited'}`}
                            value={effectiveSetting ? 'enabled' : 'disabled'}
                            onChange={(e) => {
                              const newEnabled = e.target.value === 'enabled';
                              if (newEnabled === showSelfCheckinEnabled) {
                                onRemoveTrialSelfCheckin(trial.trial_id);
                              } else {
                                onSetTrialSelfCheckin(trial.trial_id, newEnabled);
                              }
                            }}
                          >
                            <option value="enabled">App (Self)</option>
                            <option value="disabled">At Table</option>
                          </select>
                          {isCustom && (
                            <button
                              className="reset-btn"
                              onClick={() => onRemoveTrialSelfCheckin(trial.trial_id)}
                              title="Reset to show default"
                            >
                              <RotateCcw size={14} /> Reset
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Explanation card */}
          <div className="visibility-explanation">
            <h5>How It Works:</h5>
            <ul>
              <li><strong>Self Check-In Enabled:</strong> Exhibitors can check in via the mobile app</li>
              <li><strong>Self Check-In Disabled:</strong> Only stewards/admins can check in at the table</li>
              <li><strong>Cascading Hierarchy:</strong> Show Default → Trial Override → Class Override</li>
              <li><strong>Show Default</strong> applies to all trials and classes (set once)</li>
              <li><strong>Trial Override</strong> applies to all classes in that trial</li>
              <li><strong>Class Override</strong> applies to specific classes (use bulk operations for multiple classes)</li>
              <li><strong>Lowest level wins:</strong> Class override &gt; Trial override &gt; Show default</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
