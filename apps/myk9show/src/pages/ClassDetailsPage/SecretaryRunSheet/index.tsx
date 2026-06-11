import type { ClassData } from '@/components/classes/types/classTypes';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { getPaperScoringEntryHref } from '@/pages/scoring/scoringRoutes';
import type { Dog } from '@/types/dog-types';
import { ListTree } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { RunSheetRow } from './RunSheetRow';
import { useRunSheetState } from './useRunSheetState';

interface SecretaryRunSheetProps {
  currentClass: ClassData;
  dbRawEntries: RawEntryRow[];
  userId: string;
  myEntryIds?: Set<string>;
  dogs: Dog[];
  organization?: string | null;
  // When set, the "Reorder in Show Map" link routes to that show's Show
  // Desk. Omitted in tests / contexts without a resolved parent show.
  parentShowId?: string | null | undefined;
}

// INTENT: Read-only run sheet for the secretary's per-class view. The
// auto-sort presets + manual drag-and-drop reorder that used to live here
// moved to Show Map in B7. Per the surface-boundary commitment, this
// surface no longer competes with Show Map for the same action — it just
// renders entries in run order with check-in + score controls, and links
// out for reorder.
export function SecretaryRunSheet({
  currentClass,
  dbRawEntries,
  userId,
  myEntryIds = new Set(),
  dogs,
  organization,
  parentShowId,
}: SecretaryRunSheetProps) {
  const navigate = useNavigate();
  const { sortedEntries, onCheckInStatus } = useRunSheetState({
    rawEntries: dbRawEntries,
    classId: currentClass.id,
    userId,
    dogs,
    organization,
  });

  return (
    <div className="mt-6 space-y-3">
      {parentShowId && sortedEntries.length > 1 && (
        <div className="flex justify-end">
          <Link
            to={`/secretary/shows/${parentShowId}/show-desk`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ListTree className="h-4 w-4" aria-hidden="true" />
            Reorder in Show Map
          </Link>
        </div>
      )}
      <div className="space-y-2.5">
        {sortedEntries.map(entry => (
          <RunSheetRow
            key={entry.id}
            entry={entry}
            onScoreEntry={() => navigate(getPaperScoringEntryHref(currentClass.id, entry.id))}
            onCheckInStatus={status => onCheckInStatus(entry.id, status)}
            isMine={myEntryIds.has(entry.id)}
          />
        ))}
        {sortedEntries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No entries in this class.
          </p>
        )}
      </div>
    </div>
  );
}
