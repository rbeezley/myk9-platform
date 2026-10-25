/**
 * Feeds the class judge overlay (MYK9-1327): reads the judge writes this device has not
 * delivered, applies `overlayClassJudges` to the class rows a reader is about to see, and holds a
 * class's local judge steady between its assignment being acknowledged and its class row being
 * refreshed from the server.
 *
 * Offline-first: everything here reads local tables and the local mutation queue. The only
 * network use is the refresh the caller supplies, started when a class's writes are acknowledged.
 */
import { logger } from '@myk9/core';
import type { ReplicatedReadResult } from '@myk9/replication';
import type { ReplicatedClass } from './ReplicatedClassesTable';
import type { ReplicatedJudgeAssignment } from './ReplicatedJudgeAssignmentsTable.mapper';
import type { UnsentClassJudgeWork } from './judgeAssignmentClassWork';
import { overlayClassJudges } from './classJudgeOverlay';

/** How long a class waits for its refresh before the server's row is trusted again. */
export const CLASS_JUDGE_SETTLE_TTL_MS = 2 * 60 * 1000;

/** The slice of the judge assignments table the overlay reads. */
export interface ClassJudgeAssignmentsPort {
  getUnsentClassWork(): Promise<UnsentClassJudgeWork>;
  getByClassWithStatus(classId: string): Promise<ReplicatedReadResult<ReplicatedJudgeAssignment>>;
  subscribe(callback: () => void, options: { emitCurrent: false }): () => void;
  onClassJudgesSettled(listener: (classIds: string[]) => void): () => void;
}

export class ClassJudgeOverlaySource {
  /** Class id -> when its wait for the refresh runs out. */
  private readonly settling = new Map<string, number>();
  private stop: (() => void) | undefined;

  constructor(
    private readonly assignments: () => ClassJudgeAssignmentsPort,
    /** Re-read these classes from the server (the class table's row refetch). */
    private readonly refreshClasses: (classIds: string[]) => Promise<void>,
    /** Tell the class table's subscribers its presented rows changed. */
    private readonly changed: () => void
  ) {}

  /** Idempotent: subscribe to assignment changes and to acknowledgements, once. */
  start(): void {
    if (this.stop) return;
    const port = this.assignments();
    const stopChanges = port.subscribe(() => this.changed(), { emitCurrent: false });
    const stopSettled = port.onClassJudgesSettled(classIds => this.settle(classIds));
    this.stop = () => {
      stopChanges();
      stopSettled();
      this.stop = undefined;
    };
  }

  destroy(): void {
    this.stop?.();
    this.settling.clear();
  }

  /** The classes waiting for their refresh (test seam). */
  settlingClassIds(): ReadonlySet<string> {
    this.dropExpired();
    return new Set(this.settling.keys());
  }

  private dropExpired(): void {
    const now = Date.now();
    for (const [classId, until] of this.settling) {
      if (until <= now) this.settling.delete(classId);
    }
  }

  private settle(classIds: string[]): void {
    const until = Date.now() + CLASS_JUDGE_SETTLE_TTL_MS;
    for (const classId of classIds) this.settling.set(classId, until);
    this.refreshClasses(classIds)
      .then(() => {
        // Only a refresh that landed hands the class back to its server row.
        for (const classId of classIds) this.settling.delete(classId);
      })
      .catch((error: unknown) => {
        logger.warn(
          '[classJudgeOverlay] Class refresh after a judge change failed; the local judge stands until the next pull',
          'replication',
          error
        );
      })
      .finally(() => this.changed());
  }

  /** The rows as a reader should see them; on any read failure, exactly as stored. */
  async present(rows: ReplicatedClass[]): Promise<ReplicatedClass[]> {
    if (rows.length === 0) return rows;
    this.start();
    try {
      const port = this.assignments();
      const work = await port.getUnsentClassWork();
      this.dropExpired();
      if (work.classIds.size === 0 && this.settling.size === 0) return rows;

      const active = new Set([...work.classIds, ...this.settling.keys()]);
      const candidates: ReplicatedJudgeAssignment[] = [];
      for (const classId of active) {
        if (!rows.some(row => row.id === classId)) continue;
        const read = await port.getByClassWithStatus(classId);
        // An unreadable class is shown as stored, never as "no judge".
        if (!read.ok) active.delete(classId);
        else candidates.push(...read.rows);
      }
      return overlayClassJudges(rows, candidates, {
        activeClassIds: active,
        unsentRowIds: work.unsentRowIds,
      });
    } catch (error) {
      logger.warn(
        '[classJudgeOverlay] Judge overlay unavailable; showing stored rows',
        'replication',
        error
      );
      return rows;
    }
  }
}
