/**
 * Ids this device confirmed deleted while a sync pass was reading the server
 * (MYK9-1129 item a).
 *
 * A pass can read a registration from the server just before this device's
 * queued DELETE of it lands, then store that read just after the confirmed
 * delete removed the row: the deleted registration comes back as a clean
 * device copy and shows offline until the next pass. A pass opens the fence
 * when it starts, and drops any row the fence names before storing it.
 *
 * Short-lived by construction: a record is kept only while a pass that began
 * before it is still running, so a later pass, which starts after the delete,
 * stores the server's answer as usual (a delete the server did not apply, for
 * example one RLS refused with no error, comes back on that pass).
 */
export class RegistrationDeletionFence {
  private clock = 0;
  private readonly deleted = new Map<string, number>();
  private readonly openPasses = new Set<number>();

  /** Start a pass. Pass the token to {@link isDeletedSince} and {@link close}. */
  open(): number {
    const token = ++this.clock;
    this.openPasses.add(token);
    return token;
  }

  /** Record ids whose delete this device just saw confirmed. */
  recordDeleted(ids: Iterable<string>): void {
    if (this.openPasses.size === 0) return;
    for (const id of ids) this.deleted.set(String(id), ++this.clock);
  }

  /** True when `id` was confirmed deleted after the pass holding `token` began. */
  isDeletedSince(token: number, id: string): boolean {
    const at = this.deleted.get(String(id));
    return at !== undefined && at > token;
  }

  /** End a pass, forgetting records no open pass can still need. */
  close(token: number): void {
    this.openPasses.delete(token);
    const oldest = Math.min(...this.openPasses);
    for (const [id, at] of this.deleted) {
      if (this.openPasses.size === 0 || at < oldest) this.deleted.delete(id);
    }
  }
}
