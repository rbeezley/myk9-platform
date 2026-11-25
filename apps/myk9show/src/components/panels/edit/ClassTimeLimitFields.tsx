import { DurationInput } from '@myk9/scoring-ui';

import { FormField } from '@/components/common/FormField';
import { RuleBadge } from '@/components/classes/OfficialsSection';
import { useClassRequirements } from '@/hooks/useClassRequirements';
import { classDurationMaxSeconds } from '@/lib/validation';
import { useEditPanel } from './useEditPanel';

/** A class duration (m:ss) typed through the one shared time field (MYK9-1503). */
export function ClassDurationField({
  id,
  label,
  value,
  onChange,
  maxSeconds,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxSeconds: number;
  error?: string | undefined;
}) {
  return (
    <FormField label={label} fieldId={id} error={error}>
      <DurationInput
        kind="max"
        id={id}
        value={value}
        onChange={onChange}
        range={{ low: 1, high: maxSeconds }}
        className="h-11 max-w-32 rounded-md border border-input bg-background px-3 text-center font-mono text-base"
      />
    </FormField>
  );
}

/** What the time-limit fields read and write; both class forms carry these. */
interface TimeLimitFormData extends Record<string, unknown> {
  element: string;
  level: string;
  timeLimit1?: string;
  timeLimit2?: string;
  timeLimit3?: string;
}

/**
 * Container and Buried have rulebook time limits the judge cannot change; Exterior and Interior
 * limits are up to the judge (owner, 2026-11-24).
 */
export const hasFixedTimeLimit = (element: string): boolean =>
  element === 'Container' || element === 'Buried';

/**
 * The class's time limits (MYK9-1503): Time Limit 1, and the extra areas Interior Excellent and
 * Master have. `fixed` shows them as read-only text (Container, Buried). An edit also marks
 * `timeLimitEdited`, so a form that saves only what changed (Edit class from Show Desk) sends them.
 */
export function ClassTimeLimitFields({
  showId,
  fixed = false,
}: {
  showId?: string | undefined;
  fixed?: boolean;
}) {
  const { data, form } = useEditPanel<TimeLimitFormData>();
  const { autoFill } = useClassRequirements({
    element: data.element,
    level: data.level,
    showId,
  });
  const maxSeconds = classDurationMaxSeconds(data.element);
  const edit = (field: 'timeLimit1' | 'timeLimit2' | 'timeLimit3') => (value: string) => {
    form?.setValue(field, value);
    form?.setValue('timeLimitEdited', true);
  };
  const interiorAreas = data.element === 'Interior';
  const rule = autoFill?.timeLimitText;

  if (fixed) {
    return (
      <div className="space-y-2" data-testid="class-time-limit-fixed">
        <h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Time limit
        </h4>
        <p className="text-sm font-medium">{data.timeLimit1 || rule?.ruleValue || 'Not set'}</p>
        <p className="text-xs text-muted-foreground">
          The rulebook sets this time limit for {data.element} classes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Time Limits
        </h4>
        {rule?.ruleValue && (
          <RuleBadge
            label={
              rule.isJudgeSettable ? `Set by judge (${rule.ruleValue})` : `Rule: ${rule.ruleValue}`
            }
          />
        )}
      </div>

      <ClassDurationField
        id="timeLimit1"
        label="Time Limit 1"
        value={data.timeLimit1 || ''}
        onChange={edit('timeLimit1')}
        maxSeconds={maxSeconds}
        error={form?.getError('timeLimit1')}
      />

      {interiorAreas && (data.level === 'Excellent' || data.level === 'Master') && (
        <ClassDurationField
          id="timeLimit2"
          label="Time Limit 2"
          value={data.timeLimit2 || ''}
          onChange={edit('timeLimit2')}
          maxSeconds={maxSeconds}
          error={form?.getError('timeLimit2')}
        />
      )}

      {interiorAreas && data.level === 'Master' && (
        <ClassDurationField
          id="timeLimit3"
          label="Time Limit 3"
          value={data.timeLimit3 || ''}
          onChange={edit('timeLimit3')}
          maxSeconds={maxSeconds}
          error={form?.getError('timeLimit3')}
        />
      )}
    </div>
  );
}
