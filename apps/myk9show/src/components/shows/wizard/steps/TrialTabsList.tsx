import React from 'react';
import { FieldError, fieldErrorControlProps, useFieldErrors } from '@/components/forms';
import { trialClassesFieldId } from '@/pages/secretary/ShowCreationWizard/wizardFieldIds';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

interface TrialTabsListProps {
  trials: ReadonlyArray<{ id: string; classes: readonly unknown[] }>;
  names: readonly string[];
}

const MIN_TAB_REM = 7;

/**
 * The class step's trial tabs, with each trial's "needs a class" callout in the cell under ITS
 * OWN tab. The callout row repeats the tab list's columns inside the same scroller, so cell i sits
 * under tab i at every width (the tabs scroll sideways on a phone, and the callouts scroll with
 * them) and each arrow points at its own trial.
 *
 * gridTemplateColumns is inline, not `grid-cols-${n}`: Tailwind extracts class names statically,
 * so an interpolated class is never compiled and the tabs collapse to one column.
 */
export const TrialTabsList: React.FC<TrialTabsListProps> = ({ trials, names }) => {
  const fieldErrors = useFieldErrors();
  const columns = {
    gridTemplateColumns: `repeat(${trials.length}, minmax(${MIN_TAB_REM}rem, 1fr))`,
  };
  return (
    <div className="overflow-x-auto" data-testid="trial-tabs-scroller">
      <div style={{ minWidth: `${trials.length * MIN_TAB_REM}rem` }}>
        <TabsList className="grid w-full" style={columns}>
          {trials.map((trial, index) => {
            const isCompleted = trial.classes.length > 0;
            const fieldId = trialClassesFieldId(trial.id);
            return (
              <TabsTrigger
                key={trial.id}
                value={trial.id}
                {...fieldErrorControlProps(fieldId, fieldErrors[fieldId])}
              >
                <span className="truncate">{names[index]}</span>
                <Badge variant={isCompleted ? 'default' : 'outline'} className="text-xs ml-1.5">
                  {isCompleted ? trial.classes.length : '0'}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
        <div className="grid gap-1 px-1" style={columns} data-testid="trial-callout-row">
          {trials.map(trial => (
            <div key={trial.id} className="min-w-0">
              <FieldError field={trialClassesFieldId(trial.id)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
