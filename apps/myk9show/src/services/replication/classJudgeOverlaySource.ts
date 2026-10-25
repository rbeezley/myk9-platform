/**
 * Feeds the class judge overlay (MYK9-1327): decides, from persisted local state only, which
 * classes this device still speaks for and what judge it says.
 *
 * A class is ACTIVE when
 *  - it has unsent (pending or failed) judge writes in the mutation queue, or
 *  - a delivered local assignment row has a server `updated_at` newer than the stored class row's
 *    (a trigger stamps both in one transaction, so the class has not been pulled past it), or
 *  - a delivered clear (tombstone) is newer than the stored class row.
 * Otherwise the class row's own server-derived judge shows, which is how another secretary's
 * later change wins. Every input is in IndexedDB, so nothing here is lost on a reload and no
 * acknowledgement has to be observed: the next normal pull of the class lets go by itself.
 *
 * Offline-first: only local tables and the local queue are read; no network.
 */
import { logger } from '@myk9/core';
import type { ReplicatedReadResult } from '@myk9/replication';
import type { ReplicatedClass } from './ReplicatedClassesTable';
import type { ReplicatedJudgeAssignment } from './ReplicatedJudgeAssignmentsTable.mapper';
import {
  STAMPED_CLEAR_TTL_MS,
  UNSTAMPED_CLEAR_TTL_MS,
  type ClassJudgeClear,
} from './ReplicatedClassJudgeClearsTable';
import type { UnsentClassJudgeWork } from './judgeAssignmentClassWork';
import { overlayClassJudges, restoreMissingJudgeNames } from './classJudgeOverlay';

/** The slice of the judge assignments table the overlay reads. */
export interface ClassJudgeAssignmentsPort {
  getUnsentClassWork(): Promise<UnsentClassJudgeWork>;
  getAllWithStatus(): Promise<ReplicatedReadResult<ReplicatedJudgeAssignment>>;
  getByClassWithStatus(classId: string): Promise<ReplicatedReadResult<ReplicatedJudgeAssignment>>;
  subscribe(callback: () => void, options: { emitCurrent: false }): () => void;
}

/** The slice of the clears table the overlay reads and prunes. */
export interface ClassJudgeClearsPort {
  getAll(): Promise<ClassJudgeClear[]>;
  getByClassWithStatus(classId: string): Promise<ReplicatedReadResult<ClassJudgeClear>>;
  delete(id: string): Promise<void>;
  subscribe(callback: () => void, options: { emitCurrent: false }): () => void;
}

/**
 * A delivered assignment row still speaks for its class while the class row has not been pulled
 * past it. A row this device created and has not yet seen come back from a pull carries no
 * server time: it speaks until a pull stamps it, unless a stamped row of the same class exists
 * (then that row, and the class's own time, tell the truth).
 */
function notCaughtUp(
  row: ReplicatedJudgeAssignment,
  classTime: number,
  classHasStampedRow: boolean
): boolean {
  if (row.serverUpdatedAt !== undefined) return row.serverUpdatedAt > classTime;
  return row._lastModified !== undefined && !classHasStampedRow;
}

/** At most this many classes are read through the class index; more take one table pass. */
const SINGLE_READ_CLASSES = 50;

export class ClassJudgeOverlaySource {
  private stop: (() => void) | undefined;

  constructor(
    private readonly assignments: () => ClassJudgeAssignmentsPort,
    private readonly clearsTable: () => ClassJudgeClearsPort,
    /** Tell the class table's subscribers its presented rows changed. */
    private readonly changed: () => void
  ) {}

  /** Idempotent: follow assignment and tombstone changes, once. */
  start(): void {
    if (this.stop) return;
    const stopAssignments = this.assignments().subscribe(() => this.changed(), {
      emitCurrent: false,
    });
    const stopClears = this.clearsTable().subscribe(() => this.changed(), { emitCurrent: false });
    this.stop = () => {
      stopAssignments();
      stopClears();
      this.stop = undefined;
    };
  }

  destroy(): void {
    this.stop?.();
  }

