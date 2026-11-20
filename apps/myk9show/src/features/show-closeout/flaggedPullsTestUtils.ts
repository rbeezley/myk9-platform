import { collectFlaggedPulls, type FlaggedPullEntry } from './flaggedPulls';
import type { CloseoutFlaggedPulls } from './useCloseoutFlaggedPulls';

const refresh = async () => {};

/** What `useCloseoutFlaggedPulls` returns once the entries are read (MYK9-2180 tests). */
export function readFlags(entries: readonly FlaggedPullEntry[]): CloseoutFlaggedPulls {
  return { status: 'read', ...collectFlaggedPulls(entries), refresh };
}

export const NO_FLAGS: CloseoutFlaggedPulls = readFlags([]);
/** The latest entries read did not succeed. */
export const FAILED_FLAGS: CloseoutFlaggedPulls = { status: 'failed', refresh };
