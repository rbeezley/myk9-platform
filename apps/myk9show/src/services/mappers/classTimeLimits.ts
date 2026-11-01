/**
 * Class search time limits: the class editor's "M:SS" strings ↔ the
 * `classes.time_limit_seconds` / `time_limit_area{2,3}_seconds` columns the
 * live scoresheet reads. Both directions go through the shared @myk9/core
 * duration rules (MYK9-1503). A limit that is not persisted leaves the scoresheet
 * on its fallback, so a time the secretary enters must reach the column.
 */

import { formatTimeLimitSeconds, parseDuration } from '@myk9/core';

/** "5:00" / "05:00" → 300; blank, unreadable or zero → null (clears the limit). */
export function parseTimeLimitSeconds(value: string): number | null {
  const result = parseDuration(value, 'max');
  return result.ok && result.seconds > 0 ? result.seconds : null;
}

/** 300 → "5:00", the shared time field's own format; null/undefined → "". */
export { formatTimeLimitSeconds };

/** The editor's touched time-limit fields as a `classes` update (untouched → absent). */
export function mapTimeLimitUpdates(updates: {
  timeLimit1?: string | undefined;
  timeLimit2?: string | undefined;
  timeLimit3?: string | undefined;
}): {
  time_limit_seconds?: number | null;
  time_limit_area2_seconds?: number | null;
  time_limit_area3_seconds?: number | null;
} {
  return {
    ...(updates.timeLimit1 !== undefined && {
      time_limit_seconds: parseTimeLimitSeconds(updates.timeLimit1),
    }),
    ...(updates.timeLimit2 !== undefined && {
      time_limit_area2_seconds: parseTimeLimitSeconds(updates.timeLimit2),
    }),
    ...(updates.timeLimit3 !== undefined && {
      time_limit_area3_seconds: parseTimeLimitSeconds(updates.timeLimit3),
    }),
  };
}
