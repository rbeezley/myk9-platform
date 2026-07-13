// ========================================
// ROW LOCKING (Optimistic Update Support)
// ========================================

export class RowLockRegistry {
  /** Per-row mutex to prevent concurrent update livelocks */
  private rowLocks: Map<string, Promise<void>> = new Map();

  async withRowLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    await this.acquireRowLock(id);

    try {
      return await fn();
    } finally {
      this.releaseRowLock(id);
    }
  }

  private async acquireRowLock(id: string): Promise<void> {
    while (this.rowLocks.has(id)) {
      await this.rowLocks.get(id);
    }

    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });

    this.rowLocks.set(id, lockPromise);
    (this.rowLocks.get(id) as unknown as Record<string, unknown>)._release = releaseLock!;
  }

  private releaseRowLock(id: string): void {
    const lock = this.rowLocks.get(id);
    if (lock && (lock as unknown as Record<string, unknown>)._release) {
      ((lock as unknown as Record<string, unknown>)._release as () => void)();
      this.rowLocks.delete(id);
    }
  }
}
