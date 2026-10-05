// Dependency-free so UI code and its tests can import these without the
// Supabase client or the replica (MYK9-1000).

/** Exhibitor Withdraw matched nothing: the spot is no longer 'waiting'. */
export const WAITLIST_ENTRY_CHANGED_MESSAGE =
  'This wait list spot changed before you withdrew. It may have just been offered to you. We refreshed it so you can see where it stands.';

/** Secretary Remove matched nothing: the row is already gone. */
export const WAITLIST_ENTRY_GONE_MESSAGE =
  'This dog is no longer on the wait list. It may have been removed or claimed on another device. Refresh to see the current list.';

/** The server answered the DELETE without an error but deleted no row. */
export class WaitlistEntryNotDeletedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaitlistEntryNotDeletedError';
  }
}
