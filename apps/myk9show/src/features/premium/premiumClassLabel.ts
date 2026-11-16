/** "Element Level Section", the one label a premium prints for a class. */
export function formatPremiumClassLabel(cls: {
  element: string;
  level: string;
  section?: string | null;
}): string {
  return `${cls.element} ${cls.level}${cls.section ? ` ${cls.section}` : ''}`;
}

/**
 * How a judge's trial is matched to a premium trial, which carries no id: the trial's name and
 * date, both read from the same `trials` row by the generator and the publish read.
 */
export function premiumTrialKey(name: string, date: string): string {
  return `${name}|${date}`;
}
