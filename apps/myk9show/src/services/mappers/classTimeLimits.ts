/**
 * Class search time limits: the class editor's "M:SS" strings ↔ the
 * `classes.time_limit_seconds` / `time_limit_area{2,3}_seconds` columns the
 * live scoresheet reads. UKC Nosework times are set per class (the rule only
 * gives a range), so a limit that is not persisted leaves the scoresheet on
 * its fallback.
 */

/** "05:00" / "5:00" → 300; blank or unparseable → null (clears the limit). */
export function parseTimeLimitSeconds(value: string): number | null {
  const match = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(value);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds > 0 ? seconds : null;
}

/** 300 → "05:00" (the TimePicker's own format); null/undefined → "". */
export function formatTimeLimitSeconds(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

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
