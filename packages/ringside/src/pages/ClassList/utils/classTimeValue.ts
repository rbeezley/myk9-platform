/**
 * Parse the time strings a class can carry: an ISO instant, or a clock time
 * ('HH:MM', 'H:MM AM/PM') when the secretary entered one without a date.
 * Shared by the A/B merge here and the app's time formatter so there is one
 * parser.
 */

export type ParsedClassTime =
  | { kind: 'instant'; ms: number }
  | { kind: 'clock'; minutes: number; hour24: number; minute: number };

const CLOCK = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i;

export function parseClassTime(value: string | null | undefined): ParsedClassTime | null {
  if (!value) return null;
  if (value.includes('T')) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : { kind: 'instant', ms };
  }
  const match = value.match(CLOCK);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
  return { kind: 'clock', minutes: hour * 60 + minute, hour24: hour, minute };
}

/**
 * The earlier/later of two time strings by parsed value, returning the
 * winner's ORIGINAL string. A value that cannot be parsed loses to one that
 * can. An instant and a bare clock time share no axis without a time zone, so
 * the instant wins (it is the revised, dated value).
 */
export function pickClassTime(
  a: string | undefined,
  b: string | undefined,
  which: 'earlier' | 'later'
): string | undefined {
  if (!a || !b) return a ?? b;
  const pa = parseClassTime(a);
  const pb = parseClassTime(b);
  if (!pa || !pb) return pa ? a : pb ? b : a;
  if (pa.kind !== pb.kind) return pa.kind === 'instant' ? a : b;
  const va = pa.kind === 'instant' ? pa.ms : (pa as { minutes: number }).minutes;
  const vb = pb.kind === 'instant' ? pb.ms : (pb as { minutes: number }).minutes;
  if (va === vb) return a;
  return (which === 'earlier' ? va < vb : va > vb) ? a : b;
}
