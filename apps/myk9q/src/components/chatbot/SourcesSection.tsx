import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Trophy,
  Calendar,
} from 'lucide-react';
import type {
  ChatSources,
  Rule,
  ClassSummary,
  EntryResult,
  TrialSummary,
} from '../../services/chatbotService';
import { type SourceType, getSourceIcon, getSourceLabel, getSourceCount } from './chatbotUtils';

export interface SourcesSectionProps {
  sources: ChatSources;
  expandedSource: SourceType | null;
  expandedRuleId: string | null;
  onToggleSource: (sourceType: SourceType) => void;
  onToggleRule: (ruleId: string) => void;
}

export const SourcesSection: React.FC<SourcesSectionProps> = ({
  sources,
  expandedSource,
  expandedRuleId,
  onToggleSource,
  onToggleRule,
}) => (
  <div className="chat-sources">
    <div className="chat-sources-header">Sources</div>

    {(Object.keys(sources) as SourceType[]).map((sourceType) => {
      const count = getSourceCount(sources, sourceType);
      if (count === 0) return null;

      const Icon = getSourceIcon(sourceType);
      const isExpanded = expandedSource === sourceType;

      return (
        <div key={sourceType} className="chat-source-section">
          <button
            className="chat-source-header"
            onClick={() => onToggleSource(sourceType)}
            aria-expanded={isExpanded}
          >
            <div className="chat-source-title">
              <Icon size={16} />
              <span>{getSourceLabel(sourceType)}</span>
              <span className="chat-source-count">({count})</span>
            </div>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {isExpanded && (
            <div className="chat-source-content">
              {sourceType === 'rules' && (
                <RulesSourceList
                  rules={sources.rules || []}
                  expandedRuleId={expandedRuleId}
                  onToggleRule={onToggleRule}
                />
              )}
              {sourceType === 'classes' && (
                <ClassesSourceList classes={sources.classes || []} />
              )}
              {sourceType === 'entries' && (
                <EntriesSourceList entries={sources.entries || []} />
              )}
              {sourceType === 'trials' && (
                <TrialsSourceList trials={sources.trials || []} />
              )}
            </div>
          )}
        </div>
      );
    })}
  </div>
);

interface RulesSourceListProps {
  rules: Rule[];
  expandedRuleId: string | null;
  onToggleRule: (id: string) => void;
}

