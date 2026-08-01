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

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { badgeClass } from './slots/atShowChrome.helpers';
import {
  toQuickAdvanceChips,
  formatChipLabel,
  type QuickAdvanceChip,
} from './quickAdvanceReplicated';

function useQuickAdvanceChips(
  classId: string | undefined,
  scoredEntryId: string | undefined
): QuickAdvanceChip[] {
  const queryClient = useQueryClient();

  // React to the table itself rather than to any one mutation path: a check-in
  // change can land from the entry list, a steward's device, or a sync pull.
  useEffect(() => {
    if (!classId) return;
    return replicatedEntriesTable.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: ['at-show', 'quick-advance', classId] });
    });
  }, [classId, queryClient]);

  const { data } = useQuery({
    queryKey: ['at-show', 'quick-advance', classId],
    queryFn: () => replicatedEntriesTable.getEntriesByClass(classId as string),
    enabled: !!classId,
  });

  return toQuickAdvanceChips(data ?? [], { excludeEntryId: scoredEntryId });
}

export interface QuickAdvancePanelProps {
  classId: string | undefined;
  /** The entry just scored — never offered as its own next candidate. */
  scoredEntryId: string | undefined;
  /** Primary action: return to the entry list to pick anyone. */
  onBackToList: () => void;
  /** Reopen the just-saved sheet with its score pre-filled for correction. */
  onCorrectScore: () => void;
  /** Open a candidate's scoresheet (normal route, so it transitions to in-ring). */
  onPickEntry: (entryId: string) => void;
}

export const QuickAdvancePanel: React.FC<QuickAdvancePanelProps> = ({
  classId,
  scoredEntryId,
  onBackToList,
  onCorrectScore,
  onPickEntry,
}) => {
  const chips = useQuickAdvanceChips(classId, scoredEntryId);

  return (
    <div className="ringside-root container mx-auto max-w-2xl px-4 py-6">
      <div className="rounded-xl border bg-card p-5">
        <div
          role="status"
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${badgeClass(
            'neutral'
          )}`}
        >
          <CheckCircle2 className="h-4 w-4" />
          Score saved
        </div>

        <Button className="mt-5 h-12 w-full text-base" onClick={onBackToList}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to entry list
        </Button>
        <Button
          className="mt-3 h-12 w-full text-base"
          variant="outline"
          onClick={onCorrectScore}
        >
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
                    onClick={() => onPickEntry(chip.entryId)}
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
