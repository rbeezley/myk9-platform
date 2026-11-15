/**
 * "Every dog has a result. Mark class complete" in the entry list's sticky header (MYK9-2013).
 * Logic in `markClassComplete.ts`; the write is the Status dialog's own (`updateClassStatus`).
 */
import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { RingsideReplication } from '@myk9/ringside';
import { Button } from '@/components/ui/button';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { logger } from '@/utils/logger';
import {
  isClassCompleted,
  shouldOfferMarkComplete,
  type ClassCompletionFields,
} from './markClassComplete';

interface MarkClassCompleteOfferProps {
  classIds: readonly (string | undefined)[];
  statusCounts: { pending: number; completed: number } | undefined;
  canManage: boolean;
  replication: RingsideReplication;
  refresh: () => Promise<void>;
  /** Changes whenever the list re-reads (its `classInfo`), so the class rows are read again. */
  version: unknown;
}

function useClassRows(classIds: readonly string[], version: unknown) {
  const key = classIds.join(',');
  const [rows, setRows] = useState<{ key: string; classes: (ClassCompletionFields | null)[] }>({
    key: '',
    classes: [],
  });
  const [reads, setReads] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      key.split(',').map(id => replicatedClassesTable.getClassById(id).catch(() => null))
    ).then(classes => {
      if (!cancelled) setRows({ key, classes });
    });
    return () => {
      cancelled = true;
    };
  }, [key, version, reads]);
  return {
    classes: rows.key === key ? rows.classes : classIds.map(() => null),
    reread: () => setReads(n => n + 1),
  };
}

export function MarkClassCompleteOffer({
  classIds,
  statusCounts,
  canManage,
  replication,
  refresh,
  version,
}: MarkClassCompleteOfferProps) {
  const ids = classIds.filter((id): id is string => Boolean(id));
  const { classes, reread } = useClassRows(ids, version);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!shouldOfferMarkComplete({ canManage, statusCounts, classes })) return null;

  const markComplete = async () => {
    setBusy(true);
    setFailed(false);
    try {
      for (const [index, id] of ids.entries()) {
        const cls = classes[index];
        if (cls && !isClassCompleted(cls)) await replication.updateClassStatus(id, 'completed');
      }
      await refresh();
      reread();
    } catch (error) {
      logger.error('[at-show] mark class complete failed', 'at-show', { error: String(error) });
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="mark-class-complete"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-sm"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      <span className="min-w-0 flex-1" role={failed ? 'alert' : undefined}>
        {failed ? 'Could not mark the class complete. Try again.' : 'Every dog has a result.'}
      </span>
      <Button
        type="button"
        className="min-h-11"
        disabled={busy}
        onClick={() => void markComplete()}
      >
        Mark class complete
      </Button>
    </div>
  );
}
