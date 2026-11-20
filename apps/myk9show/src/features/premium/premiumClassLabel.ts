/**
 * "Element Level Section", the one label a premium prints for a class. A class with no element
 * or level (a name-only class such as "Detective") prints its name (MYK9-2231).
 */
export function formatPremiumClassLabel(cls: {
  element: string;
  level: string;
  section?: string | null;
  name?: string | null;
}): string {
  const base = [cls.element, cls.level].map(part => part.trim()).filter(Boolean);
  const label = base.length === 2 ? base.join(' ') : cls.name?.trim() || base.join(' ');
  return `${label}${cls.section ? ` ${cls.section}` : ''}`;
}

/**
 * How a judge's trial is matched to a premium trial, which carries no id: the trial's name and
 * date, both read from the same `trials` row by the generator and the publish read.
 */
export function premiumTrialKey(name: string, date: string): string {
  return `${name}|${date}`;
}

/**
 * MYK9-2248: a class the premium prints: not cancelled (`classes.status`, MYK9-1863) and not
 * soft-deleted. The app's copy of `livePremiumClasses` in
 * `supabase/functions/generate-premium/liveTrials.ts`, which this app cannot import;
 * `premiumClassLabel.test.ts` runs both on the same rows so the two cannot drift. A trial counts
 * the same way (`livePremiumTrials`): not cancelled, not soft-deleted.
 */
export function isLivePremiumRow(row: {
  status?: string | null;
  deleted_at?: string | null;
}): boolean {
  return !row.deleted_at && row.status !== 'cancelled';
}
