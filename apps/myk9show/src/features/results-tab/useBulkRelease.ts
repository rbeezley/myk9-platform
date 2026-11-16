/**
 * "Release N classes" on the Results tab (MYK9-2072): the secretary ticks classes in the list and
 * releases them together. There is no new write path: each ticked class goes through
 * `releaseClassRow`, the function the single-class Release button calls, one after another. A class
 * that does not release is named and stays ticked; the others stay released.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { ResultsClassRow } from './buildResultsClassRows';
import { getReleaseTick, releaseClassRow, type ReleaseClassRowDeps } from './releaseClassRow';
import { classRowSyncBlockedReason, readClassRowSyncState } from './useClassRowSyncState';

export interface BulkReleaseFailure {
  row: ResultsClassRow;
  message: string;
}

export interface BulkRelease {
  /** The ticked classes, in list order: only classes still listed and still releasable. */
  tickedRows: readonly ResultsClassRow[];
  /** The classes the open dialog lists, counts and runs: fixed when it opened, so it never shrinks mid-run. */
  dialogRows: readonly ResultsClassRow[];
  /** Something is running (this bulk run or another release), so Confirm cannot start. */
  busy: boolean;
  ticks: {
    isChecked: (id: string) => boolean;
    onToggle: (id: string, checked: boolean) => void;
    /** The tick box state for a row, from the same rule the single-class Release uses. */
    tickFor: (row: ResultsClassRow) => ReturnType<typeof getReleaseTick>;
    /** Boxes are held while a release is running. */
    disabled: boolean;
  };
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  running: boolean;
  /** Set once a run ended with classes that did not release; the dialog then names them. */
  failures: readonly BulkReleaseFailure[] | null;
  releasedCount: number;
  confirm: () => void;
}

async function verifyBlockedFor(row: ResultsClassRow): Promise<string | null> {
  if (row.phase !== 'needs-checking') return null;
  try {
    return classRowSyncBlockedReason(await readClassRowSyncState(row.id));
  } catch {
    return classRowSyncBlockedReason(null);
  }
}

export function useBulkRelease({
  rows,
  isOnline,
  busy,
  setBusy,
  releaseDeps,
}: {
  /** The classes the list shows: a ticked class that is filtered away is never released. */
  rows: readonly ResultsClassRow[];
  isOnline: boolean;
  /** Something else (a single release, a hide, a check) is running. */
  busy: boolean;
  /** Holds the single-class buttons while the run goes. */
  setBusy: (busy: boolean) => void;
  releaseDeps: (
    verifyBlocked: string | null,
    releaseBlocked: string | null,
    quietVerify?: boolean
  ) => ReleaseClassRowDeps;
}): BulkRelease {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [failures, setFailures] = useState<readonly BulkReleaseFailure[] | null>(null);
  const [releasedCount, setReleasedCount] = useState(0);
  const [dialogRows, setDialogRows] = useState<readonly ResultsClassRow[]>([]);
  // Leaving the tab mid-run: finish the class in flight, start no other, set no state.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The list as it is now: a class released elsewhere while the dialog was open is not released again.
  const liveRowsRef = useRef(rows);
  useEffect(() => {
    liveRowsRef.current = rows;
  }, [rows]);

  const tickedRows = useMemo(
    () => rows.filter(row => checked.has(row.id) && getReleaseTick(row, isOnline).kind === 'tick'),
    [rows, checked, isOnline]
  );

  const onToggle = useCallback((id: string, next: boolean) => {
    setChecked(previous => {
      const copy = new Set(previous);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }, []);

  const closeDialog = useCallback(() => {
    if (running) return;
    setDialogOpen(false);
    setFailures(null);
  }, [running]);

  const confirm = useCallback(() => {
    if (running || busy || dialogRows.length === 0) return;
    const batch = dialogRows;
    setRunning(true);
    setBusy(true);
    setFailures(null);
    void (async () => {
      const failed: BulkReleaseFailure[] = [];
      const done = new Set<string>();
      let stopped = false;
      try {
        for (const snapshot of batch) {
          if (!mountedRef.current) {
            stopped = true;
            break;
          }
          const row = liveRowsRef.current.find(live => live.id === snapshot.id) ?? snapshot;
          if (row.releasedAt) {
            done.add(row.id);
            continue;
          }
          try {
            const verifyBlocked = await verifyBlockedFor(row);
            const outcome = await releaseClassRow(row, releaseDeps(verifyBlocked, null, true));
            if (outcome.kind === 'released') done.add(row.id);
            else
              failed.push({
                row,
                message:
                  outcome.kind === 'failed'
                    ? outcome.message
                    : (outcome.reason ?? 'It is not ready to release.'),
              });
          } catch {
            failed.push({ row, message: 'Could not release the results. Try again.' });
          }
        }
      } finally {
        if (stopped) {
          // The tab was left mid-run: the toast is global, so it still reaches her.
          toast.error(
            `Stopped after ${done.size} of ${batch.length} classes. Release the rest again.`
          );
        } else if (mountedRef.current) {
          setChecked(previous => new Set([...previous].filter(id => !done.has(id))));
          setReleasedCount(done.size);
          setRunning(false);
          setBusy(false);
          if (failed.length === 0) {
            setDialogOpen(false);
            toast.success(
              done.size === 1 ? 'Results released' : `Results released for ${done.size} classes`
            );
          } else {
            setFailures(failed);
          }
        }
      }
    })();
  }, [busy, dialogRows, releaseDeps, running, setBusy]);

  return {
    tickedRows,
    dialogRows,
    busy,
    ticks: {
      isChecked: id => checked.has(id),
      onToggle,
      tickFor: row => getReleaseTick(row, isOnline),
      disabled: running || busy,
    },
    dialogOpen,
    openDialog: () => {
      setFailures(null);
      setDialogRows(tickedRows);
      setDialogOpen(true);
    },
    closeDialog,
    running,
    failures,
    releasedCount,
    confirm,
  };
}
