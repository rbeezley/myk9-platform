/**
 * What `judge_assignments` writes are still undelivered, in the terms the class judge overlay
 * needs (MYK9-1327), and the moment the last of a class's writes is acknowledged.
 *
 * A class-level assignment write names its class in the queued payload (`class_id`, and on a
 * DELETE the row itself is already gone locally), so the queue alone says which classes have
 * unsent judge work, across a reload. An acknowledgement event names only row ids, so the
 * tracker remembers which class each row belonged to until its upload is confirmed.
 */
import type { PendingMutation, UploadCompleteEventDetail } from '@myk9/replication';

export interface UnsentClassJudgeWork {
  /** Assignment rows with an undelivered INSERT or UPDATE. */
  unsentRowIds: Set<string>;
  /** Every class with any undelivered class-level assignment write (a delete counts). */
  classIds: Set<string>;
}

const classIdOf = (mutation: PendingMutation): string | null => {
  const classId = mutation.data?.class_id;
  return typeof classId === 'string' && classId.length > 0 ? classId : null;
};

export class ClassJudgeWorkTracker {
  private readonly classByRow = new Map<string, string>();
  private readonly listeners = new Set<(classIds: string[]) => void>();

  /** Remember which class a class-level assignment row belongs to, until it is acknowledged. */
  note(rowId: string, classId: string | null): void {
    if (classId) this.classByRow.set(String(rowId), classId);
  }

  /** Sort the queue's undelivered mutations into the overlay's inputs. */
  summarize(mutations: readonly PendingMutation[]): UnsentClassJudgeWork {
    const work: UnsentClassJudgeWork = { unsentRowIds: new Set(), classIds: new Set() };
    for (const mutation of mutations) {
      const classId = classIdOf(mutation);
      if (!classId) continue; // a show-level assignment touches no class
      this.note(mutation.rowId, classId);
      work.classIds.add(classId);
      if (mutation.operation !== 'DELETE') work.unsentRowIds.add(String(mutation.rowId));
    }
    return work;
  }

  /** Called with the classes whose every judge write is now acknowledged. */
  onSettled(listener: (classIds: string[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Listen for upload passes on `tableName`. `unsent` is read AFTER the pass, so a class that
   * still has a write waiting (a delete delivered, its replacement not yet) is not settled.
   * Returns the unsubscribe function.
   */
  listen(tableName: string, unsent: () => Promise<UnsentClassJudgeWork>): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const onUploadComplete = (event: Event) => {
      const mutations = (event as CustomEvent<UploadCompleteEventDetail>).detail?.mutations ?? [];
      const classIds = new Set<string>();
      for (const mutation of mutations) {
        if (mutation.tableName !== tableName) continue;
        const classId = this.classByRow.get(String(mutation.rowId));
        if (classId) classIds.add(classId);
        this.classByRow.delete(String(mutation.rowId));
      }
      if (classIds.size === 0) return;
      void unsent()
        .then(work => {
          const settled = [...classIds].filter(id => !work.classIds.has(id));
          if (settled.length > 0) this.listeners.forEach(listener => listener(settled));
        })
        // An unreadable queue settles nothing: the next pull carries the server's judge.
        .catch(() => undefined);
    };
    window.addEventListener('replication:upload-complete', onUploadComplete);
    return () => window.removeEventListener('replication:upload-complete', onUploadComplete);
  }
}
