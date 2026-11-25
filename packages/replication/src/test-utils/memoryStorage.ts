import { JOURNAL_ENTRY_PREFIX, type MutationJournalStorage } from '../mutation-backup';
import type { PendingMutation } from '../types';

/**
 * An in-memory Storage over `stored`, with the `length`/`key` iteration the
 * mutation journal needs. Tests read and seed `stored` directly.
 */
export function createMemoryStorage(
  stored: Record<string, string>
): MutationJournalStorage & { clear(): void } {
  return {
    getItem: (key: string) =>
      Object.prototype.hasOwnProperty.call(stored, key) ? (stored[key] ?? null) : null,
    setItem: (key: string, value: string) => {
      stored[key] = String(value);
    },
    removeItem: (key: string) => {
      delete stored[key];
    },
    clear: () => {
      for (const key of Object.keys(stored)) delete stored[key];
    },
    key: (index: number) => Object.keys(stored)[index] ?? null,
    get length() {
      return Object.keys(stored).length;
    },
  };
}

/** Seed journal entries, as a backup written by an earlier session would have left them. */
export function seedJournal(stored: Record<string, string>, mutations: PendingMutation[]): void {
  for (const mutation of mutations)
    stored[JOURNAL_ENTRY_PREFIX + mutation.id] = JSON.stringify(mutation);
}

/** Ids of the live journal entries in `stored`, in key order. */
export function journalIds(stored: Record<string, string>): string[] {
  return Object.keys(stored)
    .filter(key => key.startsWith(JOURNAL_ENTRY_PREFIX))
    .map(key => key.slice(JOURNAL_ENTRY_PREFIX.length));
}
