import { useMemo } from 'react';

/** The trial and class rows as the report controls list them (snake_case, never null). */
export function useReportScopeOptions(
  resolvedTrials: ReadonlyArray<object>,
  classes: ReadonlyArray<object> | undefined
) {
  const trialOptions = useMemo(
    () =>
      (resolvedTrials as Array<Record<string, unknown>>).map(t => ({
        id: t.id as string,
        name: (t.name ?? '') as string,
        trial_number: String(t.trial_number ?? t.trialNumber ?? ''),
        date: (t.date ?? t.trialDate ?? '') as string,
        registry_id: (t.registry_id ?? t.registryId ?? null) as string | null,
      })),
    [resolvedTrials]
  );

  const classOptions = useMemo(
    () =>
      ((classes ?? []) as Array<Record<string, unknown>>).map(c => ({
        id: c.id as string,
        name: (c.name ?? '') as string,
        element: (c.element ?? '') as string,
        level: (c.level ?? '') as string,
        section: (c.section ?? '') as string,
        trial_id: (c.trial_id ?? '') as string,
      })),
    [classes]
  );

  return { trialOptions, classOptions };
}
