/**
 * quickAdvancePanel — the post-save "Saved" state for the at-show scoresheet
 * (MYK9-83): a prominent Back-to-list action plus up to three optional one-tap
 * "up next" chips.
 *
 * INTENT (product decision, MYK9-83): NOTHING here auto-advances. Strict run
 * order holds only about half the time at the gate, so the app never guesses
 * which dog runs next — it offers a few candidates and stays put. Ignoring the
 * chips and tapping "Back to entry list" is exactly the pre-MYK9-83 flow, and
 * dismissing the panel means going back to the list, never a trap.
 *
 * Chips show BREED alongside armband and call name because a timer steward at
 * an unfamiliar ring matches the dog visually ("the golden that just walked
 * up") faster than by name or number. Check-in statuses only sharpen the
 * ranking when a steward or exhibitor happens to set them; with a paper gate
 * sheet — the common case — the chips are simply the next dogs by run order.
 *
 * Candidates come from the replicated table and re-render on its changes, so
 * this works offline and never shows a locked stale snapshot.
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { badgeClass } from './slots/atShowChrome.helpers';
import {
  toQuickAdvanceChips,
  formatChipLabel,
  type QuickAdvanceChip,
} from './quickAdvanceReplicated';

function useQuickAdvanceChips(
  classId: string | undefined,
  pairedClassId: string | undefined,
  scoredEntryId: string | undefined
): QuickAdvanceChip[] {
  const queryClient = useQueryClient();

  // React to the table itself rather than to any one mutation path: a check-in
  // change can land from the entry list, a steward's device, or a sync pull.
  useEffect(() => {
    if (!classId) return;
    return replicatedEntriesTable.subscribe(() => {
      void queryClient.invalidateQueries({
        queryKey: ['at-show', 'quick-advance', classId, pairedClassId],
      });
    });
  }, [classId, pairedClassId, queryClient]);

  // A combined A/B list runs both sections together, so the dog at the gate
  // may come from either; offer candidates from both.
  const { data } = useQuery({
    queryKey: ['at-show', 'quick-advance', classId, pairedClassId],
    queryFn: async () => {
      const ids = [classId as string, ...(pairedClassId ? [pairedClassId] : [])];
      const lists = await Promise.all(ids.map(id => replicatedEntriesTable.getEntriesByClass(id)));
      return lists.flat();
    },
    enabled: !!classId,
  });

  return toQuickAdvanceChips(data ?? [], { excludeEntryId: scoredEntryId });
}

type ScoreSaveState = 'pending' | 'acknowledged' | 'failed';

const SCORE_DETAIL_KEYS = [
  'area1_time_seconds',
  'area2_time_seconds',
  'area3_time_seconds',
  'area4_time_seconds',
  'total_correct_finds',
  'total_incorrect_finds',
  'no_finish_count',
  'points_earned',
  'disqualification_reason',
] as const;

function sameScoredRun(local: ReplicatedEntry, remote: ReplicatedEntry): boolean {
  const localCompletedAt = local.scoringCompletedAt ?? local.scoring_completed_at;
  const remoteCompletedAt = remote.scoringCompletedAt ?? remote.scoring_completed_at;
  return (
    !!localCompletedAt &&
    !!remoteCompletedAt &&
    Date.parse(localCompletedAt) === Date.parse(remoteCompletedAt) &&
    (local.resultStatus ?? local.result_status) === (remote.resultStatus ?? remote.result_status) &&
    (local.searchTimeSeconds ?? local.search_time_seconds) ===
      (remote.searchTimeSeconds ?? remote.search_time_seconds) &&
    (local.totalFaults ?? local.total_faults) === (remote.totalFaults ?? remote.total_faults) &&
    SCORE_DETAIL_KEYS.every(key => (local[key] ?? null) === (remote[key] ?? null))
  );
}

interface ScoreSaveSnapshot {
  entryId: string | undefined;
  state: ScoreSaveState;
  /** A completed check found the score still queued (not just the initial default). */
  sawQueued: boolean;
}

