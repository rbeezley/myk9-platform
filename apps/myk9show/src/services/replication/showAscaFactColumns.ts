/**
 * MYK9-2290 ASCA premium facts on `shows` (§1.5.2, §1.5.9, §1.5.19, §1.5.24): replica field ->
 * column. All four are nullable and null is meaningful (it clears the fact), so a field is
 * written only when it is defined; `undefined` means "leave the server's value".
 */
export const ASCA_SANCTION_STATUSES = ['pending', 'approved'] as const;
export const SPECTATOR_POLICIES = ['allowed', 'not_allowed'] as const;

export type AscaSanctionStatus = (typeof ASCA_SANCTION_STATUSES)[number];
export type SpectatorPolicy = (typeof SPECTATOR_POLICIES)[number];

export interface ShowAscaFacts {
  /** shows.asca_sanction_status: pending or approved; null = not set. */
  ascaSanctionStatus?: AscaSanctionStatus | null | undefined;
  /** shows.scents_by_level: the scents used for each level, free text. */
  scentsByLevel?: string | null | undefined;
  /** shows.spectators_policy: whether spectators and videoing are allowed. */
  spectatorsPolicy?: SpectatorPolicy | null | undefined;
  /** shows.photographer_contact: optional free text. */
  photographerContact?: string | null | undefined;
}

export const SHOW_ASCA_FACT_FIELD_COLUMNS = [
  ['ascaSanctionStatus', 'asca_sanction_status'],
  ['scentsByLevel', 'scents_by_level'],
  ['spectatorsPolicy', 'spectators_policy'],
  ['photographerContact', 'photographer_contact'],
] as const;

/** The columns a write actually sets (undefined fields are omitted, null clears). */
export function showAscaFactColumns(show: ShowAscaFacts): Record<string, string | null> {
  const columns: Record<string, string | null> = {};
  for (const [field, column] of SHOW_ASCA_FACT_FIELD_COLUMNS) {
    if (show[field] !== undefined) columns[column] = show[field] ?? null;
  }
  return columns;
}

/**
 * Replica fields from a `shows` row. An unset column reads as absent (undefined), so an unrelated
 * edit on a copy that never held the fact cannot write null over a value set elsewhere.
 */
export function showAscaFactsFromRow(row: object): ShowAscaFacts {
  const columns = row as Record<string, unknown>;
  const facts: ShowAscaFacts = {};
  const status = columns.asca_sanction_status;
  if (status === 'pending' || status === 'approved') facts.ascaSanctionStatus = status;
  const policy = columns.spectators_policy;
  if (policy === 'allowed' || policy === 'not_allowed') facts.spectatorsPolicy = policy;
  if (typeof columns.scents_by_level === 'string') facts.scentsByLevel = columns.scents_by_level;
  if (typeof columns.photographer_contact === 'string') {
    facts.photographerContact = columns.photographer_contact;
  }
  return facts;
}

/** Only the ASCA-fact fields an update actually sets (undefined means "leave it"). */
export function pickShowAscaFactUpdates(updates: ShowAscaFacts): ShowAscaFacts {
  const picked: ShowAscaFacts = {};
  if (updates.ascaSanctionStatus !== undefined) {
    picked.ascaSanctionStatus = updates.ascaSanctionStatus;
  }
  if (updates.scentsByLevel !== undefined) picked.scentsByLevel = updates.scentsByLevel;
  if (updates.spectatorsPolicy !== undefined) picked.spectatorsPolicy = updates.spectatorsPolicy;
  if (updates.photographerContact !== undefined) {
    picked.photographerContact = updates.photographerContact;
  }
  return picked;
}
