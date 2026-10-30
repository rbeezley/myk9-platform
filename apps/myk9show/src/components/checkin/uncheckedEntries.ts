/** A check-in state the "Check In All" / "Check In Rest" action still has to write. */
export function isUncheckedCheckInStatus(status: string | null | undefined): boolean {
  return !status || status === 'no-status';
}