  /**
   * The local class-level assignment rows of these classes. A few classes (a single-row read)
   * go through the class index; a collection read takes one pass over the table. Read fresh
   * every time: a cache fed by change notifications trails the write that caused them.
   */
  private async assignmentsByClass(
    classIds: readonly string[]
  ): Promise<Map<string, ReplicatedJudgeAssignment[]>> {
    const port = this.assignments();
    const reads =
      classIds.length <= SINGLE_READ_CLASSES
        ? await Promise.all(classIds.map(id => port.getByClassWithStatus(id)))
        : [await port.getAllWithStatus()];
    const byClass = new Map<string, ReplicatedJudgeAssignment[]>();
    for (const read of reads) {
      if (!read.ok) throw read.error;
      for (const row of read.rows) {
        if (!row.classId) continue;
        byClass.set(row.classId, [...(byClass.get(row.classId) ?? []), row]);
      }
    }
    return byClass;
  }

  /** The tombstones of these classes: through the class index for a few, else the small table. */
  private async readClears(rows: ReplicatedClass[]): Promise<ClassJudgeClear[]> {
    const port = this.clearsTable();
    if (rows.length > SINGLE_READ_CLASSES) return port.getAll();
    const reads = await Promise.all(rows.map(row => port.getByClassWithStatus(row.id)));
    return reads.flatMap(read => {
      if (!read.ok) throw read.error;
      return read.rows;
    });
  }

  /** Classes whose delivered clear is newer than the class row; prunes the ones that are not. */
  private async liveClears(
    rows: ReplicatedClass[],
    work: UnsentClassJudgeWork
  ): Promise<Set<string>> {
    const live = new Set<string>();
    const now = Date.now();
    const timeOf = new Map(rows.map(row => [row.id, row.serverUpdatedAt ?? 0]));
    for (const clear of await this.readClears(rows)) {
      const stale =
        clear.ackedAt === undefined
          ? !work.deletedRowIds.has(clear.id) && now - clear.createdAt > UNSTAMPED_CLEAR_TTL_MS
          : now - clear.ackedAt > STAMPED_CLEAR_TTL_MS ||
            (timeOf.get(clear.classId) ?? -1) > (clear.classTimeAtAck ?? 0);
      if (stale) {
        void this.clearsTable()
          .delete(clear.id)
          .catch(() => undefined);
      } else if (clear.ackedAt !== undefined) {
        live.add(clear.classId);
      }
    }
    return live;
  }

  /** The rows as a reader should see them; on any read failure, exactly as stored. */
  async present(rows: ReplicatedClass[]): Promise<ReplicatedClass[]> {
    if (rows.length === 0) return rows;
    this.start();
    try {
      const work = await this.assignments().getUnsentClassWork();
      const byClass = await this.assignmentsByClass(rows.map(row => row.id));
      const liveClears = await this.liveClears(rows, work);

      const active = new Set<string>();
      const candidates: ReplicatedJudgeAssignment[] = [];
      for (const cls of rows) {
        const own = (byClass.get(cls.id) ?? []).filter(row => !work.deletedRowIds.has(row.id));
        const hasUnsent = work.classIds.has(cls.id);
        const stamped = own.some(row => row.serverUpdatedAt !== undefined);
        const classTime = cls.serverUpdatedAt ?? 0;
        const deciding = own.filter(
          row => work.unsentRowIds.has(row.id) || notCaughtUp(row, classTime, stamped)
        );
        if (hasUnsent || deciding.length > 0 || liveClears.has(cls.id)) {
          active.add(cls.id);
          candidates.push(...(hasUnsent ? own : deciding));
        }
      }
      const overlaid =
        active.size === 0
          ? rows
          : overlayClassJudges(rows, candidates, {
              activeClassIds: active,
              unsentRowIds: work.unsentRowIds,
              deletedRowIds: work.deletedRowIds,
            });
      // A class the pull has caught up on may still lack the judge's name (name lookup failed).
      return restoreMissingJudgeNames(overlaid, byClass);
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
