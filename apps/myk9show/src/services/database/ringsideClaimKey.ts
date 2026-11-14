/**
 * The passcode claim of a session's `app_metadata`: its role and, for a per-judge
 * code, the judge (`ringside_person_id`). Undefined when it is not a ringside
 * passcode claim. Stamps queued scores so a refused one is only ever handed back to
 * the same claim (MYK9-2009).
 */
export function ringsideClaimKey(appMetadata: unknown): string | undefined {
  const claim = appMetadata as
    { kind?: unknown; ringside_role?: unknown; ringside_person_id?: unknown } | null | undefined;
  if (claim?.kind !== 'ringside_passcode' || typeof claim.ringside_role !== 'string') {
    return undefined;
  }
  const person = typeof claim.ringside_person_id === 'string' ? claim.ringside_person_id : '';
  return `${claim.ringside_role}:${person}`;
}
