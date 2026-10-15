/**
 * Who owns the local queue: the auth identity lookups MutationManager stamps
 * onto and checks against queue entries. Kept apart from the queue and upload
 * machinery in MutationManager.
 */
export class MutationIdentity {
  constructor(
    private readonly getCurrentUserId: () => Promise<string | null>,
    private readonly getCachedUserId: () => string | null,
    private readonly getOwnerIsAnonymous: (authUserId: string) => boolean
  ) {}

  /**
   * The current auth user id for comparing replica account stamps (MYK9-1133),
   * or null when it cannot be settled. The optional cached id (a synchronous
   * read of the persisted session) answers first: the live lookup refreshes an
   * expired token and, offline, retries that with backoff for tens of seconds,
   * which guarded IndexedDB reads must not wait on. The live lookup answers only
   * when nothing is persisted. For readers that branch on "unresolved" instead
   * of failing. Queue ownership uses `requireQueueOwnerUserId` (MYK9-1204).
   */
  async resolveCurrentUserId(): Promise<string | null> {
    const usable = (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0;
    const cached = this.readCachedUserId();
    if (cached) return cached;
    try {
      const live = await this.getCurrentUserId();
      return usable(live) ? live : null;
    } catch {
      return null;
    }
  }

  async requireCurrentUserId(): Promise<string> {
    const authUserId = await this.getCurrentUserId();
    if (typeof authUserId !== 'string' || authUserId.trim().length === 0) {
      throw new Error('[MutationManager] Cannot operate without an authenticated user identity');
    }
    return authUserId;
  }

  /**
   * Owner stamp for a NEW queue entry (MYK9-1204). Offline past jwt_expiry the
   * live lookup throws, which would refuse a ringside write (or, after its dirty
   * local write, strand it unqueued). A throw falls back to the persisted
   * account; the stamp is only a label, since upload still needs a live session
   * for that same id, so a different sign-in holds the entry. No persisted
   * account rethrows the live error.
   */
  async requireQueueOwnerUserId(): Promise<string> {
    // Offline, the live lookup can only fail, and only after its refresh retries
    // back off for tens of seconds: a judge must not wait on that to score.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const persisted = this.readCachedUserId();
      if (persisted) return persisted;
    }
    try {
      return await this.requireCurrentUserId();
    } catch (liveError) {
      const cached = this.readCachedUserId();
      if (cached) return cached;
      throw liveError;
    }
  }

  /** The anonymous-owner stamp for a new entry. A throwing reader means "not adoptable". */
  readOwnerIsAnonymous(authUserId: string): boolean {
    try {
      return this.getOwnerIsAnonymous(authUserId) === true;
    } catch {
      return false;
    }
  }

  /**
   * The persisted session's user id, or null. Never throws: a blocked storage
   * getter (browser privacy settings) must fall through to the live session,
   * which Supabase can still hold in memory.
   */
  private readCachedUserId(): string | null {
    try {
      const cached = this.getCachedUserId();
      return typeof cached === 'string' && cached.trim().length > 0 ? cached : null;
    } catch {
      return null;
    }
  }

  async requireSameCurrentUserId(expectedAuthUserId: string): Promise<void> {
    if ((await this.requireCurrentUserId()) !== expectedAuthUserId) {
      throw new Error('[MutationManager] Authenticated user changed during queue operation');
    }
  }
}