const RulesSourceList: React.FC<RulesSourceListProps> = ({
  rules,
  expandedRuleId,
  onToggleRule,
}) => {
  const formatMeasurement = (key: string, value: string | number | boolean): string => {
    const labels: Record<string, string> = {
      min_area_sq_ft: 'Min Area',
      max_area_sq_ft: 'Max Area',
      time_limit_minutes: 'Time Limit',
      min_hides: 'Min Hides',
      max_hides: 'Max Hides',
      max_leash_length_feet: 'Max Leash',
      warning_seconds: 'Warning Time',
    };

    const units: Record<string, string> = {
      min_area_sq_ft: 'sq ft',
      max_area_sq_ft: 'sq ft',
      time_limit_minutes: 'min',
      max_leash_length_feet: 'ft',
      warning_seconds: 'sec',
    };

    const label = labels[key] || key;
    const unit = units[key] || '';
    const displayValue = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;

    return `${label}: ${displayValue}${unit ? ' ' + unit : ''}`;
  };

  return (
    <div className="chat-rules-list">
      {rules.map((rule) => (
        <div key={rule.id} className="chat-rule-card">
          <button
            className="chat-rule-header"
            onClick={() => onToggleRule(rule.id)}
            aria-expanded={expandedRuleId === rule.id}
          >
            <div className="chat-rule-title-section">
              <h4 className="chat-rule-title">{rule.title}</h4>
              <span className="chat-rule-section">{rule.section}</span>
            </div>
            <div className="chat-rule-badges">
              {rule.categories.level && (
                <span className="chat-badge level">{rule.categories.level}</span>
              )}
              {rule.categories.element && (
                <span className="chat-badge element">{rule.categories.element}</span>
              )}
            </div>
          </button>

          {expandedRuleId === rule.id && (
            <div className="chat-rule-content">
              <p>{rule.content}</p>
              {Object.keys(rule.measurements).length > 0 && (
                <div className="chat-measurements">
                  <h5>Key Measurements:</h5>
                  <ul>
                    {Object.entries(rule.measurements).map(([key, value]) => (
                      <li key={key}>{formatMeasurement(key, value as string | number | boolean)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

interface ClassesSourceListProps {
  classes: ClassSummary[];
}

const ClassesSourceList: React.FC<ClassesSourceListProps> = ({ classes }) => {
  const formatStatus = (status: string): string => {
    const statusLabels: Record<string, string> = {
      'no-status': 'Not Started',
      'setup': 'Setup',
      'briefing': 'Briefing',
      'break': 'On Break',
      'in_progress': 'In Progress',
      'completed': 'Completed',
    };
    return statusLabels[status] || status;
  };

  return (
    <div className="chat-data-table">
      <div className="chat-data-header">
        <span>Class</span>
        <span>Entries</span>
        <span>Status</span>
      </div>
      {classes.map((cls, idx) => (
        <div key={idx} className="chat-data-row">
          <div className="chat-data-cell primary">
            <span className="chat-class-name">{cls.element} {cls.level}{cls.section ? ` ${cls.section}` : ''}</span>
            {cls.judge_name && <span className="chat-class-judge">Judge: {cls.judge_name}</span>}
          </div>
          <div className="chat-data-cell">
            <span>{cls.scored_entries}/{cls.total_entries}</span>
            {cls.qualified_count > 0 && (
              <span className="chat-qualified-count">
                <Trophy size={12} /> {cls.qualified_count}Q
              </span>
            )}
          </div>
          <div className="chat-data-cell">
            <span className={`chat-status-badge ${cls.class_status}`}>
              {formatStatus(cls.class_status)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

interface EntriesSourceListProps {
  entries: EntryResult[];
}

const EntriesSourceList: React.FC<EntriesSourceListProps> = ({ entries }) => {
  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  const getOrdinal = (n: number): string => {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  };

  return (
    <div className="chat-data-table entries">
      <div className="chat-data-header">
        <span>#</span>
        <span>Dog/Handler</span>
        <span>Result</span>
      </div>
      {entries.map((entry, idx) => (
        <div key={idx} className="chat-data-row">
          <div className="chat-data-cell armband">
            <span className="chat-armband">{entry.armband_number}</span>
          </div>
          <div className="chat-data-cell primary">
            <span className="chat-dog-name">{entry.call_name}</span>
            <span className="chat-handler-name">{entry.handler}</span>
          </div>
          <div className="chat-data-cell result">
            {entry.is_scored ? (
              <>
                <span className={`chat-result-badge ${entry.result_status}`}>
                  {entry.result_status === 'qualified' ? 'Q' : 'NQ'}
                </span>
                {entry.time !== null && (
                  <span className="chat-time">{formatTime(entry.time)}</span>
                )}
                {entry.placement && entry.placement > 0 && entry.placement <= 4 && (
                  <span className="chat-placement-badge">{getOrdinal(entry.placement)}</span>
                )}
              </>
            ) : (
              <span className="chat-not-scored">-</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

interface TrialsSourceListProps {
  trials: TrialSummary[];
}

const TrialsSourceList: React.FC<TrialsSourceListProps> = ({ trials }) => {
  return (
    <div className="chat-trials-list">
      {trials.map((trial, idx) => (
        <div key={idx} className="chat-trial-card">
          <div className="chat-trial-name">
            {trial.trial_name || `Trial ${trial.trial_number}`}
          </div>
          <div className="chat-trial-details">
            <span className="chat-trial-date">
              <Calendar size={14} />
              {new Date(trial.trial_date).toLocaleDateString()}
            </span>
            {trial.competition_type && (
              <span className="chat-trial-type">{trial.competition_type}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