function useScoreSaveState(entryId: string | undefined): {
  state: ScoreSaveState;
  sawQueued: boolean;
} {
  const [snapshot, setSnapshot] = useState<ScoreSaveSnapshot>({
    entryId,
    state: 'pending',
    sawQueued: false,
  });
  const current = snapshot.entryId === entryId ? snapshot : null;
  const state = current?.state ?? 'pending';
  const sawQueued = current?.sawQueued ?? false;
  const updateState = (next: ScoreSaveState) =>
    setSnapshot(prev => {
      const base =
        prev.entryId === entryId ? prev : { entryId, state: 'pending' as const, sawQueued: false };
      const sawQueued = base.sawQueued || next !== 'acknowledged';
      if (base.state === next && base.sawQueued === sawQueued && prev === base) return prev;
      return { entryId, state: next, sawQueued };
    });

  useEffect(() => {
    if (!entryId || state === 'acknowledged') return;
    let cancelled = false;
    let inFlight = false;
    let local: ReplicatedEntry | null = null;

    const check = async () => {
      // Battery: a phone in a pocket has nothing to show; re-check on return.
      if (inFlight || cancelled || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        local ??= await replicatedEntriesTable.getEntryById(entryId);
        if (!local) return;
        const upload = await replicatedEntriesTable.getScoreUploadState(entryId);
        if (cancelled) return;
        if (navigator.onLine) {
          try {
            const remote = await replicatedEntriesTable.readScoreFromServer(entryId);
            if (cancelled) return;
            // A failed older edit can remain on this row after this score reaches
            // the server. Matching readback is stronger proof than queue state.
            if (remote && sameScoredRun(local, remote)) {
              updateState('acknowledged');
              return;
            }
          } catch {
            // Keep the durable queue state below when readback is unavailable.
          }
        }
        updateState(upload === 'failed' ? 'failed' : 'pending');
      } catch {
        // A failed read is not proof that the server has the score.
        if (!cancelled) updateState('pending');
      } finally {
        inFlight = false;
      }
    };

    // Battery: back off 3s → 6s → 12s → 24s → 30s while unconfirmed. Replica
    // changes, regaining signal and unlocking the phone still check at once.
    let delay = 3000;
    let timer: number | undefined;
    const schedule = () => {
      timer = window.setTimeout(() => {
        void check();
        delay = Math.min(delay * 2, 30_000);
        schedule();
      }, delay);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };

    const unsubscribe = replicatedEntriesTable.subscribe(() => void check());
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', onVisible);
    schedule();
    void check();
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearTimeout(timer);
    };
  }, [entryId, state]);

  return { state, sawQueued };
}

/** Live `navigator.onLine`, so the offline wording flips when signal returns. */
function useIsOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * MYK9-1023: a score that was queued (not yet on the server) and is later
 * acknowledged gets a brief toast, so a judge who lost signal can see it landed.
 * A score acknowledged on the first check never toasts.
 */
function useScoresSentToast(saveState: ScoreSaveState, sawQueued: boolean): void {
  const toasted = useRef(false);
  useEffect(() => {
    if (saveState === 'acknowledged' && sawQueued && !toasted.current) {
      toasted.current = true;
      toast.success('Scores sent');
    }
  }, [saveState, sawQueued]);
}

export interface QuickAdvancePanelProps {
  classId: string | undefined;
  /** The other section when scoring from a combined A/B list. */
  pairedClassId?: string | undefined;
  /** The entry just scored — never offered as its own next candidate. */
  scoredEntryId: string | undefined;
  /** Primary action: return to the entry list to pick anyone. */
  onBackToList: () => void;
  /** Reopen the just-saved sheet with its score pre-filled for correction. */
  onCorrectScore: () => void;
  /** Open a candidate's scoresheet (normal route, so it transitions to in-ring). */
  onPickEntry: (entryId: string, classId: string) => void;
}

export const QuickAdvancePanel: React.FC<QuickAdvancePanelProps> = ({
  classId,
  pairedClassId,
  scoredEntryId,
  onBackToList,
  onCorrectScore,
  onPickEntry,
}) => {
  const chips = useQuickAdvanceChips(classId, pairedClassId, scoredEntryId);
  const { state: saveState, sawQueued } = useScoreSaveState(scoredEntryId);
  const online = useIsOnline();
  useScoresSentToast(saveState, sawQueued);

  return (
    <div className="ringside-root container mx-auto max-w-2xl px-4 py-6">
      <div className="rounded-xl border bg-card p-5">
        <div
          role="status"
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${badgeClass(
            saveState === 'failed'
              ? 'destructive'
              : saveState === 'acknowledged'
                ? 'success'
                : 'neutral'
          )}`}
        >
          {saveState === 'failed' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {saveState === 'acknowledged'
            ? 'Score saved'
            : saveState === 'failed'
              ? 'Saved on this device. Sync needs attention.'
              : online
                ? 'Saved on this device · waiting to sync'
                : "Saved on this device — will send when you're back online"}
        </div>

        <Button className="mt-5 h-12 w-full text-base" onClick={onBackToList}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to entry list
        </Button>
        <Button className="mt-3 h-12 w-full text-base" variant="outline" onClick={onCorrectScore}>
          Correct this score
        </Button>

        {chips.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-sm text-muted-foreground">
              Or jump straight to whoever is at the gate:
            </p>
            <ul className="flex flex-col gap-2">
              {chips.map(chip => (
                <li key={chip.entryId}>
                  <button
                    type="button"
                    onClick={() => onPickEntry(chip.entryId, chip.classId)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border bg-background px-4 py-2 text-left text-base"
                    data-testid="quick-advance-entry"
                  >
                    <span>{formatChipLabel(chip)}</span>
                    {chip.gateLabel && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${badgeClass(
                          'neutral'
                        )}`}
                      >
                        {chip.gateLabel}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
