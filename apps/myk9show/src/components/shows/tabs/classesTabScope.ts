import { matchesAny } from '@myk9/core';
import type { ClassInfo } from './classInfo';
import { classTrialLabel } from './classInfo';

export interface TrialOption {
  id: string;
  label: string;
}

/** The show's trials in date order, one per trial the classes name. */
export function listTrialOptions(classes: ClassInfo[]): TrialOption[] {
  const seen = new Map<string, { label: string; sortKey: string }>();
  for (const cls of classes) {
    if (seen.has(cls.trialId)) continue;
    seen.set(cls.trialId, {
      label: classTrialLabel(cls) || 'Trial',
      sortKey: `${cls.trialDate || ''}|${cls.trialNumber || ''}`,
    });
  }
  return Array.from(seen, ([id, { label, sortKey }]) => ({ id, label, sortKey }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true }))
    .map(({ id, label }) => ({ id, label }));
}

/**
 * The one trial Setup → Classes manages: the requested one when the show has it, else the
 * first. Selection, bulk status and bulk delete never span trials.
 */
export function resolveScopeTrialId(
  options: TrialOption[],
  requested: string | null | undefined
): string | null {
  return options.find(option => option.id === requested)?.id ?? options[0]?.id ?? null;
}

/** Text search over the class name, element and level, plus the element filter. */
export function narrowClasses(classes: ClassInfo[], search: string, element: string): ClassInfo[] {
  return classes.filter(
    cls =>
      (element === 'all' || cls.element === element) &&
      matchesAny([cls.name, cls.element, cls.level], search)
  );
}
