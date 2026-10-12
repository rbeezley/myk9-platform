/**
 * "1 fault" / "2 faults" for a scored run, or null when there is nothing to
 * say. Zero and withheld (null/undefined) faults stay hidden: faults appear
 * only when present, matching the at-show Completed tab (MYK9-1108).
 */
export function formatFaultCount(faults: number | null | undefined): string | null {
  if (faults == null || !Number.isFinite(faults) || faults <= 0) return null;
  return faults === 1 ? '1 fault' : `${faults} faults`;
}
