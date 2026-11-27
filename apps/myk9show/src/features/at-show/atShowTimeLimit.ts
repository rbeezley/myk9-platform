/**
 * Render a `time_limit_seconds` value as the ringside `ClassInfo.timeLimit`
 * string (`"180s"`). The downstream popover re-parses this back to a number,
 * so the ONLY values we may emit are clean numeric-seconds strings — never a
 * placeholder like `"TBD"`.
 *
 * `ReplicatedClass.timeLimitSeconds` is an `as number` cast over a loosely
 * typed DB row, so a non-numeric placeholder can slip past the compiler at
 * runtime. Guarding on `Number.isFinite` (and `> 0`) keeps junk from being
 * laundered into `"TBDs"` / `"NaNs"`; such inputs collapse to `undefined`
 * (no limit) instead.
 */
export function timeLimitString(seconds?: number): string | undefined {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? `${seconds}s`
    : undefined;
}
