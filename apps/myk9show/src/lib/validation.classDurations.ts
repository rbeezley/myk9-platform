import { z } from 'zod';
import { formatDuration, isUnresolvedDuration, parseDuration } from '@myk9/core';

/** A class duration (m:ss): blank, or text the shared time field can read. */
export const durationField = (label: string) =>
  z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(v => !v || !isUnresolvedDuration(v, 'max'), {
      message: `Please enter ${label} as minutes and seconds, like 4:30`,
    });

/** Longest class duration the editor accepts: 9:59, or 15:00 for Detective. */
export function classDurationMaxSeconds(element: string | undefined): number {
  return element === 'Detective' ? 15 * 60 : 9 * 60 + 59;
}

const CLASS_DURATIONS = [
  ['estimatedJudgingTime', 'The estimated judging time'],
  ['timeLimit1', 'Time limit 1'],
  ['timeLimit2', 'Time limit 2'],
  ['timeLimit3', 'Time limit 3'],
] as const;

/** A readable class duration outside the editor's range is refused, not saved (MYK9-1503). */
export function classDurationRangeIssues(
  data: { element: string; editedTimeLimits?: string[] | undefined } & Partial<
    Record<(typeof CLASS_DURATIONS)[number][0], string | undefined>
  >
): Array<{ path: string[]; message: string }> {
  const high = classDurationMaxSeconds(data.element);
  // A time limit nobody changed is not checked: a stored out-of-range value must not block Save.
  const edited = data.editedTimeLimits ?? [];
  return CLASS_DURATIONS.flatMap(([field, label]) => {
    if (field.startsWith('timeLimit') && !edited.includes(field)) return [];
    const parsed = parseDuration(data[field] ?? '', 'max');
    return parsed.ok && (parsed.seconds < 1 || parsed.seconds > high)
      ? [
          {
            path: [field],
            message: `${label} must be between ${formatDuration(1, 'max')} and ${formatDuration(high, 'max')}`,
          },
        ]
      : [];
  });
}

/** The class's time limits, shared by both class forms. */
export const classTimeLimitFields = {
  timeLimit1: durationField('time limit 1'),
  timeLimit2: durationField('time limit 2'),
  timeLimit3: durationField('time limit 3'),
};

/** Which time limits the user changed in this session (see `editedTimeLimits`). */
export const editedTimeLimitsField = z
  .array(z.enum(['timeLimit1', 'timeLimit2', 'timeLimit3']))
  .optional();
