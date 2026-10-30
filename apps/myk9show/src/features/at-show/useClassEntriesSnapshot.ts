/**
 * A class's replicated entry rows, read once per open from the replica (so it works
 * offline). Reopening the dialog gives fresh numbers; nothing re-reads while it is
 * open. Three states: loading (`rows` null, not `failed`), loaded, or `failed` with
 * `retry`, which reads once more. A failure never sits behind older rows, and a
 * different class never shows the previous class's rows.
 */
import { useCallback, useEffect, useState } from 'react';
import { replicatedEntriesTable } from '@/services/replication';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

type Outcome = { key: string; rows: ReplicatedEntry[] } | { key: string; rows: null };

interface ClassEntriesSnapshot {
  rows: ReplicatedEntry[] | null;
  failed: boolean;
  retry: () => void;
}

export function useClassEntriesSnapshot(classId: string): ClassEntriesSnapshot {
  const [attempt, setAttempt] = useState(0);
  // Keyed by class and attempt: an outcome for another key is not this read's answer.
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const key = `${classId}:${attempt}`;

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    replicatedEntriesTable
      .getEntriesByClass(classId)
      .then(rows => {
        if (!cancelled) setOutcome({ key, rows });
      })
      .catch(() => {
        if (!cancelled) setOutcome({ key, rows: null });
      });
    return () => {
      cancelled = true;
    };
  }, [classId, key]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);

  const current = outcome?.key === key ? outcome : null;
  return { rows: current?.rows ?? null, failed: current !== null && current.rows === null, retry };
}
