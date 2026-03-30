import React from 'react';

interface TrialClassFiltersProps {
  trials: Array<{
    id: string;
    name: string | null;
    date: string | null;
    trial_number: string | number | null;
  }>;
  classes: Array<{ id: string; name: string | null }>;
  trialFilter: string | null;
  classFilter: string | null;
  onTrialChange: (trialId: string | null) => void;
  onClassChange: (classId: string | null) => void;
  isLoadingTrials?: boolean;
  isLoadingClasses?: boolean;
}

function formatTrialLabel(trial: TrialClassFiltersProps['trials'][number]): string {
  const label = trial.name ?? `Trial ${trial.trial_number ?? '?'}`;
  if (trial.date) {
    const date = new Date(trial.date + 'T00:00:00');
    const formatted = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${label} — ${formatted}`;
  }
  return label;
}

const selectClassName = 'h-9 rounded-lg border border-border bg-card px-3 text-sm';

export const TrialClassFilters: React.FC<TrialClassFiltersProps> = ({
  trials,
  classes,
  trialFilter,
  classFilter,
  onTrialChange,
  onClassChange,
  isLoadingTrials = false,
  isLoadingClasses = false,
}) => {
  const isTrialDisabled = isLoadingTrials;
  const isClassDisabled = trialFilter === null || isLoadingClasses;

  return (
    <div className="flex gap-3">
      <select
        aria-label="Trial filter"
        value={trialFilter ?? ''}
        onChange={e => onTrialChange(e.target.value || null)}
        className={selectClassName}
        disabled={isTrialDisabled}
      >
        {isLoadingTrials ? (
          <option value="">Loading trials...</option>
        ) : trials.length === 0 ? (
          <option value="">No trials</option>
        ) : (
          <>
            <option value="">All Trials</option>
            {trials.map(trial => (
              <option key={trial.id} value={trial.id}>
                {formatTrialLabel(trial)}
              </option>
            ))}
          </>
        )}
      </select>

      <select
        aria-label="Class filter"
        value={classFilter ?? ''}
        onChange={e => onClassChange(e.target.value || null)}
        className={selectClassName}
        disabled={isClassDisabled}
      >
        {isLoadingClasses ? (
          <option value="">Loading classes...</option>
        ) : (
          <>
            <option value="">All Classes</option>
            {classes.map(cls => (
              <option key={cls.id} value={cls.id}>
                {cls.name ?? 'Unnamed Class'}
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  );
};

export default TrialClassFilters;
