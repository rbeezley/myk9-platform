import type { DatabaseError } from '../supabaseClient';
import { withReplicationFallback } from './replication-fallback';

export interface ReadResult<T> {
  data: T;
  error: DatabaseError | null;
}

interface ReadWithReplicationFallbackOptions<T> {
  replication: () => Promise<ReadResult<T>>;
  postgrest: () => Promise<ReadResult<T>>;
  table: string;
  operation: string;
  errorData: T;
}

export async function readWithReplicationFallback<T>({
  replication,
  postgrest,
  table,
  operation,
  errorData,
}: ReadWithReplicationFallbackOptions<T>): Promise<ReadResult<T>> {
  try {
    return await withReplicationFallback(replication, postgrest, table, operation);
  } catch (error) {
    return { data: errorData, error: error as DatabaseError };
  }
}

export async function loadLookupMap<T>(
  load: () => Promise<T[]>,
  keyFn: (item: T) => string
): Promise<Map<string, T>> {
  const items = await load();
  return new Map(items.map(item => [keyFn(item), item]));
}

export function sortedCopy<T>(items: readonly T[], compare: (a: T, b: T) => number): T[] {
  return [...items].sort(compare);
}

export function compareDateAsc<T>(getDate: (item: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const aDate = getDate(a) ?? '';
    const bDate = getDate(b) ?? '';
    return aDate.localeCompare(bDate);
  };
}

export function compareDateDesc<T>(getDate: (item: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const aDate = getDate(a) ?? '';
    const bDate = getDate(b) ?? '';
    return bDate.localeCompare(aDate);
  };
}

export function compareStringAsc<T>(getValue: (item: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const aValue = getValue(a) ?? '';
    const bValue = getValue(b) ?? '';
    return aValue.localeCompare(bValue);
  };
}

export function compareStringAscNullsLast<T>(getValue: (item: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const aValue = getValue(a);
    const bValue = getValue(b);

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return aValue.localeCompare(bValue);
  };
}

export function compareNumberAscNullsLast<T>(getValue: (item: T) => number | null | undefined) {
  return (a: T, b: T) => {
    const aValue = getValue(a);
    const bValue = getValue(b);

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return aValue - bValue;
  };
}
