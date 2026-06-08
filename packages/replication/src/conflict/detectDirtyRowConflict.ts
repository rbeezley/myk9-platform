const DEFAULT_IGNORED_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  '_version',
  '_lastModified',
  '_lastModifiedBy',
  '_syncStatus',
  '_localOnly',
]);

export interface DirtyRowConflictInput<T extends Record<string, unknown>> {
  base: T;
  local: T;
  remote: T;
  ignoredFields?: Iterable<string>;
}

export interface DirtyRowConflictResult {
  hasConflict: boolean;
  fields: string[];
}

export function detectDirtyRowConflict<T extends Record<string, unknown>>({
  base,
  local,
  remote,
  ignoredFields = DEFAULT_IGNORED_FIELDS,
}: DirtyRowConflictInput<T>): DirtyRowConflictResult {
  const ignored = new Set(ignoredFields);
  const fields = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const conflicts: string[] = [];

  for (const field of fields) {
    if (ignored.has(field)) continue;

    const baseValue = base[field];
    const localValue = local[field];
    const remoteValue = remote[field];
    const localChanged = !deepEqual(localValue, baseValue);
    const remoteChanged = !deepEqual(remoteValue, baseValue);
    const sidesDiffer = !deepEqual(localValue, remoteValue);

    if (localChanged && remoteChanged && sidesDiffer) {
      conflicts.push(field);
    }
  }

  return { hasConflict: conflicts.length > 0, fields: conflicts.sort() };
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}
