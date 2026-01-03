/**
 * ResultVisibilitySection Component
 *
 * Collapsible section for managing result visibility settings.
 * Handles show-level defaults and trial-level overrides.
 *
 * Extracted from CompetitionAdmin.tsx
 */

import React from 'react';
import { Eye, Zap, Lock, Clock, Calendar, Target, ArrowDown, RotateCcw, UserCheck, ClipboardList } from 'lucide-react';
import { PRESET_CONFIGS } from '../../../types/visibility';
import type { VisibilityPreset } from '../../../types/visibility';
import type { TrialInfo } from '../hooks/useCompetitionAdminData';
import { formatTrialDate } from '../../../utils/dateUtils';

export interface ResultVisibilitySectionProps {
  /** Whether the section is expanded */
  isExpanded: boolean;
  /** Toggle section expansion */
  onToggleExpanded: () => void;
  /** Current show-level visibility preset */
  showVisibilityPreset: VisibilityPreset;
  /** Trial-level visibility overrides */
  trialVisibilitySettings: Map<number, VisibilityPreset>;
  /** List of trials */
  trials: TrialInfo[];
  /** Handler for setting show visibility */
  onSetShowVisibility: (preset: VisibilityPreset) => void;
  /** Handler for setting trial visibility */
  onSetTrialVisibility: (trialId: number, preset: VisibilityPreset) => void;
  /** Handler for removing trial visibility override */
  onRemoveTrialVisibility: (trialId: number) => void;
}

/**
 * ResultVisibilitySection Component
 *
 * Collapsible section that displays:
 * - Show-level visibility preset selector
 * - Trial-level override controls
 * - Explanation of cascade logic
 */
export function ResultVisibilitySection({
  isExpanded,
  onToggleExpanded,
  showVisibilityPreset,
  trialVisibilitySettings,
  trials,
  onSetShowVisibility,
  onSetTrialVisibility,
  onRemoveTrialVisibility
}: ResultVisibilitySectionProps): React.ReactElement {
  return (
    <div className="visibility-control-section">
      <div className="visibility-header" onClick={onToggleExpanded}>
        <div className="visibility-title">
          <Eye className="section-icon" />
          <h3>Result Visibility Settings</h3>
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
                All classes inherit this unless overridden
              </span>
            </div>
            <div className="preset-selector">
              {(Object.keys(PRESET_CONFIGS) as VisibilityPreset[]).map((preset) => {
                const config = PRESET_CONFIGS[preset];
                const PresetIcon = preset === 'open' ? Zap : preset === 'review' ? Lock : Clock;
                return (
                  <button
                    key={preset}
                    className={`preset-card ${showVisibilityPreset === preset ? 'selected' : ''}`}
                    onClick={() => onSetShowVisibility(preset)}
                  >
                    <div className="preset-icon"><PresetIcon size={24} /></div>
                    <div className="preset-title">{config.title}</div>
                    <div className="preset-description">{config.description}</div>
                    <div className="preset-details">{config.details}</div>
                    {showVisibilityPreset === preset && (
                      <div className="selected-indicator"><UserCheck size={14} /> Selected</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trial-level overrides */}
          {trials.length > 0 && (
            <div className="trial-overrides-section">
              <h4><Calendar size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Trial Overrides (Optional)</h4>
              <p className="section-description">
                Override the show default for specific trials. Classes in these trials will inherit the trial setting unless individually overridden.
              </p>
              <div className="trial-rows-grid">
                {trials.map((trial) => {
                  const currentSetting = trialVisibilitySettings.get(trial.trial_id);
                  const isCustom = currentSetting !== undefined;
                  const effectiveSetting = currentSetting || showVisibilityPreset;

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
                        <div className="trial-visibility-selector">
                          <label className="trial-override-label-text">
                            {isCustom ? <><Target size={14} /> Custom:</> : <><ArrowDown size={14} /> Inherited:</>}
                          </label>
                          <select
                            className={`trial-preset-dropdown ${isCustom ? 'custom' : 'inherited'}`}
                            value={effectiveSetting}
                            onChange={(e) => {
                              const newPreset = e.target.value as VisibilityPreset;
                              if (newPreset === showVisibilityPreset) {
                                onRemoveTrialVisibility(trial.trial_id);
                              } else {
                                onSetTrialVisibility(trial.trial_id, newPreset);
                              }
                            }}
                          >
                            <option value="open">{PRESET_CONFIGS.open.title}</option>
                            <option value="standard">{PRESET_CONFIGS.standard.title}</option>
                            <option value="review">{PRESET_CONFIGS.review.title}</option>
                          </select>
                          {isCustom && (
                            <button
                              className="reset-btn"
                              onClick={() => onRemoveTrialVisibility(trial.trial_id)}
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
              <li><strong>Judges and Admins</strong> always see all results regardless of these settings</li>
              <li><strong>Stewards and Exhibitors</strong> see results based on these settings</li>
              <li><strong>Cascading Hierarchy:</strong> Show Default → Trial Override → Class Override</li>
              <li><strong>Show Default</strong> applies to all trials and classes (set once)</li>
              <li><strong>Trial Override</strong> applies to all classes in that trial (e.g., Trial 2 judge wants different rules)</li>
              <li><strong>Class Override</strong> applies to specific classes (use bulk operations for multiple classes)</li>
              <li><strong>Lowest level wins:</strong> Class override &gt; Trial override &gt; Show default</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
